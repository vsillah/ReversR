import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  Alert,
  Modal,
  Dimensions,
  Animated,
  PanResponder,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSizes } from '../constants/theme';
import {
  InnovationResult,
  TechnicalSpec,
  ThreeDSceneDescriptor,
  generateTechnicalSpec,
  generate2DImage,
  generate3DScene,
} from '../hooks/useGemini';

interface Props {
  innovation: InnovationResult;
  existingSpec?: TechnicalSpec | null;
  existingImageUrl?: string | null;
  existingThreeDScene?: ThreeDSceneDescriptor | null;
  imageGenerating?: boolean;
  onComplete: (
    spec: TechnicalSpec,
    scene: ThreeDSceneDescriptor | null,
    imageUrl: string | null
  ) => void;
  onContinueToBuild: () => void;
  onBack: () => void;
  onReset: () => void;
  onTryAnotherPattern: () => void;
}

type VisualTab = '2d' | '3d';

export default function PhaseThree({
  innovation,
  existingSpec,
  existingImageUrl,
  existingThreeDScene,
  imageGenerating = false,
  onComplete,
  onContinueToBuild,
  onBack,
  onReset,
  onTryAnotherPattern,
}: Props) {
  const extractBase64FromUrl = (url: string | null): string | null => {
    if (!url) return null;
    const match = url.match(/^data:image\/[^;]+;base64,(.+)$/);
    return match ? match[1] : null;
  };

  const [spec, setSpec] = useState<TechnicalSpec | null>(existingSpec || null);
  const [imageBase64, setImageBase64] = useState<string | null>(extractBase64FromUrl(existingImageUrl || null));
  const [threeDScene, setThreeDScene] = useState<ThreeDSceneDescriptor | null>(existingThreeDScene || null);
  
  const hasExistingData = !!(existingSpec);
  const initialStatus = hasExistingData 
    ? (existingImageUrl || existingThreeDScene ? 'complete' : 'specs_ready')
    : 'generating_specs';
  
  const [status, setStatus] = useState<
    'generating_specs' | 'specs_ready' | 'generating_visual' | 'complete'
  >(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<VisualTab>('2d');
  const [specsExpanded, setSpecsExpanded] = useState(false);
  const [generationTime, setGenerationTime] = useState(0);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const lastScale = useRef(1);
  const lastTranslateX = useRef(0);
  const lastTranslateY = useRef(0);

  const resetZoom = () => {
    scale.setValue(1);
    translateX.setValue(0);
    translateY.setValue(0);
    lastScale.current = 1;
    lastTranslateX.current = 0;
    lastTranslateY.current = 0;
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        translateX.setOffset(lastTranslateX.current);
        translateY.setOffset(lastTranslateY.current);
        translateX.setValue(0);
        translateY.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        translateX.setValue(gestureState.dx);
        translateY.setValue(gestureState.dy);
      },
      onPanResponderRelease: () => {
        translateX.flattenOffset();
        translateY.flattenOffset();
        lastTranslateX.current = (translateX as any)._value || 0;
        lastTranslateY.current = (translateY as any)._value || 0;
      },
    })
  ).current;

  const handleZoomIn = () => {
    const newScale = Math.min(lastScale.current * 1.5, 5);
    Animated.spring(scale, { toValue: newScale, useNativeDriver: true }).start();
    lastScale.current = newScale;
  };

  const handleZoomOut = () => {
    const newScale = Math.max(lastScale.current / 1.5, 1);
    Animated.spring(scale, { toValue: newScale, useNativeDriver: true }).start();
    lastScale.current = newScale;
    if (newScale === 1) {
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
      lastTranslateX.current = 0;
      lastTranslateY.current = 0;
    }
  };

  const handleSaveImage = async () => {
    if (!imageBase64) return;
    
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to save images.');
        return;
      }

      const filename = `${innovation.conceptName.replace(/\s+/g, '_')}_2D.png`;
      const fileUri = FileSystem.documentDirectory + filename;
      await FileSystem.writeAsStringAsync(fileUri, imageBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await MediaLibrary.saveToLibraryAsync(fileUri);
      Alert.alert('Saved', 'Image saved to your photo library.');
    } catch (e) {
      console.error('Save image error:', e);
      Alert.alert('Error', 'Failed to save image.');
    }
  };

  const handleShareImage = async () => {
    if (!imageBase64) return;

    try {
      const filename = `${innovation.conceptName.replace(/\s+/g, '_')}_2D.png`;
      const fileUri = FileSystem.documentDirectory + filename;
      await FileSystem.writeAsStringAsync(fileUri, imageBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Error', 'Sharing is not available on this device.');
      }
    } catch (e) {
      console.error('Share image error:', e);
      Alert.alert('Error', 'Failed to share image.');
    }
  };

  const formatError = (e: unknown) => {
    const err = e as { message?: string };
    const msg = err.message || 'Unknown error occurred.';
    if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
      return 'System is at capacity. Please wait and try again.';
    }
    return msg;
  };

  const fetchSpecs = useCallback(async () => {
    if (existingSpec) {
      setSpec(existingSpec);
      setStatus(existingImageUrl || existingThreeDScene ? 'complete' : 'specs_ready');
      return;
    }
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
  }, [innovation, existingSpec, existingImageUrl, existingThreeDScene]);

  useEffect(() => {
    fetchSpecs();
  }, []);

  useEffect(() => {
    if (existingImageUrl && !imageBase64) {
      const base64 = extractBase64FromUrl(existingImageUrl);
      if (base64) {
        setImageBase64(base64);
        if (status === 'specs_ready' || status === 'generating_visual') {
          setStatus('complete');
        }
      }
    }
  }, [existingImageUrl]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (status === 'generating_visual') {
      setGenerationTime(0);
      interval = setInterval(() => {
        setGenerationTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [status]);

  const handleGenerate2D = async () => {
    if (!spec) return;
    setStatus('generating_visual');
    setError(null);

    try {
      const base64 = await generate2DImage(innovation);
      setImageBase64(base64);
      setStatus('complete');
      onComplete(spec, threeDScene, `data:image/png;base64,${base64}`);
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
      onComplete(spec, scene, imageBase64 ? `data:image/png;base64,${imageBase64}` : null);
      Alert.alert(
        '3D Scene Generated',
        `Created ${scene.objects.length} objects. Export to view in desktop apps.`
      );
    } catch (err: unknown) {
      console.error('Error generating 3D:', err);
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
            <Text style={styles.description}>Blueprint generated. Visualize your innovation.</Text>
          </View>
        </View>
        <View style={styles.navButtons}>
          <TouchableOpacity onPress={onBack} style={styles.navButton}>
            <Ionicons name="arrow-back" size={14} color={Colors.gray[400]} />
            <Text style={styles.navButtonText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onReset} style={styles.navButton}>
            <Ionicons name="refresh" size={14} color={Colors.gray[400]} />
            <Text style={styles.navButtonText}>Reset</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.innovationSummary}>
        <Text style={styles.conceptName}>{innovation.conceptName}</Text>
        
        <View style={styles.summaryGrid}>
          <View style={styles.summaryLeft}>
            <View style={styles.patternSection}>
              <View style={styles.sectionHeader}>
                <Ionicons name="bulb" size={16} color={Colors.secondary} />
                <Text style={styles.sectionLabel}>SIT Pattern Applied</Text>
              </View>
              <Text style={styles.patternName}>
                {typeof innovation.patternUsed === 'string' 
                  ? innovation.patternUsed.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                  : 'Pattern Applied'}
              </Text>
              <Text style={styles.conceptDescription}>{innovation.conceptDescription}</Text>
            </View>
          </View>
          
          <View style={styles.summaryRight}>
            <View style={styles.benefitBox}>
              <View style={styles.sectionHeader}>
                <Ionicons name="flash" size={16} color={Colors.green[400]} />
                <Text style={[styles.sectionLabel, { color: Colors.green[400] }]}>Key Benefit</Text>
              </View>
              <Text style={styles.benefitText}>{innovation.marketBenefit}</Text>
            </View>
            
            {innovation.constraint && (
              <View style={styles.constraintBox}>
                <View style={styles.sectionHeader}>
                  <View style={styles.constraintDot} />
                  <Text style={[styles.sectionLabel, { color: Colors.purple[500] }]}>Innovation Constraint</Text>
                </View>
                <Text style={styles.constraintText}>{innovation.constraint}</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      <View style={styles.visualPanel}>
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === '2d' && styles.tabActive]}
            onPress={() => setActiveTab('2d')}
          >
            <Ionicons 
              name="image" 
              size={16} 
              color={activeTab === '2d' ? Colors.accent : Colors.gray[500]} 
            />
            <Text style={[styles.tabText, activeTab === '2d' && styles.tabTextActive]}>
              2D Sketch
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === '3d' && styles.tabActive]}
            onPress={() => setActiveTab('3d')}
          >
            <Ionicons 
              name="cube" 
              size={16} 
              color={activeTab === '3d' ? Colors.accent : Colors.gray[500]} 
            />
            <Text style={[styles.tabText, activeTab === '3d' && styles.tabTextActive]}>
              3D Wireframe
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.visualContent}>
          {status === 'generating_visual' ? (
            <View style={styles.visualLoading}>
              <ActivityIndicator size="large" color={Colors.accent} />
              <Text style={styles.visualLoadingText}>Generating {activeTab === '2d' ? '2D Sketch' : '3D Scene'}...</Text>
              <Text style={styles.visualLoadingTime}>{generationTime}s elapsed</Text>
              <TouchableOpacity 
                style={styles.skipButton}
                onPress={() => setStatus(spec ? 'specs_ready' : 'generating_specs')}
              >
                <Text style={styles.skipButtonText}>Skip</Text>
              </TouchableOpacity>
            </View>
          ) : activeTab === '2d' ? (
            imageBase64 ? (
              <View style={styles.generatedImageContainer}>
                <TouchableOpacity 
                  activeOpacity={0.9}
                  onPress={() => {
                    resetZoom();
                    setImageModalVisible(true);
                  }}
                >
                  <Image
                    source={{ uri: `data:image/png;base64,${imageBase64}` }}
                    style={styles.generatedImage}
                    resizeMode="contain"
                  />
                  <View style={styles.expandHint}>
                    <Ionicons name="expand" size={14} color={Colors.white} />
                    <Text style={styles.expandHintText}>Tap to expand</Text>
                  </View>
                </TouchableOpacity>
                <View style={styles.imageActions}>
                  <TouchableOpacity 
                    style={styles.imageActionButton}
                    onPress={() => {
                      resetZoom();
                      setImageModalVisible(true);
                    }}
                  >
                    <Ionicons name="expand-outline" size={18} color={Colors.accent} />
                    <Text style={styles.imageActionText}>Expand</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.imageActionButton}
                    onPress={handleSaveImage}
                  >
                    <Ionicons name="download-outline" size={18} color={Colors.accent} />
                    <Text style={styles.imageActionText}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.imageActionButton}
                    onPress={handleShareImage}
                  >
                    <Ionicons name="share-outline" size={18} color={Colors.accent} />
                    <Text style={styles.imageActionText}>Share</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.imageActionButton}
                    onPress={handleGenerate2D}
                  >
                    <Ionicons name="refresh" size={18} color={Colors.gray[400]} />
                    <Text style={[styles.imageActionText, { color: Colors.gray[400] }]}>Regen</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : imageGenerating ? (
              <View style={styles.backgroundGenerating}>
                <View style={styles.bgGenIconContainer}>
                  <ActivityIndicator size="small" color={Colors.accent} />
                </View>
                <Text style={styles.bgGenTitle}>Generating in background...</Text>
                <Text style={styles.bgGenDesc}>
                  Continue exploring — we'll notify you when it's ready
                </Text>
                <View style={styles.bgGenProgress}>
                  <View style={styles.bgGenProgressBar} />
                </View>
              </View>
            ) : (
              <View style={styles.generatePrompt}>
                <Ionicons name="image-outline" size={48} color={Colors.gray[600]} />
                <Text style={styles.generatePromptTitle}>Generate a high-speed 2D concept</Text>
                <Text style={styles.generatePromptDesc}>
                  AI-generated sketch visualization of your innovation
                </Text>
                <TouchableOpacity style={styles.generateButton} onPress={handleGenerate2D}>
                  <Text style={styles.generateButtonText}>Generate Sketch</Text>
                </TouchableOpacity>
              </View>
            )
          ) : (
            threeDScene ? (
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
                <TouchableOpacity 
                  style={styles.regenerateButton}
                  onPress={handleGenerate3D}
                >
                  <Ionicons name="refresh" size={14} color={Colors.gray[400]} />
                  <Text style={styles.regenerateText}>Regenerate</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.generatePrompt}>
                <Ionicons name="cube-outline" size={48} color={Colors.gray[600]} />
                <Text style={styles.generatePromptTitle}>Generate 3D wireframe</Text>
                <Text style={styles.generatePromptDesc}>
                  Exportable 3D scene description for CAD software
                </Text>
                <TouchableOpacity style={styles.generateButton} onPress={handleGenerate3D}>
                  <Text style={styles.generateButtonText}>Generate 3D</Text>
                </TouchableOpacity>
              </View>
            )
          )}
        </View>

        {error && <Text style={styles.inlineError}>{error}</Text>}
      </View>

      {spec && (
        <View style={styles.specPanel}>
          <TouchableOpacity 
            style={styles.specHeader}
            onPress={() => setSpecsExpanded(!specsExpanded)}
          >
            <View style={styles.specHeaderLeft}>
              <View style={styles.terminalDots}>
                <View style={[styles.dot, { backgroundColor: '#ef4444' }]} />
                <View style={[styles.dot, { backgroundColor: '#eab308' }]} />
                <View style={[styles.dot, { backgroundColor: '#22c55e' }]} />
              </View>
              <Text style={styles.specFileName}>specifications.json</Text>
            </View>
            <View style={styles.specToggle}>
              <Text style={styles.specToggleText}>
                {specsExpanded ? 'Hide Details' : 'Show Details'}
              </Text>
              <Ionicons 
                name={specsExpanded ? 'chevron-up' : 'chevron-down'} 
                size={16} 
                color={Colors.gray[400]} 
              />
            </View>
          </TouchableOpacity>

          {specsExpanded && (
            <View style={styles.specContent}>
              <View style={[styles.specSection, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
                <Text style={[styles.specLabel, { color: Colors.blue[500] }]}>PROMPT LOGIC</Text>
                <Text style={styles.specValue}>{spec.promptLogic}</Text>
              </View>

              <View style={[styles.specSection, { backgroundColor: 'rgba(168, 85, 247, 0.1)' }]}>
                <Text style={[styles.specLabel, { color: Colors.purple[500] }]}>COMPONENT STRUCTURE</Text>
                <Text style={styles.specValue}>{spec.componentStructure}</Text>
              </View>

              <View style={[styles.specSection, { backgroundColor: 'rgba(251, 146, 60, 0.1)' }]}>
                <Text style={[styles.specLabel, { color: Colors.orange[300] }]}>IMPLEMENTATION NOTES</Text>
                <Text style={styles.specValue}>{spec.implementationNotes}</Text>
              </View>

              <TouchableOpacity style={styles.downloadButton} onPress={handleExportSpecs}>
                <Ionicons name="download" size={16} color={Colors.accent} />
                <Text style={styles.downloadButtonText}>Export Specs</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {spec && (
        <TouchableOpacity style={styles.continueButton} onPress={onContinueToBuild}>
          <Text style={styles.continueButtonText}>Continue to Build</Text>
          <Ionicons name="arrow-forward" size={20} color={Colors.black} />
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.tryAnotherButton} onPress={onTryAnotherPattern}>
        <Ionicons name="shuffle" size={18} color={Colors.secondary} />
        <Text style={styles.tryAnotherText}>Try Another Pattern</Text>
      </TouchableOpacity>

      <View style={{ height: 50 }} />

      {/* Fullscreen Image Modal */}
      <Modal
        visible={imageModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setImageModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>2D Concept Sketch</Text>
            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => setImageModalVisible(false)}
            >
              <Ionicons name="close" size={24} color={Colors.white} />
            </TouchableOpacity>
          </View>
          
          <View style={styles.modalImageContainer} {...panResponder.panHandlers}>
            <Animated.Image
              source={{ uri: `data:image/png;base64,${imageBase64}` }}
              style={[
                styles.modalImage,
                {
                  transform: [
                    { scale },
                    { translateX },
                    { translateY },
                  ],
                },
              ]}
              resizeMode="contain"
            />
          </View>

          <View style={styles.modalControls}>
            <TouchableOpacity style={styles.zoomButton} onPress={handleZoomOut}>
              <Ionicons name="remove" size={24} color={Colors.white} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.zoomButton} onPress={resetZoom}>
              <Ionicons name="scan-outline" size={24} color={Colors.white} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.zoomButton} onPress={handleZoomIn}>
              <Ionicons name="add" size={24} color={Colors.white} />
            </TouchableOpacity>
            <View style={styles.modalSpacer} />
            <TouchableOpacity style={styles.modalActionButton} onPress={handleSaveImage}>
              <Ionicons name="download-outline" size={20} color={Colors.accent} />
              <Text style={styles.modalActionText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalActionButton} onPress={handleShareImage}>
              <Ionicons name="share-outline" size={20} color={Colors.accent} />
              <Text style={styles.modalActionText}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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
  innovationSummary: {
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
    color: Colors.accent,
    marginBottom: Spacing.md,
  },
  summaryGrid: {
    gap: Spacing.md,
  },
  summaryLeft: {
    marginBottom: Spacing.sm,
  },
  summaryRight: {
    gap: Spacing.sm,
  },
  patternSection: {
    marginBottom: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  sectionLabel: {
    fontSize: FontSizes.xs,
    fontWeight: 'bold',
    color: Colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  patternName: {
    fontFamily: 'monospace',
    fontSize: FontSizes.md,
    color: Colors.white,
    marginBottom: Spacing.xs,
  },
  conceptDescription: {
    fontSize: FontSizes.sm,
    color: Colors.gray[400],
    lineHeight: 20,
  },
  benefitBox: {
    backgroundColor: 'rgba(22, 101, 52, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(22, 101, 52, 0.4)',
    borderRadius: 8,
    padding: Spacing.md,
  },
  benefitText: {
    fontSize: FontSizes.sm,
    color: Colors.green[400],
    lineHeight: 20,
  },
  constraintBox: {
    backgroundColor: 'rgba(88, 28, 135, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(88, 28, 135, 0.4)',
    borderRadius: 8,
    padding: Spacing.md,
  },
  constraintDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.purple[500],
  },
  constraintText: {
    fontSize: FontSizes.sm,
    color: Colors.purple[500],
    lineHeight: 20,
  },
  visualPanel: {
    backgroundColor: Colors.black,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.panel,
  },
  tabActive: {
    backgroundColor: Colors.black,
    borderBottomWidth: 2,
    borderBottomColor: Colors.accent,
  },
  tabText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
  },
  tabTextActive: {
    color: Colors.accent,
    fontWeight: 'bold',
  },
  visualContent: {
    minHeight: 200,
    padding: Spacing.lg,
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
  visualLoadingTime: {
    marginTop: Spacing.xs,
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  skipButton: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
  },
  skipButtonText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[400],
  },
  generatePrompt: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  generatePromptTitle: {
    fontSize: FontSizes.md,
    color: Colors.white,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  generatePromptDesc: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  generateButton: {
    backgroundColor: Colors.accent,
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
  generatedImageContainer: {
    alignItems: 'center',
  },
  generatedImage: {
    width: '100%',
    height: 250,
    borderRadius: 8,
  },
  regenerateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
  },
  regenerateText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[400],
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
  inlineError: {
    padding: Spacing.md,
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
    marginBottom: Spacing.lg,
  },
  specHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.panel,
    padding: Spacing.md,
  },
  specHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
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
  specToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  specToggleText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[400],
  },
  specContent: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  specSection: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  specLabel: {
    fontSize: FontSizes.xs,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  specValue: {
    fontFamily: 'monospace',
    fontSize: FontSizes.sm,
    color: Colors.gray[300],
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
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.accent,
    paddingVertical: Spacing.md,
    borderRadius: 8,
    marginBottom: Spacing.md,
  },
  continueButtonText: {
    fontFamily: 'monospace',
    fontSize: FontSizes.md,
    fontWeight: 'bold',
    color: Colors.black,
  },
  tryAnotherButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.secondary,
    paddingVertical: Spacing.md,
    borderRadius: 8,
  },
  tryAnotherText: {
    fontSize: FontSizes.sm,
    color: Colors.secondary,
  },
  expandHint: {
    position: 'absolute',
    bottom: Spacing.sm,
    right: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 4,
  },
  expandHintText: {
    fontSize: FontSizes.xs,
    color: Colors.white,
  },
  imageActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.md,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  imageActionButton: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
  },
  imageActionText: {
    fontSize: FontSizes.xs,
    color: Colors.accent,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: 50,
    paddingBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: 'bold',
    color: Colors.white,
    fontFamily: 'monospace',
  },
  modalCloseButton: {
    padding: Spacing.sm,
  },
  modalImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  modalImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.6,
  },
  modalControls: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    paddingBottom: 40,
    backgroundColor: Colors.panel,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  zoomButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.gray[800],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  modalSpacer: {
    flex: 1,
  },
  modalActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 255, 136, 0.15)',
    borderWidth: 1,
    borderColor: Colors.accent,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 6,
    marginLeft: Spacing.sm,
  },
  modalActionText: {
    fontSize: FontSizes.sm,
    color: Colors.accent,
    fontWeight: '600',
  },
  backgroundGenerating: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  bgGenIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0, 255, 136, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  bgGenTitle: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.accent,
    marginBottom: Spacing.xs,
    fontFamily: 'monospace',
  },
  bgGenDesc: {
    fontSize: FontSizes.sm,
    color: Colors.gray[400],
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  bgGenProgress: {
    width: '80%',
    height: 3,
    backgroundColor: Colors.gray[800],
    borderRadius: 2,
    overflow: 'hidden',
  },
  bgGenProgressBar: {
    width: '60%',
    height: '100%',
    backgroundColor: Colors.accent,
    borderRadius: 2,
  },
});
