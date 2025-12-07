import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSizes } from '../constants/theme';
import { analyzeProduct, AnalysisResult } from '../hooks/useGemini';

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

export default function PhaseOne({ onComplete, isLoading, setIsLoading, initialInput, initialImage }: Props) {
  const [input, setInput] = useState(initialInput || '');
  const [error, setError] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(initialImage || null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const handleAnalyze = async () => {
    if (!input.trim() && !capturedImage) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await analyzeProduct(input, capturedImage || undefined);
      onComplete(input, result, capturedImage);
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

  const handleLoadPreset = () => {
    const randomIndex = Math.floor(Math.random() * PRODUCT_PRESETS.length);
    setInput(PRODUCT_PRESETS[randomIndex]);
  };

  const openCamera = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Permission needed', 'Camera access is required to scan objects.');
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
        Alert.alert('Camera Error', 'Failed to capture image. Please try again.');
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
        <Ionicons name="layers-outline" size={28} color={Colors.blue[500]} />
        <View style={styles.headerText}>
          <Text style={styles.title}>Phase 1: The Closed World Scan</Text>
          <Text style={styles.description}>
            Define the boundaries. Enter a product description or scan an object.
          </Text>
        </View>
      </View>

      <View style={styles.panel}>
        <View style={styles.inputHeader}>
          <Text style={styles.inputLabel}>System Input</Text>
          <View style={styles.inputActions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleLoadPreset}
              disabled={isLoading || !!capturedImage}
            >
              <Ionicons name="sparkles" size={14} color={Colors.blue[500]} />
              <Text style={styles.actionButtonText}>Feel Lucky</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={openCamera}
              disabled={isLoading || !!capturedImage}
            >
              <Ionicons name="camera" size={14} color={Colors.green[500]} />
              <Text style={[styles.actionButtonText, { color: Colors.green[500] }]}>
                Scan Object
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {capturedImage ? (
          <View style={styles.imagePreview}>
            <Image source={{ uri: capturedImage }} style={styles.previewImage} />
            <View style={styles.imageInfo}>
              <View style={styles.capturedBadge}>
                <Ionicons name="checkmark-circle" size={14} color={Colors.green[400]} />
                <Text style={styles.capturedText}>Image Captured</Text>
              </View>
              <Text style={styles.imageHint}>
                The image will be analyzed along with any text you provide.
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
          <TextInput
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder="e.g., A standard kitchen blender..."
            placeholderTextColor={Colors.gray[600]}
            multiline
            numberOfLines={4}
            editable={!isLoading}
          />
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          style={[
            styles.submitButton,
            (!input.trim() && !capturedImage) && styles.submitButtonDisabled,
          ]}
          onPress={handleAnalyze}
          disabled={isLoading || (!input.trim() && !capturedImage)}
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
  inputHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  inputLabel: {
    fontSize: FontSizes.sm,
    fontWeight: '500',
    color: Colors.gray[400],
  },
  inputActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionButtonText: {
    fontSize: FontSizes.xs,
    color: Colors.blue[500],
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
    minHeight: 100,
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
    minHeight: 400,
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
