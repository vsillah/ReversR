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
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, Spacing, FontSizes } from '../constants/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import {
  analyzeProduct,
  AnalysisResult,
  formatAiRequestError,
  getCommercialUpgradeUrlFromError,
} from '../hooks/useGemini';
import { useCommercialization } from '../hooks/useCommercialization';
import AlertModal from './AlertModal';
import LoadingOverlay, { LoadingStep } from './LoadingOverlay';
import { formatJourneyCreditShortLabel, formatResetCountdown } from '../utils/commercialUsage';

const SCAN_STEPS: LoadingStep[] = [
  { id: 'capture', label: 'Capturing input...' },
  { id: 'identify', label: 'Identifying machine signals...' },
  { id: 'map', label: 'Preparing inventory match...' },
];

interface Props {
  onComplete: (input: string, analysis: AnalysisResult, capturedImage?: string | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  initialInput?: string;
  initialImage?: string | null;
  mockAnalysis?: AnalysisResult | null;
  mockInput?: string;
}

const PRODUCT_PRESETS = [
  "A FarmBot Genesis v1.8 CNC farming machine with track extrusions, gantry main beam, gantry columns, cross-slide plate, z-axis extrusion, Farmduino, Raspberry Pi, motors, encoders, UTM PCB, solenoid valve, vacuum pump, watering tools, seeder, camera, belts, pulleys, and v-wheels.",
  "A FarmBot Genesis gantry farming robot with aluminum tracks, gantry beam, z-axis, universal tool mount, Farmduino electronics, Raspberry Pi controller, motors, encoders, solenoid valve, vacuum pump, seeder, watering nozzle, camera, and power supply.",
  "A benchtop drill press with cast base, column, quill, chuck, belt drive, motor, depth stop, table, and safety guard.",
  "A small conveyor sorting machine with frame, belt, rollers, drive motor, sensors, controller, power supply, and diverter gate.",
  "A compact injection molding machine with clamp frame, heated barrel, screw drive, hopper, hydraulic unit, controller, and mold platen.",
  "A pneumatic packaging sealer with frame, heated sealing jaw, air cylinder, foot pedal, control board, power supply, and safety shield.",
  "A lab centrifuge with rotor, motor, lid latch, control panel, vibration sensor, power supply, and enclosure.",
  "A laser cutter with gantry frame, laser tube, mirrors, lens head, stepper motors, honeycomb bed, controller, exhaust fan, and water pump.",
];

type InputMode = 'type' | 'scan' | 'lucky';

export default function PhaseOne({
  onComplete,
  isLoading,
  setIsLoading,
  initialInput,
  initialImage,
  mockAnalysis,
  mockInput,
}: Props) {
  const { colors: Colors } = useAppTheme();
  const { account, refreshAccount } = useCommercialization();
  const styles = createStyles(Colors);
  const [inputMode, setInputMode] = useState<InputMode>(initialImage ? 'scan' : 'type');
  const [input, setInput] = useState(initialInput || '');
  const [luckyProduct, setLuckyProduct] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [creditUpgradeUrl, setCreditUpgradeUrl] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(initialImage || null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [alert, setAlert] = useState<{visible: boolean, title: string, message: string} | null>(null);
  const [loadingStep, setLoadingStep] = useState<string>('capture');
  const [countdownNow, setCountdownNow] = useState(Date.now());

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

  useEffect(() => {
    const timer = setInterval(() => setCountdownNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

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

  const submitDisabled = !hasValidInput() || !!mockAnalysis;
  const submitLocked = !isLoading && submitDisabled;
  const submitIconColor = submitLocked ? Colors.mutedText : '#ffffff';

  const handleAnalyze = async () => {
    const activeInput = getActiveInput() || mockInput || '';
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

  const usageIsUnlimited = Boolean(account?.usage.unlimitedCredits || account?.entitlements.unlimitedCredits);
  const isGuestPlan = !account || account.billing.planId === 'free';
  const journeyCreditLabel = formatJourneyCreditShortLabel(account?.usage);
  const resetLabel = usageIsUnlimited
    ? 'No monthly reset limit'
    : account?.usage.resetAt
      ? formatResetCountdown(account.usage.resetAt, countdownNow)
      : 'Loading reset timer...';

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
        <Ionicons name="search" size={28} color={Colors.blue[500]} />
        <View style={styles.headerText}>
          <Text style={styles.title}>Phase 1: Scan</Text>
          <Text style={styles.description}>
            Capture a machine or describe the visible assemblies and identifying marks.
          </Text>
        </View>
      </View>

      <View style={styles.creditPanel}>
        <View style={styles.creditIconCircle}>
          <Ionicons name={usageIsUnlimited ? 'infinite-outline' : 'hourglass-outline'} size={18} color={Colors.accent} />
        </View>
        <View style={styles.creditPanelText}>
          <Text style={styles.creditPanelTitle}>{isGuestPlan ? 'Guest journey credits' : 'Journey credits'}</Text>
          <Text style={styles.creditPanelBody}>
            {journeyCreditLabel}. {resetLabel}. One credit starts the journey; later reconstruction steps do not spend more.
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
              color={inputMode === 'type' ? Colors.white : Colors.gray[400]} 
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
              color={inputMode === 'scan' ? Colors.white : Colors.gray[400]} 
            />
            <Text style={[styles.modeTabText, inputMode === 'scan' && styles.modeTabTextActive]}>
              Scan
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeTab, inputMode === 'lucky' && styles.modeTabActive]}
            onPress={() => setInputMode('lucky')}
            accessibilityRole="button"
            accessibilityLabel="Use sample machine mode"
            accessibilityState={{ selected: inputMode === 'lucky' }}
          >
            <Ionicons 
              name="dice-outline" 
              size={18} 
              color={inputMode === 'lucky' ? Colors.white : Colors.gray[400]} 
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
                style={styles.textInput}
                value={input}
                onChangeText={setInput}
                accessibilityLabel="Machine description"
                placeholder="e.g., A FarmBot Genesis gantry farming robot with tracks, gantry beam, z-axis, Farmduino, Raspberry Pi, motors, camera, tools, and power supply..."
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
                style={[styles.textInput, styles.scanTextInput]}
                value={input}
                onChangeText={setInput}
                accessibilityLabel="Optional machine scan notes"
                placeholder="Optional: Add model number, visible assemblies, damage, or inventory clues..."
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
                <Text style={styles.contentLabel}>Sample machine</Text>
                <TouchableOpacity
                  style={styles.shuffleButton}
                  onPress={handleShuffle}
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
          onPress={handleAnalyze}
          disabled={isLoading || submitDisabled}
          accessibilityRole="button"
          accessibilityLabel={mockAnalysis ? 'Mock scan result is preloaded' : 'Initiate machine scan'}
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

const createStyles = (Colors: AppColors) => StyleSheet.create({
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
  creditPanel: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  creditIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.mode === 'dark' ? 'rgba(234, 179, 8, 0.12)' : 'rgba(234, 179, 8, 0.18)',
  },
  creditPanelText: {
    flex: 1,
  },
  creditPanelTitle: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 2,
  },
  creditPanelBody: {
    fontSize: FontSizes.xs,
    color: Colors.dim,
    lineHeight: FontSizes.xs * 1.45,
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
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: 8,
  },
  modeTabActive: {
    backgroundColor: Colors.mode === 'dark' ? 'rgba(59, 130, 246, 0.2)' : Colors.blue[900],
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
  textInput: {
    backgroundColor: Colors.input,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    padding: Spacing.md,
    color: Colors.text,
    fontFamily: 'monospace',
    fontSize: FontSizes.sm,
    minHeight: 200,
    textAlignVertical: 'top',
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
    backgroundColor: Colors.blue[600],
    borderWidth: 1,
    borderColor: Colors.blue[600],
    borderRadius: 8,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  submitButtonDisabled: {
    backgroundColor: Colors.elevated,
    borderColor: Colors.border,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: FontSizes.md,
    fontWeight: '600',
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
