import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSizes } from '../constants/theme';
import { analyzeProduct, AnalysisResult } from '../hooks/useGemini';
import AlertModal from './AlertModal';
import LoadingOverlay, { LoadingStep } from './LoadingOverlay';

const SCAN_STEPS: LoadingStep[] = [
  { id: 'capture', label: 'Capturing input...' },
  { id: 'identify', label: 'Identifying components...' },
  { id: 'map', label: 'Mapping closed world...' },
];

interface Props {
  onComplete: (input: string, analysis: AnalysisResult, capturedImage?: string | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  initialInput?: string;
  initialImage?: string | null;
}

const PRODUCT_PRESETS = [
  "A mechanical analog wristwatch with leather strap, stainless steel case, crystal glass face, and gear mechanisms.",
  "A smart coffee maker with water reservoir, filter basket, heating element, and Wi-Fi connectivity.",
  "A standard bicycle with frame, two wheels, handlebars, pedals, chain, gears, and brakes.",
  "A robotic vacuum cleaner with brushes, dustbin, battery, sensors, and charging dock.",
  "A portable Bluetooth speaker with drivers, battery, control buttons, and rugged casing.",
  "A reusable water bottle with stainless steel body, screw-top lid, and carrying loop.",
  "An electric toothbrush with handle, battery, motor, brush head, and charging base.",
  "A consumer drone with propellers, camera, battery, remote controller, and GPS module.",
];

type InputMode = 'type' | 'scan' | 'lucky';

export default function PhaseOne({ onComplete, isLoading, setIsLoading, initialInput, initialImage }: Props) {
  const [inputMode, setInputMode] = useState<InputMode>(initialImage ? 'scan' : 'type');
  const [input, setInput] = useState(initialInput || '');
  const [luckyProduct, setLuckyProduct] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(initialImage || null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [alert, setAlert] = useState<{visible: boolean, title: string, message: string} | null>(null);
  const [loadingStep, setLoadingStep] = useState<string>('capture');

  useEffect(() => {
    if (isLoading) {
      setLoadingStep('capture');
      const timer1 = setTimeout(() => setLoadingStep('identify'), 1500);
      const timer2 = setTimeout(() => setLoadingStep('map'), 4000);
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }
  }, [isLoading]);

  const getActiveInput = () => {
    if (inputMode === 'lucky') return luckyProduct;
    if (inputMode === 'scan') return input;
    return input;
  };

  const hasValidInput = () => {
    if (inputMode === 'scan') return !!capturedImage || input.trim().length > 0;
    if (inputMode === 'lucky') return luckyProduct.trim().length > 0;
    return input.trim().length > 0;
  };

  const handleAnalyze = async () => {
    const activeInput = getActiveInput();
    if (!activeInput.trim() && !capturedImage) return;
    setIsLoading(true);
    setLoadingStep('capture');
    setError(null);
    try {
      const imageToUse = inputMode === 'scan' ? capturedImage : undefined;
      const result = await analyzeProduct(activeInput, imageToUse || undefined);
      onComplete(activeInput, result, imageToUse);
    } catch (e: any) {
      const errorMsg = e?.message || 'Unknown error';
      if (errorMsg.includes('Network') || errorMsg.includes('fetch')) {
        setError("Network error. Check your internet connection and try again.");
      } else if (errorMsg.includes('timeout') || errorMsg.includes('Timeout')) {
        setError("Request timed out. Try with a simpler description.");
      } else {
        setError(`Analysis failed: ${errorMsg}`);
      }
      console.error('Analysis error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleShuffle = () => {
    const randomIndex = Math.floor(Math.random() * PRODUCT_PRESETS.length);
    setLuckyProduct(PRODUCT_PRESETS[randomIndex]);
  };

  useEffect(() => {
    if (inputMode === 'lucky' && !luckyProduct) {
      handleShuffle();
    }
  }, [inputMode]);

  const openCamera = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setAlert({visible: true, title: 'Permission needed', message: 'Camera access is required to scan objects.'});
        return;
      }
    }
    setIsCameraOpen(true);
    setCapturedImage(null);
  };

  const captureImage = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({ 
          base64: true, 
          quality: 0.3,
          skipProcessing: false,
        });
        if (photo?.base64) {
          setCapturedImage(`data:image/jpeg;base64,${photo.base64}`);
        }
        setIsCameraOpen(false);
      } catch (e) {
        console.error('Failed to capture:', e);
        setAlert({visible: true, title: 'Camera Error', message: 'Failed to capture image. Please try again.'});
      }
    }
  };

  const toggleCameraFacing = () => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  };

  if (isCameraOpen) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing={facing}>
          <View style={styles.cameraOverlay}>
            <TouchableOpacity style={styles.flipButton} onPress={toggleCameraFacing}>
              <Ionicons name="camera-reverse" size={28} color={Colors.white} />
            </TouchableOpacity>
          </View>
          <View style={styles.cameraControls}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setIsCameraOpen(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.captureButton} onPress={captureImage}>
              <View style={styles.captureButtonInner} />
            </TouchableOpacity>
            <View style={{ width: 80 }} />
          </View>
        </CameraView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="search" size={28} color={Colors.blue[500]} />
        <View style={styles.headerText}>
          <Text style={styles.title}>Phase 1: Scan</Text>
          <Text style={styles.description}>
            Define the boundaries. Enter a product description or scan an object.
          </Text>
        </View>
      </View>

      <View style={styles.panel}>
        <View style={styles.modeSelector}>
          <TouchableOpacity
            style={[styles.modeTab, inputMode === 'type' && styles.modeTabActive]}
            onPress={() => setInputMode('type')}
          >
            <Ionicons 
              name="create-outline" 
              size={18} 
              color={inputMode === 'type' ? Colors.white : Colors.gray[400]} 
            />
            <Text style={[styles.modeTabText, inputMode === 'type' && styles.modeTabTextActive]}>
              Type
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeTab, inputMode === 'scan' && styles.modeTabActive]}
            onPress={() => setInputMode('scan')}
          >
            <Ionicons 
              name="camera-outline" 
              size={18} 
              color={inputMode === 'scan' ? Colors.white : Colors.gray[400]} 
            />
            <Text style={[styles.modeTabText, inputMode === 'scan' && styles.modeTabTextActive]}>
              Scan
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeTab, inputMode === 'lucky' && styles.modeTabActive]}
            onPress={() => setInputMode('lucky')}
          >
            <Ionicons 
              name="dice-outline" 
              size={18} 
              color={inputMode === 'lucky' ? Colors.white : Colors.gray[400]} 
            />
            <Text style={[styles.modeTabText, inputMode === 'lucky' && styles.modeTabTextActive]}>
              Lucky
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.contentArea}>
          {inputMode === 'type' && (
            <View style={styles.typeContent}>
              <Text style={styles.contentLabel}>Describe your product</Text>
              <TextInput
                style={styles.textInput}
                value={input}
                onChangeText={setInput}
                placeholder="e.g., A standard kitchen blender with motor, blades, pitcher, and control panel..."
                placeholderTextColor={Colors.gray[600]}
                multiline
                numberOfLines={4}
                editable={!isLoading}
              />
            </View>
          )}

          {inputMode === 'scan' && (
            <View style={styles.scanContent}>
              {capturedImage ? (
                <View style={styles.imagePreview}>
                  <Image source={{ uri: capturedImage }} style={styles.previewImage} />
                  <View style={styles.imageInfo}>
                    <View style={styles.capturedBadge}>
                      <Ionicons name="checkmark-circle" size={14} color={Colors.green[400]} />
                      <Text style={styles.capturedText}>Image Captured</Text>
                    </View>
                    <Text style={styles.imageHint}>
                      Add optional text below to guide the analysis.
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={() => setCapturedImage(null)}
                  >
                    <Ionicons name="close" size={18} color={Colors.gray[400]} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.cameraPrompt} onPress={openCamera}>
                  <View style={styles.cameraIconCircle}>
                    <Ionicons name="camera" size={32} color={Colors.green[400]} />
                  </View>
                  <Text style={styles.cameraPromptTitle}>Tap to Open Camera</Text>
                  <Text style={styles.cameraPromptHint}>
                    Point at any physical object to scan
                  </Text>
                </TouchableOpacity>
              )}
              <TextInput
                style={[styles.textInput, styles.scanTextInput]}
                value={input}
                onChangeText={setInput}
                placeholder="Optional: Add details about the object..."
                placeholderTextColor={Colors.gray[600]}
                multiline
                numberOfLines={2}
                editable={!isLoading}
              />
            </View>
          )}

          {inputMode === 'lucky' && (
            <View style={styles.luckyContent}>
              <View style={styles.luckyHeader}>
                <Text style={styles.contentLabel}>Random Product</Text>
                <TouchableOpacity style={styles.shuffleButton} onPress={handleShuffle}>
                  <Ionicons name="shuffle" size={16} color={Colors.secondary} />
                  <Text style={styles.shuffleText}>Shuffle</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.luckyCard}>
                <Ionicons name="dice" size={24} color={Colors.secondary} style={styles.luckyIcon} />
                <Text style={styles.luckyProductText}>{luckyProduct}</Text>
              </View>
            </View>
          )}
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          style={[
            styles.submitButton,
            !hasValidInput() && styles.submitButtonDisabled,
          ]}
          onPress={handleAnalyze}
          disabled={isLoading || !hasValidInput()}
        >
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={Colors.white} />
              <Text style={styles.submitButtonText}>Scanning Closed World...</Text>
            </View>
          ) : (
            <View style={styles.buttonContent}>
              <Text style={styles.submitButtonText}>Initiate Scan</Text>
              <Ionicons name="flash" size={18} color={Colors.white} />
            </View>
          )}
        </TouchableOpacity>
      </View>

      <AlertModal
        visible={alert?.visible || false}
        title={alert?.title || ''}
        message={alert?.message || ''}
        type="error"
        onClose={() => setAlert(null)}
      />

      <LoadingOverlay
        visible={isLoading}
        phase="scan"
        currentStep={loadingStep}
        steps={SCAN_STEPS}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
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
  panel: {
    backgroundColor: Colors.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
  },
  modeSelector: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: Colors.gray[800],
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: 8,
  },
  modeTabActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderColor: Colors.blue[500],
  },
  modeTabText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[400],
    fontWeight: '500',
  },
  modeTabTextActive: {
    color: Colors.white,
  },
  contentArea: {
    minHeight: 180,
  },
  contentLabel: {
    fontSize: FontSizes.sm,
    fontWeight: '500',
    color: Colors.gray[400],
    marginBottom: Spacing.sm,
  },
  typeContent: {},
  scanContent: {
    gap: Spacing.md,
  },
  luckyContent: {},
  luckyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  shuffleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.secondary,
  },
  shuffleText: {
    fontSize: FontSizes.xs,
    color: Colors.secondary,
    fontWeight: '500',
  },
  luckyCard: {
    backgroundColor: 'rgba(157,0,255,0.1)',
    borderWidth: 1,
    borderColor: Colors.secondary,
    borderRadius: 8,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  luckyIcon: {
    marginTop: 2,
  },
  luckyProductText: {
    flex: 1,
    fontSize: FontSizes.md,
    color: Colors.white,
    lineHeight: FontSizes.md * 1.5,
  },
  cameraPrompt: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: Colors.green[600],
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  cameraIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  cameraPromptTitle: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.green[400],
  },
  cameraPromptHint: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
  },
  scanTextInput: {
    minHeight: 60,
  },
  textInput: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    color: Colors.white,
    fontFamily: 'monospace',
    fontSize: FontSizes.sm,
    minHeight: 200,
    textAlignVertical: 'top',
  },
  imagePreview: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  previewImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.gray[700],
  },
  imageInfo: {
    flex: 1,
  },
  capturedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.xs,
  },
  capturedText: {
    fontSize: FontSizes.sm,
    fontFamily: 'monospace',
    color: Colors.green[400],
  },
  imageHint: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  removeImageButton: {
    padding: 4,
  },
  errorText: {
    color: Colors.red[500],
    fontSize: FontSizes.sm,
    marginTop: Spacing.sm,
  },
  submitButton: {
    backgroundColor: Colors.blue[600],
    borderRadius: 8,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: Colors.white,
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  cameraContainer: {
    flex: 1,
    marginTop: -Spacing.lg,
  },
  camera: {
    flex: 1,
    minHeight: 500,
  },
  cameraOverlay: {
    position: 'absolute',
    top: Spacing.lg,
    right: Spacing.lg,
  },
  flipButton: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: Spacing.sm,
    borderRadius: 20,
  },
  cameraControls: {
    position: 'absolute',
    bottom: Spacing.xl,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: 'rgba(220,38,38,0.8)',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: 20,
  },
  cancelButtonText: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Colors.white,
  },
});
