import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSizes } from '../constants/theme';
import {
  InnovationResult,
  TechnicalSpec,
  BillOfMaterials,
  ThreeDSceneDescriptor,
  generateBOM,
} from '../hooks/useGemini';

interface Props {
  innovation: InnovationResult;
  spec: TechnicalSpec;
  bom: BillOfMaterials | null;
  imageUrl: string | null;
  threeDScene: ThreeDSceneDescriptor | null;
  onBOMGenerated: (bom: BillOfMaterials) => void;
  onBack: () => void;
  onReset: () => void;
  onTryAnotherPattern: () => void;
}

type ArtifactStatus = {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  ready: boolean;
};

const MANUFACTURERS = [
  {
    id: 'xometry',
    name: 'Xometry',
    subtitle: 'CNC, 3D Printing, Sheet Metal',
    icon: 'build-outline' as const,
    url: 'https://www.xometry.com',
  },
  {
    id: 'shapeways',
    name: 'Shapeways',
    subtitle: '3D Printing Marketplace',
    icon: 'print-outline' as const,
    url: 'https://www.shapeways.com',
  },
  {
    id: 'protolabs',
    name: 'Protolabs',
    subtitle: 'Rapid Prototyping',
    icon: 'flash-outline' as const,
    url: 'https://www.protolabs.com',
  },
  {
    id: 'jlcpcb',
    name: 'JLCPCB',
    subtitle: 'PCB & 3D Printing',
    icon: 'hardware-chip-outline' as const,
    url: 'https://www.jlcpcb.com',
  },
];

export default function PhaseFour({
  innovation,
  spec,
  bom,
  imageUrl,
  threeDScene,
  onBOMGenerated,
  onBack,
  onReset,
  onTryAnotherPattern,
}: Props) {
  const [localBom, setLocalBom] = useState<BillOfMaterials | null>(bom);
  const has2D = !!imageUrl;
  const has3D = !!threeDScene;
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
      const exportData: Record<string, unknown> = {
        innovation,
        specifications: spec,
        billOfMaterials: localBom,
        exportedAt: new Date().toISOString(),
      };

      if (imageUrl) {
        exportData.visualization2D = {
          type: 'base64_png',
          data: imageUrl,
        };
      }

      if (threeDScene) {
        exportData.visualization3D = {
          type: 'scene_descriptor',
          scene: threeDScene,
        };
      }

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
      </View>

      <View style={styles.conceptCard}>
        <Text style={styles.conceptName}>{innovation.conceptName}</Text>
        <Text style={styles.conceptDesc}>{innovation.conceptDescription}</Text>
      </View>

      {/* Manufacturing Readiness Tracker */}
      {(() => {
        const artifacts: ArtifactStatus[] = [
          { id: 'specs', name: 'Specs', icon: 'document-text-outline', ready: !!spec },
          { id: 'bom', name: 'BOM', icon: 'list-outline', ready: !!localBom },
          { id: '3d', name: '3D', icon: 'cube-outline', ready: has3D },
          { id: '2d', name: '2D', icon: 'image-outline', ready: has2D },
        ];
        const readyCount = artifacts.filter(a => a.ready).length;
        const percentage = Math.round((readyCount / artifacts.length) * 100);
        
        return (
          <View style={styles.readinessPanel}>
            <View style={styles.readinessHeader}>
              <View style={styles.readinessLeft}>
                <Ionicons name="rocket-outline" size={18} color={Colors.gray[400]} />
                <View>
                  <Text style={styles.readinessTitle}>Manufacturing Readiness</Text>
                  <Text style={styles.readinessSubtitle}>Generate artifacts for prototype manufacturing</Text>
                </View>
              </View>
              <View style={styles.readinessBadge}>
                <Text style={styles.readinessPercent}>{percentage}% Ready</Text>
              </View>
            </View>
            <View style={styles.artifactGrid}>
              {artifacts.map((artifact) => (
                <View 
                  key={artifact.id} 
                  style={[
                    styles.artifactItem,
                    artifact.ready && styles.artifactItemReady,
                  ]}
                >
                  <Ionicons 
                    name={artifact.ready ? 'checkmark-circle' : artifact.icon} 
                    size={24} 
                    color={artifact.ready ? Colors.accent : Colors.gray[600]} 
                  />
                  <Text style={[
                    styles.artifactName,
                    artifact.ready && styles.artifactNameReady,
                  ]}>{artifact.name}</Text>
                </View>
              ))}
            </View>
          </View>
        );
      })()}

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
                    <Text style={styles.bomPartNumber} numberOfLines={1}>{item.partNumber}</Text>
                    <Text style={styles.bomQuantity}>x{item.quantity}</Text>
                  </View>
                  <Text style={styles.bomPartName} numberOfLines={2}>{item.partName}</Text>
                  <Text style={styles.bomPartDesc} numberOfLines={3}>{item.description}</Text>
                  <View style={styles.bomItemMeta}>
                    <Text style={styles.bomItemMetaText} numberOfLines={1}>{item.material}</Text>
                    <Text style={styles.bomItemCost}>{item.estimatedCost}</Text>
                  </View>
                  <View style={styles.bomItemFooter}>
                    <Text style={styles.bomSupplier} numberOfLines={1}>{item.supplier}</Text>
                    <Text style={styles.bomLeadTime} numberOfLines={1}>{item.leadTime}</Text>
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
          <View style={styles.exportInfo}>
            <Text style={styles.exportInfoLabel}>Export All includes:</Text>
            <Text style={styles.exportInfoItem}>• Innovation concept & analysis</Text>
            <Text style={styles.exportInfoItem}>• Technical specifications</Text>
            <Text style={styles.exportInfoItem}>• Bill of Materials with suppliers</Text>
            <Text style={styles.exportInfoItem}>• 2D sketches (PNG)</Text>
            <Text style={styles.exportInfoItem}>• 3D scene descriptor</Text>
            <Text style={styles.exportInfoItem}>• Export timestamp</Text>
          </View>
        </View>
      )}

      {/* Send to Manufacturer Section */}
      <View style={styles.manufacturerPanel}>
        <View style={styles.manufacturerHeader}>
          <Ionicons name="business-outline" size={18} color={Colors.gray[400]} />
          <Text style={styles.manufacturerTitle}>Send to Manufacturer</Text>
        </View>
        <View style={styles.manufacturerGrid}>
          {MANUFACTURERS.map((mfr) => (
            <TouchableOpacity
              key={mfr.id}
              style={styles.manufacturerCard}
              onPress={() => Linking.openURL(mfr.url)}
            >
              <Ionicons name={mfr.icon} size={24} color={Colors.gray[400]} />
              <Text style={styles.manufacturerName}>{mfr.name}</Text>
              <Text style={styles.manufacturerSubtitle}>{mfr.subtitle}</Text>
              <Ionicons name="open-outline" size={12} color={Colors.gray[600]} style={styles.externalIcon} />
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.manufacturerNote}>
          Upload your 3D files (.OBJ, .STL) and BOM to get instant quotes from these manufacturers.
        </Text>
      </View>

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
  readinessPanel: {
    backgroundColor: Colors.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  readinessHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
  },
  readinessLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    flex: 1,
  },
  readinessTitle: {
    fontSize: FontSizes.md,
    fontWeight: 'bold',
    color: Colors.white,
  },
  readinessSubtitle: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    marginTop: 2,
  },
  readinessBadge: {
    backgroundColor: 'rgba(0, 255, 136, 0.15)',
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 16,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  readinessPercent: {
    fontFamily: 'monospace',
    fontSize: FontSizes.xs,
    color: Colors.accent,
    fontWeight: 'bold',
  },
  artifactGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  artifactItem: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: Colors.gray[800],
    borderRadius: 8,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  artifactItemReady: {
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
    borderColor: Colors.accent,
  },
  artifactName: {
    fontFamily: 'monospace',
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  artifactNameReady: {
    color: Colors.accent,
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
    flex: 1,
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
    flex: 1,
    marginRight: Spacing.sm,
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
    alignItems: 'center',
  },
  bomSupplier: {
    fontSize: FontSizes.xs,
    color: Colors.blue[500],
    flex: 1,
  },
  bomLeadTime: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    marginLeft: Spacing.xs,
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
  exportInfo: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderLeftWidth: 3,
    borderLeftColor: Colors.purple[500],
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: 6,
    marginTop: Spacing.md,
  },
  exportInfoLabel: {
    fontSize: FontSizes.xs,
    color: Colors.white,
    fontWeight: 'bold',
    marginBottom: Spacing.sm,
  },
  exportInfoItem: {
    fontSize: FontSizes.xs,
    color: Colors.gray[300],
    marginBottom: Spacing.xs,
  },
  manufacturerPanel: {
    backgroundColor: Colors.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  manufacturerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  manufacturerTitle: {
    fontSize: FontSizes.md,
    fontWeight: 'bold',
    color: Colors.white,
  },
  manufacturerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  manufacturerCard: {
    width: '48%',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: Spacing.md,
    alignItems: 'center',
    position: 'relative',
  },
  manufacturerName: {
    fontFamily: 'monospace',
    fontSize: FontSizes.sm,
    color: Colors.white,
    marginTop: Spacing.sm,
    marginBottom: 2,
  },
  manufacturerSubtitle: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    textAlign: 'center',
  },
  externalIcon: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  manufacturerNote: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    textAlign: 'center',
    lineHeight: 16,
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
