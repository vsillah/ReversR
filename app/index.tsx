import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Image,
  TouchableOpacity,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Spacing, FontSizes } from "../constants/theme";
import AlertModal from "../components/AlertModal";
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
  capturedImage: string | null;
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
    capturedImage: null,
    analysis: null,
    selectedPattern: null,
    innovation: null,
    spec: null,
    threeDScene: null,
    imageUrl: null,
    bom: null,
  };
};

const PHASE_LABELS = ['SCAN', 'REVERSE', 'DESIGN', 'BUILD'];
const PHASE_ICONS: Record<number, keyof typeof Ionicons.glyphMap> = {
  1: 'search',
  2: 'repeat-sharp',
  3: 'pencil',
  4: 'hammer-outline',
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
  const [phaseActionModal, setPhaseActionModal] = useState<number | null>(null);
  const [confirmAlert, setConfirmAlert] = useState<{
    visible: boolean;
    title: string;
    message: string;
    buttons: Array<{ text: string; onPress: () => void; style?: 'default' | 'destructive' | 'cancel' }>;
  } | null>(null);
  
  const { generate2DVisualization } = useGemini();

  const autoSave = useCallback(async (ctx: MutationContext) => {
    if (ctx.phase > 1 || ctx.input) {
      const toSave: SavedInnovation = {
        id: ctx.id,
        createdAt: ctx.createdAt,
        updatedAt: new Date().toISOString(),
        phase: ctx.phase,
        input: ctx.input,
        capturedImage: ctx.capturedImage,
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
    
    let successCount = 0;
    let hasShownComplete = false;
    
    try {
      await generate2DAnglesProgressive(
        innovation,
        ['front', 'side', 'iso'],
        (completedAngle: AngleImage) => {
          if (imageGenInnovationId.current !== generationToken) {
            return;
          }
          
          successCount++;
          
          console.log('[DEBUG] startBackgroundImageGeneration: Received completedAngle:', {
            id: completedAngle.id,
            label: completedAngle.label,
            hasImageData: !!completedAngle.imageData,
            imageDataLength: completedAngle.imageData?.length || 0,
          });
          setGeneratedMultiAngleImages(prev => {
            const existing = prev.filter(img => img.id !== completedAngle.id);
            const newState = [...existing, completedAngle].sort((a, b) => {
              const order = ['front', 'side', 'iso'];
              return order.indexOf(a.id) - order.indexOf(b.id);
            });
            console.log('[DEBUG] setGeneratedMultiAngleImages: New state length:', newState.length);
            return newState;
          });
          
          setGeneratedImageBase64(prev => prev || completedAngle.imageData);
          
          if (successCount === 1) {
            setContext(prev => {
              if (prev.id === innovationId) {
                const updated = { ...prev, imageUrl: completedAngle.imageData };
                autoSave(updated);
                return updated;
              }
              return prev;
            });
            
            if (!hasShownComplete) {
              hasShownComplete = true;
              setImageGenStatus('complete');
            }
          }
        }
      );
      
      if (imageGenInnovationId.current === generationToken && successCount === 0) {
        setImageGenStatus('error');
      }
    } catch (error) {
      console.error('Background image generation error:', error);
      if (imageGenInnovationId.current === generationToken && successCount === 0) {
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

  const handlePhaseOneComplete = async (input: string, analysis: AnalysisResult, capturedImage?: string | null) => {
    const newContext = {
      ...context,
      input,
      capturedImage: capturedImage || null,
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

  const executeReset = () => {
    setContext(createEmptyContext());
    setImageGenStatus('idle');
    setGeneratedImageBase64(null);
    imageGenInnovationId.current = null;
  };

  const handleReset = () => {
    setPhaseActionModal(null);
    const hasProgress = context.innovation || context.spec || context.bom;
    
    if (hasProgress) {
      setConfirmAlert({
        visible: true,
        title: 'Save Innovation?',
        message: 'Starting a new innovation. Save progress first?',
        buttons: [
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              setConfirmAlert(null);
              executeReset();
            },
          },
          {
            text: 'Save & Reset',
            onPress: async () => {
              setConfirmAlert(null);
              await autoSave(context);
              executeReset();
            },
          },
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => setConfirmAlert(null),
          },
        ],
      });
    } else {
      executeReset();
    }
  };

  const executeTryAnotherPattern = async () => {
    const newInnovation = createNewInnovation();
    const newContext: MutationContext = {
      id: newInnovation.id,
      createdAt: newInnovation.createdAt,
      phase: 2,
      input: context.input,
      capturedImage: context.capturedImage,
      analysis: context.analysis,
      selectedPattern: null,
      innovation: null,
      spec: null,
      threeDScene: null,
      imageUrl: null,
      bom: null,
    };
    setContext(newContext);
    setImageGenStatus('idle');
    setGeneratedImageBase64(null);
    imageGenInnovationId.current = null;
  };

  const handleTryAnotherPattern = async () => {
    setPhaseActionModal(null);
    const hasProgress = context.innovation || context.spec || context.bom;
    
    if (hasProgress) {
      setConfirmAlert({
        visible: true,
        title: 'Save Innovation?',
        message: 'Starting a new innovation. Save progress first?',
        buttons: [
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              setConfirmAlert(null);
              executeTryAnotherPattern();
            },
          },
          {
            text: 'Save & Continue',
            onPress: async () => {
              setConfirmAlert(null);
              await autoSave(context);
              executeTryAnotherPattern();
            },
          },
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => setConfirmAlert(null),
          },
        ],
      });
    } else {
      executeTryAnotherPattern();
    }
  };

  const executePhaseNavigation = async (targetPhase: number) => {
    let clearedContext = { ...context, phase: targetPhase };
    
    if (targetPhase === 1) {
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
    } else if (targetPhase === 2) {
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
    
    setContext(clearedContext);
    await autoSave(clearedContext);
  };

  const handleGoToPhase = async (targetPhase: number) => {
    setPhaseActionModal(null);
    if (targetPhase >= context.phase) return;
    
    const hasProgress = context.innovation || context.spec || context.bom;
    const isDestructive = targetPhase <= 2 && hasProgress;
    
    if (isDestructive) {
      setConfirmAlert({
        visible: true,
        title: 'Save Innovation?',
        message: 'Starting a new innovation. Save progress first?',
        buttons: [
          {
            text: 'Discard',
            style: 'destructive',
            onPress: async () => {
              setConfirmAlert(null);
              const newInnovation = createNewInnovation();
              const freshContext: MutationContext = {
                id: newInnovation.id,
                createdAt: newInnovation.createdAt,
                phase: targetPhase,
                input: context.input,
                capturedImage: context.capturedImage,
                analysis: targetPhase === 1 ? null : context.analysis,
                selectedPattern: null,
                innovation: null,
                spec: null,
                threeDScene: null,
                imageUrl: null,
                bom: null,
              };
              setContext(freshContext);
              setImageGenStatus('idle');
              setGeneratedImageBase64(null);
              imageGenInnovationId.current = null;
            },
          },
          {
            text: 'Save & Continue',
            onPress: async () => {
              setConfirmAlert(null);
              await autoSave(context);
              const newInnovation = createNewInnovation();
              const freshContext: MutationContext = {
                id: newInnovation.id,
                createdAt: newInnovation.createdAt,
                phase: targetPhase,
                input: context.input,
                capturedImage: context.capturedImage,
                analysis: targetPhase === 1 ? null : context.analysis,
                selectedPattern: null,
                innovation: null,
                spec: null,
                threeDScene: null,
                imageUrl: null,
                bom: null,
              };
              setContext(freshContext);
              setImageGenStatus('idle');
              setGeneratedImageBase64(null);
              imageGenInnovationId.current = null;
            },
          },
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => setConfirmAlert(null),
          },
        ],
      });
    } else {
      await executePhaseNavigation(targetPhase);
    }
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
      capturedImage: saved.capturedImage || null,
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
            <TouchableOpacity 
              style={styles.stepContainer}
              onPress={() => {
                if (context.phase > step) {
                  setPhaseActionModal(step);
                }
              }}
              disabled={context.phase <= step}
              activeOpacity={context.phase > step ? 0.7 : 1}
            >
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
            </TouchableOpacity>
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
            initialInput={context.input}
            initialImage={context.capturedImage}
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
        {context.phase === 4 && context.innovation && (
          context.spec ? (
            <PhaseFour
              innovation={context.innovation}
              spec={context.spec}
              bom={context.bom}
              imageUrl={context.imageUrl}
              multiAngleImages={generatedMultiAngleImages}
              threeDScene={context.threeDScene}
              onBOMGenerated={handleBOMGenerated}
              onBack={handleBack}
              onReset={handleReset}
            />
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
              <Text style={{ color: '#9CA3AF', fontSize: 16, textAlign: 'center', marginBottom: 8 }}>
                Specifications not found
              </Text>
              <Text style={{ color: '#6B7280', fontSize: 14, textAlign: 'center', marginBottom: 20 }}>
                Go back to the Design phase to generate the technical specs for your innovation.
              </Text>
              <TouchableOpacity 
                onPress={handleBack}
                style={{ backgroundColor: '#22D3EE', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 }}
              >
                <Text style={{ color: '#000', fontWeight: 'bold' }}>Go to Design</Text>
              </TouchableOpacity>
            </View>
          )
        )}
      </ScrollView>
      
      {/* Notification suppressed - users found it confusing when navigating to Phase 3 */}

      <Modal
        visible={phaseActionModal !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPhaseActionModal(null)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setPhaseActionModal(null)}
        >
          <View style={styles.phaseActionModal}>
            <Text style={styles.phaseActionTitle}>
              {phaseActionModal ? PHASE_LABELS[phaseActionModal - 1] : ''} Phase
            </Text>
            <Text style={styles.phaseActionSubtitle}>
              What would you like to do?
            </Text>
            
            <TouchableOpacity 
              style={styles.phaseActionButton}
              onPress={() => phaseActionModal && handleGoToPhase(phaseActionModal)}
            >
              <Ionicons name="arrow-back" size={20} color={Colors.accent} />
              <Text style={styles.phaseActionButtonText}>Go back to this phase</Text>
            </TouchableOpacity>

            {phaseActionModal && phaseActionModal >= 2 && (
              <TouchableOpacity 
                style={styles.phaseActionButton}
                onPress={() => {
                  setPhaseActionModal(null);
                  handleTryAnotherPattern();
                }}
              >
                <Ionicons name="shuffle" size={20} color={Colors.secondary} />
                <Text style={styles.phaseActionButtonText}>Try another pattern</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity 
              style={[styles.phaseActionButton, styles.phaseActionButtonDanger]}
              onPress={() => {
                setPhaseActionModal(null);
                handleReset();
              }}
            >
              <Ionicons name="refresh" size={20} color={Colors.red[500]} />
              <Text style={[styles.phaseActionButtonText, { color: Colors.red[500] }]}>Reset and start over</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.phaseActionCancelButton}
              onPress={() => setPhaseActionModal(null)}
            >
              <Text style={styles.phaseActionCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <AlertModal
        visible={confirmAlert?.visible || false}
        title={confirmAlert?.title || ''}
        message={confirmAlert?.message || ''}
        type="info"
        buttons={confirmAlert?.buttons || []}
        onClose={() => setConfirmAlert(null)}
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  phaseActionModal: {
    backgroundColor: Colors.panel,
    borderRadius: 16,
    padding: Spacing.xl,
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  phaseActionTitle: {
    fontFamily: 'monospace',
    fontSize: FontSizes.lg,
    fontWeight: 'bold',
    color: Colors.white,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  phaseActionSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[400],
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  phaseActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: 8,
    backgroundColor: Colors.dark,
    marginBottom: Spacing.sm,
  },
  phaseActionButtonText: {
    fontSize: FontSizes.md,
    color: Colors.white,
  },
  phaseActionButtonDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  phaseActionCancelButton: {
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
  },
  phaseActionCancelText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
    textAlign: 'center',
  },
});
