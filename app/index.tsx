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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppColors, Spacing, FontSizes } from '../constants/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import AlertModal from "../components/AlertModal";
import WelcomeScreen from "../components/WelcomeScreen";
import PhaseOne from "../components/PhaseOne";
import PhaseTwo from "../components/PhaseTwo";
import PhaseThree from "../components/PhaseThree";
import PhaseFour from "../components/PhaseFour";
import HistoryScreen from "../components/HistoryScreen";
import SettingsModal, { SettingsSection } from "../components/SettingsModal";
import ImageGenerationNotification, { ImageGenStatus } from "../components/ImageGenerationNotification";
import TourGuide, { TourStep, tourCheckKey } from "../components/TourGuide";
import {
  AnalysisResult,
  InnovationResult,
  TechnicalSpec,
  ThreeDSceneDescriptor,
  MachineWorkflowKey,
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
import { ReviewerApprovalRecord } from "../utils/reviewerApprovalRecords";
import { useCommercialization } from "../hooks/useCommercialization";

interface MutationContext {
  id: string;
  createdAt: string;
  phase: number;
  input: string;
  capturedImage: string | null;
  analysis: AnalysisResult | null;
  selectedPattern: MachineWorkflowKey | null;
  innovation: InnovationResult | null;
  spec: TechnicalSpec | null;
  threeDScene: ThreeDSceneDescriptor | null;
  imageUrl: string | null;
  bom: BillOfMaterials | null;
  reviewerApprovalRecords: ReviewerApprovalRecord[];
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
    reviewerApprovalRecords: [],
  };
};

const PHASE_LABELS = ['SCAN', 'INVENTORY', 'DESIGN', 'BUILD'];
const PHASE_ICONS: Record<number, keyof typeof Ionicons.glyphMap> = {
  1: 'search',
  2: 'repeat-sharp',
  3: 'pencil',
  4: 'hammer-outline',
};

const TOUR_STORAGE_KEY = 'reversr-rebuild-guided-tour:v1';

type TourSavedState = {
  active: boolean;
  stepIndex: number;
  completedChecks: string[];
  completedAt: string | null;
};

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    eyebrow: 'Orientation',
    title: 'Start from the reconstruction map',
    body: 'The welcome screen shows the full path: scan a machine, match inventory, design the reconstruction, then prepare build artifacts.',
    structureId: 'reversr-tour-welcome',
    checks: [
      { id: 'map', label: 'Read four-phase map' },
      { id: 'start', label: 'Find new reconstruction' },
      { id: 'settings', label: 'Find settings' },
    ],
  },
  {
    id: 'settings',
    eyebrow: 'Settings',
    title: 'Review account, AI, and inventory settings',
    body: 'Settings is where users confirm plan credits, managed AI status, inventory source configuration, policy links, and backend credential references.',
    structureId: 'reversr-tour-settings',
    opensSettings: true,
    checks: [
      { id: 'account', label: 'Check account panel' },
      { id: 'ai', label: 'Check AI runtime' },
      { id: 'inventory', label: 'Check inventory source' },
    ],
  },
  {
    id: 'phase-nav',
    eyebrow: 'Navigation',
    title: 'Use the phase rail as the workflow compass',
    body: 'The phase rail shows progress through Scan, Inventory, Design, and Build. Completed earlier phases can be reopened from the rail with save/reset safeguards.',
    structureId: 'reversr-tour-phase-nav',
    checks: [
      { id: 'current', label: 'Identify current phase' },
      { id: 'complete', label: 'Find completed phases' },
      { id: 'safeguards', label: 'Note save/reset prompts' },
    ],
  },
  {
    id: 'scan',
    eyebrow: 'Phase 1',
    title: 'Scan or describe the machine',
    body: 'Scan supports typed descriptions, camera capture, and a sample machine mode so users can learn the flow before using a real asset.',
    structureId: 'reversr-tour-scan',
    phase: 1,
    checks: [
      { id: 'modes', label: 'Review input modes' },
      { id: 'notes', label: 'Find machine notes' },
      { id: 'action', label: 'Find scan action' },
    ],
  },
  {
    id: 'inventory',
    eyebrow: 'Phase 2',
    title: 'Match the scan to inventory',
    body: 'Inventory shows the scan summary, the configured source, candidate matches, and the settings link used to change the source.',
    structureId: 'reversr-tour-inventory',
    phase: 2,
    checks: [
      { id: 'summary', label: 'Review scan summary' },
      { id: 'source', label: 'Check source' },
      { id: 'candidate', label: 'Select a match' },
    ],
  },
  {
    id: 'design',
    eyebrow: 'Phase 3',
    title: 'Generate specs and visual handoff',
    body: 'Design turns the selected inventory match into technical specifications, 2D references, and optional 3D scene data for downstream fabrication work.',
    structureId: 'reversr-tour-design',
    phase: 3,
    checks: [
      { id: 'specs', label: 'Find specs' },
      { id: 'visuals', label: 'Find visual tabs' },
      { id: 'build', label: 'Find continue to build' },
    ],
  },
  {
    id: 'build',
    eyebrow: 'Phase 4',
    title: 'Prepare BOM and manufacturer handoff',
    body: 'Build packages the reconstruction into BOM, material treatment guidance, reviewer approval records, quote routing, and manufacturer-ready handoff artifacts.',
    structureId: 'reversr-tour-build',
    phase: 4,
    checks: [
      { id: 'bom', label: 'Find BOM' },
      { id: 'approval', label: 'Find reviewer gate' },
      { id: 'packet', label: 'Find handoff packet' },
    ],
  },
  {
    id: 'history',
    eyebrow: 'Continuity',
    title: 'Resume prior reconstruction work',
    body: 'History keeps saved reconstructions available so users can return to a scan, spec, BOM, or approval record instead of starting over.',
    structureId: 'reversr-tour-history',
    opensHistory: true,
    checks: [
      { id: 'list', label: 'Open history' },
      { id: 'resume', label: 'Find resume action' },
      { id: 'boundary', label: 'Confirm saved work remains local' },
    ],
  },
];

const guidedTourCheckKeysForStep = (stepIndex: number) => (
  TOUR_STEPS[stepIndex].checks.map(check => tourCheckKey(stepIndex, check.id))
);

const allGuidedTourCheckKeys = () => new Set(
  TOUR_STEPS.flatMap((_, stepIndex) => guidedTourCheckKeysForStep(stepIndex))
);

export default function HomeScreen() {
  const { colors: Colors } = useAppTheme();
  const { account, profile } = useCommercialization();
  const styles = createStyles(Colors);
  const [started, setStarted] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [context, setContext] = useState<MutationContext>(createEmptyContext());
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSection>('account');
  const [tourActive, setTourActive] = useState(false);
  const [tourStepIndex, setTourStepIndex] = useState(0);
  const [tourCompletedChecks, setTourCompletedChecks] = useState<Set<string>>(() => new Set());
  const [tourCompletedAt, setTourCompletedAt] = useState<string | null>(null);
  const [tourStateLoaded, setTourStateLoaded] = useState(false);
  
  const [imageGenStatus, setImageGenStatus] = useState<ImageGenStatus>('idle');
  const [generatedImageBase64, setGeneratedImageBase64] = useState<string | null>(null);
  const [generatedMultiAngleImages, setGeneratedMultiAngleImages] = useState<AngleImage[]>([]);
  const userIsAuthenticated = Boolean(account?.access);
  const savedDisplayName = profile.name?.trim();
  const userDisplayName = userIsAuthenticated
    ? (savedDisplayName && savedDisplayName !== 'Repair shop user' ? savedDisplayName : 'User')
    : 'Guest';
  const userChipIcon = userIsAuthenticated ? 'person-circle-outline' : 'person-outline';

  const openSettings = useCallback((section: SettingsSection = 'account') => {
    setSettingsInitialSection(section);
    setShowSettings(true);
  }, []);
  const imageGenInnovationId = useRef<string | null>(null);
  const [phaseActionModal, setPhaseActionModal] = useState<number | null>(null);
  const [confirmAlert, setConfirmAlert] = useState<{
    visible: boolean;
    title: string;
    message: string;
    buttons: Array<{ text: string; onPress: () => void; style?: 'default' | 'destructive' | 'cancel' }>;
  } | null>(null);
  
  const { generate2DVisualization } = useGemini();
  const tourStep = TOUR_STEPS[tourStepIndex];
  const completedTourCheckCount = TOUR_STEPS.reduce((count, step, stepIndex) => {
    return count + step.checks.filter(check => tourCompletedChecks.has(tourCheckKey(stepIndex, check.id))).length;
  }, 0);
  const totalTourCheckCount = TOUR_STEPS.reduce((count, step) => count + step.checks.length, 0);
  const canFocusTourStep = !tourStep.phase || context.phase >= tourStep.phase;
  const focusBlockedReason = tourStep.phase && context.phase < tourStep.phase
    ? `Complete Phase ${context.phase} first to unlock ${PHASE_LABELS[tourStep.phase - 1]}.`
    : undefined;

  useEffect(() => {
    const loadTourState = async () => {
      try {
        const raw = await AsyncStorage.getItem(TOUR_STORAGE_KEY);
        if (!raw) {
          setTourStateLoaded(true);
          return;
        }

        const parsed = JSON.parse(raw) as Partial<TourSavedState>;
        const validKeys = allGuidedTourCheckKeys();
        const stepIndex = Number.isInteger(parsed.stepIndex)
          ? Math.min(Math.max(parsed.stepIndex ?? 0, 0), TOUR_STEPS.length - 1)
          : 0;

        setTourActive(parsed.active === true);
        setTourStepIndex(stepIndex);
        setTourCompletedChecks(new Set(
          Array.isArray(parsed.completedChecks)
            ? parsed.completedChecks.filter(key => typeof key === 'string' && validKeys.has(key))
            : []
        ));
        setTourCompletedAt(typeof parsed.completedAt === 'string' ? parsed.completedAt : null);
      } catch (error) {
        console.warn('Failed to load guided tour state', error);
      } finally {
        setTourStateLoaded(true);
      }
    };

    loadTourState();
  }, []);

  useEffect(() => {
    if (!tourStateLoaded) return;

    const saveTourState = async () => {
      try {
        await AsyncStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify({
          active: tourActive,
          stepIndex: tourStepIndex,
          completedChecks: Array.from(tourCompletedChecks),
          completedAt: tourCompletedAt,
        }));
      } catch (error) {
        console.warn('Failed to save guided tour state', error);
      }
    };

    saveTourState();
  }, [tourActive, tourStepIndex, tourCompletedChecks, tourCompletedAt, tourStateLoaded]);

  const markTourCheck = useCallback((stepIndex: number, checkId: string) => {
    setTourCompletedChecks(current => {
      const next = new Set(current);
      next.add(tourCheckKey(stepIndex, checkId));
      return next;
    });
  }, []);

  const toggleTourCheck = useCallback((stepIndex: number, checkId: string) => {
    setTourCompletedChecks(current => {
      const next = new Set(current);
      const key = tourCheckKey(stepIndex, checkId);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const toggleTourStepDone = useCallback((stepIndex: number) => {
    setTourCompletedChecks(current => {
      const next = new Set(current);
      const stepKeys = guidedTourCheckKeysForStep(stepIndex);
      const isStepComplete = stepKeys.every(key => next.has(key));
      stepKeys.forEach(key => {
        if (isStepComplete) {
          next.delete(key);
        } else {
          next.add(key);
        }
      });
      return next;
    });
  }, []);

  const startTour = useCallback(() => {
    setTourStepIndex(0);
    setTourActive(true);
    setTourCompletedAt(null);
  }, []);

  const closeTour = useCallback(() => {
    setTourActive(false);
  }, []);

  const finishTour = useCallback(() => {
    setTourCompletedAt(new Date().toISOString());
    setTourActive(false);
  }, []);

  const moveToTourStep = useCallback((nextStepIndex: number) => {
    const nextStep = TOUR_STEPS[nextStepIndex];
    if (!nextStep.opensSettings) {
      setShowSettings(false);
    }
    if (!nextStep.opensHistory) {
      setShowHistory(false);
    }
    if (nextStep.id !== 'welcome' && !nextStep.opensSettings && !nextStep.opensHistory) {
      setStarted(true);
    }
    setTourStepIndex(nextStepIndex);
  }, []);

  const focusTourStep = useCallback(() => {
    const step = TOUR_STEPS[tourStepIndex];
    if (step.phase && context.phase < step.phase) return;

    setShowSettings(step.opensSettings === true);
    setShowHistory(step.opensHistory === true);

    if (step.phase && step.phase === context.phase) {
      setStarted(true);
    } else if (step.phase && step.phase < context.phase) {
      setStarted(true);
      setPhaseActionModal(step.phase);
    } else if (step.opensHistory) {
      setHistoryRefreshKey(prev => prev + 1);
      setStarted(true);
    } else if (!step.opensSettings && step.id !== 'welcome') {
      setStarted(true);
    }

    markTourCheck(tourStepIndex, step.checks[0]?.id || 'open');
    if (step.id === 'welcome') {
      markTourCheck(tourStepIndex, 'map');
    }
  }, [context.phase, markTourCheck, tourStepIndex]);

  const goToNextTourStep = useCallback(() => {
    if (tourStepIndex >= TOUR_STEPS.length - 1) {
      finishTour();
      return;
    }
    moveToTourStep(Math.min(TOUR_STEPS.length - 1, tourStepIndex + 1));
  }, [finishTour, moveToTourStep, tourStepIndex]);

  const goToPreviousTourStep = useCallback(() => {
    moveToTourStep(Math.max(0, tourStepIndex - 1));
  }, [moveToTourStep, tourStepIndex]);

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
        reviewerApprovalRecords: ctx.reviewerApprovalRecords,
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

    // Reconstruction clone: defer visual generation until the user explicitly requests it.
    // This keeps inventory matching and BOM generation usable without image-model credentials.
    setImageGenStatus('idle');
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

  const handleReviewerApprovalRecordSaved = async (record: ReviewerApprovalRecord) => {
    const newContext = {
      ...context,
      reviewerApprovalRecords: [record, ...context.reviewerApprovalRecords],
    };
    setContext(newContext);
    await autoSave(newContext);
  };

  const handleGoToDesign = async () => {
    const newContext = {
      ...context,
      phase: 3,
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
          reviewerApprovalRecords: [],
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
          reviewerApprovalRecords: [],
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
        title: 'Save Reconstruction?',
        message: 'Starting a new reconstruction. Save progress first?',
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
      reviewerApprovalRecords: [],
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
        title: 'Save Reconstruction?',
        message: 'Starting a new reconstruction. Save progress first?',
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
        reviewerApprovalRecords: [],
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
        reviewerApprovalRecords: [],
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
        title: 'Save Reconstruction?',
        message: 'Starting a new reconstruction. Save progress first?',
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
                reviewerApprovalRecords: [],
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
                reviewerApprovalRecords: [],
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
      reviewerApprovalRecords: saved.reviewerApprovalRecords || [],
    });
    setShowHistory(false);
    setStarted(true);
  };

  const openHistory = useCallback(() => {
    setHistoryRefreshKey(prev => prev + 1);
    setShowHistory(true);
    setStarted(true);
  }, []);

  const renderTourGuide = () => (
    <TourGuide
      active={tourActive}
      step={tourStep}
      stepIndex={tourStepIndex}
      stepCount={TOUR_STEPS.length}
      completedChecks={tourCompletedChecks}
      completedCount={completedTourCheckCount}
      totalCount={totalTourCheckCount}
      canFocusStep={canFocusTourStep}
      focusBlockedReason={focusBlockedReason}
      onFocusStep={focusTourStep}
      onToggleCheck={toggleTourCheck}
      onToggleStepDone={toggleTourStepDone}
      onBack={goToPreviousTourStep}
      onNext={goToNextTourStep}
      onExit={closeTour}
    />
  );

  if (!started) {
    return (
      <View style={styles.container}>
        <WelcomeScreen
          onStart={handleStartNew}
          onHistory={openHistory}
          onSettings={() => openSettings('account')}
          onTour={startTour}
        />
        <SettingsModal
          visible={showSettings}
          onClose={() => setShowSettings(false)}
          initialSection={settingsInitialSection}
        />
        {renderTourGuide()}
      </View>
    );
  }

  if (showHistory) {
    return (
      <View style={styles.container}>
        <HistoryScreen
          onBack={() => setShowHistory(false)}
          onResume={handleResume}
          refreshKey={historyRefreshKey}
        />
        {renderTourGuide()}
      </View>
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
            <Text style={styles.subtitle}>MACHINE RECONSTRUCTION</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.userChip, styles.userChipFloating, userIsAuthenticated && styles.userChipActive]}
          onPress={() => openSettings('account')}
          accessibilityRole="button"
          accessibilityLabel={userIsAuthenticated ? `Open account settings for ${userDisplayName}` : 'Open account settings as guest'}
          testID="reversr-user-chip"
        >
          <Ionicons
            name={userChipIcon}
            size={18}
            color={userIsAuthenticated ? Colors.accent : Colors.gray[400]}
          />
          <Text
            style={[styles.userChipText, userIsAuthenticated && styles.userChipTextActive]}
            numberOfLines={1}
          >
            {userDisplayName}
          </Text>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.historyButton}
            onPress={() => openSettings('account')}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            testID="reversr-tour-settings-button"
          >
            <Ionicons name="settings-outline" size={24} color={Colors.gray[400]} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.historyButton}
            onPress={openHistory}
            accessibilityRole="button"
            accessibilityLabel="Open reconstruction history"
            testID="reversr-tour-history-button"
          >
            <Ionicons name="time-outline" size={24} color={Colors.gray[400]} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.historyButton}
            onPress={startTour}
            accessibilityRole="button"
            accessibilityLabel="Start guided tour"
            testID="reversr-tour-start-header"
          >
            <Ionicons name="compass-outline" size={24} color={Colors.gray[400]} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.progressBar} testID="reversr-tour-phase-nav">
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

      <ScrollView
        style={styles.content}
        contentContainerStyle={tourActive ? styles.contentWithTour : undefined}
        showsVerticalScrollIndicator={false}
      >
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
            capturedImage={context.capturedImage}
            onComplete={handlePhaseTwoComplete}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            onBack={handleBack}
            onReset={handleReset}
            onOpenSettings={() => openSettings('inventory')}
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
              reconstructionId={context.id}
              reviewerApprovalRecords={context.reviewerApprovalRecords}
              onBOMGenerated={handleBOMGenerated}
              onReviewerApprovalRecordSaved={handleReviewerApprovalRecordSaved}
              onGoToDesign={handleGoToDesign}
              onBack={handleBack}
              onReset={handleReset}
            />
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
              <Text style={{ color: '#9CA3AF', fontSize: 16, textAlign: 'center', marginBottom: 8 }}>
                Specifications not found
              </Text>
              <Text style={{ color: '#6B7280', fontSize: 14, textAlign: 'center', marginBottom: 20 }}>
                Go back to the Design phase to generate the reconstruction specifications.
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
              accessibilityRole="button"
              accessibilityLabel={`Go back to ${phaseActionModal ? PHASE_LABELS[phaseActionModal - 1] : 'selected'} phase`}
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
                accessibilityRole="button"
                accessibilityLabel="Review inventory match"
              >
                <Ionicons name="shuffle" size={20} color={Colors.secondary} />
                <Text style={styles.phaseActionButtonText}>Review inventory match</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity 
              style={[styles.phaseActionButton, styles.phaseActionButtonDanger]}
              onPress={() => {
                setPhaseActionModal(null);
                handleReset();
              }}
              accessibilityRole="button"
              accessibilityLabel="Reset and start over"
            >
              <Ionicons name="refresh" size={20} color={Colors.red[500]} />
              <Text style={[styles.phaseActionButtonText, { color: Colors.red[500] }]}>Reset and start over</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.phaseActionCancelButton}
              onPress={() => setPhaseActionModal(null)}
              accessibilityRole="button"
              accessibilityLabel="Cancel phase action"
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

      <SettingsModal 
        visible={showSettings} 
        onClose={() => setShowSettings(false)} 
        initialSection={settingsInitialSection}
      />
      {renderTourGuide()}
    </View>
  );
}

const createStyles = (Colors: AppColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark,
  },
  header: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.panel,
    position: 'relative',
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flexShrink: 1,
    minWidth: 0,
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
    flexShrink: 1,
  },
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginLeft: 'auto',
    paddingRight: 116,
    flexShrink: 0,
  },
  userChip: {
    minHeight: 36,
    maxWidth: 132,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.surface,
  },
  userChipFloating: {
    position: 'absolute',
    right: Spacing.lg,
    top: Spacing.sm,
    zIndex: 2,
  },
  userChipActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + '10',
  },
  userChipText: {
    color: Colors.gray[400],
    fontSize: FontSizes.xs,
    fontWeight: '800',
    maxWidth: 86,
  },
  userChipTextActive: {
    color: Colors.accent,
  },
  historyButton: {
    padding: Spacing.sm,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
  contentWithTour: {
    paddingBottom: 300,
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
    backgroundColor: Colors.surface,
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
