import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Image,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Spacing, FontSizes } from "../constants/theme";
import WelcomeScreen from "../components/WelcomeScreen";
import PhaseOne from "../components/PhaseOne";
import PhaseTwo from "../components/PhaseTwo";
import PhaseThree from "../components/PhaseThree";
import PhaseFour from "../components/PhaseFour";
import HistoryScreen from "../components/HistoryScreen";
import ImageGenerationNotification, { ImageGenStatus } from "../components/ImageGenerationNotification";
import {
  AnalysisResult,
  InnovationResult,
  TechnicalSpec,
  ThreeDSceneDescriptor,
  SITPattern,
  BillOfMaterials,
  useGemini,
  AngleImage,
  generate2DAnglesProgressive,
} from "../hooks/useGemini";
import {
  SavedInnovation,
  saveInnovation,
  createNewInnovation,
} from "../hooks/useStorage";

interface MutationContext {
  id: string;
  createdAt: string;
  phase: number;
  input: string;
  analysis: AnalysisResult | null;
  selectedPattern: SITPattern | null;
  innovation: InnovationResult | null;
  spec: TechnicalSpec | null;
  threeDScene: ThreeDSceneDescriptor | null;
  imageUrl: string | null;
  bom: BillOfMaterials | null;
}

const createEmptyContext = (): MutationContext => {
  const newInnovation = createNewInnovation();
  return {
    id: newInnovation.id,
    createdAt: newInnovation.createdAt,
    phase: 1,
    input: "",
    analysis: null,
    selectedPattern: null,
    innovation: null,
    spec: null,
    threeDScene: null,
    imageUrl: null,
    bom: null,
  };
};

const PHASE_LABELS = ['SCAN', 'REVERSE', 'ARCHITECT', 'BUILD'];
const PHASE_ICONS: Record<number, keyof typeof Ionicons.glyphMap> = {
  1: 'layers-outline',
  2: 'flash-outline',
  3: 'code-slash-outline',
  4: 'construct-outline',
};

export default function HomeScreen() {
  const [started, setStarted] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [context, setContext] = useState<MutationContext>(createEmptyContext());
  const [isLoading, setIsLoading] = useState(false);
  
  const [imageGenStatus, setImageGenStatus] = useState<ImageGenStatus>('idle');
  const [generatedImageBase64, setGeneratedImageBase64] = useState<string | null>(null);
  const [generatedMultiAngleImages, setGeneratedMultiAngleImages] = useState<AngleImage[]>([]);
  const imageGenInnovationId = useRef<string | null>(null);
  
  const { generate2DVisualization } = useGemini();

  const autoSave = useCallback(async (ctx: MutationContext) => {
    if (ctx.phase > 1 || ctx.input) {
      const toSave: SavedInnovation = {
        id: ctx.id,
        createdAt: ctx.createdAt,
        updatedAt: new Date().toISOString(),
        phase: ctx.phase,
        input: ctx.input,
        analysis: ctx.analysis,
        selectedPattern: ctx.selectedPattern,
        innovation: ctx.innovation,
        spec: ctx.spec,
        threeDScene: ctx.threeDScene,
        imageUrl: ctx.imageUrl,
        bom: ctx.bom,
      };
      await saveInnovation(toSave);
    }
  }, []);

  const startBackgroundImageGeneration = useCallback(async (innovation: InnovationResult, innovationId: string) => {
    const generationToken = `${innovationId}-${Date.now()}`;
    imageGenInnovationId.current = generationToken;
    setImageGenStatus('generating');
    setGeneratedImageBase64(null);
    setGeneratedMultiAngleImages([]);
    
    let completedCount = 0;
    const totalAngles = 3;
    
    try {
      await generate2DAnglesProgressive(
        innovation,
        ['front', 'side', 'iso'],
        (completedAngle: AngleImage) => {
          if (imageGenInnovationId.current !== generationToken) {
            return;
          }
          
          completedCount++;
          
          setGeneratedMultiAngleImages(prev => {
            const existing = prev.filter(img => img.id !== completedAngle.id);
            return [...existing, completedAngle].sort((a, b) => {
              const order = ['front', 'side', 'iso'];
              return order.indexOf(a.id) - order.indexOf(b.id);
            });
          });
          
          setGeneratedImageBase64(prev => prev || completedAngle.imageData);
          
          if (completedCount === 1) {
            setContext(prev => {
              if (prev.id === innovationId) {
                const updated = { ...prev, imageUrl: completedAngle.imageData };
                autoSave(updated);
                return updated;
              }
              return prev;
            });
          }
          
          if (completedCount >= totalAngles) {
            setImageGenStatus('complete');
          }
        }
      );
      
      if (imageGenInnovationId.current === generationToken && completedCount === 0) {
        setImageGenStatus('error');
      }
    } catch (error) {
      console.error('Background image generation error:', error);
      if (imageGenInnovationId.current === generationToken) {
        setImageGenStatus('error');
      }
    }
  }, [autoSave]);

  const handleImageNotificationPress = useCallback(() => {
    if (imageGenStatus === 'complete' && context.phase !== 3) {
      setContext(prev => ({ ...prev, phase: 3 }));
    }
    if (imageGenStatus === 'complete' || imageGenStatus === 'error') {
      setImageGenStatus('idle');
    }
  }, [imageGenStatus, context.phase]);

  const handleImageNotificationDismiss = useCallback(() => {
    setImageGenStatus('idle');
  }, []);

  const handlePhaseOneComplete = async (input: string, analysis: AnalysisResult) => {
    const newContext = {
      ...context,
      input,
      analysis,
      phase: 2,
    };
    setContext(newContext);
    await autoSave(newContext);
  };

  const handlePhaseTwoComplete = async (innovation: InnovationResult) => {
    const newContext = {
      ...context,
      innovation,
      selectedPattern: innovation.patternUsed,
      phase: 3,
    };
    setContext(newContext);
    await autoSave(newContext);
    
    startBackgroundImageGeneration(innovation, context.id);
  };

  const handlePhaseThreeComplete = async (
    spec: TechnicalSpec,
    scene: ThreeDSceneDescriptor | null,
    imageUrl: string | null
  ) => {
    const newContext = {
      ...context,
      spec,
      threeDScene: scene,
      imageUrl,
    };
    setContext(newContext);
    await autoSave(newContext);
  };

  const handleContinueToBuild = async () => {
    const newContext = {
      ...context,
      phase: 4,
    };
    setContext(newContext);
    await autoSave(newContext);
  };

  const handleBOMGenerated = async (bom: BillOfMaterials) => {
    const newContext = {
      ...context,
      bom,
    };
    setContext(newContext);
    await autoSave(newContext);
  };

  const handleBack = async () => {
    if (context.phase > 1) {
      const newPhase = context.phase - 1;
      let clearedContext = { ...context, phase: newPhase };
      
      if (newPhase === 1) {
        clearedContext = {
          ...clearedContext,
          analysis: null,
          selectedPattern: null,
          innovation: null,
          spec: null,
          threeDScene: null,
          imageUrl: null,
          bom: null,
        };
        setImageGenStatus('idle');
        setGeneratedImageBase64(null);
        imageGenInnovationId.current = null;
      } else if (newPhase === 2) {
        clearedContext = {
          ...clearedContext,
          innovation: null,
          spec: null,
          threeDScene: null,
          imageUrl: null,
          bom: null,
        };
        setImageGenStatus('idle');
        setGeneratedImageBase64(null);
        imageGenInnovationId.current = null;
      }
      // Phase 3 (from Build): Keep all data (spec, 2D, 3D, BOM) for persistence
      
      setContext(clearedContext);
      await autoSave(clearedContext);
    }
  };

  const handleReset = () => {
    setContext(createEmptyContext());
    setImageGenStatus('idle');
    setGeneratedImageBase64(null);
    imageGenInnovationId.current = null;
  };

  const handleTryAnotherPattern = async () => {
    const newContext = {
      ...context,
      phase: 2,
      innovation: null,
      spec: null,
      threeDScene: null,
      imageUrl: null,
      bom: null,
    };
    setContext(newContext);
    await autoSave(newContext);
    setImageGenStatus('idle');
    setGeneratedImageBase64(null);
    imageGenInnovationId.current = null;
  };

  const handleStartNew = () => {
    setContext(createEmptyContext());
    setShowHistory(false);
    setStarted(true);
    setImageGenStatus('idle');
    setGeneratedImageBase64(null);
    imageGenInnovationId.current = null;
  };

  const handleResume = (saved: SavedInnovation) => {
    setContext({
      id: saved.id,
      createdAt: saved.createdAt,
      phase: saved.phase,
      input: saved.input,
      analysis: saved.analysis,
      selectedPattern: saved.selectedPattern,
      innovation: saved.innovation,
      spec: saved.spec,
      threeDScene: saved.threeDScene,
      imageUrl: saved.imageUrl,
      bom: saved.bom,
    });
    setShowHistory(false);
    setStarted(true);
  };

  const openHistory = useCallback(() => {
    setHistoryRefreshKey(prev => prev + 1);
    setShowHistory(true);
    setStarted(true);
  }, []);

  if (!started) {
    return (
      <WelcomeScreen
        onStart={handleStartNew}
        onHistory={openHistory}
      />
    );
  }

  if (showHistory) {
    return (
      <HistoryScreen
        onBack={() => setShowHistory(false)}
        onResume={handleResume}
        refreshKey={historyRefreshKey}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Image
            source={require("../assets/logo-transparent.png")}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <View>
            <Text style={styles.title}>
              REVERS<Text style={styles.titleAccent}>R</Text>
            </Text>
            <Text style={styles.subtitle}>SYSTEMATIC INVENTIVE THINKING</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.historyButton}
          onPress={openHistory}
        >
          <Ionicons name="time-outline" size={24} color={Colors.gray[400]} />
        </TouchableOpacity>
      </View>

      <View style={styles.progressBar}>
        {[1, 2, 3, 4].map((step, index) => (
          <React.Fragment key={step}>
            <View style={styles.stepContainer}>
              <View
                style={[
                  styles.stepCircle,
                  context.phase >= step && styles.stepCircleActive,
                  context.phase > step && styles.stepCircleComplete,
                ]}
              >
                {context.phase > step ? (
                  <Ionicons name="checkmark" size={16} color={Colors.black} />
                ) : (
                  <Text
                    style={[
                      styles.stepNumber,
                      context.phase >= step && styles.stepNumberActive,
                    ]}
                  >
                    {step}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  context.phase >= step && styles.stepLabelActive,
                ]}
              >
                {PHASE_LABELS[step - 1]}
              </Text>
            </View>
            {index < 3 && (
              <View
                style={[
                  styles.stepConnector,
                  context.phase > step && styles.stepConnectorActive,
                ]}
              />
            )}
          </React.Fragment>
        ))}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {context.phase === 1 && (
          <PhaseOne
            onComplete={handlePhaseOneComplete}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
          />
        )}
        {context.phase === 2 && context.analysis && (
          <PhaseTwo
            analysis={context.analysis}
            onComplete={handlePhaseTwoComplete}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            onBack={handleBack}
            onReset={handleReset}
          />
        )}
        {context.phase === 3 && context.innovation && (
          <PhaseThree
            innovation={context.innovation}
            existingSpec={context.spec}
            existingImageUrl={context.imageUrl}
            existingThreeDScene={context.threeDScene}
            imageGenerating={imageGenStatus === 'generating'}
            multiAngleImages={generatedMultiAngleImages}
            onComplete={handlePhaseThreeComplete}
            onContinueToBuild={handleContinueToBuild}
            onBack={handleBack}
            onReset={handleReset}
            onTryAnotherPattern={handleTryAnotherPattern}
          />
        )}
        {context.phase === 4 && context.innovation && context.spec && (
          <PhaseFour
            innovation={context.innovation}
            spec={context.spec}
            bom={context.bom}
            imageUrl={context.imageUrl}
            threeDScene={context.threeDScene}
            onBOMGenerated={handleBOMGenerated}
            onBack={handleBack}
            onReset={handleReset}
            onTryAnotherPattern={handleTryAnotherPattern}
          />
        )}
      </ScrollView>
      
      <ImageGenerationNotification
        status={imageGenStatus}
        onPress={handleImageNotificationPress}
        onDismiss={handleImageNotificationDismiss}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.panel,
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  headerLogo: {
    width: 56,
    height: 56,
  },
  title: {
    fontFamily: "monospace",
    fontSize: FontSizes.xl,
    fontWeight: "bold",
    color: Colors.white,
    letterSpacing: 2,
  },
  titleAccent: {
    color: Colors.accent,
  },
  subtitle: {
    fontSize: FontSizes.xs,
    color: Colors.dim,
    letterSpacing: 3,
  },
  historyButton: {
    padding: Spacing.sm,
  },
  progressBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.lg,
  },
  stepContainer: {
    alignItems: "center",
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.black,
    borderWidth: 2,
    borderColor: Colors.gray[800],
    justifyContent: "center",
    alignItems: "center",
  },
  stepCircleActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  stepCircleComplete: {
    backgroundColor: Colors.green[500],
    borderColor: Colors.green[500],
  },
  stepNumber: {
    fontFamily: "monospace",
    fontSize: FontSizes.xs,
    fontWeight: "bold",
    color: Colors.gray[600],
  },
  stepNumberActive: {
    color: Colors.black,
  },
  stepLabel: {
    marginTop: Spacing.xs,
    fontSize: 9,
    fontWeight: "bold",
    color: Colors.gray[700],
    letterSpacing: 1,
  },
  stepLabelActive: {
    color: Colors.white,
  },
  stepConnector: {
    width: 24,
    height: 2,
    backgroundColor: Colors.gray[800],
    marginHorizontal: 4,
    marginBottom: 20,
  },
  stepConnectorActive: {
    backgroundColor: Colors.green[500],
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
});
