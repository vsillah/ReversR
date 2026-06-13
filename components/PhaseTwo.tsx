import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, Spacing, FontSizes } from '../constants/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import {
  AnalysisResult,
  InnovationResult,
  InventoryConnector,
  InventoryValidationResult,
  identifyMachineFromInventory,
  validateInventoryConnector,
} from '../hooks/useGemini';
import {
  defaultConnector,
  getAuthModeLabel,
  getConnectorTypeLabel,
  loadInventoryConnector,
  saveInventoryConnector,
} from '../utils/inventoryConnector';
import LoadingOverlay, { LoadingStep } from './LoadingOverlay';

const INVENTORY_STEPS: LoadingStep[] = [
  { id: 'connect', label: 'Checking inventory source...' },
  { id: 'match', label: 'Preparing selected match...' },
  { id: 'plan', label: 'Building reconstruction plan...' },
];

type MatchCandidate = NonNullable<InventoryValidationResult['matchCandidates']>[number];

interface Props {
  analysis: AnalysisResult;
  capturedImage?: string | null;
  onComplete: (innovation: InnovationResult) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  onBack: () => void;
  onReset: () => void;
  onOpenSettings: () => void;
}

const percentLabel = (value: number) => `${Math.round(value)}% match`;

export default function PhaseTwo({
  analysis,
  capturedImage,
  onComplete,
  isLoading,
  setIsLoading,
  onBack,
  onOpenSettings,
}: Props) {
  const { colors: Colors } = useAppTheme();
  const styles = createStyles(Colors);
  const [connector, setConnector] = useState<InventoryConnector>(defaultConnector);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<InventoryValidationResult | null>(null);
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>('connect');

  const candidates = useMemo(() => validation?.matchCandidates || [], [validation]);
  const selectedCandidate = candidates.find(candidate => candidate.machineId === selectedMachineId) || null;

  useEffect(() => {
    const loadAndValidate = async () => {
      setIsValidating(true);
      setError(null);
      try {
        const nextConnector = await loadInventoryConnector();
        setConnector(nextConnector);
        const result = await validateInventoryConnector(nextConnector, analysis);
        setValidation(result);
        setSelectedMachineId(result.matchCandidates?.[0]?.machineId || null);
      } catch (e: any) {
        console.error('Inventory validation failed:', e);
        setValidation(null);
        setSelectedMachineId(null);
        setError(e?.message || 'Inventory match check failed. Confirm the inventory source in Settings and try again.');
      } finally {
        setIsValidating(false);
      }
    };

    loadAndValidate();
  }, [analysis]);

  useEffect(() => {
    if (isLoading) {
      setLoadingStep('connect');
      const timer1 = setTimeout(() => setLoadingStep('match'), 1000);
      const timer2 = setTimeout(() => setLoadingStep('plan'), 2600);
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }
  }, [isLoading]);

  const handleRecheck = async () => {
    setIsValidating(true);
    setError(null);
    try {
      const nextConnector = await loadInventoryConnector();
      setConnector(nextConnector);
      await saveInventoryConnector(nextConnector);
      const result = await validateInventoryConnector(nextConnector, analysis);
      setValidation(result);
      setSelectedMachineId(result.matchCandidates?.[0]?.machineId || null);
    } catch (e: any) {
      console.error('Inventory validation failed:', e);
      setValidation(null);
      setSelectedMachineId(null);
      setError(e?.message || 'Inventory match check failed. Confirm the inventory source in Settings and try again.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleContinue = async () => {
    if (!selectedMachineId) {
      setError('Select a machine match before continuing.');
      return;
    }

    setIsLoading(true);
    setLoadingStep('connect');
    setError(null);

    try {
      await saveInventoryConnector(connector);
      const result = await identifyMachineFromInventory(analysis, connector, capturedImage, selectedMachineId);
      onComplete(result);
    } catch (e: any) {
      console.error('Inventory match failed:', e);
      setError(e?.message || 'Inventory match failed. Select a machine or restart the scan.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderCandidate = (candidate: MatchCandidate) => {
    const isSelected = candidate.machineId === selectedMachineId;
    return (
      <TouchableOpacity
        key={candidate.machineId}
        style={[styles.candidateCard, isSelected && styles.candidateCardSelected]}
        onPress={() => setSelectedMachineId(candidate.machineId)}
        accessibilityRole="button"
        accessibilityLabel={`Select ${candidate.machineName} at ${candidate.matchPercent} percent match`}
        accessibilityState={{ selected: isSelected }}
      >
        <View style={styles.candidateHeader}>
          <View style={styles.candidateNameBlock}>
            <Text style={styles.candidateName}>{candidate.machineName}</Text>
            <Text style={styles.candidateMeta}>
              {candidate.machineId}{candidate.revision ? ` | Rev ${candidate.revision}` : ''} | {candidate.partCount} parts
            </Text>
          </View>
          <View style={[styles.percentBadge, isSelected && styles.percentBadgeSelected]}>
            <Text style={styles.percentBadgeText}>{percentLabel(candidate.matchPercent)}</Text>
          </View>
        </View>
        <Text style={styles.candidateEvidence}>{candidate.evidence}</Text>
        {isSelected && (
          <View style={styles.selectedRow}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.accent} />
            <Text style={styles.selectedText}>Selected for reconstruction</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="git-branch-outline" size={28} color={Colors.secondary} />
          <View style={styles.headerText}>
            <Text style={styles.title}>Phase 2: Inventory</Text>
            <Text style={styles.description}>
              Review the inventory matches from your scan and choose the machine to rebuild.
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.panel}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Scan Summary</Text>
          <View style={styles.matchBadge}>
            <Ionicons name="search" size={14} color={Colors.accent} />
            <Text style={styles.matchBadgeText}>Ready to match</Text>
          </View>
        </View>

        <Text style={styles.machineName}>{analysis.productName}</Text>
        <Text style={styles.summaryText}>{analysis.rawAnalysis}</Text>

        <View style={styles.componentsGrid}>
          {analysis.components.map((component, index) => (
            <View key={`${component.name}-${index}`} style={styles.componentChip}>
              <Text style={styles.componentName}>{component.name}</Text>
              {component.isEssential && <Text style={styles.componentMeta}>core</Text>}
            </View>
          ))}
        </View>
      </View>

      <View style={styles.panel}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Inventory Match</Text>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={handleRecheck}
            disabled={isValidating || isLoading}
            accessibilityRole="button"
            accessibilityLabel="Recheck inventory matches"
          >
            <Ionicons name="refresh-outline" size={17} color={Colors.accent} />
          </TouchableOpacity>
        </View>

        <View style={styles.sourceNotice}>
          <Ionicons name="information-circle-outline" size={17} color={Colors.gray[400]} />
          <Text style={styles.sourceNoticeText}>
            Using {connector.sourceName}. To change the preconfigured inventory source, open the gear settings at the top.
          </Text>
          <TouchableOpacity
            style={styles.settingsLink}
            onPress={onOpenSettings}
            accessibilityRole="button"
            accessibilityLabel="Open settings to change inventory source"
          >
            <Ionicons name="settings-outline" size={15} color={Colors.accent} />
            <Text style={styles.settingsLinkText}>Settings</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sourceSummary}>
          <View style={styles.inventorySummaryIcon}>
            <Ionicons name="cube-outline" size={18} color={Colors.accent} />
          </View>
          <View style={styles.sourceSummaryText}>
            <Text style={styles.sourceName}>{connector.sourceName}</Text>
            <Text style={styles.sourceMeta}>
              {getConnectorTypeLabel(connector.connectorType)} | {getAuthModeLabel(connector.authMode)}
              {validation?.recordCount ? ` | ${validation.recordCount} records checked` : ''}
            </Text>
          </View>
        </View>

        {isValidating && (
          <View style={styles.statePanel}>
            <Ionicons name="sync-outline" size={18} color={Colors.accent} />
            <Text style={styles.stateText}>Checking inventory matches...</Text>
          </View>
        )}

        {!isValidating && candidates.length > 0 && (
          <>
            <Text style={styles.matchGuidance}>
              {candidates.length === 1 && candidates[0].matchPercent === 100
                ? 'The scan produced one exact inventory match.'
                : 'Select the best matching machine. Showing matches above 80% match confidence.'}
            </Text>
            <View style={styles.candidateList}>
              {candidates.map(renderCandidate)}
            </View>
          </>
        )}

        {!isValidating && validation?.status === 'ok' && candidates.length === 0 && (
          <View style={styles.noMatchPanel}>
            <Ionicons name="alert-circle-outline" size={24} color={Colors.orange[300]} />
            <Text style={styles.noMatchTitle}>No strong machine match found</Text>
            <Text style={styles.noMatchText}>
              No inventory records matched the Phase 1 scan above 80%. Add clearer model names, visible assemblies, or part details and scan again.
            </Text>
            <TouchableOpacity
              style={styles.restartButton}
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Restart Phase 1 scan"
            >
              <Ionicons name="arrow-back" size={17} color={Colors.black} />
              <Text style={styles.restartButtonText}>Restart Phase 1</Text>
            </TouchableOpacity>
          </View>
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}

        {selectedCandidate && (
          <TouchableOpacity
            style={[styles.applyButton, (isLoading || isValidating) && styles.disabledButton]}
            onPress={handleContinue}
            disabled={isLoading || isValidating}
            accessibilityRole="button"
            accessibilityLabel={`Use ${selectedCandidate.machineName} and continue to design`}
            accessibilityState={{ disabled: isLoading || isValidating }}
          >
            <View style={styles.buttonContent}>
              <Text style={styles.applyButtonText}>Use Selected Machine</Text>
              <Ionicons name="arrow-forward" size={18} color={Colors.white} />
            </View>
          </TouchableOpacity>
        )}
      </View>

      <LoadingOverlay
        visible={isLoading}
        phase="reverse"
        currentStep={loadingStep}
        steps={INVENTORY_STEPS}
      />
    </View>
  );
}

const createStyles = (Colors: AppColors) => StyleSheet.create({
  container: {
    paddingVertical: Spacing.lg,
    gap: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    flex: 1,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: FontSizes.xl,
    fontWeight: 'bold',
    color: Colors.white,
    marginBottom: Spacing.xs,
  },
  description: {
    fontSize: FontSizes.sm,
    color: Colors.gray[400],
    lineHeight: 20,
  },
  panel: {
    backgroundColor: Colors.panel,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: 'bold',
    color: Colors.white,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[700],
  },
  matchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 8,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  matchBadgeText: {
    color: Colors.accent,
    fontSize: FontSizes.xs,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  machineName: {
    color: Colors.white,
    fontSize: FontSizes.xl,
    fontWeight: 'bold',
    marginBottom: Spacing.sm,
  },
  summaryText: {
    color: Colors.gray[400],
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  componentsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  componentChip: {
    borderWidth: 1,
    borderColor: Colors.gray[700],
    borderRadius: 8,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.gray[900],
  },
  componentName: {
    color: Colors.gray[300],
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  componentMeta: {
    color: Colors.accent,
    fontSize: FontSizes.xs,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  sourceNotice: {
    borderWidth: 1,
    borderColor: Colors.gray[800],
    borderRadius: 8,
    padding: Spacing.sm,
    backgroundColor: Colors.surface,
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  sourceNoticeText: {
    color: Colors.gray[400],
    fontSize: FontSizes.xs,
    lineHeight: 17,
  },
  settingsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'flex-start',
    paddingTop: Spacing.xs,
  },
  settingsLinkText: {
    color: Colors.accent,
    fontSize: FontSizes.xs,
    fontWeight: 'bold',
  },
  sourceSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  inventorySummaryIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  sourceSummaryText: {
    flex: 1,
  },
  sourceName: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
  },
  sourceMeta: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
  statePanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.gray[800],
    borderRadius: 8,
    padding: Spacing.md,
  },
  stateText: {
    color: Colors.gray[300],
    fontSize: FontSizes.sm,
  },
  matchGuidance: {
    color: Colors.gray[400],
    fontSize: FontSizes.sm,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  candidateList: {
    gap: Spacing.sm,
  },
  candidateCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: Spacing.md,
    backgroundColor: Colors.surface,
  },
  candidateCardSelected: {
    borderColor: Colors.accent,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  candidateHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  candidateNameBlock: {
    flex: 1,
  },
  candidateName: {
    color: Colors.white,
    fontSize: FontSizes.md,
    fontWeight: 'bold',
  },
  candidateMeta: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    marginTop: 3,
  },
  percentBadge: {
    borderWidth: 1,
    borderColor: Colors.gray[700],
    borderRadius: 8,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  percentBadgeSelected: {
    borderColor: Colors.accent,
    backgroundColor: 'rgba(16, 185, 129, 0.16)',
  },
  percentBadgeText: {
    color: Colors.accent,
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
  },
  candidateEvidence: {
    color: Colors.gray[400],
    fontSize: FontSizes.xs,
    lineHeight: 17,
    marginTop: Spacing.sm,
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  selectedText: {
    color: Colors.accent,
    fontSize: FontSizes.xs,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  noMatchPanel: {
    borderWidth: 1,
    borderColor: Colors.orange[300],
    borderRadius: 8,
    padding: Spacing.md,
    backgroundColor: 'rgba(251, 146, 60, 0.08)',
  },
  noMatchTitle: {
    color: Colors.white,
    fontSize: FontSizes.md,
    fontWeight: 'bold',
    marginTop: Spacing.sm,
  },
  noMatchText: {
    color: Colors.gray[300],
    fontSize: FontSizes.sm,
    lineHeight: 20,
    marginTop: Spacing.xs,
    marginBottom: Spacing.md,
  },
  restartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingVertical: Spacing.sm,
  },
  restartButtonText: {
    color: Colors.black,
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
  },
  errorText: {
    color: Colors.red[500],
    marginTop: Spacing.sm,
  },
  applyButton: {
    backgroundColor: Colors.secondary,
    borderRadius: 8,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  disabledButton: {
    opacity: 0.6,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  applyButtonText: {
    color: Colors.white,
    fontSize: FontSizes.md,
    fontWeight: 'bold',
  },
});
