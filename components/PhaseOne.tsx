import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, Spacing, FontSizes, Radii, makeShadows, Fonts } from '../constants/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import {
  analyzeProduct,
  AnalysisResult,
  formatAiRequestError,
  getCommercialUpgradeUrlFromError,
} from '../hooks/useGemini';
import { useCommercialization } from '../hooks/useCommercialization';
import {
  DEFAULT_SAMPLE_SET,
  getSampleSetForConnector,
  loadInventoryConnector,
} from '../utils/inventoryConnector';
import AlertModal from './AlertModal';
import LoadingOverlay, { LoadingStep } from './LoadingOverlay';

const SCAN_STEPS: LoadingStep[] = [
  { id: 'capture', label: 'Capturing input...' },
  { id: 'identify', label: 'Identifying machine signals...' },
  { id: 'map', label: 'Preparing inventory match...' },
];

interface Props {
  onComplete: (input: string, analysis: AnalysisResult, capturedImage?: string | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  onInputFocus?: (event?: any) => void;
  initialInput?: string;
  initialImage?: string | null;
  mockAnalysis?: AnalysisResult | null;
  inventoryRefreshKey?: number;
}

type InputMode = 'type' | 'scan' | 'lucky';
type PhaseOneAlert = {
  visible: boolean;
  title: string;
  message: string;
  type?: 'info' | 'error' | 'success';
};

export default function PhaseOne({
  onComplete,
  isLoading,
  setIsLoading,
  onInputFocus,
  initialInput,
  initialImage,
  mockAnalysis,
  inventoryRefreshKey = 0,
}: Props) {
  const { colors: Colors } = useAppTheme();
  const { refreshAccount } = useCommercialization();
  const styles = createStyles(Colors);
  const [inputMode, setInputMode] = useState<InputMode>(initialImage ? 'scan' : 'type');
  const [input, setInput] = useState(initialInput || '');
  const [sampleSourceLabel, setSampleSourceLabel] = useState(DEFAULT_SAMPLE_SET.sourceLabel);
  const [productPresets, setProductPresets] = useState<string[]>(DEFAULT_SAMPLE_SET.samples);
  const [luckyProduct, setLuckyProduct] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [creditUpgradeUrl, setCreditUpgradeUrl] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(initialImage || null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [alert, setAlert] = useState<PhaseOneAlert | null>(null);
  const [loadingStep, setLoadingStep] = useState<string>('capture');
  const [focusedField, setFocusedField] = useState<'type' | 'scan' | null>(null);

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

  const loadInventorySamples = async () => {
    try {
      const connector = await loadInventoryConnector();
      const sampleSet = getSampleSetForConnector(connector);
      setSampleSourceLabel(sampleSet.sourceLabel);
      setProductPresets(sampleSet.samples);
      return sampleSet.samples;
    } catch (error) {
      console.warn('Failed to load inventory source samples', error);
      setSampleSourceLabel(DEFAULT_SAMPLE_SET.sourceLabel);
      setProductPresets(DEFAULT_SAMPLE_SET.samples);
      return DEFAULT_SAMPLE_SET.samples;
    }
  };

  useEffect(() => {
    loadInventorySamples();
  }, [inventoryRefreshKey]);

  const getActiveInput = () => {
    if (inputMode === 'lucky') return luckyProduct;
    if (inputMode === 'scan') return input;
    return input;
  };

  const handleFieldFocus = (field: 'type' | 'scan', event?: any) => {
    setFocusedField(field);
    onInputFocus?.(event);
  };

  const handleFieldBlur = () => {
    setFocusedField(null);
  };

  const hasValidInput = () => {
    if (inputMode === 'scan') return !!capturedImage || input.trim().length > 0;
    if (inputMode === 'lucky') return luckyProduct.trim().length > 0;
    return input.trim().length > 0;
  };

  const submitDisabled = !hasValidInput() || !!mockAnalysis;
  const submitLocked = !isLoading && submitDisabled;
  const submitIconColor = submitLocked ? Colors.mutedText : '#ffffff';

  const getSubmitLockMessage = () => {
    if (mockAnalysis) {
      return 'The mock scan is already loaded. Use the guided tour controls to move to the next step.';
    }

    if (inputMode === 'scan') {
      return 'Capture a machine photo or add scan notes first. Use Tap to Open Camera, or enter model numbers, visible assemblies, damage, or inventory clues.';
    }

    if (inputMode === 'lucky') {
      return 'Choose a sample machine first. Use Shuffle if no sample is loaded, then Start Machine Scan will activate.';
    }

    return 'Describe the machine first. Add visible assemblies, model numbers, labels, damage, or other identifying marks, then Start Machine Scan will activate.';
  };

  const showSubmitLockGuidance = () => {
    setAlert({
      visible: true,
      title: 'Start Machine Scan needs input',
      message: getSubmitLockMessage(),
      type: 'info',
    });
  };

  const handleAnalyze = async () => {
    const activeInput = getActiveInput();
    if (!activeInput.trim() && !capturedImage) return;
    if (mockAnalysis) {
      setError(null);
      setCreditUpgradeUrl(null);
      onComplete(activeInput, mockAnalysis, capturedImage);
      return;
    }

    setIsLoading(true);
    setLoadingStep('capture');
    setError(null);
    setCreditUpgradeUrl(null);
    try {
      const imageToUse = inputMode === 'scan' ? capturedImage : undefined;
      const result = await analyzeProduct(activeInput, imageToUse || undefined);
      await refreshAccount();
      onComplete(activeInput, result, imageToUse);
    } catch (e: any) {
      setCreditUpgradeUrl(getCommercialUpgradeUrlFromError(e));
      const errorMsg = e?.message || 'Unknown error';
      if (errorMsg.includes('Network') || errorMsg.includes('fetch')) {
        setError("Network error. Check your internet connection and try again.");
      } else if (errorMsg.includes('timeout') || errorMsg.includes('Timeout')) {
        setError("Request timed out. Try with a simpler description.");
      } else {
        setError(formatAiRequestError(e, 'Analysis failed'));
      }
      console.error('Analysis error:', e);
      refreshAccount().catch(() => {});
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitPress = () => {
    if (submitDisabled) {
      showSubmitLockGuidance();
      return;
    }

    handleAnalyze();
  };

  const handleShuffle = (nextPresets = productPresets) => {
    const presets = nextPresets.length > 0 ? nextPresets : DEFAULT_SAMPLE_SET.samples;
    const randomIndex = Math.floor(Math.random() * presets.length);
    setLuckyProduct(presets[randomIndex]);
  };

  const openSampleMode = async () => {
    const nextPresets = await loadInventorySamples();
    setInputMode('lucky');
    handleShuffle(nextPresets);
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
        setAlert({visible: true, title: 'Permission needed', message: 'Camera access is required to scan machines.'});
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
            <TouchableOpacity
              style={styles.flipButton}
              onPress={toggleCameraFacing}
              accessibilityRole="button"
              accessibilityLabel="Flip camera"
            >
              <Ionicons name="camera-reverse" size={28} color={Colors.white} />
            </TouchableOpacity>
          </View>
          <View style={styles.cameraControls}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setIsCameraOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Cancel camera scan"
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.captureButton}
              onPress={captureImage}
              accessibilityRole="button"
              accessibilityLabel="Capture machine photo"
            >
              <View style={styles.captureButtonInner} />
            </TouchableOpacity>
            <View style={{ width: 80 }} />
          </View>
        </CameraView>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="reversr-tour-scan">
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="scan-outline" size={24} color={Colors.primary} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Phase 1: Scan</Text>
          <Text style={styles.description}>
            Capture a machine or describe the visible assemblies and identifying marks.
          </Text>
        </View>
      </View>

      <View style={styles.panel}>
        <View style={styles.modeSelector}>
          <TouchableOpacity
            style={[styles.modeTab, inputMode === 'type' && styles.modeTabActive]}
            onPress={() => setInputMode('type')}
            accessibilityRole="button"
            accessibilityLabel="Use text description mode"
            accessibilityState={{ selected: inputMode === 'type' }}
          >
            <Ionicons
              name="create-outline"
              size={18}
              color={inputMode === 'type' ? Colors.primary : Colors.mutedText}
            />
            <Text style={[styles.modeTabText, inputMode === 'type' && styles.modeTabTextActive]}>
              Type
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeTab, inputMode === 'scan' && styles.modeTabActive]}
            onPress={() => setInputMode('scan')}
            accessibilityRole="button"
            accessibilityLabel="Use camera scan mode"
            accessibilityState={{ selected: inputMode === 'scan' }}
          >
            <Ionicons
              name="camera-outline"
              size={18}
              color={inputMode === 'scan' ? Colors.primary : Colors.mutedText}
            />
            <Text style={[styles.modeTabText, inputMode === 'scan' && styles.modeTabTextActive]}>
              Scan
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeTab, inputMode === 'lucky' && styles.modeTabActive]}
            onPress={openSampleMode}
            accessibilityRole="button"
            accessibilityLabel="Use sample machine mode"
            accessibilityState={{ selected: inputMode === 'lucky' }}
          >
            <Ionicons
              name="dice-outline"
              size={18}
              color={inputMode === 'lucky' ? Colors.primary : Colors.mutedText}
            />
            <Text style={[styles.modeTabText, inputMode === 'lucky' && styles.modeTabTextActive]}>
              Sample
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.contentArea}>
          {inputMode === 'type' && (
            <View style={styles.typeContent}>
              <Text style={styles.contentLabel}>Describe the machine</Text>
              <TextInput
                style={[
                  styles.textInput,
                  focusedField === 'type' && Platform.OS !== 'web' && styles.textInputFocusedCompact,
                ]}
                value={input}
                onChangeText={setInput}
                onFocus={(event) => handleFieldFocus('type', event)}
                onBlur={handleFieldBlur}
                accessibilityLabel="Machine description"
                placeholder="e.g., A FarmBot Genesis gantry farming robot with tracks, gantry beam, z-axis, Farmduino, Raspberry Pi, motors, camera, tools, and power supply..."
                placeholderTextColor={Colors.gray[500]}
                multiline
                numberOfLines={4}
                editable={!isLoading}
              />
              <Text style={styles.inputHint}>
                Suggested example only. ReversR uses this field only after you enter your own text.
              </Text>
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
                    accessibilityRole="button"
                    accessibilityLabel="Remove captured machine photo"
                  >
                    <Ionicons name="close" size={18} color={Colors.gray[400]} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.cameraPrompt}
                  onPress={openCamera}
                  accessibilityRole="button"
                  accessibilityLabel="Open camera to scan machine"
                >
                  <View style={styles.cameraIconCircle}>
                    <Ionicons name="camera" size={32} color={Colors.green[400]} />
                  </View>
                  <Text style={styles.cameraPromptTitle}>Tap to Open Camera</Text>
                  <Text style={styles.cameraPromptHint}>
                    Point at a machine, model plate, or visible assembly
                  </Text>
                </TouchableOpacity>
              )}
              <TextInput
                style={[
                  styles.textInput,
                  styles.scanTextInput,
                  focusedField === 'scan' && Platform.OS !== 'web' && styles.scanTextInputFocusedCompact,
                ]}
                value={input}
                onChangeText={setInput}
                onFocus={(event) => handleFieldFocus('scan', event)}
                onBlur={handleFieldBlur}
                accessibilityLabel="Optional machine scan notes"
                placeholder="Optional: Add model number, visible assemblies, damage, or inventory clues..."
                placeholderTextColor={Colors.gray[500]}
                multiline
                numberOfLines={2}
                editable={!isLoading}
              />
            </View>
          )}

          {inputMode === 'lucky' && (
            <View style={styles.luckyContent}>
              <View style={styles.luckyHeader}>
                <View style={styles.sampleLabelBlock}>
                  <Text style={styles.contentLabel}>Sample machine</Text>
                  <Text style={styles.sampleSourceText}>Source: {sampleSourceLabel}</Text>
                </View>
                <TouchableOpacity
                  style={styles.shuffleButton}
                  onPress={() => handleShuffle()}
                  accessibilityRole="button"
                  accessibilityLabel="Shuffle sample machine description"
                >
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

        {error && (
          <View style={styles.errorPanel}>
            <Text style={styles.errorText}>{error}</Text>
            {creditUpgradeUrl && (
              <TouchableOpacity
                style={styles.errorActionButton}
                onPress={() => Linking.openURL(creditUpgradeUrl)}
                accessibilityRole="link"
                accessibilityLabel="Open ReversR account billing page"
              >
                <Ionicons name="open-outline" size={15} color={Colors.accent} />
                <Text style={styles.errorActionText}>Open Account</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.submitButton,
            submitLocked && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmitPress}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel={submitDisabled ? `Start Machine Scan inactive. ${getSubmitLockMessage()}` : 'Initiate machine scan'}
          accessibilityState={{ disabled: isLoading || submitDisabled }}
        >
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#ffffff" />
              <Text style={styles.submitButtonText}>Scanning Machine...</Text>
            </View>
          ) : (
            <View style={styles.buttonContent}>
              <Text style={[styles.submitButtonText, submitLocked && styles.submitButtonTextDisabled]}>
                {mockAnalysis ? 'Mock Scan Preloaded' : 'Start Machine Scan'}
              </Text>
              <Ionicons name="flash" size={18} color={submitIconColor} />
            </View>
          )}
        </TouchableOpacity>
      </View>

      <AlertModal
        visible={alert?.visible || false}
        title={alert?.title || ''}
        message={alert?.message || ''}
        type={alert?.type || 'error'}
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

const createStyles = (Colors: AppColors) => {
  const shadows = makeShadows(Colors);
  return StyleSheet.create({
  container: {
    paddingVertical: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
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
    fontFamily: Fonts.display,
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
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    ...shadows.card,
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
    backgroundColor: Colors.elevated,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.md,
  },
  modeTabActive: {
    backgroundColor: Colors.primarySoft,
    borderColor: Colors.primary,
  },
  modeTabText: {
    fontSize: FontSizes.sm,
    color: Colors.mutedText,
    fontWeight: '600',
  },
  modeTabTextActive: {
    color: Colors.primary,
  },
  contentArea: {
    minHeight: 150,
  },
  contentLabel: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.mutedText,
    marginBottom: Spacing.sm,
  },
  typeContent: {
    gap: Spacing.sm,
  },
  inputHint: {
    fontSize: FontSizes.xs,
    color: Colors.dimText,
    lineHeight: 18,
  },
  scanContent: {
    gap: Spacing.md,
  },
  luckyContent: {},
  luckyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  sampleLabelBlock: {
    flex: 1,
  },
  sampleSourceText: {
    color: Colors.dim,
    fontSize: FontSizes.xs,
    marginTop: -Spacing.xs,
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
    color: Colors.text,
    lineHeight: FontSizes.md * 1.5,
  },
  cameraPrompt: {
    backgroundColor: Colors.surface,
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
  scanTextInputFocusedCompact: {
    minHeight: 84,
  },
  textInput: {
    backgroundColor: Colors.input,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    padding: Spacing.md,
    color: Colors.text,
    fontFamily: 'monospace',
    fontSize: FontSizes.sm,
    minHeight: 150,
    textAlignVertical: 'top',
  },
  textInputFocusedCompact: {
    minHeight: 112,
  },
  imagePreview: {
    backgroundColor: Colors.surface,
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
    textAlign: 'center',
  },
  errorPanel: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    alignItems: 'center',
  },
  errorActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  errorActionText: {
    color: Colors.accent,
    fontSize: FontSizes.sm,
    fontWeight: '700',
  },
  submitButton: {
    backgroundColor: Colors.primary,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: Radii.md,
    paddingVertical: 15,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  submitButtonDisabled: {
    backgroundColor: Colors.elevated,
    borderColor: Colors.border,
  },
  submitButtonText: {
    color: '#ffffff',
    fontFamily: Fonts.bold,
    fontSize: FontSizes.md,
  },
  submitButtonTextDisabled: {
    color: Colors.mutedText,
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
};
