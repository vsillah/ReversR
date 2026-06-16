import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, Spacing, FontSizes, Radii, makeShadows } from '../constants/theme';
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
  mockMode?: boolean;
  mockValidation?: InventoryValidationResult | null;
  mockInnovation?: InnovationResult | null;
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
  mockMode = false,
  mockValidation,
  mockInnovation,
}: Props) {
  const { colors: Colors } = useAppTheme();
  const styles = createStyles(Colors);
  const [connector, setConnector] = useState<InventoryConnector>(defaultConnector);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<InventoryValidationResult | null>(null);
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const [expandedMachineIds, setExpandedMachineIds] = useState<Set<string>>(new Set());
  const [sourceHelpPinned, setSourceHelpPinned] = useState(false);
  const [sourceHelpHovered, setSourceHelpHovered] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>('connect');

  const candidates = useMemo(() => validation?.matchCandidates || [], [validation]);
  const selectedCandidate = candidates.find(candidate => candidate.machineId === selectedMachineId) || null;
  const noQualifyingMatches = !isValidating && validation?.status === 'ok' && candidates.length === 0;
  const showSourceHelp = noQualifyingMatches || sourceHelpPinned || sourceHelpHovered;

  useEffect(() => {
    if (mockMode && mockValidation) {
      setConnector({
        sourceName: mockValidation.sourceName,
        sourceUrl: mockValidation.sourceUrl,
        connectorType: 'demo',
        authMode: mockValidation.authMode || 'none',
      });
      setValidation(mockValidation);
      setSelectedMachineId(mockValidation.matchCandidates?.[0]?.machineId || null);
      setExpandedMachineIds(new Set());
      setIsValidating(false);
      setError(null);
      return;
    }

    const loadAndValidate = async () => {
      setIsValidating(true);
      setError(null);
      try {
        const nextConnector = await loadInventoryConnector();
        setConnector(nextConnector);
        const result = await validateInventoryConnector(nextConnector, analysis);
        setValidation(result);
        setSelectedMachineId(result.matchCandidates?.[0]?.machineId || null);
        setExpandedMachineIds(new Set());
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
  }, [analysis, mockMode, mockValidation]);

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
    if (mockMode && mockValidation) {
      setValidation(mockValidation);
      setSelectedMachineId(mockValidation.matchCandidates?.[0]?.machineId || null);
      setExpandedMachineIds(new Set());
      setError(null);
      return;
    }

    setIsValidating(true);
    setError(null);
    try {
      const nextConnector = await loadInventoryConnector();
      setConnector(nextConnector);
      await saveInventoryConnector(nextConnector);
      const result = await validateInventoryConnector(nextConnector, analysis);
      setValidation(result);
      setSelectedMachineId(result.matchCandidates?.[0]?.machineId || null);
      setExpandedMachineIds(new Set());
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
      if (mockMode && mockInnovation) {
        onComplete(mockInnovation);
        return;
      }

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

  const toggleCandidateSummary = (machineId: string) => {
    setExpandedMachineIds(prev => {
      const next = new Set(prev);

      if (next.has(machineId)) {
        next.delete(machineId);
      } else {
        next.add(machineId);
      }

      return next;
    });
  };

  const renderCandidate = (candidate: MatchCandidate) => {
    const isSelected = candidate.machineId === selectedMachineId;
    const isExpanded = expandedMachineIds.has(candidate.machineId);

    return (
      <View
        key={candidate.machineId}
        style={[styles.candidateCard, isSelected && styles.candidateCardSelected]}
      >
        <TouchableOpacity
          style={styles.candidateSelectArea}
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
        </TouchableOpacity>

        <Text style={styles.candidateEvidence}>{candidate.evidence}</Text>

        <View style={styles.candidateActionRow}>
          <TouchableOpacity
            style={styles.summaryToggle}
            onPress={() => toggleCandidateSummary(candidate.machineId)}
            accessibilityRole="button"
            accessibilityLabel={`${isExpanded ? 'Hide' : 'Show'} ${candidate.machineName} machine summary`}
            accessibilityState={{ expanded: isExpanded }}
          >
            <Ionicons
              name={isExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
              size={16}
              color={Colors.accent}
            />
            <Text style={styles.summaryToggleText}>
              {isExpanded ? 'Hide machine summary' : 'Show machine summary'}
            </Text>
          </TouchableOpacity>

          {isSelected && (
            <View style={styles.selectedRow}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.accent} />
              <Text style={styles.selectedText}>Selected</Text>
            </View>
          )}
        </View>

        {isExpanded && (
          <View style={styles.machineSummaryPanel}>
            <Text style={styles.machineSummaryTitle}>{analysis.productName}</Text>
            <Text style={styles.machineSummaryText}>{analysis.rawAnalysis}</Text>

            <View style={styles.componentsGrid}>
              {analysis.components.map((component, index) => (
                <View key={`${candidate.machineId}-${component.name}-${index}`} style={styles.componentChip}>
                  <Text style={styles.componentName}>{component.name}</Text>
                  {component.isEssential && <Text style={styles.componentMeta}>core</Text>}
                </View>
              ))}
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container} testID="reversr-tour-inventory">
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Ionicons name="git-branch-outline" size={24} color={Colors.primary} />
          </View>
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
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Inventory Match</Text>
            <Pressable
              style={[styles.helpButton, (showSourceHelp || sourceHelpPinned) && styles.helpButtonActive]}
              onHoverIn={() => setSourceHelpHovered(true)}
              onHoverOut={() => setSourceHelpHovered(false)}
              onPress={() => setSourceHelpPinned(prev => !prev)}
              accessibilityRole="button"
              accessibilityLabel="Show inventory source details"
              accessibilityState={{ expanded: showSourceHelp }}
            >
              <Ionicons name="information-circle-outline" size={17} color={Colors.accent} />
            </Pressable>
          </View>
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

        {showSourceHelp && (
          <View style={styles.sourceTooltip}>
            <View style={styles.sourceTooltipHeader}>
              <Ionicons name="cube-outline" size={16} color={Colors.accent} />
              <Text style={styles.sourceTooltipTitle}>{connector.sourceName}</Text>
            </View>
            <Text style={styles.sourceTooltipText}>
              Matching is using this preconfigured inventory source. Change it only from gear settings when the source or connector is wrong.
            </Text>
            <Text style={styles.sourceTooltipMeta}>
              {getConnectorTypeLabel(connector.connectorType)} | {getAuthModeLabel(connector.authMode)}
              {validation?.recordCount ? ` | ${validation.recordCount} records checked` : ''}
            </Text>
            <TouchableOpacity
              style={styles.settingsLink}
              onPress={onOpenSettings}
              accessibilityRole="button"
              accessibilityLabel="Open settings to change inventory source"
            >
              <Ionicons name="settings-outline" size={15} color={Colors.accent} />
              <Text style={styles.settingsLinkText}>Open inventory settings</Text>
            </TouchableOpacity>
          </View>
        )}

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
              <Ionicons name="arrow-back" size={17} color="#ffffff" />
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

const createStyles = (Colors: AppColors) => {
  const shadows = makeShadows(Colors);
  return StyleSheet.create({
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
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primarySoft,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: FontSizes.xl,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  description: {
    fontSize: FontSizes.sm,
    color: Colors.mutedText,
    lineHeight: 20,
  },
  panel: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
    ...shadows.card,
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
    color: Colors.text,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  helpButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  helpButtonActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.mode === 'dark' ? 'rgba(16, 185, 129, 0.12)' : '#ecfdf5',
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
  componentsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  componentChip: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.elevated,
  },
  componentName: {
    color: Colors.text,
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  componentMeta: {
    color: Colors.accent,
    fontSize: FontSizes.xs,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  sourceTooltip: {
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 8,
    padding: Spacing.md,
    backgroundColor: Colors.mode === 'dark' ? 'rgba(16, 185, 129, 0.10)' : '#ecfdf5',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  sourceTooltipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  sourceTooltipTitle: {
    color: Colors.text,
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
    flex: 1,
  },
  sourceTooltipText: {
    color: Colors.mutedText,
    fontSize: FontSizes.xs,
    lineHeight: 17,
  },
  sourceTooltipMeta: {
    color: Colors.dim,
    fontSize: FontSizes.xs,
    lineHeight: 16,
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
    borderRadius: Radii.md,
    backgroundColor: Colors.elevated,
    overflow: 'hidden',
  },
  candidateCardSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentSoft,
  },
  candidateSelectArea: {
    padding: Spacing.md,
    paddingBottom: Spacing.sm,
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
    color: Colors.text,
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
    paddingHorizontal: Spacing.md,
  },
  candidateActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    padding: Spacing.md,
    paddingTop: Spacing.sm,
  },
  summaryToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: 32,
  },
  summaryToggleText: {
    color: Colors.accent,
    fontSize: FontSizes.xs,
    fontWeight: 'bold',
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  selectedText: {
    color: Colors.accent,
    fontSize: FontSizes.xs,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  machineSummaryPanel: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    padding: Spacing.md,
    backgroundColor: Colors.panel,
  },
  machineSummaryTitle: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: 'bold',
    marginBottom: Spacing.xs,
  },
  machineSummaryText: {
    color: Colors.mutedText,
    fontSize: FontSizes.sm,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  noMatchPanel: {
    borderWidth: 1,
    borderColor: Colors.orange[300],
    borderRadius: 8,
    padding: Spacing.md,
    backgroundColor: 'rgba(251, 146, 60, 0.08)',
  },
  noMatchTitle: {
    color: Colors.text,
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
    backgroundColor: Colors.primary,
    borderRadius: Radii.md,
    paddingVertical: Spacing.md,
  },
  restartButtonText: {
    color: '#ffffff',
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
  },
  errorText: {
    color: Colors.danger,
    marginTop: Spacing.sm,
  },
  applyButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radii.md,
    paddingVertical: 15,
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
    color: '#ffffff',
    fontSize: FontSizes.md,
    fontWeight: 'bold',
  },
  });
};
