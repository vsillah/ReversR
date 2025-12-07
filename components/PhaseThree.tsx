import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
  Dimensions,
  Animated,
  PanResponder,
  Image as RNImage,
} from 'react-native';
import { Image } from 'expo-image';
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
  AngleImage,
} from '../hooks/useGemini';
import AlertModal from './AlertModal';

interface Props {
  innovation: InnovationResult;
  existingSpec?: TechnicalSpec | null;
  existingImageUrl?: string | null;
  existingThreeDScene?: ThreeDSceneDescriptor | null;
  imageGenerating?: boolean;
  multiAngleImages?: AngleImage[];
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
  multiAngleImages = [],
  onComplete,
  onContinueToBuild,
  onBack,
  onReset,
  onTryAnotherPattern,
}: Props) {
  const [spec, setSpec] = useState<TechnicalSpec | null>(existingSpec || null);
  const [localImageBase64, setLocalImageBase64] = useState<string | null>(null);
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
  const [imageLoadError, setImageLoadError] = useState(false);
  const [cachedFileUris, setCachedFileUris] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<{visible: boolean, title: string, message: string, type: 'info' | 'error' | 'success'} | null>(null);
  const ALL_ANGLES = [
    { id: 'front', label: 'Front View' },
    { id: 'side', label: 'Side View' },
    { id: 'iso', label: 'Isometric' },
  ];
  
  const availableAngles = multiAngleImages.filter(img => img.imageData);
  const [selectedAngleId, setSelectedAngleId] = useState<string | null>(null);
  
  // Debug logging for image data flow
  console.log('[DEBUG] PhaseThree render:', {
    multiAngleImagesCount: multiAngleImages.length,
    availableAnglesCount: availableAngles.length,
    selectedAngleId,
    existingImageUrl: existingImageUrl ? `${existingImageUrl.substring(0, 50)}...` : 'null',
    imageGenerating,
  });
  if (multiAngleImages.length > 0) {
    console.log('[DEBUG] PhaseThree multiAngleImages details:', multiAngleImages.map(img => ({
      id: img.id,
      hasImageData: !!img.imageData,
      imageDataLength: img.imageData?.length || 0,
      imageDataPrefix: img.imageData?.substring(0, 30) || 'null',
    })));
  }
  
  // Normalize image URI - handles file URIs, data URLs, HTTP URLs, and raw base64
  const normalizeImageUri = (data: string | null | undefined): string | null => {
    if (!data) {
      console.log('[DEBUG] normalizeImageUri: null/undefined input');
      return null;
    }
    if (typeof data !== 'string') {
      console.log('[DEBUG] normalizeImageUri: non-string input', typeof data);
      return null;
    }
    const trimmed = data.trim();
    if (!trimmed) {
      console.log('[DEBUG] normalizeImageUri: empty after trim');
      return null;
    }
    
    console.log('[DEBUG] normalizeImageUri: input length:', trimmed.length, 'first 60 chars:', trimmed.substring(0, 60));
    
    // File URIs - return unchanged (from expo-file-system)
    if (trimmed.startsWith('file://')) {
      console.log('[DEBUG] normalizeImageUri: detected file:// URI');
      return trimmed;
    }
    // Already a data URL - return unchanged
    if (trimmed.startsWith('data:image/')) {
      console.log('[DEBUG] normalizeImageUri: detected data:image URL, returning unchanged');
      return trimmed;
    }
    // HTTP/HTTPS URLs - return unchanged
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      console.log('[DEBUG] normalizeImageUri: detected HTTP URL');
      return trimmed;
    }
    // Raw base64 data (PNG or JPEG signatures)
    if (trimmed.startsWith('iVBOR') || trimmed.startsWith('/9j/') || trimmed.match(/^[A-Za-z0-9+/=]{50,}$/)) {
      console.log('[DEBUG] normalizeImageUri: detected raw base64, adding prefix');
      return `data:image/png;base64,${trimmed}`;
    }
    // Fallback - assume base64 if it's a long string without URL-like characters
    if (trimmed.length > 100 && !trimmed.includes('/') && !trimmed.includes('.')) {
      console.log('[DEBUG] normalizeImageUri: fallback base64 detection, adding prefix');
      return `data:image/png;base64,${trimmed}`;
    }
    // Return as-is for any other format
    console.log('[DEBUG] normalizeImageUri: returning as-is');
    return trimmed;
  };

  // Auto-select first available angle when it loads
  useEffect(() => {
    if (availableAngles.length > 0 && !selectedAngleId) {
      setSelectedAngleId(availableAngles[0].id);
    }
  }, [availableAngles, selectedAngleId]);

  // Reset image load error when images change
  useEffect(() => {
    setImageLoadError(false);
  }, [multiAngleImages, existingImageUrl, selectedAngleId]);

  // Convert base64 data URLs to file URIs for Android compatibility
  // Large base64 strings (>64KB) don't render properly in React Native Image on Android
  const cacheBase64ToFile = useCallback(async (dataUrl: string, angleId: string): Promise<string | null> => {
    if (!dataUrl) return null;
    
    // If it's already a file URI, return as-is
    if (dataUrl.startsWith('file://')) {
      return dataUrl;
    }
    
    // If it's an HTTP URL, return as-is (they work fine)
    if (dataUrl.startsWith('http://') || dataUrl.startsWith('https://')) {
      return dataUrl;
    }
    
    // Extract base64 data from data URL
    const base64Match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
    if (!base64Match) {
      console.log('[DEBUG] cacheBase64ToFile: Not a data URL, returning as-is');
      return dataUrl;
    }
    
    const base64Data = base64Match[1];
    
    // Create a cache key that includes image content signature (length + first/last chars)
    // This ensures we regenerate the file when image data changes
    const contentSignature = `${base64Data.length}_${base64Data.substring(0, 8)}_${base64Data.substring(base64Data.length - 8)}`;
    const fullCacheKey = `${angleId}_${contentSignature}`;
    
    // Check if we already cached this exact image content
    if (cachedFileUris[fullCacheKey]) {
      console.log('[DEBUG] cacheBase64ToFile: Using cached file URI for', fullCacheKey);
      return cachedFileUris[fullCacheKey];
    }
    
    console.log('[DEBUG] cacheBase64ToFile: Converting to file, base64 length:', base64Data.length, 'key:', fullCacheKey);
    
    try {
      const filename = `reversr_image_${angleId}_${Date.now()}.png`;
      const fileUri = FileSystem.cacheDirectory + filename;
      
      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      console.log('[DEBUG] cacheBase64ToFile: Saved to file:', fileUri);
      
      // Cache the file URI with content-aware key
      setCachedFileUris(prev => ({ ...prev, [fullCacheKey]: fileUri }));
      
      return fileUri;
    } catch (error) {
      console.error('[DEBUG] cacheBase64ToFile error:', error);
      return null;
    }
  }, [cachedFileUris]);

  // State for displayable file URIs

  // Derive the best available image from props or local state
  const derivedImageUri = useMemo(() => {
    console.log('[DEBUG] PhaseThree derivedImageUri useMemo:', {
      multiAngleImagesLength: multiAngleImages.length,
      existingImageUrl: existingImageUrl ? 'present' : 'null',
      localImageBase64: localImageBase64 ? 'present' : 'null',
    });
    // Priority 1: Multi-angle images from background generation
    if (multiAngleImages.length > 0) {
      const firstImage = multiAngleImages.find(img => img.imageData);
      console.log('[DEBUG] PhaseThree: Found firstImage:', {
        id: firstImage?.id,
        hasImageData: !!firstImage?.imageData,
        imageDataLength: firstImage?.imageData?.length || 0,
      });
      if (firstImage?.imageData) {
        const normalized = normalizeImageUri(firstImage.imageData);
        console.log('[DEBUG] PhaseThree: Normalized URI length:', normalized?.length || 0);
        return normalized;
      }
    }
    // Priority 2: Existing image URL from saved innovation
    if (existingImageUrl) {
      return normalizeImageUri(existingImageUrl);
    }
    // Priority 3: Locally generated image
    if (localImageBase64) {
      return normalizeImageUri(localImageBase64);
    }
    return null;
  }, [multiAngleImages, existingImageUrl, localImageBase64]);

  // Update status when images become available
  useEffect(() => {
    if (derivedImageUri && (status === 'specs_ready' || status === 'generating_specs') && spec) {
      setStatus('complete');
    }
  }, [derivedImageUri, status, spec]);
  
  const currentAngleImage = availableAngles.find(img => img.id === selectedAngleId) || availableAngles[0] || null;
  const currentAngleIndex = availableAngles.findIndex(img => img.id === selectedAngleId);
  const pendingAnglesCount = imageGenerating ? (3 - availableAngles.length) : 0;

  // Get the display URI directly from the current angle image or derived image
  // expo-image handles large base64 data URIs natively (no file conversion needed for display)
  // File conversion is only used for Save/Share operations
  const displayImageUri = useMemo(() => {
    const uri = normalizeImageUri(currentAngleImage?.imageData) || derivedImageUri;
    console.log('[DEBUG] displayImageUri computed:', uri ? uri.substring(0, 60) + '...' : 'null', 'angleId:', currentAngleImage?.id);
    return uri;
  }, [currentAngleImage, derivedImageUri]);
  
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
    const imageToSave = normalizeImageUri(currentAngleImage?.imageData) || derivedImageUri;
    console.log('[DEBUG] handleSaveImage called, imageToSave:', imageToSave ? `${imageToSave.substring(0, 50)}...` : 'null');
    if (!imageToSave) {
      console.log('[DEBUG] handleSaveImage: No image to save');
      setAlert({visible: true, title: 'No Image', message: 'No image available to save.', type: 'info'});
      return;
    }
    
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      console.log('[DEBUG] handleSaveImage: Permission status:', status);
      if (status !== 'granted') {
        setAlert({visible: true, title: 'Permission Required', message: 'Please allow access to save images.', type: 'error'});
        return;
      }

      const angleSuffix = currentAngleImage?.label?.replace(/\s+/g, '_') || '2D';
      const filename = `${innovation.conceptName.replace(/\s+/g, '_')}_${angleSuffix}.png`;
      const fileUri = FileSystem.documentDirectory + filename;
      console.log('[DEBUG] handleSaveImage: Saving to:', fileUri);
      
      // Handle HTTP URLs by downloading, base64 data URLs by extracting
      if (imageToSave.startsWith('http://') || imageToSave.startsWith('https://')) {
        console.log('[DEBUG] handleSaveImage: Downloading from URL');
        const downloadResult = await FileSystem.downloadAsync(imageToSave, fileUri);
        if (downloadResult.status !== 200) {
          throw new Error('Failed to download image');
        }
      } else {
        console.log('[DEBUG] handleSaveImage: Writing base64 data, length:', imageToSave.length);
        const base64Data = imageToSave.replace(/^data:image\/\w+;base64,/, '');
        console.log('[DEBUG] handleSaveImage: Base64 data length after strip:', base64Data.length);
        await FileSystem.writeAsStringAsync(fileUri, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });
        console.log('[DEBUG] handleSaveImage: File written successfully');
      }

      await MediaLibrary.saveToLibraryAsync(fileUri);
      console.log('[DEBUG] handleSaveImage: Saved to library');
      setAlert({visible: true, title: 'Saved', message: `${currentAngleImage?.label || 'Image'} saved to your photo library.`, type: 'success'});
    } catch (e: any) {
      console.error('[DEBUG] handleSaveImage error:', e?.message || e);
      setAlert({visible: true, title: 'Error', message: `Failed to save image: ${e?.message || 'Unknown error'}`, type: 'error'});
    }
  };

  const handleSaveAllAngles = async () => {
    console.log('[DEBUG] handleSaveAllAngles called, availableAngles:', availableAngles.length);
    if (availableAngles.length === 0) {
      setAlert({visible: true, title: 'No Images', message: 'No images available to save.', type: 'info'});
      return;
    }
    
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      console.log('[DEBUG] handleSaveAllAngles: Permission status:', status);
      if (status !== 'granted') {
        setAlert({visible: true, title: 'Permission Required', message: 'Please allow access to save images.', type: 'error'});
        return;
      }

      let savedCount = 0;
      for (const angle of availableAngles) {
        if (angle.imageData) {
          const imageUri = normalizeImageUri(angle.imageData);
          console.log('[DEBUG] handleSaveAllAngles: Processing angle:', angle.id, 'imageUri:', imageUri ? 'present' : 'null');
          if (!imageUri) continue;
          
          const filename = `${innovation.conceptName.replace(/\s+/g, '_')}_${angle.label.replace(/\s+/g, '_')}.png`;
          const fileUri = FileSystem.documentDirectory + filename;
          
          try {
            // Handle HTTP URLs by downloading, base64 data URLs by extracting
            if (imageUri.startsWith('http://') || imageUri.startsWith('https://')) {
              const downloadResult = await FileSystem.downloadAsync(imageUri, fileUri);
              if (downloadResult.status !== 200) continue;
            } else {
              const base64Data = imageUri.replace(/^data:image\/\w+;base64,/, '');
              await FileSystem.writeAsStringAsync(fileUri, base64Data, {
                encoding: FileSystem.EncodingType.Base64,
              });
            }
            
            await MediaLibrary.saveToLibraryAsync(fileUri);
            savedCount++;
            console.log('[DEBUG] handleSaveAllAngles: Saved angle:', angle.id);
          } catch (angleError: any) {
            console.error('[DEBUG] handleSaveAllAngles: Error saving angle:', angle.id, angleError?.message);
          }
        }
      }
      
      console.log('[DEBUG] handleSaveAllAngles: Total saved:', savedCount);
      setAlert({visible: true, title: 'Saved', message: `${savedCount} images saved to your photo library.`, type: 'success'});
    } catch (e: any) {
      console.error('[DEBUG] handleSaveAllAngles error:', e?.message || e);
      setAlert({visible: true, title: 'Error', message: `Failed to save images: ${e?.message || 'Unknown error'}`, type: 'error'});
    }
  };

  const handleShareImage = async () => {
    const imageToShare = normalizeImageUri(currentAngleImage?.imageData) || derivedImageUri;
    if (!imageToShare) return;

    try {
      const angleSuffix = currentAngleImage?.label?.replace(/\s+/g, '_') || '2D';
      const filename = `${innovation.conceptName.replace(/\s+/g, '_')}_${angleSuffix}.png`;
      const fileUri = FileSystem.documentDirectory + filename;
      
      // Handle HTTP URLs by downloading, base64 data URLs by extracting
      if (imageToShare.startsWith('http://') || imageToShare.startsWith('https://')) {
        const downloadResult = await FileSystem.downloadAsync(imageToShare, fileUri);
        if (downloadResult.status !== 200) {
          throw new Error('Failed to download image');
        }
      } else {
        const base64Data = imageToShare.replace(/^data:image\/\w+;base64,/, '');
        await FileSystem.writeAsStringAsync(fileUri, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        setAlert({visible: true, title: 'Error', message: 'Sharing is not available on this device.', type: 'error'});
      }
    } catch (e) {
      console.error('Share image error:', e);
      setAlert({visible: true, title: 'Error', message: 'Failed to share image.', type: 'error'});
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
      onComplete(existingSpec, existingThreeDScene ?? null, existingImageUrl ?? null);
      return;
    }
    setError(null);
    setStatus('generating_specs');
    try {
      const result = await generateTechnicalSpec(innovation);
      setSpec(result);
      setStatus('specs_ready');
      onComplete(result, existingThreeDScene ?? null, existingImageUrl ?? null);
    } catch (err: unknown) {
      console.error('Error generating specs:', err);
      setError(formatError(err));
    }
  }, [innovation, existingSpec, existingImageUrl, existingThreeDScene, onComplete]);

  useEffect(() => {
    fetchSpecs();
  }, []);


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
      setLocalImageBase64(base64);
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
      onComplete(spec, scene, derivedImageUri);
      setAlert({visible: true, title: '3D Scene Generated', message: `Created ${scene.objects.length} objects. Export to view in desktop apps.`, type: 'success'});
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
        setAlert({visible: true, title: 'Saved', message: 'Specifications saved to device.', type: 'success'});
      }
    } catch (e) {
      console.error('Export error:', e);
      setAlert({visible: true, title: 'Error', message: 'Failed to export specifications.', type: 'error'});
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
      setAlert({visible: true, title: 'Error', message: 'Failed to export 3D model.', type: 'error'});
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
          <Ionicons name="pencil" size={28} color={Colors.accent} />
          <View style={styles.headerText}>
            <Text style={styles.title}>Phase 3: The Architect</Text>
            <Text style={styles.description}>Blueprint generated. Visualize your innovation.</Text>
          </View>
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
            (availableAngles.length > 0 || derivedImageUri) ? (
              <View style={styles.generatedImageContainer}>
                {(availableAngles.length > 0 || imageGenerating) && (
                  <View style={styles.angleSelector}>
                    {ALL_ANGLES.map((angleDef) => {
                      const loadedAngle = multiAngleImages.find(img => img.id === angleDef.id);
                      const isLoaded = loadedAngle?.imageData;
                      const isSelected = selectedAngleId === angleDef.id && isLoaded;
                      
                      return (
                        <TouchableOpacity
                          key={angleDef.id}
                          style={[
                            styles.angleSelectorButton,
                            isSelected && styles.angleSelectorButtonActive,
                            !isLoaded && styles.angleSelectorButtonPending
                          ]}
                          onPress={() => {
                            if (isLoaded) {
                              setSelectedAngleId(angleDef.id);
                            }
                          }}
                          disabled={!isLoaded}
                        >
                          {!isLoaded && imageGenerating ? (
                            <ActivityIndicator size={10} color={Colors.gray[500]} />
                          ) : null}
                          <Text style={[
                            styles.angleSelectorText,
                            isSelected && styles.angleSelectorTextActive,
                            !isLoaded && styles.angleSelectorTextPending
                          ]}>
                            {angleDef.label.replace(' View', '')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    {pendingAnglesCount > 0 && (
                      <Text style={styles.pendingCountText}>
                        {availableAngles.length}/3
                      </Text>
                    )}
                  </View>
                )}
                
                {(() => {
                  // DIAGNOSTIC: Log render-time state
                  console.log('[DEBUG] RENDER: displayImageUri:', displayImageUri ? displayImageUri.substring(0, 60) + '...' : 'null');
                  console.log('[DEBUG] RENDER: imageLoadError:', imageLoadError, 'selectedAngleId:', selectedAngleId);
                  
                  // Use displayImageUri directly - expo-image handles large base64 data URIs natively
                  if (!displayImageUri || imageLoadError) {
                    const hasSourceImage = !!displayImageUri;
                    console.log('[DEBUG] RENDER: Showing placeholder. hasSourceImage:', hasSourceImage, 'reason:', !displayImageUri ? 'no displayImageUri' : 'imageLoadError');
                    return (
                      <View 
                        style={[styles.generatedImage, { justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.panel }]}
                      >
                        <Ionicons name="image-outline" size={48} color={Colors.gray[500]} />
                        <Text style={{ color: Colors.gray[400], marginTop: 12, fontSize: 14, textAlign: 'center', paddingHorizontal: 20 }}>
                          {imageLoadError ? 'Image failed to load' : 'Click Expand to view sketches'}
                        </Text>
                      </View>
                    );
                  }
                  console.log('[DEBUG] RENDER v2: Showing RNImage with test URL');
                  
                  // Using React Native's built-in Image with test URL
                  const testImageUrl = 'https://picsum.photos/400/250';
                  
                  return (
                    <View style={{ width: '100%' }}>
                      {/* Debug indicator - bright red text to confirm new code is running */}
                      <Text style={{ color: 'red', fontSize: 12, textAlign: 'center', marginBottom: 4 }}>
                        [v2] Testing RNImage...
                      </Text>
                      <TouchableOpacity 
                        activeOpacity={0.9}
                        onPress={() => {
                          resetZoom();
                          setImageModalVisible(true);
                        }}
                      >
                        <RNImage
                          source={{ uri: testImageUrl }}
                          style={{ width: 350, height: 250, borderRadius: 8, backgroundColor: '#444', alignSelf: 'center' }}
                          resizeMode="contain"
                          onError={(e) => {
                            console.log('[DEBUG] RNImage onError:', e.nativeEvent.error);
                            setImageLoadError(true);
                          }}
                          onLoad={() => {
                            console.log('[DEBUG] RNImage onLoad SUCCESS');
                            setImageLoadError(false);
                          }}
                        />
                      </TouchableOpacity>
                    </View>
                  );
                })()}
                
                {availableAngles.length > 1 && (
                  <View style={styles.angleNavigation}>
                    <TouchableOpacity 
                      style={[styles.angleNavButton, currentAngleIndex === 0 && styles.angleNavButtonDisabled]}
                      onPress={() => {
                        if (currentAngleIndex > 0) {
                          setSelectedAngleId(availableAngles[currentAngleIndex - 1].id);
                        }
                      }}
                      disabled={currentAngleIndex === 0}
                    >
                      <Ionicons name="chevron-back" size={20} color={currentAngleIndex === 0 ? Colors.gray[600] : Colors.accent} />
                    </TouchableOpacity>
                    <Text style={styles.angleIndicator}>
                      {currentAngleIndex + 1} / {availableAngles.length}
                    </Text>
                    <TouchableOpacity 
                      style={[styles.angleNavButton, currentAngleIndex === availableAngles.length - 1 && styles.angleNavButtonDisabled]}
                      onPress={() => {
                        if (currentAngleIndex < availableAngles.length - 1) {
                          setSelectedAngleId(availableAngles[currentAngleIndex + 1].id);
                        }
                      }}
                      disabled={currentAngleIndex === availableAngles.length - 1}
                    >
                      <Ionicons name="chevron-forward" size={20} color={currentAngleIndex === availableAngles.length - 1 ? Colors.gray[600] : Colors.accent} />
                    </TouchableOpacity>
                  </View>
                )}
                
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
                  {availableAngles.length > 1 && (
                    <TouchableOpacity 
                      style={styles.imageActionButton}
                      onPress={handleSaveAllAngles}
                    >
                      <Ionicons name="images-outline" size={18} color={Colors.secondary} />
                      <Text style={[styles.imageActionText, { color: Colors.secondary }]}>Save All</Text>
                    </TouchableOpacity>
                  )}
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
              <View style={styles.scene3dContainer}>
                <View style={styles.scene3dHeader}>
                  <Ionicons name="cube" size={32} color={Colors.accent} />
                  <View style={styles.scene3dHeaderText}>
                    <Text style={styles.scene3dTitle}>3D Scene Generated</Text>
                    <Text style={styles.scene3dSubtitle}>{threeDScene.objects.length} objects ready for export</Text>
                  </View>
                </View>

                <View style={styles.exportSection}>
                  <Text style={styles.exportSectionTitle}>Export Format</Text>
                  <View style={styles.exportButtons}>
                    <TouchableOpacity
                      style={styles.exportButton}
                      onPress={() => handleExport3D('obj')}
                    >
                      <Ionicons name="document-outline" size={16} color={Colors.accent} />
                      <Text style={styles.exportButtonText}>.OBJ</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.exportButton}
                      onPress={() => handleExport3D('stl')}
                    >
                      <Ionicons name="cube-outline" size={16} color={Colors.accent} />
                      <Text style={styles.exportButtonText}>.STL</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.viewerSection}>
                  <Text style={styles.viewerTitle}>View Your 3D Model</Text>
                  <Text style={styles.viewerDesc}>Open the exported file in any of these apps:</Text>
                  <View style={styles.viewerList}>
                    <View style={styles.viewerItem}>
                      <Ionicons name="desktop-outline" size={14} color={Colors.blue[500]} />
                      <Text style={styles.viewerName}>Windows: 3D Viewer (built-in)</Text>
                    </View>
                    <View style={styles.viewerItem}>
                      <Ionicons name="logo-apple" size={14} color={Colors.gray[400]} />
                      <Text style={styles.viewerName}>Mac: Preview or QuickLook</Text>
                    </View>
                    <View style={styles.viewerItem}>
                      <Ionicons name="globe-outline" size={14} color={Colors.green[400]} />
                      <Text style={styles.viewerName}>Web: Autodesk Viewer (free)</Text>
                    </View>
                    <View style={styles.viewerItem}>
                      <Ionicons name="color-palette-outline" size={14} color={Colors.orange[300]} />
                      <Text style={styles.viewerName}>Pro: Blender, Fusion 360</Text>
                    </View>
                  </View>
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

      {/* Continue to Build button */}
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
            <Text style={styles.modalTitle}>
              {currentAngleImage?.label || '2D Concept Sketch'}
              {availableAngles.length > 1 && ` (${currentAngleIndex + 1}/${availableAngles.length})`}
            </Text>
            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => setImageModalVisible(false)}
            >
              <Ionicons name="close" size={24} color={Colors.white} />
            </TouchableOpacity>
          </View>
          
          <View style={styles.modalImageContainer} {...panResponder.panHandlers}>
            <Animated.Image
              source={{ uri: displayImageUri || '' }}
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

          {availableAngles.length > 1 && (
            <View style={styles.modalAngleNav}>
              <TouchableOpacity 
                style={[styles.modalAngleButton, currentAngleIndex === 0 && styles.modalAngleButtonDisabled]}
                onPress={() => {
                  resetZoom();
                  if (currentAngleIndex > 0) {
                    setSelectedAngleId(availableAngles[currentAngleIndex - 1].id);
                  }
                }}
                disabled={currentAngleIndex === 0}
              >
                <Ionicons name="chevron-back" size={28} color={currentAngleIndex === 0 ? Colors.gray[600] : Colors.white} />
              </TouchableOpacity>
              
              <View style={styles.modalAngleDots}>
                {availableAngles.map((angle, index) => (
                  <View 
                    key={angle.id} 
                    style={[styles.modalAngleDot, currentAngleIndex === index && styles.modalAngleDotActive]} 
                  />
                ))}
              </View>
              
              <TouchableOpacity 
                style={[styles.modalAngleButton, currentAngleIndex === availableAngles.length - 1 && styles.modalAngleButtonDisabled]}
                onPress={() => {
                  resetZoom();
                  if (currentAngleIndex < availableAngles.length - 1) {
                    setSelectedAngleId(availableAngles[currentAngleIndex + 1].id);
                  }
                }}
                disabled={currentAngleIndex === availableAngles.length - 1}
              >
                <Ionicons name="chevron-forward" size={28} color={currentAngleIndex === availableAngles.length - 1 ? Colors.gray[600] : Colors.white} />
              </TouchableOpacity>
            </View>
          )}

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
            {availableAngles.length > 1 && (
              <TouchableOpacity style={styles.modalActionButton} onPress={handleSaveAllAngles}>
                <Ionicons name="images-outline" size={20} color={Colors.secondary} />
                <Text style={[styles.modalActionText, { color: Colors.secondary }]}>All</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      <AlertModal
        visible={alert?.visible || false}
        title={alert?.title || ''}
        message={alert?.message || ''}
        type={alert?.type || 'info'}
        onClose={() => setAlert(null)}
      />
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
  angleSelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 8,
    marginBottom: Spacing.sm,
  },
  angleSelectorButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 6,
    backgroundColor: Colors.panel,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  angleSelectorButtonActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  angleSelectorText: {
    fontSize: FontSizes.xs,
    fontFamily: 'monospace',
    color: Colors.gray[400],
  },
  angleSelectorTextActive: {
    color: Colors.black,
    fontWeight: 'bold',
  },
  angleSelectorButtonPending: {
    opacity: 0.5,
    borderStyle: 'dashed',
  },
  angleSelectorTextPending: {
    color: Colors.gray[600],
  },
  pendingCountText: {
    fontSize: FontSizes.xs,
    fontFamily: 'monospace',
    color: Colors.accent,
    marginLeft: Spacing.sm,
  },
  angleNavigation: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  angleNavButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.panel,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  angleNavButtonDisabled: {
    opacity: 0.5,
  },
  angleIndicator: {
    fontSize: FontSizes.sm,
    fontFamily: 'monospace',
    color: Colors.gray[400],
  },
  modalAngleNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalAngleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalAngleButtonDisabled: {
    opacity: 0.3,
  },
  modalAngleDots: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  modalAngleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.gray[600],
  },
  modalAngleDotActive: {
    backgroundColor: Colors.accent,
  },
  scene3dContainer: {
    padding: Spacing.md,
  },
  scene3dHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  scene3dHeaderText: {
    flex: 1,
  },
  scene3dTitle: {
    fontSize: FontSizes.md,
    fontWeight: 'bold',
    color: Colors.accent,
    fontFamily: 'monospace',
  },
  scene3dSubtitle: {
    fontSize: FontSizes.xs,
    color: Colors.gray[400],
    marginTop: 2,
  },
  exportSection: {
    marginBottom: Spacing.lg,
  },
  exportSectionTitle: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
    color: Colors.gray[500],
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  viewerSection: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 8,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  viewerTitle: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.white,
    marginBottom: 4,
  },
  viewerDesc: {
    fontSize: FontSizes.xs,
    color: Colors.gray[400],
    marginBottom: Spacing.sm,
  },
  viewerList: {
    gap: Spacing.xs,
  },
  viewerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  viewerName: {
    fontSize: FontSizes.xs,
    color: Colors.gray[300],
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
  continueButtonDisabled: {
    backgroundColor: Colors.gray[800],
  },
  continueButtonTextDisabled: {
    fontFamily: 'monospace',
    fontSize: FontSizes.md,
    color: Colors.gray[500],
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
