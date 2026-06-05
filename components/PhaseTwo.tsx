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
  identifyMachineFromInventory,
} from '../hooks/useGemini';
import LoadingOverlay, { LoadingStep } from './LoadingOverlay';

const INVENTORY_STEPS: LoadingStep[] = [
  { id: 'connect', label: 'Checking inventory connector...' },
  { id: 'match', label: 'Matching machine profile...' },
  { id: 'plan', label: 'Preparing reconstruction plan...' },
];

const CONNECTOR_STORAGE_KEY = 'reversr_inventory_connector';

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
  sourceName: 'Demo Machine Inventory',
  sourceUrl: 'demo://sample-machines',
  connectorType: 'demo',
  authMode: 'none',
  notes: 'Use this demo source until an ERP, spreadsheet, or parts database connector is available.',
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
  const [loadingStep, setLoadingStep] = useState<string>('connect');

  useEffect(() => {
    const loadConnector = async () => {
      try {
        const saved = await AsyncStorage.getItem(CONNECTOR_STORAGE_KEY);
        if (saved) {
          setConnector({ ...defaultConnector, ...JSON.parse(saved) });
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
  };

  const saveConnector = async () => {
    await AsyncStorage.setItem(CONNECTOR_STORAGE_KEY, JSON.stringify(connector));
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
          placeholder="e.g., PartsLedger, Airtable, NetSuite, MaintenanceDB"
          placeholderTextColor={Colors.gray[600]}
        />

        <Text style={styles.fieldLabel}>Inventory URL or connector URI</Text>
        <TextInput
          style={styles.input}
          value={connector.sourceUrl}
          onChangeText={value => updateConnector('sourceUrl', value)}
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
            >
              <Text style={[styles.optionText, connector.authMode === option && styles.optionTextActive]}>
                {option.replace(/_/g, ' ')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Admin notes</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          value={connector.notes}
          onChangeText={value => updateConnector('notes', value)}
          placeholder="Map required columns, access notes, or connector owner."
          placeholderTextColor={Colors.gray[600]}
          multiline
        />

        {error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          style={styles.applyButton}
          onPress={handleMatch}
          disabled={isLoading}
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
