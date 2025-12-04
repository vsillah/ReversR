import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSizes } from '../constants/theme';
import {
  InnovationResult,
  TechnicalSpec,
  ThreeDSceneDescriptor,
  BillOfMaterials,
  generateTechnicalSpec,
  generate2DImage,
  generate3DScene,
  generateBOM,
} from '../hooks/useGemini';

interface Props {
  innovation: InnovationResult;
  onComplete: (
    spec: TechnicalSpec,
    scene: ThreeDSceneDescriptor | null,
    imageUrl: string | null,
    bom?: BillOfMaterials | null
  ) => void;
  onReset: () => void;
}

export default function PhaseThree({ innovation, onComplete, onReset }: Props) {
  const [spec, setSpec] = useState<TechnicalSpec | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [threeDScene, setThreeDScene] = useState<ThreeDSceneDescriptor | null>(null);
  const [bom, setBom] = useState<BillOfMaterials | null>(null);
  const [status, setStatus] = useState<
    'generating_specs' | 'specs_ready' | 'generating_visual' | 'generating_bom' | 'complete'
  >('generating_specs');
  const [error, setError] = useState<string | null>(null);

  const formatError = (e: unknown) => {
    const err = e as { message?: string };
    const msg = err.message || 'Unknown error occurred.';
    if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
      return 'System is at capacity. Please wait and try again.';
    }
    return msg;
  };

  const fetchSpecs = useCallback(async () => {
    setError(null);
    setStatus('generating_specs');
    try {
      const result = await generateTechnicalSpec(innovation);
      setSpec(result);
      setStatus('specs_ready');
    } catch (err: unknown) {
      console.error('Error generating specs:', err);
      setError(formatError(err));
    }
  }, [innovation]);

  useEffect(() => {
    fetchSpecs();
  }, [fetchSpecs]);

  const handleGenerate2D = async () => {
    if (!spec) return;
    setStatus('generating_visual');
    setError(null);

    try {
      const base64 = await generate2DImage(innovation);
      setImageBase64(base64);
      setStatus('complete');
      onComplete(spec, threeDScene, `data:image/png;base64,${base64}`, bom);
    } catch (err: unknown) {
      console.error('Error generating 2D:', err);
      setError(formatError(err));
      setStatus('specs_ready');
    }
  };

  const handleGenerate3D = async () => {
    if (!spec) return;
    setStatus('generating_visual');
    setError(null);

    try {
      const scene = await generate3DScene(innovation);
      setThreeDScene(scene);
      setStatus('complete');
      onComplete(spec, scene, imageBase64 ? `data:image/png;base64,${imageBase64}` : null, bom);
      Alert.alert(
        '3D Scene Generated',
        `Created ${scene.objects.length} objects. 3D viewing on mobile is limited - export to view in desktop apps.`
      );
    } catch (err: unknown) {
      console.error('Error generating 3D:', err);
      setError(formatError(err));
      setStatus('specs_ready');
    }
  };

  const handleGenerateBOM = async () => {
    if (!spec) return;
    setStatus('generating_bom');
    setError(null);

    try {
      const bomResult = await generateBOM(innovation);
      setBom(bomResult);
      setStatus('complete');
      onComplete(spec, threeDScene, imageBase64 ? `data:image/png;base64,${imageBase64}` : null, bomResult);
    } catch (err: unknown) {
      console.error('Error generating BOM:', err);
      setError(formatError(err));
      setStatus('specs_ready');
    }
  };

  const handleExportSpecs = async () => {
    if (!spec) return;

    try {
      const jsonContent = JSON.stringify(spec, null, 2);
      const fileUri = FileSystem.documentDirectory + 'specifications.json';
      await FileSystem.writeAsStringAsync(fileUri, jsonContent);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Saved', 'Specifications saved to device.');
      }
    } catch (e) {
      console.error('Export error:', e);
      Alert.alert('Error', 'Failed to export specifications.');
    }
  };

  const handleExport3D = async (format: 'obj' | 'stl') => {
    if (!threeDScene) return;

    try {
      let content = '';
      const name = innovation.conceptName.replace(/\s+/g, '_');

      if (format === 'obj') {
        content = `# ReversR Export\n# ${name}\n`;
        threeDScene.objects.forEach((obj, idx) => {
          content += `o ${obj.name || obj.id}\n`;
          content += `# Type: ${obj.type}, Position: ${obj.position.join(',')}\n`;
        });
      } else {
        content = `solid ${name}\nendsolid ${name}`;
      }

      const fileUri = FileSystem.documentDirectory + `${name}.${format}`;
      await FileSystem.writeAsStringAsync(fileUri, content);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      }
    } catch (e) {
      console.error('3D Export error:', e);
      Alert.alert('Error', 'Failed to export 3D model.');
    }
  };

  const handleExportBOM = async () => {
    if (!bom) return;

    try {
      const csvHeader = 'Part Number,Part Name,Description,Quantity,Material,Est. Cost,Supplier,Lead Time,Notes\n';
      const csvRows = bom.items.map(item => 
        `"${item.partNumber}","${item.partName}","${item.description}",${item.quantity},"${item.material}","${item.estimatedCost}","${item.supplier}","${item.leadTime}","${item.notes}"`
      ).join('\n');
      const csvContent = csvHeader + csvRows + `\n\nTotal Estimated Cost: ${bom.totalEstimatedCost}\nManufacturing Notes: ${bom.manufacturingNotes}`;

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

  if (status === 'generating_specs') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.accent} />
        <Text style={styles.loadingText}>Consulting The Architect...</Text>
      </View>
    );
  }

  if (error && !spec) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Connection Error</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchSpecs}>
          <Ionicons name="refresh" size={16} color={Colors.white} />
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="code-slash" size={28} color={Colors.accent} />
          <View style={styles.headerText}>
            <Text style={styles.title}>Phase 3: The Architect</Text>
            <Text style={styles.description}>Blueprint generated. Select visualization.</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onReset} style={styles.resetButton}>
          <Text style={styles.resetText}>New Session</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.innovationCard}>
        <Text style={styles.innovationName}>{innovation.conceptName}</Text>
        <Text style={styles.innovationDesc}>{innovation.conceptDescription}</Text>
        <View style={styles.benefitBadge}>
          <Text style={styles.benefitLabel}>Benefit</Text>
          <Text style={styles.benefitText}>{innovation.marketBenefit}</Text>
        </View>
      </View>

      <View style={styles.visualPanel}>
        <Text style={styles.sectionTitle}>Visualization</Text>

        {status === 'generating_visual' ? (
          <View style={styles.visualLoading}>
            <ActivityIndicator size="small" color={Colors.accent} />
            <Text style={styles.visualLoadingText}>Generating...</Text>
          </View>
        ) : imageBase64 ? (
          <Image
            source={{ uri: `data:image/png;base64,${imageBase64}` }}
            style={styles.generatedImage}
            resizeMode="contain"
          />
        ) : threeDScene ? (
          <View style={styles.scene3dInfo}>
            <Ionicons name="cube" size={48} color={Colors.accent} />
            <Text style={styles.scene3dText}>
              3D Scene: {threeDScene.objects.length} objects
            </Text>
            <View style={styles.exportButtons}>
              <TouchableOpacity
                style={styles.exportButton}
                onPress={() => handleExport3D('obj')}
              >
                <Text style={styles.exportButtonText}>.OBJ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.exportButton}
                onPress={() => handleExport3D('stl')}
              >
                <Text style={styles.exportButtonText}>.STL</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.visualOptions}>
            <TouchableOpacity style={styles.visualButton} onPress={handleGenerate2D}>
              <Ionicons name="image" size={24} color={Colors.gray[400]} />
              <Text style={styles.visualButtonText}>Generate 2D Sketch</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.visualButton} onPress={handleGenerate3D}>
              <Ionicons name="cube-outline" size={24} color={Colors.gray[400]} />
              <Text style={styles.visualButtonText}>Generate 3D Scene</Text>
            </TouchableOpacity>
          </View>
        )}

        {error && <Text style={styles.inlineError}>{error}</Text>}
      </View>

      {spec && (
        <View style={styles.specPanel}>
          <View style={styles.specHeader}>
            <View style={styles.terminalDots}>
              <View style={[styles.dot, { backgroundColor: '#ef4444' }]} />
              <View style={[styles.dot, { backgroundColor: '#eab308' }]} />
              <View style={[styles.dot, { backgroundColor: '#22c55e' }]} />
            </View>
            <Text style={styles.specFileName}>specifications.json</Text>
          </View>

          <View style={styles.specSection}>
            <Text style={styles.specLabel}>Prompt Logic</Text>
            <Text style={styles.specValue}>{spec.promptLogic}</Text>
          </View>

          <View style={styles.specSection}>
            <Text style={styles.specLabel}>Component Structure</Text>
            <Text style={styles.specValue}>{spec.componentStructure}</Text>
          </View>

          <View style={styles.specSection}>
            <Text style={styles.specLabel}>Implementation Notes</Text>
            <Text style={styles.specValue}>{spec.implementationNotes}</Text>
          </View>

          <TouchableOpacity style={styles.downloadButton} onPress={handleExportSpecs}>
            <Ionicons name="download" size={16} color={Colors.accent} />
            <Text style={styles.downloadButtonText}>Export Specs</Text>
          </TouchableOpacity>
        </View>
      )}

      {spec && (
        <View style={styles.bomPanel}>
          <Text style={styles.sectionTitle}>Phase 4: Bill of Materials</Text>
          
          {status === 'generating_bom' ? (
            <View style={styles.visualLoading}>
              <ActivityIndicator size="small" color={Colors.accent} />
              <Text style={styles.visualLoadingText}>Generating BOM...</Text>
            </View>
          ) : bom ? (
            <View style={styles.bomContent}>
              <View style={styles.bomHeader}>
                <Text style={styles.bomProjectName}>{bom.projectName}</Text>
                <Text style={styles.bomMeta}>v{bom.version} | {bom.dateGenerated}</Text>
              </View>
              
              <View style={styles.bomItemsContainer}>
                {bom.items.slice(0, 5).map((item, index) => (
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
                  </View>
                ))}
                {bom.items.length > 5 && (
                  <Text style={styles.bomMoreItems}>+{bom.items.length - 5} more items</Text>
                )}
              </View>

              <View style={styles.bomTotalSection}>
                <Text style={styles.bomTotalLabel}>Total Estimated Cost</Text>
                <Text style={styles.bomTotalValue}>{bom.totalEstimatedCost}</Text>
              </View>

              <Text style={styles.bomNotes}>{bom.manufacturingNotes}</Text>

              <TouchableOpacity style={styles.downloadButton} onPress={handleExportBOM}>
                <Ionicons name="download" size={16} color={Colors.accent} />
                <Text style={styles.downloadButtonText}>Export BOM (CSV)</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.generateBomButton} onPress={handleGenerateBOM}>
              <Ionicons name="list" size={24} color={Colors.gray[400]} />
              <Text style={styles.generateBomText}>Generate Bill of Materials</Text>
              <Text style={styles.generateBomSubtext}>Parts, quantities, costs & suppliers</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={{ height: 50 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: Spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
  },
  loadingText: {
    marginTop: Spacing.md,
    fontFamily: 'monospace',
    fontSize: FontSizes.sm,
    color: Colors.accent,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
    paddingHorizontal: Spacing.lg,
  },
  errorTitle: {
    fontSize: FontSizes.lg,
    fontWeight: 'bold',
    color: Colors.red[500],
    marginBottom: Spacing.sm,
  },
  errorMessage: {
    fontSize: FontSizes.sm,
    color: Colors.red[500],
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
  },
  retryButtonText: {
    color: Colors.white,
    fontSize: FontSizes.sm,
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
  resetButton: {
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
  },
  resetText: {
    fontSize: FontSizes.sm,
    color: Colors.white,
  },
  innovationCard: {
    backgroundColor: Colors.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  innovationName: {
    fontFamily: 'monospace',
    fontSize: FontSizes.lg,
    color: Colors.accent,
    marginBottom: Spacing.sm,
  },
  innovationDesc: {
    fontSize: FontSizes.sm,
    color: Colors.gray[300],
    marginBottom: Spacing.md,
  },
  benefitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(22, 101, 52, 0.2)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(22, 101, 52, 0.5)',
  },
  benefitLabel: {
    fontSize: FontSizes.xs,
    color: Colors.green[500],
    textTransform: 'uppercase',
  },
  benefitText: {
    fontSize: FontSizes.sm,
    color: Colors.green[400],
    flex: 1,
  },
  visualPanel: {
    backgroundColor: Colors.black,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    minHeight: 200,
  },
  sectionTitle: {
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
    color: Colors.gray[300],
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: Spacing.md,
  },
  visualLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  visualLoadingText: {
    marginTop: Spacing.sm,
    fontSize: FontSizes.sm,
    color: Colors.accent,
  },
  generatedImage: {
    width: '100%',
    height: 250,
    borderRadius: 8,
  },
  scene3dInfo: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  scene3dText: {
    marginTop: Spacing.md,
    fontSize: FontSizes.sm,
    color: Colors.gray[400],
  },
  exportButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  exportButton: {
    backgroundColor: Colors.panel,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
  },
  exportButtonText: {
    fontFamily: 'monospace',
    fontSize: FontSizes.sm,
    color: Colors.accent,
  },
  visualOptions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  visualButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.panel,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    borderRadius: 8,
    gap: Spacing.sm,
  },
  visualButtonText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[400],
    textAlign: 'center',
  },
  inlineError: {
    marginTop: Spacing.md,
    fontSize: FontSizes.sm,
    color: Colors.red[500],
    textAlign: 'center',
  },
  specPanel: {
    backgroundColor: Colors.black,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  specHeader: {
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
  specFileName: {
    fontFamily: 'monospace',
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  specSection: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  specLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  specValue: {
    fontFamily: 'monospace',
    fontSize: FontSizes.sm,
    color: Colors.blue[500],
    lineHeight: 20,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.panel,
  },
  downloadButtonText: {
    fontSize: FontSizes.sm,
    color: Colors.accent,
  },
  bomPanel: {
    backgroundColor: Colors.black,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginTop: Spacing.lg,
  },
  bomContent: {
    gap: Spacing.md,
  },
  bomHeader: {
    marginBottom: Spacing.sm,
  },
  bomProjectName: {
    fontFamily: 'monospace',
    fontSize: FontSizes.lg,
    color: Colors.accent,
    marginBottom: Spacing.xs,
  },
  bomMeta: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  bomItemsContainer: {
    gap: Spacing.sm,
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
    color: Colors.accent,
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
    alignItems: 'center',
  },
  bomItemMetaText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  bomItemCost: {
    fontFamily: 'monospace',
    fontSize: FontSizes.sm,
    color: Colors.green[400],
  },
  bomMoreItems: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
    textAlign: 'center',
    paddingVertical: Spacing.sm,
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
  },
  bomTotalLabel: {
    fontSize: FontSizes.sm,
    color: Colors.green[500],
    fontWeight: 'bold',
  },
  bomTotalValue: {
    fontFamily: 'monospace',
    fontSize: FontSizes.lg,
    color: Colors.green[400],
    fontWeight: 'bold',
  },
  bomNotes: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    fontStyle: 'italic',
    marginTop: Spacing.sm,
  },
  generateBomButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.panel,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xl,
    borderRadius: 8,
    gap: Spacing.sm,
  },
  generateBomText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[300],
    fontWeight: 'bold',
  },
  generateBomSubtext: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
});
