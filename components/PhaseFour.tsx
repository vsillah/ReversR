import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSizes } from '../constants/theme';
import {
  InnovationResult,
  TechnicalSpec,
  BillOfMaterials,
  generateBOM,
} from '../hooks/useGemini';

interface Props {
  innovation: InnovationResult;
  spec: TechnicalSpec;
  bom: BillOfMaterials | null;
  onBOMGenerated: (bom: BillOfMaterials) => void;
  onBack: () => void;
  onReset: () => void;
  onTryAnotherPattern: () => void;
}

export default function PhaseFour({
  innovation,
  spec,
  bom,
  onBOMGenerated,
  onBack,
  onReset,
  onTryAnotherPattern,
}: Props) {
  const [localBom, setLocalBom] = useState<BillOfMaterials | null>(bom);
  const [status, setStatus] = useState<'idle' | 'generating' | 'complete'>(
    bom ? 'complete' : 'idle'
  );
  const [error, setError] = useState<string | null>(null);

  const formatError = (e: unknown) => {
    const err = e as { message?: string };
    const msg = err.message || 'Unknown error occurred.';
    if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
      return 'System is at capacity. Please wait and try again.';
    }
    return msg;
  };

  const handleGenerateBOM = async () => {
    setStatus('generating');
    setError(null);

    try {
      const bomResult = await generateBOM(innovation);
      setLocalBom(bomResult);
      setStatus('complete');
      onBOMGenerated(bomResult);
    } catch (err: unknown) {
      console.error('Error generating BOM:', err);
      setError(formatError(err));
      setStatus('idle');
    }
  };

  const handleExportBOM = async () => {
    if (!localBom) return;

    try {
      const csvHeader = 'Part Number,Part Name,Description,Quantity,Material,Est. Cost,Supplier,Lead Time,Notes\n';
      const csvRows = localBom.items.map(item =>
        `"${item.partNumber}","${item.partName}","${item.description}",${item.quantity},"${item.material}","${item.estimatedCost}","${item.supplier}","${item.leadTime}","${item.notes}"`
      ).join('\n');
      const csvContent = csvHeader + csvRows + `\n\nTotal Estimated Cost: ${localBom.totalEstimatedCost}\nManufacturing Notes: ${localBom.manufacturingNotes}`;

      const name = innovation.conceptName.replace(/\s+/g, '_');
      const fileUri = FileSystem.documentDirectory + `${name}_BOM.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csvContent);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Saved', 'Bill of Materials saved to device.');
      }
    } catch (e) {
      console.error('BOM Export error:', e);
      Alert.alert('Error', 'Failed to export Bill of Materials.');
    }
  };

  const handleExportAll = async () => {
    try {
      const exportData = {
        innovation,
        specifications: spec,
        billOfMaterials: localBom,
        exportedAt: new Date().toISOString(),
      };

      const name = innovation.conceptName.replace(/\s+/g, '_');
      const fileUri = FileSystem.documentDirectory + `${name}_complete.json`;
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(exportData, null, 2));

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Saved', 'Complete innovation package saved to device.');
      }
    } catch (e) {
      console.error('Export error:', e);
      Alert.alert('Error', 'Failed to export package.');
    }
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="construct" size={28} color={Colors.orange[300]} />
          <View style={styles.headerText}>
            <Text style={styles.title}>Phase 4: Build</Text>
            <Text style={styles.description}>Manufacturing readiness & Bill of Materials</Text>
          </View>
        </View>
        <View style={styles.navButtons}>
          <TouchableOpacity onPress={onBack} style={styles.navButton}>
            <Ionicons name="arrow-back" size={16} color={Colors.gray[400]} />
            <Text style={styles.navButtonText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onReset} style={styles.navButton}>
            <Ionicons name="refresh" size={16} color={Colors.gray[400]} />
            <Text style={styles.navButtonText}>Reset</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.conceptCard}>
        <Text style={styles.conceptName}>{innovation.conceptName}</Text>
        <Text style={styles.conceptDesc}>{innovation.conceptDescription}</Text>
      </View>

      <View style={styles.bomPanel}>
        <View style={styles.panelHeader}>
          <View style={styles.terminalDots}>
            <View style={[styles.dot, { backgroundColor: '#ef4444' }]} />
            <View style={[styles.dot, { backgroundColor: '#eab308' }]} />
            <View style={[styles.dot, { backgroundColor: '#22c55e' }]} />
          </View>
          <Text style={styles.panelTitle}>bill_of_materials.csv</Text>
        </View>

        {status === 'generating' ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.orange[300]} />
            <Text style={styles.loadingText}>Generating Bill of Materials...</Text>
            <Text style={styles.loadingSubtext}>Calculating parts, costs & suppliers</Text>
          </View>
        ) : localBom ? (
          <View style={styles.bomContent}>
            <View style={styles.bomHeader}>
              <Text style={styles.bomProjectName}>{localBom.projectName}</Text>
              <Text style={styles.bomMeta}>v{localBom.version} | {localBom.dateGenerated}</Text>
            </View>

            <View style={styles.bomItemsContainer}>
              {localBom.items.map((item, index) => (
                <View key={index} style={styles.bomItem}>
                  <View style={styles.bomItemHeader}>
                    <Text style={styles.bomPartNumber}>{item.partNumber}</Text>
                    <Text style={styles.bomQuantity}>x{item.quantity}</Text>
                  </View>
                  <Text style={styles.bomPartName}>{item.partName}</Text>
                  <Text style={styles.bomPartDesc}>{item.description}</Text>
                  <View style={styles.bomItemMeta}>
                    <Text style={styles.bomItemMetaText}>{item.material}</Text>
                    <Text style={styles.bomItemCost}>{item.estimatedCost}</Text>
                  </View>
                  <View style={styles.bomItemFooter}>
                    <Text style={styles.bomSupplier}>{item.supplier}</Text>
                    <Text style={styles.bomLeadTime}>{item.leadTime}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.bomTotalSection}>
              <Text style={styles.bomTotalLabel}>Total Estimated Cost</Text>
              <Text style={styles.bomTotalValue}>{localBom.totalEstimatedCost}</Text>
            </View>

            <View style={styles.bomNotesSection}>
              <Text style={styles.bomNotesLabel}>Manufacturing Notes</Text>
              <Text style={styles.bomNotes}>{localBom.manufacturingNotes}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.generateContainer}>
            <Ionicons name="list-outline" size={48} color={Colors.gray[600]} />
            <Text style={styles.generateTitle}>Bill of Materials</Text>
            <Text style={styles.generateDesc}>
              Generate a complete parts list with quantities, materials, estimated costs, and supplier recommendations.
            </Text>
            <TouchableOpacity style={styles.generateButton} onPress={handleGenerateBOM}>
              <Ionicons name="hammer" size={20} color={Colors.black} />
              <Text style={styles.generateButtonText}>Generate BOM</Text>
            </TouchableOpacity>
          </View>
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}
      </View>

      {localBom && (
        <View style={styles.exportPanel}>
          <Text style={styles.exportTitle}>Export Options</Text>
          <View style={styles.exportButtons}>
            <TouchableOpacity style={styles.exportButton} onPress={handleExportBOM}>
              <Ionicons name="document-text" size={20} color={Colors.accent} />
              <Text style={styles.exportButtonText}>Export BOM (CSV)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.exportButton} onPress={handleExportAll}>
              <Ionicons name="archive" size={20} color={Colors.accent} />
              <Text style={styles.exportButtonText}>Export All (JSON)</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.actionsPanel}>
        <Text style={styles.actionsTitle}>What's Next?</Text>
        <TouchableOpacity style={styles.actionButton} onPress={onTryAnotherPattern}>
          <Ionicons name="shuffle" size={20} color={Colors.secondary} />
          <View style={styles.actionContent}>
            <Text style={styles.actionButtonText}>Try Another Pattern</Text>
            <Text style={styles.actionButtonSubtext}>Keep analysis, apply different SIT pattern</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={onReset}>
          <Ionicons name="add-circle" size={20} color={Colors.accent} />
          <View style={styles.actionContent}>
            <Text style={styles.actionButtonText}>New Innovation</Text>
            <Text style={styles.actionButtonSubtext}>Start fresh with a new product</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={{ height: 50 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
  },
  headerLeft: {
    flexDirection: 'row',
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
    color: Colors.dim,
  },
  navButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
  },
  navButtonText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[400],
  },
  conceptCard: {
    backgroundColor: Colors.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  conceptName: {
    fontFamily: 'monospace',
    fontSize: FontSizes.lg,
    color: Colors.orange[300],
    marginBottom: Spacing.sm,
  },
  conceptDesc: {
    fontSize: FontSizes.sm,
    color: Colors.gray[300],
  },
  bomPanel: {
    backgroundColor: Colors.black,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.panel,
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  terminalDots: {
    flexDirection: 'row',
    gap: 6,
    marginRight: Spacing.md,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  panelTitle: {
    fontFamily: 'monospace',
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  loadingText: {
    marginTop: Spacing.md,
    fontFamily: 'monospace',
    fontSize: FontSizes.sm,
    color: Colors.orange[300],
  },
  loadingSubtext: {
    marginTop: Spacing.xs,
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  bomContent: {
    padding: Spacing.lg,
  },
  bomHeader: {
    marginBottom: Spacing.md,
  },
  bomProjectName: {
    fontFamily: 'monospace',
    fontSize: FontSizes.lg,
    color: Colors.orange[300],
    marginBottom: Spacing.xs,
  },
  bomMeta: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  bomItemsContainer: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  bomItem: {
    backgroundColor: Colors.panel,
    borderRadius: 8,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bomItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  bomPartNumber: {
    fontFamily: 'monospace',
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  bomQuantity: {
    fontFamily: 'monospace',
    fontSize: FontSizes.sm,
    color: Colors.orange[300],
    fontWeight: 'bold',
  },
  bomPartName: {
    fontSize: FontSizes.sm,
    color: Colors.white,
    fontWeight: 'bold',
    marginBottom: Spacing.xs,
  },
  bomPartDesc: {
    fontSize: FontSizes.xs,
    color: Colors.gray[400],
    marginBottom: Spacing.sm,
  },
  bomItemMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  bomItemMetaText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  bomItemCost: {
    fontFamily: 'monospace',
    fontSize: FontSizes.sm,
    color: Colors.green[400],
    fontWeight: 'bold',
  },
  bomItemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bomSupplier: {
    fontSize: FontSizes.xs,
    color: Colors.blue[500],
  },
  bomLeadTime: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  bomTotalSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(22, 101, 52, 0.2)',
    padding: Spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(22, 101, 52, 0.5)',
    marginBottom: Spacing.md,
  },
  bomTotalLabel: {
    fontSize: FontSizes.sm,
    color: Colors.green[400],
    fontWeight: 'bold',
  },
  bomTotalValue: {
    fontFamily: 'monospace',
    fontSize: FontSizes.lg,
    color: Colors.green[400],
    fontWeight: 'bold',
  },
  bomNotesSection: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: Spacing.md,
    borderRadius: 8,
  },
  bomNotesLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  bomNotes: {
    fontSize: FontSizes.sm,
    color: Colors.gray[300],
    lineHeight: 20,
  },
  generateContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.lg,
  },
  generateTitle: {
    fontSize: FontSizes.lg,
    fontWeight: 'bold',
    color: Colors.white,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  generateDesc: {
    fontSize: FontSizes.sm,
    color: Colors.gray[400],
    textAlign: 'center',
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.orange[300],
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: 8,
  },
  generateButtonText: {
    fontFamily: 'monospace',
    fontSize: FontSizes.md,
    fontWeight: 'bold',
    color: Colors.black,
  },
  errorText: {
    padding: Spacing.md,
    fontSize: FontSizes.sm,
    color: Colors.red[500],
    textAlign: 'center',
  },
  exportPanel: {
    backgroundColor: Colors.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  exportTitle: {
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
    color: Colors.gray[300],
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: Spacing.md,
  },
  exportButtons: {
    gap: Spacing.sm,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: Spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  exportButtonText: {
    fontSize: FontSizes.sm,
    color: Colors.accent,
  },
  actionsPanel: {
    backgroundColor: Colors.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
  },
  actionsTitle: {
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
    color: Colors.gray[300],
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: Spacing.md,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: Spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  actionContent: {
    flex: 1,
  },
  actionButtonText: {
    fontSize: FontSizes.sm,
    color: Colors.white,
    fontWeight: 'bold',
  },
  actionButtonSubtext: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    marginTop: 2,
  },
});
