import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Image,
  TouchableOpacity,
  Modal,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppColors, Spacing, FontSizes, Radii, Fonts, makeShadows } from '../constants/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { LinearGradient } from "expo-linear-gradient";
import { BottomTabBar, HorizontalStepper, ScoreRing } from "../components/ui";
import ReversRLogoMark from "../components/ReversRLogoMark";
import AlertModal from "../components/AlertModal";
import WelcomeScreen from "../components/WelcomeScreen";
import WelcomeIntroScreen from "../components/WelcomeIntroScreen";
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
  InventoryValidationResult,
  useGemini,
  AngleImage,
  MockTourFixture,
  fetchMockTourFarmBotFixture,
  generate2DAnglesProgressive,
} from "../hooks/useGemini";
import {
  SavedInnovation,
  saveInnovation,
  createNewInnovation,
} from "../hooks/useStorage";
import { ReviewerApprovalRecord } from "../utils/reviewerApprovalRecords";
import { useCommercialization } from "../hooks/useCommercialization";
import { formatJourneyCreditShortLabel, formatResetCountdown } from "../utils/commercialUsage";

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
const PHASE_STEP_LABELS = ['Scan', 'Inventory', 'Design', 'Build'];
const PHASE_STEP_HINTS = [
  'Capture or describe the machine',
  'Match the scan to a record',
  'Specs, references, and 3D handoff',
  'BOM, assembly, and pricing',
];
const PHASE_ICONS: Record<number, keyof typeof Ionicons.glyphMap> = {
  1: 'search',
  2: 'repeat-sharp',
  3: 'pencil',
  4: 'hammer-outline',
};

const TOUR_STORAGE_KEY = 'reversr-rebuild-guided-tour:v2';
const MOCK_TOUR_FIXTURE_CACHE_KEY = 'reversr-rebuild-mock-tour:farmbot-genesis-v1.8:v1';
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
      { id: 'map', label: 'Read the four-phase map' },
      { id: 'start', label: 'Locate New Reconstruction' },
      { id: 'settings', label: 'Locate the menu' },
    ],
  },
  {
    id: 'settings',
    eyebrow: 'Settings',
    title: 'Review account, support, and AI remediation settings',
    body: 'Settings is where users confirm plan credits, managed AI status, inventory sources, and Support reports. Super admins can review session logs, preview AI remediation actions, run safe fixes, queue engineering handoffs, and send in-app updates.',
    structureId: 'reversr-tour-settings',
    opensSettings: true,
    checks: [
      { id: 'account', label: 'Open account settings', completion: 'auto' },
      { id: 'ai', label: 'Review AI status' },
      { id: 'support', label: 'Find Support issue reporting' },
      { id: 'remediation', label: 'Review Super Admin AI remediation path' },
    ],
  },
  {
    id: 'phase-nav',
    eyebrow: 'Navigation',
    title: 'Use the phase rail as the workflow compass',
    body: 'The phase rail shows progress through Scan, Inventory, Design, and Build. Completed earlier phases can be reopened from the rail with save/reset safeguards.',
    structureId: 'reversr-tour-phase-nav',
    checks: [
      { id: 'current', label: 'Open the phase rail', completion: 'auto' },
      { id: 'complete', label: 'Notice completed phases' },
      { id: 'safeguards', label: 'Open a completed phase prompt' },
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
      { id: 'modes', label: 'Open scan input modes', completion: 'auto' },
      { id: 'notes', label: 'Enter or inspect machine notes', completion: 'auto' },
      { id: 'action', label: 'Complete machine scan', completion: 'auto' },
    ],
  },
  {
    id: 'inventory',
    eyebrow: 'Phase 2',
    title: 'Match the scan to inventory',
    body: 'Inventory opens on candidate matches first. Source details live behind the info control, and each match can expand to show the machine summary.',
    structureId: 'reversr-tour-inventory',
    phase: 2,
    checks: [
      { id: 'candidate', label: 'Select a candidate match', completion: 'auto' },
      { id: 'summary', label: 'Expand a match summary', completion: 'auto' },
      { id: 'source', label: 'Open source details', completion: 'auto' },
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
      { id: 'specs', label: 'Generate or load specs', completion: 'auto' },
      { id: 'visuals', label: 'Load visual reference data', completion: 'auto' },
      { id: 'build', label: 'Locate Continue to Build', completion: 'auto' },
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
      { id: 'bom', label: 'Generate or load BOM', completion: 'auto' },
      { id: 'approval', label: 'Save reviewer approval', completion: 'auto' },
      { id: 'packet', label: 'Prepare handoff packet' },
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
      { id: 'list', label: 'Open saved reconstructions', completion: 'auto' },
      { id: 'resume', label: 'Resume a reconstruction', completion: 'auto' },
      { id: 'boundary', label: 'Confirm saved work stays local' },
    ],
  },
];

const guidedTourCheckKeysForStep = (stepIndex: number) => (
  TOUR_STEPS[stepIndex].checks.map(check => tourCheckKey(stepIndex, check.id))
);

const guidedTourManualCheckKeysForStep = (stepIndex: number) => (
  TOUR_STEPS[stepIndex].checks
    .filter(check => check.completion !== 'auto')
    .map(check => tourCheckKey(stepIndex, check.id))
);

const allGuidedTourCheckKeys = () => new Set(
  TOUR_STEPS.flatMap((_, stepIndex) => guidedTourCheckKeysForStep(stepIndex))
);

const MOCK_TOUR_INPUT = 'Mock tour: FarmBot Genesis v1.8 gantry farming robot with tracks, gantry beam, z-axis, Farmduino, Raspberry Pi, motors, camera, UTM, seeder, watering nozzle, and power supply.';

const MOCK_TOUR_ANALYSIS: AnalysisResult = {
  productName: 'FarmBot Genesis v1.8 gantry farming robot',
  components: [
    { name: 'Track extrusions', description: 'Parallel rail structure for X-axis movement.', isEssential: true },
    { name: 'Gantry main beam', description: 'Cross beam that rides on the tracks.', isEssential: true },
    { name: 'Z-axis extrusion', description: 'Vertical tool axis for planting and watering tools.', isEssential: true },
    { name: 'Farmduino controller', description: 'Main electronics board for motors and peripherals.', isEssential: true },
    { name: 'Universal Tool Mount', description: 'Interchangeable mount for seeder, watering nozzle, and camera.', isEssential: true },
  ],
  neighborhoodResources: ['Public FarmBot inventory fixture', 'Mock reconstruction tour data'],
  attributes: [
    { name: 'Machine class', value: 'Open-source CNC farming robot', type: 'Qualitative' },
    { name: 'Approximate assembly groups', value: '5', type: 'Quantitative' },
  ],
  closedWorldBoundary: 'Mock journey uses local fixture data only. No AI request, inventory API lookup, credit charge, or vendor submission is performed.',
  rawAnalysis: 'Mock scan identifies a FarmBot Genesis v1.8-style gantry robot with track, gantry, z-axis, controller, UTM, camera, seeder, watering, and power assemblies.',
};

const MOCK_TOUR_VALIDATION: InventoryValidationResult = {
  status: 'ok',
  sourceName: 'Mock Tour Inventory',
  sourceUrl: 'local://mock-tour/farmbot-genesis-v1.8',
  authMode: 'none',
  credentialStatus: 'not_required',
  recordCount: 1,
  requiredFields: ['machineId', 'machineName', 'revision', 'parts'],
  sampleMachines: [
    {
      machineId: 'farmbot-genesis-v1.8',
      machineName: 'FarmBot Genesis',
      revision: 'v1.8',
      partCount: 5,
    },
  ],
  matchCandidates: [
    {
      machineId: 'farmbot-genesis-v1.8',
      machineName: 'FarmBot Genesis',
      revision: 'v1.8',
      partCount: 5,
      confidenceScore: 0.96,
      matchPercent: 96,
      evidence: 'Mock scan mentions tracks, gantry beam, z-axis, Farmduino, Raspberry Pi, UTM, camera, seeder, and watering assemblies.',
    },
  ],
};

const MOCK_TOUR_INNOVATION: InnovationResult = {
  patternUsed: 'inventory_match',
  conceptName: 'FarmBot Genesis v1.8 Reconstruction Package',
  conceptDescription: 'A fixture-backed reconstruction package for a FarmBot-style gantry farming robot, including matched machine identity, core assemblies, and build handoff artifacts.',
  marketGap: 'Repair teams need a low-risk way to learn the ReversR workflow before spending AI credits on a real machine.',
  constraint: 'Mock data is for training only and should not be submitted to a fabricator.',
  noveltyScore: 72,
  viabilityScore: 88,
  marketBenefit: 'Shows the complete reconstruction path without requiring paid generation.',
  machineId: 'farmbot-genesis-v1.8',
  machineName: 'FarmBot Genesis',
  inventorySource: 'Mock Tour Inventory',
  confidenceScore: 0.96,
  evidence: MOCK_TOUR_VALIDATION.matchCandidates?.[0]?.evidence,
  assemblySteps: [
    {
      stepNumber: 1,
      title: 'Square the track frame',
      instructions: 'Lay out the track extrusions, verify spacing, and confirm fasteners are aligned before gantry placement.',
      parts: ['Track extrusions', 'Frame fasteners'],
      estimatedTime: '30 min',
      qualityCheck: 'Track spacing is parallel and gantry wheels roll without binding.',
    },
    {
      stepNumber: 2,
      title: 'Install gantry and z-axis',
      instructions: 'Mount gantry columns, main beam, cross-slide, and z-axis extrusion using the matched inventory layout.',
      parts: ['Gantry main beam', 'Gantry columns', 'Z-axis extrusion'],
      estimatedTime: '45 min',
      qualityCheck: 'Gantry moves smoothly across both tracks and z-axis remains plumb.',
    },
    {
      stepNumber: 3,
      title: 'Fit electronics and tool mount',
      instructions: 'Mount controller, Raspberry Pi, UTM, camera, seeder, and watering components for review.',
      parts: ['Farmduino', 'Raspberry Pi', 'Universal Tool Mount', 'Camera'],
      estimatedTime: '50 min',
      qualityCheck: 'All electronics and tool leads are routed without strain.',
    },
  ],
  pricing: {
    partsSubtotal: '$1,250 - $1,650',
    modelingEstimate: '$350 - $600',
    fabricationEstimate: '$900 - $1,400',
    assemblyLaborEstimate: '$500 - $800',
    totalEstimate: '$3,000 - $4,450',
    confidence: 'medium',
  },
  fulfillmentOptions: [
    {
      vendorName: 'Mock CNC Vendor',
      serviceType: 'CNC and extrusion prep',
      url: 'https://example.com/mock-cnc',
      packageRequired: ['BOM', 'Assembly sequence', 'Technical specifications'],
    },
  ],
  sourceLinks: {
    inventory: 'local://mock-tour/farmbot-genesis-v1.8',
  },
  referenceImages: [],
};

const MOCK_TOUR_SPEC: TechnicalSpec = {
  promptLogic: 'Use the matched FarmBot inventory record as the source of truth, then organize reconstruction around track, gantry, z-axis, electronics, and UTM assemblies.',
  componentStructure: 'Frame and tracks -> gantry beam and columns -> z-axis carriage -> Farmduino/Raspberry Pi electronics -> UTM, camera, seeder, and watering tools.',
  implementationNotes: 'This is mock tour data. Treat measurements, pricing, and vendor readiness as training examples, not fabrication-approved output.',
};

const MOCK_TOUR_SCENE: ThreeDSceneDescriptor = {
  objects: [
    { id: 'track-left', type: 'box', position: [-2, 0, 0], rotation: [0, 0, 0], scale: [0.12, 0.12, 4], color: '#7dd3fc', material: 'standard', name: 'Left track' },
    { id: 'track-right', type: 'box', position: [2, 0, 0], rotation: [0, 0, 0], scale: [0.12, 0.12, 4], color: '#7dd3fc', material: 'standard', name: 'Right track' },
    { id: 'gantry-beam', type: 'box', position: [0, 1.4, 0], rotation: [0, 0, 0], scale: [4.2, 0.16, 0.16], color: '#00ff9d', material: 'standard', name: 'Gantry beam' },
    { id: 'z-axis', type: 'box', position: [0, 0.75, 0], rotation: [0, 0, 0], scale: [0.18, 1.35, 0.18], color: '#a855f7', material: 'standard', name: 'Z-axis' },
  ],
};

const MOCK_TOUR_BOM: BillOfMaterials = {
  projectName: 'FarmBot Genesis v1.8 Mock Reconstruction',
  version: 'mock-tour-v1',
  dateGenerated: '2026-06-14',
  totalEstimatedCost: '$1,250 - $1,650',
  manufacturingNotes: 'Mock BOM for guided tour only. Human review is required before vendor contact or fabrication.',
  items: [
    {
      partNumber: 'MOCK-TRACK-001',
      partName: 'Track extrusion set',
      description: 'Matched track rail pair for gantry movement.',
      quantity: 2,
      material: 'Aluminum extrusion',
      estimatedCost: '$220',
      supplier: 'Mock inventory',
      leadTime: 'Fixture',
      notes: 'Tour data only.',
    },
    {
      partNumber: 'MOCK-GANTRY-002',
      partName: 'Gantry beam assembly',
      description: 'Main beam and column assembly.',
      quantity: 1,
      material: 'Aluminum extrusion and fasteners',
      estimatedCost: '$310',
      supplier: 'Mock inventory',
      leadTime: 'Fixture',
      notes: 'Verify dimensions against a real machine before fabrication.',
    },
    {
      partNumber: 'MOCK-ELEC-003',
      partName: 'Controller and compute kit',
      description: 'Farmduino-style controller, Raspberry Pi, wiring, and enclosure.',
      quantity: 1,
      material: 'Electronics',
      estimatedCost: '$420',
      supplier: 'Mock inventory',
      leadTime: 'Fixture',
      notes: 'No real electronics order is prepared.',
    },
  ],
};

const getValidMockTourFixtureImages = (fixture?: MockTourFixture | null): AngleImage[] => (
  fixture?.images?.filter(image => image?.imageData) || []
);

const createStorableMockTourFixture = (fixture: MockTourFixture): MockTourFixture => {
  const images = (fixture.images || []).map(image => {
    const sourceUrl = image.imageSource?.url;
    const isSourceBackedUrl = sourceUrl && /^https?:\/\//i.test(sourceUrl);
    const shouldStoreSourceUrl = typeof image.imageData === 'string'
      && image.imageData.startsWith('data:image/')
      && isSourceBackedUrl
      && image.imageSource?.sourceType !== 'ai_generated_fallback';

    return {
      ...image,
      imageData: shouldStoreSourceUrl ? sourceUrl : image.imageData,
    };
  });
  const firstImage = images.find(image => image.imageData)?.imageData || null;

  return {
    ...fixture,
    images,
    primaryImageUrl: firstImage,
  };
};

const readCachedMockTourFixture = async (): Promise<MockTourFixture | null> => {
  try {
    const raw = await AsyncStorage.getItem(MOCK_TOUR_FIXTURE_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as {
      cachedAt?: string;
      fixture?: MockTourFixture;
    };
    if (
      parsed.fixture?.schemaVersion === 1 &&
      parsed.fixture.fixtureId === 'farmbot-genesis-v1.8' &&
      getValidMockTourFixtureImages(parsed.fixture).length > 0
    ) {
      return parsed.fixture;
    }
  } catch (error) {
    console.warn('Failed to read mock tour fixture cache', error);
  }
  return null;
};

const loadMockTourFixture = async (): Promise<MockTourFixture | null> => {
  const cachedFixture = await readCachedMockTourFixture();
  if (cachedFixture) return cachedFixture;

  try {
    const fixture = await fetchMockTourFarmBotFixture();
    if (getValidMockTourFixtureImages(fixture).length > 0) {
      const storableFixture = createStorableMockTourFixture(fixture);
      try {
        await AsyncStorage.setItem(MOCK_TOUR_FIXTURE_CACHE_KEY, JSON.stringify({
          cachedAt: new Date().toISOString(),
          fixture: storableFixture,
        }));
      } catch (storageError) {
        console.warn('Failed to store mock tour fixture cache', storageError);
      }
    }
    return fixture;
  } catch (error) {
    console.warn('Failed to load mock tour fixture', error);
    return null;
  }
};

const createMockTourContext = (fixture?: MockTourFixture | null): MutationContext => {
  const mockInnovation = createNewInnovation();
  const fixtureInnovation = fixture?.innovation || {};
  const fixtureValidation = fixture?.validation;
  const fixtureImages = getValidMockTourFixtureImages(fixture);
  const primaryFixtureImage = fixture?.primaryImageUrl || fixtureImages[0]?.imageData || null;
  const mergedInnovation: InnovationResult = {
    ...MOCK_TOUR_INNOVATION,
    ...fixtureInnovation,
    machineId: fixtureInnovation.machineId || fixture?.machineId || MOCK_TOUR_INNOVATION.machineId,
    machineName: fixtureInnovation.machineName || fixture?.machineName || MOCK_TOUR_INNOVATION.machineName,
    inventorySource: fixtureInnovation.inventorySource || fixture?.inventorySource || MOCK_TOUR_INNOVATION.inventorySource,
    sourceLinks: fixtureInnovation.sourceLinks || fixture?.sourceLinks || MOCK_TOUR_INNOVATION.sourceLinks,
    referenceImages: fixtureInnovation.referenceImages || fixture?.referenceImages || MOCK_TOUR_INNOVATION.referenceImages,
    evidence: fixtureInnovation.evidence || fixtureValidation?.matchCandidates?.[0]?.evidence || MOCK_TOUR_INNOVATION.evidence,
  };

  return {
    id: mockInnovation.id,
    createdAt: mockInnovation.createdAt,
    phase: 1,
    input: MOCK_TOUR_INPUT,
    capturedImage: null,
    analysis: MOCK_TOUR_ANALYSIS,
    selectedPattern: 'inventory_match',
    innovation: mergedInnovation,
    spec: MOCK_TOUR_SPEC,
    threeDScene: MOCK_TOUR_SCENE,
    imageUrl: primaryFixtureImage,
    bom: MOCK_TOUR_BOM,
    reviewerApprovalRecords: [],
  };
};

export default function HomeScreen() {
  const { colors: Colors, mode: themeMode, setMode: setThemeMode } = useAppTheme();
  const { account, profile } = useCommercialization();
  const safeAreaInsets = useSafeAreaInsets();
  const styles = createStyles(Colors);
  const [started, setStarted] = useState(false);
  const [welcomeIntroLoaded, setWelcomeIntroLoaded] = useState(false);
  const [welcomeIntroVisible, setWelcomeIntroVisible] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [context, setContext] = useState<MutationContext>(createEmptyContext());
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [inventorySampleRefreshKey, setInventorySampleRefreshKey] = useState(0);
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSection>('account');
  const [workflowMenuOpen, setWorkflowMenuOpen] = useState(false);
  const [tourActive, setTourActive] = useState(false);
  const [tourStepIndex, setTourStepIndex] = useState(0);
  const [tourCompletedChecks, setTourCompletedChecks] = useState<Set<string>>(() => new Set());
  const [tourCompletedAt, setTourCompletedAt] = useState<string | null>(null);
  const [tourStateLoaded, setTourStateLoaded] = useState(false);
  const [tourHistoryResumeDetected, setTourHistoryResumeDetected] = useState(false);
  const [mockJourneyActive, setMockJourneyActive] = useState(false);
  const [mockTourFixture, setMockTourFixture] = useState<MockTourFixture | null>(null);
  const [countdownNow, setCountdownNow] = useState(Date.now());
  
  const [imageGenStatus, setImageGenStatus] = useState<ImageGenStatus>('idle');
  const [generatedImageBase64, setGeneratedImageBase64] = useState<string | null>(null);
  const [generatedMultiAngleImages, setGeneratedMultiAngleImages] = useState<AngleImage[]>([]);
  const userIsAuthenticated = Boolean(account?.access);
  const savedDisplayName = profile.name?.trim();
  const userHasSavedName = Boolean(savedDisplayName && savedDisplayName !== 'Repair shop user');
  const userHasProfileIdentity = userIsAuthenticated || userHasSavedName || Boolean(profile.avatarUri);
  const userDisplayName = userHasSavedName ? savedDisplayName : userIsAuthenticated ? 'User' : 'Guest';
  const userChipIcon = userHasProfileIdentity ? 'person-circle-outline' : 'person-outline';
  const userAvatarUri = profile.avatarUri || '';
  const usageIsUnlimited = Boolean(account?.usage.unlimitedCredits || account?.entitlements.unlimitedCredits);
  const isGuestPlan = !account || account.billing.planId === 'free';
  const guestCreditLabel = formatJourneyCreditShortLabel(account?.usage, 4);
  const guestResetLabel = usageIsUnlimited
    ? 'No monthly reset limit'
    : account?.usage.resetAt
      ? formatResetCountdown(account.usage.resetAt, countdownNow)
      : 'Loading reset timer...';
  const guestUpgradeUrl = account?.billing.billingLinks?.upgradeUrl || 'https://reversr.vercel.app/account?upgrade=credits';
  const guestCreditCopy = `${guestCreditLabel}. ${guestResetLabel}.`;
  const guestCreditCopySegments = guestCreditCopy.split(/(\d+)/g);

  const openSettings = useCallback((section: SettingsSection = 'account') => {
    setSettingsInitialSection(section);
    setShowSettings(true);
  }, []);
  const closeSettings = useCallback(() => {
    setShowSettings(false);
    setInventorySampleRefreshKey(prev => prev + 1);
  }, []);
  const nextThemeMode = themeMode === 'dark' ? 'light' : 'dark';
  const handleToggleTheme = useCallback(() => {
    setWorkflowMenuOpen(false);
    setThemeMode(nextThemeMode).catch(error => {
      console.error('Failed to update appearance theme', error);
    });
  }, [nextThemeMode, setThemeMode]);
  const handleWorkflowMenuAction = useCallback((action: () => void) => {
    setWorkflowMenuOpen(false);
    action();
  }, []);
  const handleOpenGuestUpgrade = useCallback(() => {
    const webWindow = typeof globalThis !== 'undefined' ? (globalThis as any).window : undefined;
    if (webWindow?.location?.assign) {
      webWindow.location.assign(guestUpgradeUrl);
      return;
    }

    Linking.openURL(guestUpgradeUrl).catch(error => {
      console.error('Failed to open ReversR upgrade page', error);
    });
  }, [guestUpgradeUrl]);
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
  const canFocusTourStep = mockJourneyActive || !tourStep.phase || context.phase >= tourStep.phase;
  const focusBlockedReason = !mockJourneyActive && tourStep.phase && context.phase < tourStep.phase
    ? `This scene opens after Phase ${context.phase}. Complete the current phase to unlock ${PHASE_LABELS[tourStep.phase - 1]}.`
    : undefined;
  const detectedTourCheckKeys = useMemo(() => {
    const detected = new Set<string>();
    const mark = (stepId: TourStep['id'], checkId: string) => {
      const stepIndex = TOUR_STEPS.findIndex(step => step.id === stepId);
      if (stepIndex >= 0) detected.add(tourCheckKey(stepIndex, checkId));
    };

    if (showSettings && settingsInitialSection === 'account') {
      mark('settings', 'account');
    }
    if (started && !showSettings && !showHistory) {
      mark('phase-nav', 'current');
    }

    if (started && context.phase === 1 && !showSettings && !showHistory) {
      mark('scan', 'modes');
    }
    if (context.input.trim().length > 0 || mockJourneyActive) {
      mark('scan', 'notes');
    }
    if (context.analysis || context.phase > 1) {
      mark('scan', 'action');
    }

    if (context.analysis && context.phase >= 2) {
      mark('inventory', 'summary');
      mark('inventory', 'source');
    }
    if (context.innovation || context.phase >= 3) {
      mark('inventory', 'candidate');
    }

    if (context.spec) {
      mark('design', 'specs');
      mark('design', 'build');
    }
    if (context.imageUrl || context.threeDScene || generatedMultiAngleImages.some(image => image.imageData)) {
      mark('design', 'visuals');
    }

    if (context.bom) {
      mark('build', 'bom');
    }
    if (context.reviewerApprovalRecords.length > 0) {
      mark('build', 'approval');
    }

    if (showHistory) {
      mark('history', 'list');
    }
    if (tourHistoryResumeDetected) {
      mark('history', 'resume');
    }

    return detected;
  }, [
    context.analysis,
    context.bom,
    context.imageUrl,
    context.input,
    context.innovation,
    context.phase,
    context.reviewerApprovalRecords.length,
    context.spec,
    context.threeDScene,
    generatedMultiAngleImages,
    mockJourneyActive,
    settingsInitialSection,
    showHistory,
    showSettings,
    started,
    tourHistoryResumeDetected,
  ]);

  useEffect(() => {
    setWelcomeIntroVisible(true);
    setWelcomeIntroLoaded(true);
  }, []);

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
    const timer = setInterval(() => setCountdownNow(Date.now()), 60000);
    return () => clearInterval(timer);
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

  useEffect(() => {
    if (!tourStateLoaded || detectedTourCheckKeys.size === 0) return;

    setTourCompletedChecks(current => {
      let changed = false;
      const next = new Set(current);
      detectedTourCheckKeys.forEach(key => {
        if (!next.has(key)) {
          next.add(key);
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [detectedTourCheckKeys, tourStateLoaded]);

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
      const stepKeys = guidedTourManualCheckKeysForStep(stepIndex);
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
    setTourHistoryResumeDetected(false);
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

  const startMockJourney = useCallback(async () => {
    const fixture = await loadMockTourFixture();
    const fixtureImages = getValidMockTourFixtureImages(fixture);
    setMockTourFixture(fixture);
    setContext(createMockTourContext(fixture));
    setMockJourneyActive(true);
    setStarted(true);
    setShowSettings(false);
    setShowHistory(false);
    setPhaseActionModal(null);
    setImageGenStatus('idle');
    setGeneratedImageBase64(fixture?.primaryImageUrl || fixtureImages[0]?.imageData || null);
    setGeneratedMultiAngleImages(fixtureImages);
    imageGenInnovationId.current = null;
    setTourActive(true);
    setTourStepIndex(3);
    setTourCompletedAt(null);
    setTourHistoryResumeDetected(false);
  }, []);

  const stopMockJourney = useCallback(() => {
    setMockJourneyActive(false);
    setMockTourFixture(null);
    setContext(createEmptyContext());
    setStarted(false);
    setShowSettings(false);
    setShowHistory(false);
    setPhaseActionModal(null);
    setImageGenStatus('idle');
    setGeneratedImageBase64(null);
    setGeneratedMultiAngleImages([]);
    imageGenInnovationId.current = null;
    setTourStepIndex(0);
    setTourHistoryResumeDetected(false);
  }, []);

  const applyTourStepFocus = useCallback((stepIndex: number) => {
    const step = TOUR_STEPS[stepIndex];
    setPhaseActionModal(null);

    if (step.id === 'welcome') {
      setShowSettings(false);
      setShowHistory(false);
      setStarted(false);
      return;
    }

    if (step.opensSettings) {
      setShowHistory(false);
      openSettings('account');
      return;
    }

    if (step.opensHistory) {
      setShowSettings(false);
      setHistoryRefreshKey(prev => prev + 1);
      setShowHistory(true);
      setStarted(true);
      return;
    }

    setShowSettings(false);
    setShowHistory(false);
    setStarted(true);

    if (mockJourneyActive && step.phase) {
      setContext(prev => ({ ...prev, phase: step.phase || prev.phase }));
      return;
    }

    if (step.phase && context.phase < step.phase) {
      return;
    }

    if (step.phase && step.phase < context.phase) {
      setPhaseActionModal(step.phase);
    }
  }, [context.phase, mockJourneyActive, openSettings]);

  useEffect(() => {
    if (!tourActive || !tourStateLoaded) return;
    applyTourStepFocus(tourStepIndex);
  }, [applyTourStepFocus, tourActive, tourStateLoaded, tourStepIndex]);

  const moveToTourStep = useCallback((nextStepIndex: number) => {
    setTourStepIndex(nextStepIndex);
  }, []);

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
    setMockJourneyActive(false);
    setMockTourFixture(null);
    setTourHistoryResumeDetected(false);
    setContext(createEmptyContext());
    setImageGenStatus('idle');
    setGeneratedImageBase64(null);
    setGeneratedMultiAngleImages([]);
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
    setMockJourneyActive(false);
    setMockTourFixture(null);
    setTourHistoryResumeDetected(false);
    setContext(createEmptyContext());
    setShowHistory(false);
    setStarted(true);
    setImageGenStatus('idle');
    setGeneratedImageBase64(null);
    setGeneratedMultiAngleImages([]);
    imageGenInnovationId.current = null;
  };

  const handleResume = (saved: SavedInnovation) => {
    setMockJourneyActive(false);
    setMockTourFixture(null);
    setTourHistoryResumeDetected(true);
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

  const goHome = useCallback(() => {
    setShowSettings(false);
    setShowHistory(false);
    setStarted(false);
  }, []);

  const enterHome = useCallback(() => {
    setWelcomeIntroVisible(false);
  }, []);

  const tabBarInset = safeAreaInsets.bottom + 84;

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
      placement={tourStep.phase ? 'top-right' : 'bottom-left'}
      mockJourneyActive={mockJourneyActive}
      onStartMockJourney={startMockJourney}
      onStopMockJourney={stopMockJourney}
      onToggleCheck={toggleTourCheck}
      onToggleStepDone={toggleTourStepDone}
      onBack={goToPreviousTourStep}
      onNext={goToNextTourStep}
      onExit={closeTour}
    />
  );
  const contentBottomPadding = tabBarInset + Spacing.md;

  if (!welcomeIntroLoaded) {
    return <View style={styles.container} />;
  }

  if (welcomeIntroVisible) {
    return (
      <View style={styles.container}>
        <WelcomeIntroScreen onEnter={enterHome} />
      </View>
    );
  }

  if (!started) {
    return (
      <View style={styles.container}>
        <WelcomeScreen
          onStart={handleStartNew}
          onHistory={openHistory}
          onSettings={() => openSettings('account')}
          onProfile={() => openSettings('profile')}
          onTour={startTour}
          onSupport={() => openSettings('support')}
          onResume={handleResume}
          userDisplayName={userDisplayName}
          userIsAuthenticated={userIsAuthenticated}
          userAvatarUri={userAvatarUri}
          bottomBarInset={tabBarInset}
        />
        <SettingsModal
          visible={showSettings}
          onClose={closeSettings}
          initialSection={settingsInitialSection}
        />
        {renderTourGuide()}
        <BottomTabBar
          active="home"
          onHome={goHome}
          onProjects={openHistory}
          onNew={handleStartNew}
          onTour={startTour}
          onMore={() => openSettings('account')}
          bottomInset={safeAreaInsets.bottom}
        />
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
          bottomBarInset={tabBarInset}
        />
        {renderTourGuide()}
        <BottomTabBar
          active="projects"
          onHome={goHome}
          onProjects={openHistory}
          onNew={handleStartNew}
          onTour={startTour}
          onMore={() => openSettings('account')}
          bottomInset={safeAreaInsets.bottom}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <ReversRLogoMark colors={Colors} size={40} />
          <View style={styles.brandTextWrap}>
            <Text style={styles.title}>
              REVERS<Text style={styles.titleAccent}>R</Text>
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>Machine Reconstruction</Text>
          </View>
        </View>
        <View style={styles.headerControls}>
          <TouchableOpacity
            style={[styles.userChip, userHasProfileIdentity && styles.userChipActive]}
            onPress={() => openSettings('profile')}
            accessibilityRole="button"
            accessibilityLabel={userHasProfileIdentity ? `Open profile for ${userDisplayName}` : 'Open guest profile'}
            testID="reversr-user-chip"
          >
            {userAvatarUri ? (
              <Image source={{ uri: userAvatarUri }} style={styles.userChipAvatar} resizeMode="cover" />
            ) : (
              <Ionicons
                name={userChipIcon}
                size={18}
                color={userHasProfileIdentity ? Colors.accent : Colors.gray[400]}
              />
            )}
            <Text
              style={[styles.userChipText, userHasProfileIdentity && styles.userChipTextActive]}
              numberOfLines={1}
            >
              {userDisplayName}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuButton}
            onPress={handleToggleTheme}
            accessibilityRole="button"
            accessibilityLabel={nextThemeMode === 'dark' ? 'Use dark mode' : 'Use light mode'}
            testID="reversr-appearance-toggle"
          >
            <Ionicons
              name={nextThemeMode === 'dark' ? 'moon-outline' : 'sunny-outline'}
              size={20}
              color={Colors.text}
            />
          </TouchableOpacity>

          <View style={styles.menuHost}>
            <TouchableOpacity
              style={[styles.menuButton, workflowMenuOpen && styles.menuButtonActive]}
              onPress={() => setWorkflowMenuOpen(current => !current)}
              accessibilityRole="button"
              accessibilityLabel={workflowMenuOpen ? 'Close reconstruction menu' : 'Open reconstruction menu'}
              accessibilityState={{ expanded: workflowMenuOpen }}
              testID="reversr-actions-menu-button"
            >
              <Ionicons name={workflowMenuOpen ? 'close-outline' : 'menu-outline'} size={22} color={Colors.text} />
            </TouchableOpacity>

            {workflowMenuOpen && (
              <View style={styles.menuPanel} testID="reversr-actions-menu">
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleWorkflowMenuAction(() => openSettings('account'))}
                  accessibilityRole="button"
                  accessibilityLabel="Open settings"
                  testID="reversr-tour-settings-button"
                >
                  <Ionicons name="settings-outline" size={18} color={Colors.primary} />
                  <Text style={styles.menuItemText}>Settings</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleWorkflowMenuAction(openHistory)}
                  accessibilityRole="button"
                  accessibilityLabel="Open reconstruction history"
                  testID="reversr-tour-history-button"
                >
                  <Ionicons name="time-outline" size={18} color={Colors.primary} />
                  <Text style={styles.menuItemText}>History</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleWorkflowMenuAction(startTour)}
                  accessibilityRole="button"
                  accessibilityLabel="Start guided tour"
                  testID="reversr-tour-start-header"
                >
                  <Ionicons name="compass-outline" size={18} color={Colors.primary} />
                  <Text style={styles.menuItemText}>Tour</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>

      {isGuestPlan && (
        <View style={styles.guestCreditBar} testID="reversr-guest-credit-bar">
          <Text style={styles.guestCreditText} numberOfLines={2}>
            {guestCreditCopySegments.map((segment, index) => (
              /^\d+$/.test(segment)
                ? <Text key={`${segment}-${index}`} style={styles.guestCreditNumber}>{segment}</Text>
                : segment
            ))}
          </Text>
          <TouchableOpacity
            style={styles.guestCreditLink}
            onPress={handleOpenGuestUpgrade}
            accessibilityRole="link"
            accessibilityLabel="Upgrade ReversR plan"
          >
            <Text style={styles.guestCreditLinkText}>Upgrade Now</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.progressBar}>
        <LinearGradient
          colors={Colors.mode === 'dark'
            ? ['rgba(0,255,157,0.14)', 'rgba(16,18,24,0.25)']
            : ['rgba(0,122,85,0.10)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.currentStepCard}
        >
          <ScoreRing
            progress={context.phase / 4}
            value={`${Math.min(context.phase, 4)}/4`}
            caption="Step"
            size={72}
            strokeWidth={8}
          />
          <View style={styles.currentStepInfo}>
            <Text style={styles.currentStepOverline}>Current step</Text>
            <Text style={styles.currentStepName}>{PHASE_STEP_LABELS[Math.min(context.phase, 4) - 1]}</Text>
          </View>
        </LinearGradient>
        <HorizontalStepper
          steps={PHASE_STEP_LABELS}
          subLabels={PHASE_STEP_HINTS}
          currentStep={context.phase}
          onStepPress={(step) => setPhaseActionModal(step)}
          testID="reversr-tour-phase-nav"
        />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={[
          { paddingBottom: contentBottomPadding },
          tourActive && styles.contentWithTour,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {context.phase === 1 && (
          <PhaseOne
            onComplete={handlePhaseOneComplete}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            initialInput={context.input}
            initialImage={context.capturedImage}
            mockAnalysis={mockJourneyActive ? MOCK_TOUR_ANALYSIS : null}
            mockInput={mockJourneyActive ? MOCK_TOUR_INPUT : undefined}
            inventoryRefreshKey={inventorySampleRefreshKey}
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
            mockMode={mockJourneyActive}
            mockValidation={mockJourneyActive ? (mockTourFixture?.validation || MOCK_TOUR_VALIDATION) : null}
            mockInnovation={mockJourneyActive ? (context.innovation || MOCK_TOUR_INNOVATION) : null}
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
            mockMode={mockJourneyActive}
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
            <LinearGradient
              colors={Colors.mode === 'dark'
                ? ['rgba(59,130,246,0.14)', 'rgba(0,255,157,0.06)', 'rgba(16,18,24,0)']
                : ['rgba(37,99,235,0.10)', 'rgba(0,122,85,0.06)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.phaseActionGlow}
            />
            <View style={styles.phaseActionHeader}>
              <View style={styles.phaseActionTitleGroup}>
                <Text style={styles.phaseActionEyebrow}>Workflow navigation</Text>
                <Text style={styles.phaseActionTitle}>
                  {phaseActionModal ? PHASE_STEP_LABELS[phaseActionModal - 1] : ''} phase
                </Text>
              </View>
              <TouchableOpacity
                style={styles.phaseActionCloseButton}
                onPress={() => setPhaseActionModal(null)}
                accessibilityRole="button"
                accessibilityLabel="Close phase navigation"
                hitSlop={8}
              >
                <Ionicons name="close" size={18} color={Colors.mutedText} />
              </TouchableOpacity>
            </View>
            <Text style={styles.phaseActionSubtitle}>
              Choose the next step for this reconstruction.
            </Text>
            
            <TouchableOpacity 
              style={[styles.phaseActionButton, styles.phaseActionButtonPrimary]}
              onPress={() => phaseActionModal && handleGoToPhase(phaseActionModal)}
              accessibilityRole="button"
              accessibilityLabel={`Go back to ${phaseActionModal ? PHASE_LABELS[phaseActionModal - 1] : 'selected'} phase`}
            >
              <View style={[styles.phaseActionIconWrap, styles.phaseActionIconWrapPrimary]}>
                <Ionicons name="arrow-back" size={18} color={Colors.accent} />
              </View>
              <View style={styles.phaseActionButtonCopy}>
                <Text style={styles.phaseActionButtonText}>Go back to this phase</Text>
                <Text style={styles.phaseActionButtonHint}>Return to the selected workflow step.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.dimText} />
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
                <View style={[styles.phaseActionIconWrap, styles.phaseActionIconWrapSecondary]}>
                  <Ionicons name="shuffle" size={18} color={Colors.secondary} />
                </View>
                <View style={styles.phaseActionButtonCopy}>
                  <Text style={styles.phaseActionButtonText}>Review inventory match</Text>
                  <Text style={styles.phaseActionButtonHint}>Compare the matched inventory path.</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.dimText} />
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
              <View style={[styles.phaseActionIconWrap, styles.phaseActionIconWrapDanger]}>
                <Ionicons name="refresh" size={18} color={Colors.danger} />
              </View>
              <View style={styles.phaseActionButtonCopy}>
                <Text style={[styles.phaseActionButtonText, styles.phaseActionButtonTextDanger]}>Reset and start over</Text>
                <Text style={[styles.phaseActionButtonHint, styles.phaseActionButtonHintDanger]}>Clear this reconstruction and begin again.</Text>
              </View>
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
        onClose={closeSettings}
        initialSection={settingsInitialSection}
      />
      {renderTourGuide()}
      <BottomTabBar
        active={null}
        onHome={goHome}
        onProjects={openHistory}
        onNew={handleStartNew}
        onTour={startTour}
        onMore={() => openSettings('account')}
        bottomInset={safeAreaInsets.bottom}
      />
    </View>
  );
}

const createStyles = (Colors: AppColors) => {
  const isDark = Colors.mode === 'dark';
  const shadows = makeShadows(Colors);
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.hairline,
    backgroundColor: Colors.panel,
    position: 'relative',
    zIndex: 60,
    elevation: 12,
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flexShrink: 1,
    minWidth: 0,
  },
  brandTextWrap: {
    flexShrink: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: Fonts.brand,
    fontSize: 18,
    color: isDark ? '#d8dde2' : '#343a40',
    letterSpacing: 1.5,
    lineHeight: 22,
  },
  titleAccent: {
    color: isDark ? '#28c6cf' : '#008c95',
  },
  subtitle: {
    fontSize: FontSizes.xs,
    color: Colors.dimText,
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  headerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    flexShrink: 0,
    zIndex: 40,
  },
  menuHost: {
    position: 'relative',
    alignItems: 'flex-end',
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  menuButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySoft,
  },
  menuPanel: {
    position: 'absolute',
    top: 48,
    right: 0,
    width: 184,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.md,
    backgroundColor: Colors.panel,
    paddingVertical: Spacing.xs,
    ...shadows.elevated,
    zIndex: 30,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 44,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  menuItemText: {
    color: Colors.text,
    fontSize: FontSizes.sm,
    fontWeight: '700',
  },
  userChip: {
    minHeight: 40,
    maxWidth: 118,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.pill,
    paddingVertical: 7,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.surface,
  },
  userChipActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentSoft,
  },
  userChipAvatar: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: Colors.elevated,
  },
  userChipText: {
    color: Colors.mutedText,
    fontSize: FontSizes.xs,
    fontWeight: '800',
    maxWidth: 86,
  },
  userChipTextActive: {
    color: Colors.accent,
  },
  guestCreditBar: {
    alignSelf: 'center',
    maxWidth: 360,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: 0,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  guestCreditText: {
    color: Colors.mutedText,
    fontSize: FontSizes.xs,
    fontWeight: '700',
    textAlign: 'center',
    flexShrink: 1,
  },
  guestCreditNumber: {
    color: Colors.accent,
    fontFamily: 'monospace',
    fontWeight: '900',
  },
  guestCreditLink: {
    minHeight: 22,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  guestCreditLinkText: {
    color: Colors.primary,
    fontSize: FontSizes.xs,
    fontWeight: '800',
  },
  progressBar: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  currentStepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.mode === 'dark' ? 'rgba(0,255,157,0.30)' : Colors.border,
  },
  currentStepInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  currentStepOverline: {
    fontFamily: Fonts.bold,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: Colors.accent,
  },
  currentStepName: {
    fontFamily: Fonts.display,
    fontSize: FontSizes.xl,
    color: Colors.text,
  },
  currentStepHint: {
    fontSize: FontSizes.sm,
    color: Colors.mutedText,
    lineHeight: 18,
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
    backgroundColor: Colors.scrim,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  phaseActionModal: {
    backgroundColor: Colors.panel,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: Colors.mode === 'dark' ? 'rgba(148,163,184,0.22)' : Colors.border,
    overflow: 'hidden',
    ...shadows.floating,
  },
  phaseActionGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  phaseActionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  phaseActionTitleGroup: {
    flex: 1,
    minWidth: 0,
  },
  phaseActionEyebrow: {
    fontFamily: Fonts.bold,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: Colors.accent,
    marginBottom: 4,
  },
  phaseActionTitle: {
    fontFamily: Fonts.display,
    fontSize: FontSizes.xxl,
    color: Colors.text,
  },
  phaseActionCloseButton: {
    width: 34,
    height: 34,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  phaseActionSubtitle: {
    fontSize: FontSizes.md,
    color: Colors.mutedText,
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },
  phaseActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 68,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    marginBottom: Spacing.sm,
  },
  phaseActionButtonPrimary: {
    borderColor: Colors.mode === 'dark' ? 'rgba(0,255,157,0.32)' : 'rgba(0,122,85,0.24)',
    backgroundColor: Colors.accentSoft,
  },
  phaseActionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.elevated,
  },
  phaseActionIconWrapPrimary: {
    borderColor: Colors.mode === 'dark' ? 'rgba(0,255,157,0.35)' : 'rgba(0,122,85,0.28)',
    backgroundColor: Colors.accentSoft,
  },
  phaseActionIconWrapSecondary: {
    borderColor: Colors.mode === 'dark' ? 'rgba(168,85,247,0.34)' : 'rgba(124,58,237,0.25)',
    backgroundColor: Colors.mode === 'dark' ? 'rgba(168,85,247,0.14)' : 'rgba(124,58,237,0.10)',
  },
  phaseActionIconWrapDanger: {
    borderColor: Colors.mode === 'dark' ? 'rgba(239,68,68,0.36)' : 'rgba(220,38,38,0.24)',
    backgroundColor: Colors.dangerSoft,
  },
  phaseActionButtonCopy: {
    flex: 1,
    minWidth: 0,
  },
  phaseActionButtonText: {
    fontSize: FontSizes.md,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 2,
  },
  phaseActionButtonHint: {
    fontSize: FontSizes.sm,
    color: Colors.mutedText,
    lineHeight: 16,
  },
  phaseActionButtonTextDanger: {
    color: Colors.danger,
  },
  phaseActionButtonHintDanger: {
    color: Colors.mode === 'dark' ? 'rgba(252,165,165,0.82)' : Colors.red[600],
  },
  phaseActionButtonDanger: {
    backgroundColor: Colors.dangerSoft,
    borderColor: Colors.mode === 'dark' ? 'rgba(239,68,68,0.42)' : 'rgba(220,38,38,0.30)',
  },
  phaseActionCancelButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.hairline,
    backgroundColor: Colors.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(15,23,42,0.03)',
    marginTop: Spacing.sm,
  },
  phaseActionCancelText: {
    fontSize: FontSizes.sm,
    fontWeight: '800',
    color: Colors.mutedText,
    textAlign: 'center',
  },
  });
};
