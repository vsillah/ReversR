import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSizes } from '../constants/theme';
import {
  AnalysisResult,
  InnovationResult,
  InventoryConnector,
  InventoryValidationResult,
  identifyMachineFromInventory,
  validateInventoryConnector,
} from '../hooks/useGemini';
import LoadingOverlay, { LoadingStep } from './LoadingOverlay';

const INVENTORY_STEPS: LoadingStep[] = [
  { id: 'connect', label: 'Checking inventory connector...' },
  { id: 'match', label: 'Matching machine profile...' },
  { id: 'plan', label: 'Preparing reconstruction plan...' },
];

const CONNECTOR_STORAGE_KEY = 'reversr_inventory_connector';
const FARMBOT_PUBLIC_INVENTORY_URL = 'https://raw.githubusercontent.com/vsillah/ReversR-Rebuild/main/public/inventory/farmbot-genesis-v1.8.json';

interface Props {
  analysis: AnalysisResult;
  capturedImage?: string | null;
  onComplete: (innovation: InnovationResult) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  onBack: () => void;
  onReset: () => void;
}

const defaultConnector: InventoryConnector = {
  sourceName: 'FarmBot Genesis Public Inventory',
  sourceUrl: FARMBOT_PUBLIC_INVENTORY_URL,
  connectorType: 'api',
  authMode: 'none',
  credentialRef: '',
  notes: 'Public FarmBot Genesis v1.8 machine inventory generated from FarmBot hardware documentation and BOM sources. Human review is required before procurement, fabrication, or assembly.',
};

const migrateSavedConnector = (savedConnector: Partial<InventoryConnector>): InventoryConnector => {
  const merged = { ...defaultConnector, ...savedConnector };
  const isLegacyDemo = merged.sourceUrl === 'demo://sample-machines' || merged.sourceName === 'Demo Machine Inventory';
  return isLegacyDemo ? defaultConnector : merged;
};

export default function PhaseTwo({
  analysis,
  capturedImage,
  onComplete,
  isLoading,
  setIsLoading,
}: Props) {
  const [connector, setConnector] = useState<InventoryConnector>(defaultConnector);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<InventoryValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>('connect');

  useEffect(() => {
    const loadConnector = async () => {
      try {
        const saved = await AsyncStorage.getItem(CONNECTOR_STORAGE_KEY);
        if (saved) {
          const migratedConnector = migrateSavedConnector(JSON.parse(saved));
          setConnector(migratedConnector);
          if (migratedConnector.sourceUrl === FARMBOT_PUBLIC_INVENTORY_URL) {
            await AsyncStorage.setItem(CONNECTOR_STORAGE_KEY, JSON.stringify(migratedConnector));
          }
        }
      } catch (e) {
        console.error('Failed to load inventory connector:', e);
      }
    };
    loadConnector();
  }, []);

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

  const updateConnector = (key: keyof InventoryConnector, value: string) => {
    setConnector(prev => ({ ...prev, [key]: value }));
    setValidation(null);
  };

  const saveConnector = async () => {
    await AsyncStorage.setItem(CONNECTOR_STORAGE_KEY, JSON.stringify(connector));
  };

  const handleValidate = async () => {
    setIsValidating(true);
    setError(null);
    try {
      await saveConnector();
      const result = await validateInventoryConnector(connector);
      setValidation(result);
    } catch (e: any) {
      console.error('Inventory validation failed:', e);
      setValidation(null);
      setError(e?.message || 'Inventory validation failed. Check the connector URL and data format.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleMatch = async () => {
    setIsLoading(true);
    setLoadingStep('connect');
    setError(null);

    try {
      await saveConnector();
      const result = await identifyMachineFromInventory(analysis, connector, capturedImage);
      onComplete(result);
    } catch (e: any) {
      console.error('Inventory match failed:', e);
      setError(e?.message || 'Inventory match failed. Check the connector and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="git-branch-outline" size={28} color={Colors.secondary} />
          <View style={styles.headerText}>
            <Text style={styles.title}>Phase 2: Inventory</Text>
            <Text style={styles.description}>
              Connect the machine inventory, match the scan, then prepare a reconstruction plan.
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
          <Text style={styles.sectionTitle}>Admin Inventory Connector</Text>
          <Ionicons name="lock-closed-outline" size={16} color={Colors.gray[500]} />
        </View>

        <Text style={styles.fieldLabel}>Source name</Text>
        <TextInput
          style={styles.input}
          value={connector.sourceName}
          onChangeText={value => updateConnector('sourceName', value)}
          accessibilityLabel="Inventory source name"
          placeholder="e.g., PartsLedger, Airtable, NetSuite, MaintenanceDB"
          placeholderTextColor={Colors.gray[600]}
        />

        <Text style={styles.fieldLabel}>Inventory URL or connector URI</Text>
        <TextInput
          style={styles.input}
          value={connector.sourceUrl}
          onChangeText={value => updateConnector('sourceUrl', value)}
          accessibilityLabel="Inventory connector URL"
          placeholder="https://.../machines.csv or api://inventory/machines"
          placeholderTextColor={Colors.gray[600]}
          autoCapitalize="none"
        />

        <View style={styles.optionRow}>
          {(['demo', 'csv', 'api', 'erp'] as InventoryConnector['connectorType'][]).map(option => (
            <TouchableOpacity
              key={option}
              style={[styles.optionButton, connector.connectorType === option && styles.optionButtonActive]}
              onPress={() => updateConnector('connectorType', option)}
              accessibilityRole="button"
              accessibilityLabel={`Use ${option.toUpperCase()} inventory connector type`}
              accessibilityState={{ selected: connector.connectorType === option }}
            >
              <Text style={[styles.optionText, connector.connectorType === option && styles.optionTextActive]}>
                {option.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.optionRow}>
          {(['none', 'api_key', 'oauth', 'private_network'] as InventoryConnector['authMode'][]).map(option => (
            <TouchableOpacity
              key={option}
              style={[styles.optionButton, connector.authMode === option && styles.optionButtonActive]}
              onPress={() => updateConnector('authMode', option)}
              accessibilityRole="button"
              accessibilityLabel={`Use ${option.replace(/_/g, ' ')} inventory authentication`}
              accessibilityState={{ selected: connector.authMode === option }}
            >
              <Text style={[styles.optionText, connector.authMode === option && styles.optionTextActive]}>
                {option.replace(/_/g, ' ')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {connector.authMode !== 'none' && (
          <>
            <Text style={styles.fieldLabel}>Backend credential reference</Text>
            <TextInput
              style={styles.input}
              value={connector.credentialRef}
              onChangeText={value => updateConnector('credentialRef', value)}
              accessibilityLabel="Backend credential reference"
              placeholder="e.g., partsledger-prod-api-key"
              placeholderTextColor={Colors.gray[600]}
              autoCapitalize="none"
            />
            <Text style={styles.helperText}>
              Store only a reference here. API keys, OAuth tokens, and private-network headers must be configured on the backend.
            </Text>
          </>
        )}

        <Text style={styles.fieldLabel}>Admin notes</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          value={connector.notes}
          onChangeText={value => updateConnector('notes', value)}
          accessibilityLabel="Inventory connector admin notes"
          placeholder="Map required columns, access notes, or connector owner."
          placeholderTextColor={Colors.gray[600]}
          multiline
        />

        <View style={styles.validationRow}>
          <TouchableOpacity
            style={[styles.validateButton, isValidating && styles.disabledButton]}
            onPress={handleValidate}
            disabled={isValidating || isLoading}
            accessibilityRole="button"
            accessibilityLabel="Validate inventory connector"
            accessibilityState={{ disabled: isValidating || isLoading }}
          >
            <Ionicons name="shield-checkmark-outline" size={18} color={Colors.accent} />
            <Text style={styles.validateButtonText}>
              {isValidating ? 'Validating...' : 'Validate Connector'}
            </Text>
          </TouchableOpacity>
          {validation?.status === 'ok' && (
            <View style={styles.validationBadge}>
              <Ionicons name="checkmark-circle" size={14} color={Colors.green[400]} />
              <Text style={styles.validationBadgeText}>
                {validation.recordCount} records
                {validation.credentialStatus === 'configured' ? ' | credential configured' : ''}
              </Text>
            </View>
          )}
        </View>

        {validation?.status === 'ok' && (
          <View style={styles.validationPanel}>
            <Text style={styles.validationTitle}>Inventory Preview</Text>
            {validation.sampleMachines.map(machine => (
              <View key={machine.machineId} style={styles.machinePreviewRow}>
                <View style={styles.machinePreviewText}>
                  <Text style={styles.machinePreviewName}>{machine.machineName}</Text>
                  <Text style={styles.machinePreviewMeta}>
                    {machine.machineId}{machine.revision ? ` | Rev ${machine.revision}` : ''} | {machine.partCount} parts
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          style={styles.applyButton}
          onPress={handleMatch}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel="Match machine and build reconstruction plan"
          accessibilityState={{ disabled: isLoading }}
        >
          <View style={styles.buttonContent}>
            <Text style={styles.applyButtonText}>Match Machine & Build Plan</Text>
            <Ionicons name="construct" size={18} color={Colors.white} />
          </View>
        </TouchableOpacity>
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

const styles = StyleSheet.create({
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
  fieldLabel: {
    color: Colors.gray[300],
    fontSize: FontSizes.sm,
    fontWeight: '700',
    marginBottom: Spacing.xs,
    marginTop: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.dark,
    borderWidth: 1,
    borderColor: Colors.gray[700],
    borderRadius: 8,
    padding: Spacing.md,
    color: Colors.white,
    fontSize: FontSizes.md,
    marginBottom: Spacing.sm,
  },
  notesInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  helperText: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    lineHeight: 16,
    marginTop: -Spacing.xs,
    marginBottom: Spacing.sm,
  },
  validationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    flexWrap: 'wrap',
  },
  validateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  validateButtonText: {
    color: Colors.accent,
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
  },
  disabledButton: {
    opacity: 0.6,
  },
  validationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderWidth: 1,
    borderColor: Colors.green[600],
    borderRadius: 8,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  validationBadgeText: {
    color: Colors.green[400],
    fontSize: FontSizes.xs,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  validationPanel: {
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  validationTitle: {
    color: Colors.gray[300],
    fontSize: FontSizes.xs,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  machinePreviewRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.sm,
    marginTop: Spacing.sm,
  },
  machinePreviewText: {
    flex: 1,
  },
  machinePreviewName: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
  },
  machinePreviewMeta: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginVertical: Spacing.sm,
  },
  optionButton: {
    borderWidth: 1,
    borderColor: Colors.gray[700],
    borderRadius: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minWidth: 84,
    alignItems: 'center',
  },
  optionButtonActive: {
    backgroundColor: Colors.secondary + '20',
    borderColor: Colors.secondary,
  },
  optionText: {
    color: Colors.gray[400],
    fontSize: FontSizes.xs,
    fontWeight: 'bold',
    textTransform: 'capitalize',
  },
  optionTextActive: {
    color: Colors.white,
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
