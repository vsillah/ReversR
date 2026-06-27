import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Linking,
  TextInput,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Directory, EncodingType, File as ExpoFile, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, Spacing, FontSizes, Radii, Fonts } from '../constants/theme';
import { useAndroidKeyboardInset } from '../hooks/useAndroidKeyboardInset';
import { useCommercialization } from '../hooks/useCommercialization';
import { useAppTheme } from '../hooks/useAppTheme';
import {
  InnovationResult,
  TechnicalSpec,
  BillOfMaterials,
  ThreeDSceneDescriptor,
  AngleImage,
  generateBOM,
  formatAiRequestError,
  getCommercialUpgradeUrlFromError,
} from '../hooks/useGemini';
import AlertModal from './AlertModal';
import LoadingOverlay, { LoadingStep } from './LoadingOverlay';
import { ensureFocusedFieldVisible } from '../utils/focusVisibility';
import ManufacturingStudio from './ManufacturingStudio';
import { Badge, InfoTooltip } from './ui';
import { buildManufacturingHandoff, ManufacturingHandoff } from '../utils/manufacturingHandoff';
import {
  ReviewerApproval,
  ReviewerApprovalRecord,
  ReviewerApprovalStatus,
  buildReviewerApproval,
  createReviewerApprovalRecord,
  getLatestReviewerApprovalRecord,
  getLatestSavedVendorApproval,
} from '../utils/reviewerApprovalRecords';

const BUILD_STEPS: LoadingStep[] = [
  { id: 'analyzing', label: 'Analyzing specifications' },
  { id: 'calculating', label: 'Calculating parts & materials' },
  { id: 'sourcing', label: 'Finding suppliers & costs' },
];

interface Props {
  innovation: InnovationResult;
  spec: TechnicalSpec;
  bom: BillOfMaterials | null;
  imageUrl: string | null;
  multiAngleImages?: AngleImage[];
  threeDScene: ThreeDSceneDescriptor | null;
  reconstructionId: string;
  reviewerApprovalRecords?: ReviewerApprovalRecord[];
  onBOMGenerated: (bom: BillOfMaterials) => void;
  onReviewerApprovalRecordSaved: (record: ReviewerApprovalRecord) => void | Promise<void>;
  onGoToDesign: () => void;
  onBack: () => void;
  onReset: () => void;
  bottomBarInset?: number;
}

type BuildReadinessItem = {
  id: string;
  label: string;
  summary: string;
  complete: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  section: BuildSectionKey;
  isUnlocked: boolean;
  unlockReason?: string;
  status: 'complete' | 'current' | 'available' | 'locked';
};

type BuildSectionKey = 'inventory' | 'bom' | 'assembly' | 'manufacturing' | 'exports' | 'approval' | 'handoff';

const BUILD_SECTION_ORDER: BuildSectionKey[] = [
  'inventory',
  'bom',
  'assembly',
  'manufacturing',
  'exports',
  'approval',
  'handoff',
];

const MANUFACTURERS = [
  {
    id: 'xometry',
    name: 'Xometry',
    subtitle: 'CNC, 3D Printing, Sheet Metal',
    icon: 'build-outline' as const,
    url: 'https://www.xometry.com',
  },
  {
    id: 'shapeways',
    name: 'Shapeways',
    subtitle: '3D Printing Marketplace',
    icon: 'print-outline' as const,
    url: 'https://www.shapeways.com',
  },
  {
    id: 'protolabs',
    name: 'Protolabs',
    subtitle: 'Rapid Prototyping',
    icon: 'flash-outline' as const,
    url: 'https://www.protolabs.com',
  },
  {
    id: 'jlcpcb',
    name: 'JLCPCB',
    subtitle: 'PCB & 3D Printing',
    icon: 'hardware-chip-outline' as const,
    url: 'https://www.jlcpcb.com',
  },
];

const REVIEWER_APPROVAL_OPTIONS: Array<{
  status: ReviewerApprovalStatus;
  label: string;
  description: string;
}> = [
  {
    status: 'pending_review',
    label: 'Pending',
    description: 'Packet is not approved for vendor submission.',
  },
  {
    status: 'approved_for_vendor_review',
    label: 'Approve Vendor Review',
    description: 'Qualified reviewer allows a quote/request draft, not fabrication.',
  },
  {
    status: 'changes_requested',
    label: 'Changes Requested',
    description: 'Reviewer needs edits before vendor submission.',
  },
  {
    status: 'blocked',
    label: 'Blocked',
    description: 'Safety, source, CAD, or treatment issue blocks release.',
  },
];

type QuoteVendor = {
  vendorName: string;
  serviceType: string;
  url: string;
  packageRequired: string[];
};

type PhaseFourExportKind = 'bom' | 'completePackage' | 'quotePacket';

type PhaseFourExportFile = {
  fileName: string;
  fileUri: string;
};

const EXPORT_CONFIG: Record<PhaseFourExportKind, {
  suffix: string;
  mimeType: string;
  uti: string;
  dialogTitle: string;
}> = {
  bom: {
    suffix: 'BOM.csv',
    mimeType: 'text/csv',
    uti: 'public.comma-separated-values-text',
    dialogTitle: 'Share ReversR BOM CSV',
  },
  completePackage: {
    suffix: 'complete.json',
    mimeType: 'application/json',
    uti: 'public.json',
    dialogTitle: 'Share ReversR reconstruction package',
  },
  quotePacket: {
    suffix: 'manufacturer_quote_packet.json',
    mimeType: 'application/json',
    uti: 'public.json',
    dialogTitle: 'Share ReversR manufacturer quote packet',
  },
};

const sanitizeExportFilenamePart = (value?: string | null): string => {
  const normalized = (value || 'reversr-reconstruction')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);

  return normalized || 'reversr-reconstruction';
};

const formatExportErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error.trim();
  return 'Unknown export error';
};

const toCsvValue = (value: unknown): string => {
  if (value === null || value === undefined) return '""';
  const text = String(value).replace(/"/g, '""');
  return `"${text}"`;
};

const buildBomCsv = (bom: BillOfMaterials): string => {
  const rows = [
    [
      'Part Number',
      'Part Name',
      'Description',
      'Quantity',
      'Material',
      'Est. Cost',
      'Supplier',
      'Lead Time',
      'Notes',
    ],
    ...bom.items.map(item => [
      item.partNumber,
      item.partName,
      item.description,
      item.quantity,
      item.material,
      item.estimatedCost,
      item.supplier,
      item.leadTime,
      item.notes,
    ]),
    [],
    ['Summary', 'Value'],
    ['Total Estimated Cost', bom.totalEstimatedCost],
    ['Manufacturing Notes', bom.manufacturingNotes],
  ];

  return rows.map(row => row.map(toCsvValue).join(',')).join('\n');
};

type ManufacturerQuotePacket = {
  packetType: 'manufacturer_quote_request';
  packetVersion: string;
  generatedAt: string;
  humanReviewRequired: boolean;
  machine: {
    machineId?: string;
    machineName?: string;
    inventorySource?: string;
    confidenceScore?: number;
    evidence?: string;
  };
  reconstructionPackage: {
    conceptName: string;
    description: string;
    constraint: string;
    rebuildOutcome: string;
  };
  pricing?: InnovationResult['pricing'];
  billOfMaterials: BillOfMaterials;
  assemblySteps: InnovationResult['assemblySteps'];
  technicalSpec: TechnicalSpec;
  visualReferences: {
    has2D: boolean;
    angleLabels: string[];
    has3DScene: boolean;
    hasDatabase3DRender: boolean;
    visualEvidenceSource?: string;
    sourceRender?: ThreeDSceneDescriptor['sourceRender'];
    expectedFileTypes: string[];
  };
  aiCadGate: ManufacturingHandoff['aiCadGate'];
  materialTreatmentGuidance: ManufacturingHandoff['materialTreatmentGuidance'];
  reviewerApproval: ReviewerApproval;
  latestReviewerApprovalRecord?: ReviewerApprovalRecord;
  reviewerApprovalRecords: ReviewerApprovalRecord[];
  manufacturingHandoff: ManufacturingHandoff;
  vendorTargets: QuoteVendor[];
  quoteRouting: {
    selectedVendor?: QuoteVendor;
    recipientEmail?: string;
    adminNotes?: string;
    submissionMode: 'user_reviewed_email_draft';
  };
  quoteRequestMessage: string;
};

export default function PhaseFour({
  innovation,
  spec,
  bom,
  imageUrl,
  multiAngleImages = [],
  threeDScene,
  reconstructionId,
  reviewerApprovalRecords = [],
  onBOMGenerated,
  onReviewerApprovalRecordSaved,
  onGoToDesign,
  onBack,
  onReset,
  bottomBarInset = 0,
}: Props) {
  const { colors: Colors } = useAppTheme();
  const { account } = useCommercialization();
  const { width } = useWindowDimensions();
  const styles = createStyles(Colors);
  const scrollViewRef = useRef<ScrollView>(null);
  const workspaceOffsetRef = useRef(0);
  const keyboardInset = useAndroidKeyboardInset(32);
  const buildFocusVisibilityProps = {
    onFocusCapture: (event: any) => ensureFocusedFieldVisible(scrollViewRef, event),
  } as any;
  const handleBuildFieldFocus = (event: any) => ensureFocusedFieldVisible(scrollViewRef, event);
  const [selectedBuildStep, setSelectedBuildStep] = useState<BuildSectionKey | null>(null);
  const [hoveredBuildStep, setHoveredBuildStep] = useState<BuildSectionKey | null>(null);
  const [localBom, setLocalBom] = useState<BillOfMaterials | null>(bom);
  const has2D = !!imageUrl || multiAngleImages.some(img => !!img.imageData);
  const has3D = !!threeDScene;
  const hasDatabase3DRender = Boolean(threeDScene?.sourceRender || innovation.hasDatabase3DRender);
  const visualEvidenceSource = threeDScene?.visualEvidenceSource || innovation.visualEvidenceSource || (hasDatabase3DRender ? 'database_3d_render' : has3D ? 'ai_generated_scene' : has2D ? 'database_or_ai_2d_reference' : 'pending');
  const [status, setStatus] = useState<'idle' | 'generating' | 'complete'>(
    bom ? 'complete' : 'idle'
  );
  const [error, setError] = useState<string | null>(null);
  const [creditUpgradeUrl, setCreditUpgradeUrl] = useState<string | null>(null);
  const [alert, setAlert] = useState<{visible: boolean, title: string, message: string, type: 'info' | 'error' | 'success'} | null>(null);
  const [showAllBomItems, setShowAllBomItems] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>('analyzing');
  const [selectedVendorName, setSelectedVendorName] = useState('');
  const [quoteRecipientEmail, setQuoteRecipientEmail] = useState('');
  const [quoteAdminNotes, setQuoteAdminNotes] = useState('');
  const [reviewerApprovalStatus, setReviewerApprovalStatus] = useState<ReviewerApprovalStatus>('pending_review');
  const [reviewerName, setReviewerName] = useState('');
  const [reviewerRole, setReviewerRole] = useState('');
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [savedReviewRecords, setSavedReviewRecords] = useState<ReviewerApprovalRecord[]>(reviewerApprovalRecords);
  const isWideLayout = width >= 1024;
  const keyboardOpen = keyboardInset > 0;
  const angleLabels = useMemo(() => (
    multiAngleImages
      .filter(image => !!image.imageData)
      .map(image => image.label)
  ), [multiAngleImages]);
  const manufacturingHandoff = useMemo(() => buildManufacturingHandoff({
    innovation,
    spec,
    bom: localBom,
    scene: threeDScene,
    has2D,
    angleLabels,
  }), [innovation, spec, localBom, threeDScene, has2D, angleLabels]);
  const reviewerApproval = useMemo<ReviewerApproval>(() => (
    buildReviewerApproval(reviewerApprovalStatus, reviewerName, reviewerRole, reviewerNotes)
  ), [reviewerApprovalStatus, reviewerName, reviewerRole, reviewerNotes]);
  const latestReviewRecord = useMemo(() => (
    getLatestReviewerApprovalRecord(savedReviewRecords)
  ), [savedReviewRecords]);
  const savedVendorApprovalRecord = useMemo(() => (
    getLatestSavedVendorApproval(savedReviewRecords)
  ), [savedReviewRecords]);
  const canExportQuotePacket = account?.entitlements.canExportQuotePacket ?? false;
  const hasBom = !!localBom;
  const hasSavedVendorApproval = !!savedVendorApprovalRecord;
  const canPrepareVendorRequest = hasBom && hasSavedVendorApproval && canExportQuotePacket;
  const vendorRequestCtaLabel = !hasBom
    ? 'Generate BOM First'
    : !hasSavedVendorApproval
      ? 'Saved Approval Required'
      : canExportQuotePacket
        ? 'Prepare Request Email'
        : 'Upgrade for Vendor Requests';
  const vendorRequestBlockedMessage = !hasSavedVendorApproval
    ? 'Vendor request preparation remains locked until an Approved for vendor review record is saved.'
    : canExportQuotePacket
      ? `Vendor request preparation is enabled by saved review ${savedVendorApprovalRecord.recordId}. Fabrication is still not approved.`
      : 'Vendor request preparation requires Pro Shop or Team after an approved review record is saved. Fabrication is still not approved.';

  const requirePaidExport = () => {
    if (canExportQuotePacket) return true;
    setAlert({
      visible: true,
      title: 'Pro Export Required',
      message: 'Complete reconstruction packages, manufacturer quote packets, and vendor request drafts require Pro Shop or Team. BOM CSV remains available on the Free plan.',
      type: 'info',
    });
    return false;
  };

  const writePhaseFourExportFile = (
    kind: PhaseFourExportKind,
    content: string
  ): PhaseFourExportFile => {
    const exportDirectory = new Directory(Paths.document, 'reversr-exports');
    exportDirectory.create({ idempotent: true, intermediates: true });

    const config = EXPORT_CONFIG[kind];
    const baseName = sanitizeExportFilenamePart(innovation.conceptName || innovation.machineName);
    const fileName = `${baseName}_${config.suffix}`;
    const file = new ExpoFile(exportDirectory, fileName);
    file.create({ overwrite: true, intermediates: true });
    file.write(content, { encoding: EncodingType.UTF8 });

    return {
      fileName,
      fileUri: file.uri,
    };
  };

  const shareOrShowSavedFile = async (
    kind: PhaseFourExportKind,
    exportedFile: PhaseFourExportFile,
    fallbackLabel: string
  ) => {
    const config = EXPORT_CONFIG[kind];
    const canShare = await Sharing.isAvailableAsync();

    if (canShare) {
      await Sharing.shareAsync(exportedFile.fileUri, {
        mimeType: config.mimeType,
        UTI: config.uti,
        dialogTitle: config.dialogTitle,
      });
      return;
    }

    setAlert({
      visible: true,
      title: 'Saved',
      message: `${fallbackLabel} saved to app storage as ${exportedFile.fileName}. Native sharing is not available on this device.`,
      type: 'success',
    });
  };

  useEffect(() => {
    setSavedReviewRecords(reviewerApprovalRecords);
  }, [reviewerApprovalRecords]);

  useEffect(() => {
    // Scroll to top on mount
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  // Step progression for loading overlay
  useEffect(() => {
    if (status === 'generating') {
      setLoadingStep(BUILD_STEPS[0].id);
      let stepIndex = 0;
      const interval = setInterval(() => {
        stepIndex++;
        if (stepIndex < BUILD_STEPS.length) {
          setLoadingStep(BUILD_STEPS[stepIndex].id);
        }
      }, 2500);
      return () => clearInterval(interval);
    }
  }, [status]);

  const getVendorTargets = (): QuoteVendor[] => {
    if (innovation.fulfillmentOptions && innovation.fulfillmentOptions.length > 0) {
      return innovation.fulfillmentOptions;
    }

    return MANUFACTURERS.map(manufacturer => ({
      vendorName: manufacturer.name,
      serviceType: manufacturer.subtitle,
      url: manufacturer.url,
      packageRequired: ['BOM CSV', 'assembly sequence', 'technical specs', '2D/3D references when available'],
    }));
  };

  const getSelectedVendor = () => {
    const vendorTargets = getVendorTargets();
    return vendorTargets.find(vendor => vendor.vendorName === selectedVendorName) || vendorTargets[0];
  };

  const getReviewStatusLabel = (statusValue: ReviewerApprovalStatus) => (
    REVIEWER_APPROVAL_OPTIONS.find(option => option.status === statusValue)?.label || statusValue
  );

  const formatReviewDate = (dateString?: string): string => {
    if (!dateString) return 'unsaved';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const handleSaveReviewerApprovalRecord = async () => {
    const trimmedName = reviewerName.trim();
    const trimmedRole = reviewerRole.trim();
    const trimmedNotes = reviewerNotes.trim();

    if (reviewerApprovalStatus === 'approved_for_vendor_review' && (!trimmedName || !trimmedRole)) {
      setAlert({
        visible: true,
        title: 'Reviewer Identity Required',
        message: 'Add reviewer name and role before saving an approval record for vendor review.',
        type: 'info',
      });
      return;
    }

    if ((reviewerApprovalStatus === 'changes_requested' || reviewerApprovalStatus === 'blocked') && !trimmedNotes) {
      setAlert({
        visible: true,
        title: 'Reviewer Notes Required',
        message: 'Add notes explaining the requested changes or blocker before saving this review record.',
        type: 'info',
      });
      return;
    }

    const record = createReviewerApprovalRecord({
      reconstructionId,
      innovation,
      manufacturingHandoff,
      approval: buildReviewerApproval(reviewerApprovalStatus, reviewerName, reviewerRole, reviewerNotes, new Date().toISOString()),
    });

    const nextRecords = [record, ...savedReviewRecords];
    setSavedReviewRecords(nextRecords);
    await onReviewerApprovalRecordSaved(record);
    if (reviewerApprovalStatus === 'approved_for_vendor_review') {
      setSelectedBuildStep('handoff');
      setTimeout(() => scrollToWorkspace(), 80);
    }
    setAlert({
      visible: true,
      title: 'Review Record Saved',
      message: reviewerApprovalStatus === 'approved_for_vendor_review'
        ? 'Saved approval now unlocks vendor request preparation. Fabrication remains blocked.'
        : 'Reviewer decision saved to the reconstruction record.',
      type: 'success',
    });
  };

  const getQuoteRequestMessage = (selectedVendor?: QuoteVendor) => [
    `Please review the attached reconstruction package for ${innovation.machineName || innovation.conceptName}.`,
    `Requested service: ${selectedVendor?.serviceType || '3D modeling, fabrication feasibility, and quote review'}.`,
    `We need a quote for CAD draft qualification, 3D modeling, fabrication feasibility, expected lead time, and any missing source files required before production.`,
    `Use the BOM, assembly sequence, technical spec, pricing envelope, and inventory match evidence as review inputs.`,
    `AI CAD gate: ${manufacturingHandoff.aiCadGate.status}. Recommended lane: ${manufacturingHandoff.aiCadGate.recommendedCadLane}.`,
    `Material/treatment review: confirm material choice, treatment compatibility, finish requirements, tolerance impact after treatment, lead time impact, and inspection needs.`,
    `Reviewer approval: ${reviewerApproval.status}. Vendor submission approved: ${reviewerApproval.approvedForVendorSubmission ? 'yes' : 'no'}.`,
    latestReviewRecord ? `Latest saved review record: ${latestReviewRecord.recordId}; ${latestReviewRecord.status}; saved ${latestReviewRecord.savedAt}.` : 'Latest saved review record: none.',
    quoteAdminNotes.trim() ? `Additional notes from the admin:\n${quoteAdminNotes.trim()}` : '',
    `Do not fabricate, print, submit to production, or order parts until a qualified reviewer confirms machine identity, source dimensions, CAD editability, tolerances, material treatments, safety constraints, and revision compatibility.`,
  ].filter(Boolean).join('\n\n');

  const buildQuotePacket = (bomForPacket: BillOfMaterials): ManufacturerQuotePacket => {
    const vendorTargets = getVendorTargets();
    const selectedVendor = getSelectedVendor();
    return {
      packetType: 'manufacturer_quote_request',
      packetVersion: '0.2-review',
      generatedAt: new Date().toISOString(),
      humanReviewRequired: true,
      machine: {
        machineId: innovation.machineId,
        machineName: innovation.machineName,
        inventorySource: innovation.inventorySource,
        confidenceScore: innovation.confidenceScore,
        evidence: innovation.evidence,
      },
      reconstructionPackage: {
        conceptName: innovation.conceptName,
        description: innovation.conceptDescription,
        constraint: innovation.constraint,
        rebuildOutcome: innovation.marketBenefit,
      },
      pricing: innovation.pricing,
      billOfMaterials: bomForPacket,
      assemblySteps: innovation.assemblySteps || [],
      technicalSpec: spec,
      visualReferences: {
        has2D,
        angleLabels,
        has3DScene: has3D,
        hasDatabase3DRender,
        visualEvidenceSource,
        sourceRender: threeDScene?.sourceRender,
        expectedFileTypes: ['BOM CSV', 'quote packet JSON', 'assembly notes', 'CAD draft source when generated', 'STEP/native CAD after CAD qualification', 'PDF detail drawings', 'material treatment notes', 'STL/3MF CAD draft if generated', 'PNG visual references if generated'],
      },
      aiCadGate: manufacturingHandoff.aiCadGate,
      materialTreatmentGuidance: manufacturingHandoff.materialTreatmentGuidance,
      reviewerApproval,
      latestReviewerApprovalRecord: latestReviewRecord || undefined,
      reviewerApprovalRecords: savedReviewRecords,
      manufacturingHandoff,
      vendorTargets,
      quoteRouting: {
        selectedVendor,
        recipientEmail: quoteRecipientEmail.trim() || undefined,
        adminNotes: quoteAdminNotes.trim() || undefined,
        submissionMode: 'user_reviewed_email_draft',
      },
      quoteRequestMessage: getQuoteRequestMessage(selectedVendor),
    };
  };

  const handleGenerateBOM = async () => {
    setStatus('generating');
    setError(null);
    setCreditUpgradeUrl(null);

    try {
      const bomResult = await generateBOM(innovation);
      setLocalBom(bomResult);
      setShowAllBomItems(false);
      setStatus('complete');
      onBOMGenerated(bomResult);
      setSelectedBuildStep(
        !hasAssembly
          ? 'assembly'
          : !hasManufacturingEvidence
            ? 'manufacturing'
            : 'exports'
      );
      setTimeout(() => scrollToWorkspace(), 80);
    } catch (err: unknown) {
      console.error('Error generating BOM:', err);
      setCreditUpgradeUrl(getCommercialUpgradeUrlFromError(err));
      setError(formatAiRequestError(err));
      setStatus('idle');
    }
  };

  const handleExportBOM = async () => {
    if (!localBom) return;

    try {
      const exportedFile = writePhaseFourExportFile('bom', buildBomCsv(localBom));
      await shareOrShowSavedFile('bom', exportedFile, 'Bill of Materials CSV');
    } catch (e) {
      console.error('BOM Export error:', e);
      setAlert({visible: true, title: 'BOM Export Failed', message: `Could not export Bill of Materials: ${formatExportErrorMessage(e)}`, type: 'error'});
    }
  };

  const handleExportAll = async () => {
    if (!requirePaidExport()) return;

    try {
      const quotePacket = localBom ? buildQuotePacket(localBom) : null;
      const exportData: Record<string, unknown> = {
        innovation,
        specifications: spec,
        billOfMaterials: localBom,
        manufacturingHandoff,
        manufacturerQuotePacket: quotePacket,
        reviewerApproval,
        reviewerApprovalRecords: savedReviewRecords,
        latestReviewerApprovalRecord: latestReviewRecord,
        exportedAt: new Date().toISOString(),
      };

      if (imageUrl) {
        exportData.visualization2D = {
          type: 'base64_png',
          data: imageUrl,
        };
      }

      if (threeDScene) {
        exportData.visualization3D = {
          type: 'scene_descriptor',
          scene: threeDScene,
        };
      }

      const exportedFile = writePhaseFourExportFile('completePackage', JSON.stringify(exportData, null, 2));
      await shareOrShowSavedFile('completePackage', exportedFile, 'Complete reconstruction package');
    } catch (e) {
      console.error('Export error:', e);
      setAlert({visible: true, title: 'Package Export Failed', message: `Could not export complete reconstruction package: ${formatExportErrorMessage(e)}`, type: 'error'});
    }
  };

  const handleExportQuotePacket = async () => {
    if (!requirePaidExport()) return;

    if (!localBom) {
      setAlert({visible: true, title: 'BOM Required', message: 'Generate the Bill of Materials before exporting a manufacturer quote packet.', type: 'info'});
      return;
    }

    try {
      const packet = buildQuotePacket(localBom);
      const exportedFile = writePhaseFourExportFile('quotePacket', JSON.stringify(packet, null, 2));
      await shareOrShowSavedFile('quotePacket', exportedFile, 'Manufacturer quote packet');
    } catch (e) {
      console.error('Quote packet export error:', e);
      setAlert({visible: true, title: 'Quote Packet Export Failed', message: `Could not export manufacturer quote packet: ${formatExportErrorMessage(e)}`, type: 'error'});
    }
  };

  const handlePrepareQuoteEmail = async () => {
    if (!requirePaidExport()) return;

    if (!localBom) {
      setAlert({visible: true, title: 'BOM Required', message: 'Generate the Bill of Materials before preparing a vendor quote request.', type: 'info'});
      return;
    }
    if (!savedVendorApprovalRecord) {
      setAlert({visible: true, title: 'Saved Reviewer Approval Required', message: 'Save an Approved for vendor review record before preparing a vendor request email.', type: 'info'});
      return;
    }

    const selectedVendor = getSelectedVendor();
    const subject = `Quote request: ${innovation.machineName || innovation.conceptName}`;
    const body = [
      getQuoteRequestMessage(selectedVendor),
      '',
      'Package checklist:',
      '- Manufacturer quote packet JSON',
      '- BOM CSV',
      '- Assembly sequence',
      '- Technical specifications',
      '- AI CAD gate and CAD draft readiness notes',
      '- Material treatment guidance',
      '- Reviewer approval record',
      has2D ? '- 2D visual references' : '- 2D visual references: pending',
      hasDatabase3DRender ? '- Source-backed 3D database render/CAD viewer' : has3D ? '- 3D scene visual reference' : '- 3D scene visual reference: pending',
      '',
      'Inventory match:',
      `- Machine: ${innovation.machineName || innovation.conceptName}`,
      innovation.machineId ? `- Machine ID: ${innovation.machineId}` : '',
      innovation.inventorySource ? `- Inventory source: ${innovation.inventorySource}` : '',
      innovation.confidenceScore != null ? `- Match confidence: ${Math.round(innovation.confidenceScore * 100)}%` : '',
      innovation.evidence ? `- Evidence: ${innovation.evidence}` : '',
      '',
      'Pricing envelope:',
      innovation.pricing ? `- Parts: ${innovation.pricing.partsSubtotal}` : '',
      innovation.pricing ? `- 3D modeling: ${innovation.pricing.modelingEstimate}` : '',
      innovation.pricing ? `- Fabrication: ${innovation.pricing.fabricationEstimate}` : '',
      innovation.pricing ? `- Total estimate: ${innovation.pricing.totalEstimate}` : '',
      '',
      'Manufacturing review requirements:',
      `- Nominal envelope: ${manufacturingHandoff.envelope.widthMm} x ${manufacturingHandoff.envelope.depthMm} x ${manufacturingHandoff.envelope.heightMm} mm`,
      `- Datum scheme: ${manufacturingHandoff.datumScheme.map(datum => datum.datum).join(', ')}`,
      `- AI CAD gate: ${manufacturingHandoff.aiCadGate.status}; recommended lane: ${manufacturingHandoff.aiCadGate.recommendedCadLane}`,
      `- Saved reviewer approval: ${savedVendorApprovalRecord.recordId}; ${savedVendorApprovalRecord.status}; saved ${savedVendorApprovalRecord.savedAt}`,
      '- Confirm CAD draft source, STEP/native CAD, PDF detail drawings, tolerance stack, material selection, treatment compatibility, finish requirements, DfM concerns, lead time, and quote assumptions before any fabrication begins.',
    ].filter(Boolean).join('\n');

    const recipient = quoteRecipientEmail.trim();
    const mailtoUrl = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    try {
      const supported = await Linking.canOpenURL(mailtoUrl);
      if (!supported) {
        setAlert({visible: true, title: 'Email App Unavailable', message: 'Export the quote packet and paste the request message into your email or vendor portal.', type: 'info'});
        return;
      }
      await Linking.openURL(mailtoUrl);
    } catch (e) {
      console.error('Quote email error:', e);
      setAlert({visible: true, title: 'Email Draft Failed', message: 'Export the quote packet and paste the request message into your email or vendor portal.', type: 'error'});
    }
  };

  const hasInventorySummary = !!spec && (!!innovation.machineId || !!innovation.inventorySource || !!innovation.machineName);
  const hasAssembly = (innovation.assemblySteps?.length || 0) > 0;
  const hasManufacturingEvidence = has2D || has3D;

  const getUnlockReason = (section: BuildSectionKey): string | undefined => {
    switch (section) {
      case 'inventory':
      case 'bom':
        return undefined;
      case 'assembly':
        return hasBom ? undefined : 'Generate BOM to unlock assembly sequence.';
      case 'manufacturing':
        if (!hasBom) return 'Generate BOM to unlock manufacturing studio.';
        if (!hasAssembly) return 'Confirm assembly sequence to unlock manufacturing studio.';
        return hasManufacturingEvidence ? undefined : 'Return to Design to generate 2D or 3D references.';
      case 'exports':
        if (!hasBom) return 'Generate BOM to unlock export options.';
        if (!hasAssembly) return 'Confirm assembly sequence to unlock export options.';
        return hasManufacturingEvidence ? undefined : 'Return to Design to generate manufacturing references before export review.';
      case 'approval':
        if (!hasBom) return 'Generate BOM to unlock reviewer approval.';
        if (!hasAssembly) return 'Confirm assembly sequence to unlock reviewer approval.';
        return hasManufacturingEvidence ? undefined : 'Return to Design to finish the review package before reviewer approval.';
      case 'handoff':
        if (!hasBom) return 'Generate BOM to unlock manufacturer handoff.';
        if (!hasAssembly) return 'Confirm assembly sequence to unlock manufacturer handoff.';
        if (!hasManufacturingEvidence) return 'Return to Design to finish the review package before manufacturer handoff.';
        return hasSavedVendorApproval ? undefined : 'Save an Approved for vendor review record to unlock manufacturer handoff.';
      default:
        return undefined;
    }
  };

  const buildReadinessItems: BuildReadinessItem[] = BUILD_SECTION_ORDER.map(section => {
    let item: Omit<BuildReadinessItem, 'isUnlocked' | 'unlockReason' | 'status'>;

    switch (section) {
      case 'inventory':
        item = {
          id: 'inventory',
          label: 'Tour inventory',
          summary: innovation.machineId || innovation.inventorySource
            ? `${innovation.machineId || 'Matched machine'}${innovation.inventorySource ? ` | ${innovation.inventorySource}` : ''}`
            : 'Confirm machine revision and source evidence.',
          complete: hasInventorySummary,
          icon: 'document-text-outline',
          section,
        };
        break;
      case 'bom':
        item = {
          id: 'bom',
          label: 'Bill of materials',
          summary: localBom
            ? `${localBom.items.length} line items ready for material and supplier review.`
            : 'Generate parts, materials, costs, and supplier list.',
          complete: hasBom,
          icon: 'list-outline',
          section,
        };
        break;
      case 'assembly':
        item = {
          id: 'assembly',
          label: 'Assembly sequence',
          summary: `${innovation.assemblySteps?.length || 0} assembly step${(innovation.assemblySteps?.length || 0) === 1 ? '' : 's'} available.`,
          complete: hasAssembly,
          icon: 'construct-outline',
          section,
        };
        break;
      case 'manufacturing':
        item = {
          id: 'manufacturing',
          label: 'Manufacturing studio',
          summary: hasManufacturingEvidence
            ? hasDatabase3DRender
              ? 'Source-backed 3D render/CAD evidence feeds CAD readiness and DfM review.'
              : `${has2D ? '2D' : ''}${has2D && has3D ? ' + ' : ''}${has3D ? '3D' : ''} references feed CAD readiness and DfM review.`
            : 'Generate visual references before manufacturing review.',
          complete: hasManufacturingEvidence,
          icon: 'cube-outline',
          section,
        };
        break;
      case 'exports':
        item = {
          id: 'exports',
          label: 'Export options',
          summary: hasBom
            ? 'BOM, complete package, and quote packet exports are available.'
            : 'Generate the BOM before export options unlock.',
          complete: hasBom,
          icon: 'archive-outline',
          section,
        };
        break;
      case 'approval':
        item = {
          id: 'approval',
          label: 'Reviewer approval',
          summary: savedVendorApprovalRecord
            ? `${getReviewStatusLabel(savedVendorApprovalRecord.status)} | ${formatReviewDate(savedVendorApprovalRecord.savedAt)}`
            : 'Save an Approved for vendor review record before vendor request.',
          complete: hasSavedVendorApproval,
          icon: 'shield-checkmark-outline',
          section,
        };
        break;
      case 'handoff':
      default:
        item = {
          id: 'handoff',
          label: 'Manufacturer handoff',
          summary: canPrepareVendorRequest
            ? 'Vendor request draft is ready for packet attachment and review.'
            : vendorRequestBlockedMessage,
          complete: canPrepareVendorRequest,
          icon: 'business-outline',
          section: 'handoff',
        };
        break;
    }

    return {
      ...item,
      isUnlocked: !getUnlockReason(section),
      unlockReason: getUnlockReason(section),
      status: 'available',
    };
  });

  const recommendedBuildStep = buildReadinessItems.find(item => item.isUnlocked && !item.complete)?.section
    ?? buildReadinessItems.find(item => !item.isUnlocked)?.section
    ?? 'handoff';

  const activeBuildStep = selectedBuildStep ?? recommendedBuildStep;
  const activeBuildStepIndex = BUILD_SECTION_ORDER.indexOf(activeBuildStep);
  const nextBuildStep = activeBuildStepIndex < BUILD_SECTION_ORDER.length - 1
    ? BUILD_SECTION_ORDER[activeBuildStepIndex + 1]
    : null;

  const buildStepByKey = Object.fromEntries(
    buildReadinessItems.map(item => [item.section, item])
  ) as Record<BuildSectionKey, BuildReadinessItem>;

  const getBuildStatusLabel = (item: BuildReadinessItem) => (
    item.status === 'current'
      ? 'Current'
      : item.status === 'complete'
        ? 'Complete'
        : item.status === 'locked'
          ? 'Locked'
          : 'Available'
  );

  const activeBuildMeta: BuildReadinessItem = {
    ...buildStepByKey[activeBuildStep],
    status: buildStepByKey[activeBuildStep].section === recommendedBuildStep
      ? 'current'
      : buildStepByKey[activeBuildStep].isUnlocked
        ? buildStepByKey[activeBuildStep].complete
          ? 'complete'
          : 'available'
        : 'locked',
  } as BuildReadinessItem;

  const buildSteps: BuildReadinessItem[] = buildReadinessItems.map(item => ({
    ...item,
    status: item.section === recommendedBuildStep
      ? 'current'
      : item.isUnlocked
        ? item.complete
          ? 'complete'
          : 'available'
        : 'locked',
  }));

  const readinessReadyCount = buildSteps.filter(item => item.complete).length;
  const readinessLockedCount = buildSteps.filter(item => item.status === 'locked').length;
  const readinessRemainingCount = buildSteps.filter(item => !item.complete && item.status !== 'locked').length;
  const readinessPercent = Math.round((readinessReadyCount / buildSteps.length) * 100);
  const isVendorReviewReady = readinessReadyCount === buildSteps.length;
  const nextBuildMeta = nextBuildStep ? buildStepByKey[nextBuildStep] : null;
  const actionBuildStep = nextBuildStep ?? (!activeBuildMeta.complete ? activeBuildStep : null);
  const actionBuildMeta = actionBuildStep ? buildStepByKey[actionBuildStep] : null;
  const actionBuildIsLocked = !!actionBuildMeta && !actionBuildMeta.isUnlocked;

  useEffect(() => {
    setShowAllBomItems(false);
  }, [activeBuildStep]);

  const scrollToWorkspace = (offset = Spacing.lg) => {
    const y = workspaceOffsetRef.current;
    scrollViewRef.current?.scrollTo({
      y: Math.max(0, y - offset),
      animated: true,
    });
  };

  const openBuildStep = (section: BuildSectionKey, options: { scrollToWorkspace?: boolean } = {}) => {
    setSelectedBuildStep(section);
    if (options.scrollToWorkspace) {
      setTimeout(() => scrollToWorkspace(), 80);
    }
  };

  const getLockedAction = (section: BuildSectionKey): { label: string; action: () => void } | null => {
    switch (section) {
      case 'assembly':
        return !hasBom ? { label: 'Open Bill of Materials', action: () => openBuildStep('bom', { scrollToWorkspace: true }) } : null;
      case 'manufacturing':
        if (!hasBom) return { label: 'Open Bill of Materials', action: () => openBuildStep('bom', { scrollToWorkspace: true }) };
        if (!hasAssembly) return { label: 'Open Assembly Sequence', action: () => openBuildStep('assembly', { scrollToWorkspace: true }) };
        return !hasManufacturingEvidence ? { label: 'Return to Design', action: onGoToDesign } : null;
      case 'exports':
        if (!hasBom) return { label: 'Open Bill of Materials', action: () => openBuildStep('bom', { scrollToWorkspace: true }) };
        if (!hasAssembly) return { label: 'Open Assembly Sequence', action: () => openBuildStep('assembly', { scrollToWorkspace: true }) };
        return !hasManufacturingEvidence ? { label: 'Return to Design', action: onGoToDesign } : null;
      case 'approval':
        if (!hasBom) return { label: 'Open Bill of Materials', action: () => openBuildStep('bom', { scrollToWorkspace: true }) };
        if (!hasAssembly) return { label: 'Open Assembly Sequence', action: () => openBuildStep('assembly', { scrollToWorkspace: true }) };
        return !hasManufacturingEvidence ? { label: 'Return to Design', action: onGoToDesign } : null;
      case 'handoff':
        if (!hasBom) return { label: 'Open Bill of Materials', action: () => openBuildStep('bom', { scrollToWorkspace: true }) };
        if (!hasAssembly) return { label: 'Open Assembly Sequence', action: () => openBuildStep('assembly', { scrollToWorkspace: true }) };
        if (!hasManufacturingEvidence) return { label: 'Return to Design', action: onGoToDesign };
        return !hasSavedVendorApproval ? { label: 'Open Reviewer Approval', action: () => openBuildStep('approval', { scrollToWorkspace: true }) } : null;
      default:
        return null;
    }
  };

  const renderReviewerApprovalCard = () => (
    <View style={styles.reviewerApprovalCard}>
      <View style={styles.quotePacketHeader}>
        <Ionicons name="shield-checkmark-outline" size={20} color={Colors.orange[300]} />
        <Text style={styles.quotePacketTitle}>Reviewer Approval</Text>
        <InfoTooltip
          text="Record the review decision before preparing a vendor request. Approval permits vendor quote review only; fabrication and production release remain blocked until qualified CAD, DfM, treatment, and first-article gates pass."
          accessibilityLabel="Show reviewer approval details"
          bubbleAlign="start"
        />
      </View>
      <View style={styles.approvalChoiceGrid}>
        {REVIEWER_APPROVAL_OPTIONS.map(option => {
          const isSelected = reviewerApprovalStatus === option.status;
          return (
            <View
              key={option.status}
              style={[styles.approvalChoiceButton, isSelected && styles.approvalChoiceButtonActive]}
            >
              <TouchableOpacity
                style={styles.approvalChoiceSelect}
                onPress={() => setReviewerApprovalStatus(option.status)}
                accessibilityRole="button"
                accessibilityLabel={`Set reviewer approval status to ${option.label}`}
                accessibilityHint={option.description}
                accessibilityState={{ selected: isSelected }}
              >
                <Text style={[styles.approvalChoiceLabel, isSelected && styles.approvalChoiceLabelActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
      <Text style={styles.quoteFieldLabel}>Reviewer name</Text>
      <TextInput
        style={styles.quoteInput}
        value={reviewerName}
        onChangeText={setReviewerName}
        onFocus={handleBuildFieldFocus}
        accessibilityLabel="Reviewer name"
        placeholder="Reviewer name"
        placeholderTextColor={Colors.gray[600]}
      />
      <Text style={styles.quoteFieldLabel}>Reviewer role</Text>
      <TextInput
        style={styles.quoteInput}
        value={reviewerRole}
        onChangeText={setReviewerRole}
        onFocus={handleBuildFieldFocus}
        accessibilityLabel="Reviewer role"
        placeholder="CAD reviewer, machinist, engineer, or vendor"
        placeholderTextColor={Colors.gray[600]}
      />
      <Text style={styles.quoteFieldLabel}>Reviewer notes</Text>
      <TextInput
        style={[styles.quoteInput, styles.quoteNotesInput]}
        value={reviewerNotes}
        onChangeText={setReviewerNotes}
        onFocus={handleBuildFieldFocus}
        accessibilityLabel="Reviewer approval notes"
        placeholder="Record source-dimension, CAD, material treatment, DfM, or release concerns."
        placeholderTextColor={Colors.gray[600]}
        multiline
      />
      <TouchableOpacity
        style={styles.saveReviewButton}
        onPress={handleSaveReviewerApprovalRecord}
        accessibilityRole="button"
        accessibilityLabel="Save reviewer approval record"
      >
        <Ionicons name="save-outline" size={18} color={Colors.black} />
        <Text style={styles.saveReviewButtonText}>Save Review Record</Text>
      </TouchableOpacity>
      <View style={[styles.approvalStatusBox, !!savedVendorApprovalRecord && styles.approvalStatusBoxApproved]}>
        <Ionicons
          name={savedVendorApprovalRecord ? 'checkmark-circle-outline' : 'alert-circle-outline'}
          size={16}
          color={savedVendorApprovalRecord ? Colors.accent : Colors.orange[300]}
        />
        <Text style={styles.approvalStatusText}>
          {vendorRequestBlockedMessage}
        </Text>
      </View>
      {latestReviewRecord ? (
        <View style={styles.reviewHistoryBox}>
          <Text style={styles.reviewHistoryTitle}>Saved Review Records</Text>
          {savedReviewRecords.slice(0, 3).map(record => (
            <View key={record.recordId} style={styles.reviewHistoryItem}>
              <View style={styles.reviewHistoryItemHeader}>
                <Text style={styles.reviewHistoryStatus}>{getReviewStatusLabel(record.status)}</Text>
                <Text style={styles.reviewHistoryDate}>{formatReviewDate(record.savedAt)}</Text>
              </View>
              <Text style={styles.reviewHistoryMeta} numberOfLines={2}>
                {record.reviewerName || 'Unnamed reviewer'}{record.reviewerRole ? ` | ${record.reviewerRole}` : ''} | {record.recordId}
              </Text>
              {record.notes ? (
                <Text style={styles.reviewHistoryNotes} numberOfLines={2}>{record.notes}</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.reviewHistoryBox}>
          <Text style={styles.reviewHistoryTitle}>Saved Review Records</Text>
          <Text style={styles.reviewHistoryEmpty}>No saved reviewer decision yet.</Text>
        </View>
      )}
    </View>
  );

  const renderBuildSectionContent = (section: BuildSectionKey) => {
    switch (section) {
      case 'inventory':
        return (
          <View style={styles.packageSummaryCard}>
            <View style={styles.packageSummaryHeader}>
              <View style={styles.packageSummaryTitleRow}>
                <Text style={styles.packageSummaryTitle}>{innovation.machineName || innovation.conceptName}</Text>
                <InfoTooltip
                  text={innovation.conceptDescription}
                  accessibilityLabel="Show package description"
                  bubbleAlign="start"
                />
              </View>
              <Text style={styles.packageSummaryMeta}>
                {innovation.machineId ? `${innovation.machineId} | ` : ''}{innovation.inventorySource || 'Inventory source pending'}
              </Text>
            </View>
            <View style={styles.packageSummaryGrid}>
              <View style={styles.packageSummaryTile}>
                <Text style={styles.packageSummaryTileLabel}>BOM</Text>
                <Text style={styles.packageSummaryTileValue}>{localBom ? `${localBom.items.length} items` : 'Pending'}</Text>
              </View>
              <View style={styles.packageSummaryTile}>
                <Text style={styles.packageSummaryTileLabel}>Assembly</Text>
                <Text style={styles.packageSummaryTileValue}>{innovation.assemblySteps?.length || 0} steps</Text>
              </View>
              <View style={styles.packageSummaryTile}>
                <Text style={styles.packageSummaryTileLabel}>Visuals</Text>
                <Text style={styles.packageSummaryTileValue}>{hasDatabase3DRender ? 'Source 3D' : has2D && has3D ? '2D + 3D' : has2D ? '2D only' : has3D ? '3D only' : 'Pending'}</Text>
              </View>
            </View>
          </View>
        );
      case 'bom':
        return (
          <>
            <View style={styles.bomPanel}>
              <View style={styles.panelHeader}>
                <View style={styles.terminalDots}>
                  <View style={[styles.dot, { backgroundColor: '#ef4444' }]} />
                  <View style={[styles.dot, { backgroundColor: '#eab308' }]} />
                  <View style={[styles.dot, { backgroundColor: '#22c55e' }]} />
                </View>
                <Text style={styles.panelTitle}>Bill of Materials (BOM)</Text>
                {localBom && (
                  <View style={styles.bomToggleContainer}>
                    <Text style={styles.bomItemCount}>{localBom.items.length} items</Text>
                  </View>
                )}
              </View>

              {status === 'generating' ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={Colors.orange[300]} />
                  <Text style={styles.loadingText}>Generating Bill of Materials...</Text>
                  <Text style={styles.loadingSubtext}>Calculating parts, costs & suppliers</Text>
                </View>
              ) : localBom ? (
                <View style={styles.bomContent}>
                  <View style={styles.bomHeader}>
                    <Text style={styles.bomProjectName}>{localBom.projectName}</Text>
                    <Text style={styles.bomMeta}>v{localBom.version} | {localBom.dateGenerated}</Text>
                  </View>

                  <View style={styles.bomCollapsed}>
                    <View style={styles.bomCollapsedRow}>
                      <Ionicons name="checkmark-circle" size={18} color={Colors.accent} />
                      <Text style={styles.bomCollapsedText}>{localBom.items.length} parts</Text>
                      <Text style={styles.bomCollapsedDivider}>|</Text>
                      <Text style={styles.bomCollapsedCost}>{localBom.totalEstimatedCost}</Text>
                    </View>
                    <Text style={styles.bomCollapsedHint}>Material and supplier review package is ready.</Text>
                  </View>

                  <View style={styles.bomItemsContainer}>
                    {(showAllBomItems ? localBom.items : localBom.items.slice(0, 5)).map((item, index) => (
                      <View key={index} style={styles.bomItem}>
                        <View style={styles.bomItemHeader}>
                          <Text style={styles.bomPartNumber} numberOfLines={1}>{item.partNumber}</Text>
                          <Text style={styles.bomQuantity}>x{item.quantity}</Text>
                        </View>
                        <Text style={styles.bomPartName} numberOfLines={2}>{item.partName}</Text>
                        <Text style={styles.bomPartDesc} numberOfLines={3}>{item.description}</Text>
                        <View style={styles.bomItemMeta}>
                          <Text style={styles.bomItemMetaText} numberOfLines={1}>{item.material}</Text>
                          <Text style={styles.bomItemCost}>{item.estimatedCost}</Text>
                        </View>
                        <View style={styles.bomItemFooter}>
                          <Text style={styles.bomSupplier} numberOfLines={1}>{item.supplier}</Text>
                          <Text style={styles.bomLeadTime} numberOfLines={1}>{item.leadTime}</Text>
                        </View>
                      </View>
                    ))}
                  </View>

                  {localBom.items.length > 5 ? (
                    <TouchableOpacity
                      style={styles.showMoreButton}
                      onPress={() => setShowAllBomItems(current => !current)}
                      accessibilityRole="button"
                      accessibilityLabel={showAllBomItems ? 'Show fewer BOM line items' : 'Show all BOM line items'}
                    >
                      <Text style={styles.showMoreButtonText}>
                        {showAllBomItems ? 'Show fewer line items' : `Show all ${localBom.items.length} line items`}
                      </Text>
                      <Ionicons name={showAllBomItems ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.accent} />
                    </TouchableOpacity>
                  ) : null}

                  <View style={styles.bomTotalSection}>
                    <Text style={styles.bomTotalLabel}>Total Estimated Cost</Text>
                    <Text style={styles.bomTotalValue}>{localBom.totalEstimatedCost}</Text>
                  </View>

                  <View style={styles.bomNotesSection}>
                    <Text style={styles.bomNotesLabel}>Manufacturing Notes</Text>
                    <Text style={styles.bomNotes}>{localBom.manufacturingNotes}</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.generateContainer}>
                  <Ionicons name="list-outline" size={48} color={Colors.gray[600]} />
                  <Text style={styles.generateTitle}>Bill of Materials</Text>
                  <Text style={styles.generateDesc}>
                    Generate a complete parts list with quantities, materials, estimated costs, and supplier recommendations.
                  </Text>
                  <TouchableOpacity
                    style={styles.generateButton}
                    onPress={handleGenerateBOM}
                    accessibilityRole="button"
                    accessibilityLabel="Generate bill of materials"
                  >
                    <Ionicons name="hammer" size={20} color="#ffffff" />
                    <Text style={styles.generateButtonText}>Generate BOM</Text>
                  </TouchableOpacity>
                </View>
              )}

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
            </View>

            {innovation.pricing && (
              <View style={styles.pricingPanel}>
                <Text style={styles.exportTitle}>Pricing Estimate</Text>
                <View style={styles.pricingGrid}>
                  <Text style={styles.pricingLabel}>Parts</Text>
                  <Text style={styles.pricingValue}>{innovation.pricing.partsSubtotal}</Text>
                  <Text style={styles.pricingLabel}>3D modeling</Text>
                  <Text style={styles.pricingValue}>{innovation.pricing.modelingEstimate}</Text>
                  <Text style={styles.pricingLabel}>Fabrication</Text>
                  <Text style={styles.pricingValue}>{innovation.pricing.fabricationEstimate}</Text>
                  <Text style={styles.pricingLabel}>Assembly labor</Text>
                  <Text style={styles.pricingValue}>{innovation.pricing.assemblyLaborEstimate}</Text>
                  <Text style={[styles.pricingLabel, styles.pricingTotalLabel]}>Total</Text>
                  <Text style={[styles.pricingValue, styles.pricingTotalValue]}>{innovation.pricing.totalEstimate}</Text>
                </View>
              </View>
            )}
          </>
        );
      case 'assembly':
        return innovation.assemblySteps && innovation.assemblySteps.length > 0 ? (
          <View style={styles.assemblyPanel}>
            <Text style={styles.exportTitle}>Assembly Sequence</Text>
            {innovation.assemblySteps.map(step => (
              <View key={step.stepNumber} style={styles.assemblyStep}>
                <View style={styles.assemblyStepHeader}>
                  <Text style={styles.assemblyStepNumber}>{step.stepNumber}</Text>
                  <View style={styles.assemblyStepTitleWrap}>
                    <Text style={styles.assemblyStepTitle}>{step.title}</Text>
                    <Text style={styles.assemblyStepMeta}>{step.estimatedTime}</Text>
                  </View>
                </View>
                <Text style={styles.assemblyInstructions}>{step.instructions}</Text>
                <Text style={styles.assemblyParts}>Parts: {step.parts.join(', ')}</Text>
                <Text style={styles.assemblyCheck}>QC: {step.qualityCheck}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.generateContainer}>
            <Ionicons name="construct-outline" size={42} color={Colors.gray[600]} />
            <Text style={styles.generateTitle}>Assembly Sequence</Text>
            <Text style={styles.generateDesc}>No assembly sequence is available for this package yet.</Text>
          </View>
        );
      case 'manufacturing':
        return <ManufacturingStudio handoff={manufacturingHandoff} scene={threeDScene} collapsible={false} />;
      case 'exports':
        return localBom ? (
          <View style={styles.exportPanel}>
            <Text style={styles.exportTitle}>Export Options</Text>
            <View style={styles.exportButtons}>
              <TouchableOpacity
                style={styles.exportButton}
                onPress={handleExportBOM}
                accessibilityRole="button"
                accessibilityLabel="Export BOM CSV"
              >
                <Ionicons name="document-text" size={20} color={Colors.accent} />
                <Text style={styles.exportButtonText}>Export BOM (CSV)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.exportButton}
                onPress={handleExportAll}
                accessibilityRole="button"
                accessibilityLabel="Export complete reconstruction package"
              >
                <Ionicons name="archive" size={20} color={Colors.accent} />
                <Text style={styles.exportButtonText}>Export All (JSON)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.exportButton}
                onPress={handleExportQuotePacket}
                accessibilityRole="button"
                accessibilityLabel="Export manufacturer quote packet"
              >
                <Ionicons name="send" size={20} color={Colors.accent} />
                <Text style={styles.exportButtonText}>Export Quote Packet</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.exportInfo}>
              <Text style={styles.exportInfoLabel}>Export All includes:</Text>
              <Text style={styles.exportInfoItem}>• Machine match & reconstruction analysis</Text>
              <Text style={styles.exportInfoItem}>• Technical specifications</Text>
              <Text style={styles.exportInfoItem}>• Bill of Materials with suppliers</Text>
              <Text style={styles.exportInfoItem}>• Manufacturer quote request packet</Text>
              <Text style={styles.exportInfoItem}>• AI CAD gate, dimensions, datums, and DfM gates</Text>
              <Text style={styles.exportInfoItem}>• Material treatment review assumptions</Text>
              <Text style={styles.exportInfoItem}>• 2D visual references (PNG)</Text>
              <Text style={styles.exportInfoItem}>• 3D scene descriptor as visual reference</Text>
              <Text style={styles.exportInfoItem}>• Export timestamp</Text>
            </View>
          </View>
        ) : (
          <View style={styles.generateContainer}>
            <Ionicons name="archive-outline" size={42} color={Colors.gray[600]} />
            <Text style={styles.generateTitle}>Export Options</Text>
            <Text style={styles.generateDesc}>Generate the BOM before export options unlock.</Text>
            <TouchableOpacity
              style={styles.generateButton}
              onPress={handleGenerateBOM}
              accessibilityRole="button"
              accessibilityLabel="Generate bill of materials"
            >
              <Ionicons name="hammer" size={20} color="#ffffff" />
              <Text style={styles.generateButtonText}>Generate BOM</Text>
            </TouchableOpacity>
          </View>
        );
      case 'approval':
        return renderReviewerApprovalCard();
      case 'handoff':
        return (
          <View style={styles.manufacturerPanel}>
            <View style={styles.manufacturerHeader}>
              <View style={styles.manufacturerHeaderTitle}>
                <Ionicons name="business-outline" size={18} color={Colors.gray[400]} />
                <Text style={styles.manufacturerTitle}>Manufacturer Handoff</Text>
              </View>
            </View>
            <View style={styles.quotePacketCard}>
              <View style={styles.quotePacketHeader}>
                <Ionicons name="send-outline" size={20} color={Colors.accent} />
                <Text style={styles.quotePacketTitle}>Quote Packet</Text>
              </View>
              <Text style={styles.quotePacketText}>
                Export a review-ready packet with the matched machine, BOM, assembly steps, pricing envelope, AI CAD gate, material treatment notes, required files, and a vendor request message.
              </Text>
              <TouchableOpacity
                style={[styles.quotePacketButton, !localBom && styles.quotePacketButtonDisabled]}
                onPress={handleExportQuotePacket}
                disabled={!localBom}
                accessibilityRole="button"
                accessibilityLabel="Export manufacturer quote packet"
                accessibilityState={{ disabled: !localBom }}
              >
                <Text style={styles.quotePacketButtonText}>
                  {localBom ? 'Export Quote Packet' : 'Generate BOM First'}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.quoteRequestCard}>
              <View style={styles.quotePacketHeader}>
                <Ionicons name="mail-outline" size={20} color={Colors.accent} />
                <Text style={styles.quotePacketTitle}>Vendor Request Draft</Text>
              </View>
              <Text style={styles.quotePacketText}>
                Select a vendor target and prepare a reviewable email draft after a reviewer approval record is saved. Attach the exported packet and files before sending.
              </Text>
              <Text style={styles.quoteFieldLabel}>Vendor target</Text>
              <View style={styles.vendorChoiceGrid}>
                {getVendorTargets().map(vendor => {
                  const isSelected = (selectedVendorName || getVendorTargets()[0]?.vendorName) === vendor.vendorName;
                  return (
                    <TouchableOpacity
                      key={`${vendor.vendorName}-${vendor.url}`}
                      style={[styles.vendorChoiceButton, isSelected && styles.vendorChoiceButtonActive]}
                      onPress={() => setSelectedVendorName(vendor.vendorName)}
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${vendor.vendorName} as quote request vendor`}
                      accessibilityState={{ selected: isSelected }}
                    >
                      <Text style={[styles.vendorChoiceText, isSelected && styles.vendorChoiceTextActive]} numberOfLines={1}>
                        {vendor.vendorName}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.quoteFieldLabel}>Recipient email</Text>
              <TextInput
                style={styles.quoteInput}
                value={quoteRecipientEmail}
                onChangeText={setQuoteRecipientEmail}
                onFocus={handleBuildFieldFocus}
                accessibilityLabel="Vendor quote recipient email"
                placeholder="quotes@vendor.com"
                placeholderTextColor={Colors.gray[600]}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <Text style={styles.quoteFieldLabel}>Admin notes for vendor</Text>
              <TextInput
                style={[styles.quoteInput, styles.quoteNotesInput]}
                value={quoteAdminNotes}
                onChangeText={setQuoteAdminNotes}
                onFocus={handleBuildFieldFocus}
                accessibilityLabel="Admin notes for vendor quote request"
                placeholder="Tolerance concerns, preferred materials, target lead time, or missing files to ask about."
                placeholderTextColor={Colors.gray[600]}
                multiline
              />
              <TouchableOpacity
                style={[styles.quotePacketButton, !canPrepareVendorRequest && styles.quotePacketButtonDisabled]}
                onPress={handlePrepareQuoteEmail}
                disabled={!canPrepareVendorRequest}
                accessibilityRole="button"
                accessibilityLabel="Prepare vendor quote request email"
                accessibilityState={{ disabled: !canPrepareVendorRequest }}
              >
                <Text style={styles.quotePacketButtonText}>
                  {vendorRequestCtaLabel}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.manufacturerGrid}>
              {MANUFACTURERS.map((mfr) => (
                <TouchableOpacity
                  key={mfr.id}
                  style={styles.manufacturerCard}
                  onPress={() => Linking.openURL(mfr.url)}
                  accessibilityRole="link"
                  accessibilityLabel={`Open ${mfr.name} vendor website`}
                >
                  <Ionicons name={mfr.icon} size={24} color={Colors.gray[400]} />
                  <Text style={styles.manufacturerName}>{mfr.name}</Text>
                  <Text style={styles.manufacturerSubtitle}>{mfr.subtitle}</Text>
                  <Ionicons name="open-outline" size={12} color={Colors.gray[600]} style={styles.externalIcon} />
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.manufacturerNote}>
              Open a vendor site after exporting the quote packet. Upload the packet, BOM, assembly sequence, manufacturing handoff, CAD draft files when available, and visual references to request CAD qualification, treatment review, fabrication review, and quotes.
            </Text>
          </View>
        );
      default:
        return null;
    }
  };

  const renderLockedStepContent = (item: BuildReadinessItem) => {
    const lockedAction = getLockedAction(item.section);
    return (
      <View style={styles.lockedStepCard}>
        <View style={styles.lockedStepHeader}>
          <Ionicons name="lock-closed-outline" size={18} color={Colors.orange[300]} />
          <Text style={styles.lockedStepTitle}>{item.label} is locked</Text>
        </View>
        <Text style={styles.lockedStepText}>{item.unlockReason}</Text>
        <Text style={styles.lockedStepHint}>{item.summary}</Text>
        {lockedAction ? (
          <TouchableOpacity
            style={styles.lockedStepButton}
            onPress={lockedAction.action}
            accessibilityRole="button"
            accessibilityLabel={lockedAction.label}
          >
            <Text style={styles.lockedStepButtonText}>{lockedAction.label}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.container}
        contentContainerStyle={{ paddingBottom: keyboardOpen ? Spacing.xxl + keyboardInset : bottomBarInset + Spacing.xl + keyboardInset }}
        showsVerticalScrollIndicator={false}
        testID="reversr-tour-build"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        {...buildFocusVisibilityProps}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIcon}>
              <Ionicons name="hammer-outline" size={24} color={Colors.primary} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>Phase 4: Build</Text>
            </View>
          </View>
        </View>

        <View style={[styles.buildWorkspaceShell, isWideLayout && styles.buildWorkspaceShellDesktop]}>
          <View style={[styles.readinessPanel, isWideLayout && styles.readinessPanelDesktop]}>
            <View style={styles.readinessHeader}>
              <View style={styles.readinessLeft}>
                <Ionicons name={isVendorReviewReady ? 'checkmark-circle-outline' : 'alert-circle-outline'} size={22} color={isVendorReviewReady ? Colors.accent : Colors.orange[300]} />
                <View style={styles.readinessHeadingText}>
                  <Text style={styles.readinessTitle}>Build Readiness</Text>
                  <Text style={styles.readinessSubtitle}>
                    {isVendorReviewReady
                      ? 'Ready for vendor review. Fabrication still requires qualified CAD and DfM signoff.'
                      : `${buildSteps.length - readinessReadyCount} gate${buildSteps.length - readinessReadyCount === 1 ? '' : 's'} open before vendor review.`}
                  </Text>
                </View>
              </View>
              <View style={[styles.readinessBadge, isVendorReviewReady && styles.readinessBadgeReady]}>
                <Text style={styles.readinessPercent}>{readinessPercent}%</Text>
              </View>
            </View>
            <View style={styles.readinessSummaryRow}>
              <Badge label={`${readinessReadyCount}/${buildSteps.length} complete`} tone="success" icon="checkmark-circle" />
              <Badge label={`${readinessRemainingCount} remaining`} tone="primary" icon="arrow-forward-circle" />
              <Badge label={`${readinessLockedCount} locked`} tone="warning" icon="lock-closed" />
            </View>
            <View style={styles.readinessStatusStrip}>
              <View style={styles.readinessStatusLine} />
              {buildSteps.map(item => {
                const isSelected = activeBuildStep === item.section;
                const isHovered = Platform.OS === 'web' && isWideLayout && hoveredBuildStep === item.section;
                const statusIcon = item.status === 'locked'
                  ? 'lock-closed'
                  : item.complete
                    ? 'checkmark'
                    : undefined;
                return (
                  <Pressable
                    key={item.id}
                    style={styles.readinessNodeSlot}
                    onPress={() => openBuildStep(item.section)}
                    onHoverIn={Platform.OS === 'web' ? () => setHoveredBuildStep(item.section) : undefined}
                    onHoverOut={Platform.OS === 'web' ? () => setHoveredBuildStep(current => current === item.section ? null : current) : undefined}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.label}: ${getBuildStatusLabel(item)}`}
                    accessibilityHint={item.isUnlocked ? `Show ${item.label}. ${item.summary}` : `Locked. ${item.unlockReason}`}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <View
                      style={[
                        styles.readinessNodeButton,
                        item.complete && styles.readinessNodeButtonComplete,
                        item.status === 'current' && styles.readinessNodeButtonCurrent,
                        item.status === 'locked' && styles.readinessNodeButtonLocked,
                        isSelected && styles.readinessNodeButtonSelected,
                      ]}
                    >
                      {statusIcon ? (
                        <Ionicons
                          name={statusIcon as keyof typeof Ionicons.glyphMap}
                          size={item.status === 'locked' ? 14 : 17}
                          color={item.status === 'locked' ? Colors.orange[300] : item.complete ? Colors.black : Colors.white}
                        />
                      ) : (
                        <Text
                          style={[
                            styles.readinessNodeIndex,
                            item.status === 'current' && styles.readinessNodeIndexCurrent,
                            item.status === 'locked' && styles.readinessNodeIndexLocked,
                          ]}
                        >
                          {BUILD_SECTION_ORDER.indexOf(item.section) + 1}
                        </Text>
                      )}
                    </View>
                    <View
                      style={[
                        styles.readinessNodeStateDot,
                        item.complete && styles.readinessNodeStateDotComplete,
                        item.status === 'current' && styles.readinessNodeStateDotCurrent,
                        item.status === 'locked' && styles.readinessNodeStateDotLocked,
                      ]}
                    />
                    {isHovered ? (
                      <View style={styles.readinessNodeTooltip}>
                        <Text style={styles.readinessNodeTooltipTitle}>{item.label}</Text>
                        <Text style={styles.readinessNodeTooltipText} numberOfLines={2}>
                          {item.isUnlocked ? item.summary : item.unlockReason}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.readinessActiveDetail}>
              <View style={[
                styles.readinessActiveDetailIcon,
                activeBuildMeta.status === 'complete' && styles.readinessActiveDetailIconComplete,
                activeBuildMeta.status === 'current' && styles.readinessActiveDetailIconCurrent,
                activeBuildMeta.status === 'locked' && styles.readinessActiveDetailIconLocked,
              ]}>
                <Ionicons
                  name={
                    activeBuildMeta.status === 'locked'
                      ? 'lock-closed'
                      : activeBuildMeta.complete
                        ? 'checkmark'
                        : activeBuildMeta.icon
                  }
                  size={16}
                  color={
                    activeBuildMeta.status === 'locked'
                      ? Colors.orange[300]
                      : activeBuildMeta.complete
                        ? Colors.black
                        : Colors.primary
                  }
                />
              </View>
              <View style={styles.readinessActiveDetailText}>
                <Text style={styles.readinessActiveDetailTitle}>{activeBuildMeta.label}</Text>
                <Text style={styles.readinessActiveDetailSummary} numberOfLines={2}>
                  {activeBuildMeta.isUnlocked ? activeBuildMeta.summary : activeBuildMeta.unlockReason}
                </Text>
              </View>
              <View style={[
                styles.stepStatusBadge,
                activeBuildMeta.status === 'complete' && styles.stepStatusBadgeComplete,
                activeBuildMeta.status === 'current' && styles.stepStatusBadgeCurrent,
                activeBuildMeta.status === 'locked' && styles.stepStatusBadgeLocked,
              ]}>
                <Text style={styles.stepStatusText}>{getBuildStatusLabel(activeBuildMeta)}</Text>
              </View>
            </View>
          </View>
          <View
            style={[styles.workspacePanel, isWideLayout && styles.workspacePanelDesktop]}
            onLayout={(event) => {
              workspaceOffsetRef.current = event.nativeEvent.layout.y;
            }}
          >
            <View style={styles.workspaceHeader}>
              <View style={styles.workspaceHeaderText}>
                <Text style={styles.workspaceTitle}>{activeBuildMeta.label}</Text>
                <Text style={styles.workspaceSubtitle}>
                  {activeBuildMeta.isUnlocked ? activeBuildMeta.summary : activeBuildMeta.unlockReason}
                </Text>
              </View>
              <View style={[
                styles.workspaceStatusBadge,
                activeBuildMeta.status === 'complete' && styles.workspaceStatusBadgeComplete,
                activeBuildMeta.status === 'current' && styles.workspaceStatusBadgeCurrent,
                activeBuildMeta.status === 'locked' && styles.workspaceStatusBadgeLocked,
              ]}>
                <Text style={styles.workspaceStatusText}>
                  {getBuildStatusLabel(activeBuildMeta)}
                </Text>
              </View>
            </View>
            {activeBuildMeta.isUnlocked
              ? renderBuildSectionContent(activeBuildMeta.section)
              : renderLockedStepContent(activeBuildMeta)}
          </View>
        </View>

        <View style={styles.actionsPanel}>
          <Text style={styles.actionsTitle}>What's Next?</Text>
          {actionBuildMeta ? (
            <TouchableOpacity
              style={[styles.nextSectionButton, actionBuildIsLocked && styles.nextSectionButtonLocked]}
              onPress={() => {
                if (!actionBuildStep || actionBuildIsLocked) return;
                openBuildStep(actionBuildStep, { scrollToWorkspace: true });
              }}
              disabled={actionBuildIsLocked}
              accessibilityRole="button"
              accessibilityLabel={actionBuildIsLocked ? `${actionBuildMeta.label} locked` : `Open ${actionBuildMeta.label}`}
              accessibilityHint={actionBuildIsLocked ? actionBuildMeta.unlockReason : `Show ${actionBuildMeta.label}. ${actionBuildMeta.summary}`}
              accessibilityState={{ disabled: actionBuildIsLocked }}
            >
              <View style={[
                styles.nextSectionIcon,
                actionBuildMeta.complete && styles.nextSectionIconComplete,
                actionBuildIsLocked && styles.nextSectionIconLocked,
              ]}>
                <Ionicons
                  name={actionBuildIsLocked ? 'lock-closed-outline' : actionBuildMeta.complete ? 'checkmark-circle' : actionBuildMeta.icon}
                  size={18}
                  color={actionBuildIsLocked ? Colors.orange[300] : actionBuildMeta.complete ? Colors.accent : Colors.primary}
                />
              </View>
              <View style={styles.actionContent}>
                <Text style={styles.actionButtonText}>{actionBuildMeta.label}</Text>
                <Text style={styles.actionButtonSubtext} numberOfLines={2}>
                  {actionBuildIsLocked ? actionBuildMeta.unlockReason : actionBuildMeta.summary}
                </Text>
              </View>
              {!actionBuildIsLocked ? (
                <Ionicons name="arrow-forward" size={18} color={Colors.primary} />
              ) : null}
            </TouchableOpacity>
          ) : (
            <View style={styles.nextSectionCompleteCard}>
              <Ionicons name="checkmark-circle-outline" size={20} color={Colors.accent} />
              <View style={styles.actionContent}>
                <Text style={styles.actionButtonText}>Build review complete</Text>
                <Text style={styles.actionButtonSubtext}>All build sections have been reviewed.</Text>
              </View>
            </View>
          )}
          <TouchableOpacity
            style={styles.actionButton}
            onPress={onReset}
            accessibilityRole="button"
            accessibilityLabel="Start a new reconstruction"
          >
            <Ionicons name="add-circle" size={20} color={Colors.accent} />
            <View style={styles.actionContent}>
              <Text style={styles.actionButtonText}>New Reconstruction</Text>
              <Text style={styles.actionButtonSubtext}>Start fresh with a new product</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      <AlertModal
        visible={alert?.visible || false}
        title={alert?.title || ''}
        message={alert?.message || ''}
        type={alert?.type || 'info'}
        onClose={() => setAlert(null)}
      />

      <LoadingOverlay
        visible={status === 'generating'}
        phase="build"
        currentStep={loadingStep}
        steps={BUILD_STEPS}
      />
    </View>
  );
}

const createStyles = (Colors: AppColors) => StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingVertical: Spacing.lg,
  },
  buildWorkspaceShell: {
    gap: Spacing.lg,
  },
  buildWorkspaceShellDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: FontSizes.xl,
    fontFamily: Fonts.display,
    color: Colors.text,
    marginBottom: 0,
  },
  description: {
    fontSize: FontSizes.sm,
    color: Colors.mutedText,
    lineHeight: 20,
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
  packageSummaryCard: {
    backgroundColor: Colors.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
    overflow: 'visible',
  },
  packageSummaryHeader: {
    gap: 4,
    zIndex: 50,
    elevation: 50,
  },
  packageSummaryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  packageSummaryTitle: {
    fontSize: FontSizes.lg,
    fontFamily: Fonts.display,
    color: Colors.white,
  },
  packageSummaryMeta: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  packageSummaryDesc: {
    fontSize: FontSizes.sm,
    color: Colors.gray[300],
    lineHeight: 20,
  },
  packageSummaryGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  packageSummaryTile: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: Spacing.sm,
    gap: 4,
  },
  packageSummaryTileLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    textTransform: 'uppercase',
  },
  packageSummaryTileValue: {
    fontSize: FontSizes.xs,
    color: Colors.white,
    fontWeight: 'bold',
  },
  readinessPanel: {
    backgroundColor: Colors.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  readinessPanelDesktop: {
    width: 360,
    marginBottom: 0,
  },
  readinessHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
  },
  readinessLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  readinessHeadingText: {
    flex: 1,
    minWidth: 0,
  },
  readinessTitle: {
    fontSize: FontSizes.md,
    fontWeight: 'bold',
    color: Colors.white,
  },
  readinessSubtitle: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    marginTop: 2,
  },
  readinessBadge: {
    backgroundColor: 'rgba(0, 255, 136, 0.15)',
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 16,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  readinessPercent: {
    fontFamily: 'monospace',
    fontSize: FontSizes.xs,
    color: Colors.accent,
    fontWeight: 'bold',
  },
  readinessBadgeReady: {
    backgroundColor: 'rgba(0, 255, 136, 0.22)',
  },
  readinessSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  readinessStatusStrip: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
  },
  readinessStatusLine: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: 24,
    height: 2,
    backgroundColor: Colors.border,
  },
  readinessNodeSlot: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
    zIndex: 2,
  },
  readinessNodeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readinessNodeButtonSelected: {
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  readinessNodeButtonComplete: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  readinessNodeButtonCurrent: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderColor: Colors.primary,
    borderWidth: 2,
  },
  readinessNodeButtonLocked: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  readinessNodeIndex: {
    color: Colors.gray[400],
    fontSize: 12,
    fontWeight: '800',
  },
  readinessNodeIndexCurrent: {
    color: Colors.white,
  },
  readinessNodeIndexLocked: {
    color: Colors.orange[300],
  },
  readinessNodeStateDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.gray[500],
    marginTop: Spacing.xs,
  },
  readinessNodeStateDotComplete: {
    backgroundColor: Colors.accent,
  },
  readinessNodeStateDotCurrent: {
    backgroundColor: Colors.primary,
  },
  readinessNodeStateDotLocked: {
    backgroundColor: Colors.orange[300],
  },
  readinessNodeTooltip: {
    position: 'absolute',
    bottom: 52,
    width: 156,
    left: '50%',
    marginLeft: -78,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.elevated,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 20,
    zIndex: 20,
  },
  readinessNodeTooltipTitle: {
    color: Colors.white,
    fontSize: FontSizes.xs,
    fontWeight: '800',
    marginBottom: 2,
    textAlign: 'center',
  },
  readinessNodeTooltipText: {
    color: Colors.gray[400],
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
  },
  readinessActiveDetail: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: Spacing.md,
  },
  readinessActiveDetailIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  readinessActiveDetailIconComplete: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  readinessActiveDetailIconCurrent: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(59, 130, 246, 0.16)',
  },
  readinessActiveDetailIconLocked: {
    borderColor: 'rgba(245, 158, 11, 0.35)',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
  },
  readinessActiveDetailText: {
    flex: 1,
    minWidth: 0,
  },
  readinessActiveDetailTitle: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: '800',
    marginBottom: 2,
  },
  readinessActiveDetailSummary: {
    color: Colors.gray[400],
    fontSize: FontSizes.xs,
    lineHeight: 18,
  },
  readinessItemAction: {
    color: Colors.accent,
    fontSize: FontSizes.xs,
    fontWeight: 'bold',
    alignSelf: 'center',
  },
  stepStatusBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    backgroundColor: Colors.black,
  },
  stepStatusBadgeComplete: {
    borderColor: Colors.accent,
    backgroundColor: 'rgba(0, 255, 136, 0.14)',
  },
  stepStatusBadgeCurrent: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(59, 130, 246, 0.16)',
  },
  stepStatusBadgeLocked: {
    borderColor: Colors.orange[300],
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
  },
  stepStatusText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  workspacePanel: {
    flex: 1,
    backgroundColor: Colors.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  workspacePanelDesktop: {
    marginBottom: 0,
    minHeight: 680,
  },
  workspaceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  workspaceHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  workspaceTitle: {
    fontSize: FontSizes.lg,
    color: Colors.white,
    fontFamily: Fonts.display,
  },
  workspaceSubtitle: {
    marginTop: Spacing.xs,
    fontSize: FontSizes.sm,
    lineHeight: 20,
    color: Colors.gray[400],
  },
  workspaceStatusBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.black,
  },
  workspaceStatusBadgeComplete: {
    borderColor: Colors.accent,
    backgroundColor: 'rgba(0, 255, 136, 0.14)',
  },
  workspaceStatusBadgeCurrent: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(59, 130, 246, 0.16)',
  },
  workspaceStatusBadgeLocked: {
    borderColor: Colors.orange[300],
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
  },
  workspaceStatusText: {
    color: Colors.white,
    fontSize: FontSizes.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  bomPanel: {
    backgroundColor: Colors.black,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.panel,
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
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
  panelTitle: {
    fontFamily: 'monospace',
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    flex: 1,
  },
  bomToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  bomItemCount: {
    fontFamily: 'monospace',
    fontSize: FontSizes.xs,
    color: Colors.gray[400],
  },
  bomCollapsed: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
  bomCollapsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  bomCollapsedText: {
    fontFamily: 'monospace',
    fontSize: FontSizes.sm,
    color: Colors.white,
  },
  bomCollapsedDivider: {
    color: Colors.gray[600],
  },
  bomCollapsedCost: {
    fontFamily: 'monospace',
    fontSize: FontSizes.sm,
    color: Colors.orange[300],
    fontWeight: 'bold',
  },
  bomCollapsedHint: {
    marginTop: Spacing.xs,
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  loadingText: {
    marginTop: Spacing.md,
    fontFamily: 'monospace',
    fontSize: FontSizes.sm,
    color: Colors.orange[300],
  },
  loadingSubtext: {
    marginTop: Spacing.xs,
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  bomContent: {
    padding: Spacing.lg,
  },
  bomHeader: {
    marginBottom: Spacing.md,
  },
  bomProjectName: {
    fontFamily: 'monospace',
    fontSize: FontSizes.lg,
    color: Colors.orange[300],
    marginBottom: Spacing.xs,
  },
  bomMeta: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  bomItemsContainer: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  bomItem: {
    backgroundColor: Colors.panel,
    borderRadius: 8,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bomItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  bomPartNumber: {
    fontFamily: 'monospace',
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    flex: 1,
  },
  bomQuantity: {
    fontFamily: 'monospace',
    fontSize: FontSizes.sm,
    color: Colors.orange[300],
    fontWeight: 'bold',
  },
  bomPartName: {
    fontSize: FontSizes.sm,
    color: Colors.white,
    fontWeight: 'bold',
    marginBottom: Spacing.xs,
  },
  bomPartDesc: {
    fontSize: FontSizes.xs,
    color: Colors.gray[400],
    marginBottom: Spacing.sm,
  },
  bomItemMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  bomItemMetaText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    flex: 1,
    marginRight: Spacing.sm,
  },
  bomItemCost: {
    fontFamily: 'monospace',
    fontSize: FontSizes.sm,
    color: Colors.green[400],
    fontWeight: 'bold',
  },
  bomItemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bomSupplier: {
    fontSize: FontSizes.xs,
    color: Colors.blue[500],
    flex: 1,
  },
  bomLeadTime: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    marginLeft: Spacing.xs,
  },
  bomTotalSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(22, 101, 52, 0.2)',
    padding: Spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(22, 101, 52, 0.5)',
    marginBottom: Spacing.md,
  },
  bomTotalLabel: {
    fontSize: FontSizes.sm,
    color: Colors.green[400],
    fontWeight: 'bold',
  },
  bomTotalValue: {
    fontFamily: 'monospace',
    fontSize: FontSizes.lg,
    color: Colors.green[400],
    fontWeight: 'bold',
  },
  bomNotesSection: {
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: 8,
  },
  bomNotesLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  bomNotes: {
    fontSize: FontSizes.sm,
    color: Colors.gray[300],
    lineHeight: 20,
  },
  showMoreButton: {
    marginBottom: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  showMoreButtonText: {
    color: Colors.accent,
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  lockedStepCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    borderRadius: 12,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  lockedStepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  lockedStepTitle: {
    color: Colors.white,
    fontSize: FontSizes.md,
    fontWeight: '700',
  },
  lockedStepText: {
    color: Colors.orange[300],
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  lockedStepHint: {
    color: Colors.gray[400],
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  lockedStepButton: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.orange[300],
    borderRadius: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  lockedStepButtonText: {
    color: Colors.black,
    fontWeight: '700',
    fontSize: FontSizes.sm,
  },
  generateContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.lg,
  },
  generateTitle: {
    fontSize: FontSizes.lg,
    fontWeight: 'bold',
    color: Colors.white,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  generateDesc: {
    fontSize: FontSizes.sm,
    color: Colors.gray[400],
    textAlign: 'center',
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radii.md,
  },
  generateButtonText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.md,
    color: '#ffffff',
  },
  errorText: {
    fontSize: FontSizes.sm,
    color: Colors.red[500],
    textAlign: 'center',
  },
  errorPanel: {
    padding: Spacing.md,
    gap: Spacing.sm,
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
  exportPanel: {
    backgroundColor: Colors.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  exportTitle: {
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
    color: Colors.gray[300],
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: Spacing.md,
  },
  exportButtons: {
    gap: Spacing.sm,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  exportButtonText: {
    fontSize: FontSizes.sm,
    color: Colors.accent,
  },
  exportInfo: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderLeftWidth: 3,
    borderLeftColor: Colors.purple[500],
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: 6,
    marginTop: Spacing.md,
  },
  exportInfoLabel: {
    fontSize: FontSizes.xs,
    color: Colors.white,
    fontWeight: 'bold',
    marginBottom: Spacing.sm,
  },
  exportInfoItem: {
    fontSize: FontSizes.xs,
    color: Colors.gray[300],
    marginBottom: Spacing.xs,
  },
  assemblyPanel: {
    backgroundColor: Colors.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  assemblyStep: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  assemblyStepHeader: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  assemblyStepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    color: Colors.black,
    textAlign: 'center',
    lineHeight: 28,
    fontWeight: 'bold',
  },
  assemblyStepTitleWrap: {
    flex: 1,
  },
  assemblyStepTitle: {
    color: Colors.white,
    fontSize: FontSizes.md,
    fontWeight: 'bold',
  },
  assemblyStepMeta: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
  assemblyInstructions: {
    color: Colors.gray[300],
    fontSize: FontSizes.sm,
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  assemblyParts: {
    color: Colors.blue[500],
    fontSize: FontSizes.xs,
    marginBottom: Spacing.xs,
  },
  assemblyCheck: {
    color: Colors.green[400],
    fontSize: FontSizes.xs,
  },
  pricingPanel: {
    backgroundColor: Colors.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  pricingGrid: {
    gap: Spacing.sm,
  },
  pricingLabel: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  pricingValue: {
    color: Colors.white,
    fontSize: FontSizes.md,
    fontWeight: 'bold',
    marginBottom: Spacing.xs,
  },
  pricingTotalLabel: {
    color: Colors.accent,
    marginTop: Spacing.sm,
  },
  pricingTotalValue: {
    color: Colors.accent,
    fontSize: FontSizes.xl,
  },
  manufacturerPanel: {
    backgroundColor: Colors.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  manufacturerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  manufacturerHeaderTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  manufacturerTitle: {
    fontSize: FontSizes.md,
    fontWeight: 'bold',
    color: Colors.white,
  },
  handoffHeaderAction: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.surface,
  },
  handoffHeaderActionText: {
    color: Colors.gray[300],
    fontSize: FontSizes.xs,
    fontWeight: 'bold',
  },
  quotePacketCard: {
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
    borderRadius: 8,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  quoteRequestCard: {
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    borderRadius: 8,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  handoffCompactCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  handoffSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    backgroundColor: Colors.panel,
    padding: Spacing.sm,
  },
  handoffSummaryRowReady: {
    borderColor: 'rgba(0, 255, 157, 0.3)',
    backgroundColor: 'rgba(0, 255, 136, 0.08)',
  },
  handoffSummaryIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.black,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  handoffSummaryIconReady: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  handoffSummaryText: {
    flex: 1,
    minWidth: 0,
  },
  handoffSummaryLabel: {
    color: Colors.white,
    fontSize: FontSizes.xs,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  handoffSummaryValue: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    lineHeight: 16,
  },
  handoffCompactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.xs,
  },
  handoffCompactButtonText: {
    color: Colors.black,
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
  },
  reviewerApprovalCard: {
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
    borderRadius: 8,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    overflow: 'visible',
  },
  quotePacketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
    zIndex: 50,
    elevation: 50,
  },
  quotePacketTitle: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
  },
  quoteFieldLabel: {
    color: Colors.gray[400],
    fontSize: FontSizes.xs,
    fontWeight: 'bold',
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  vendorChoiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  vendorChoiceButton: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    maxWidth: '48%',
  },
  vendorChoiceButtonActive: {
    borderColor: Colors.accent,
    backgroundColor: 'rgba(0, 255, 157, 0.12)',
  },
  vendorChoiceText: {
    color: Colors.gray[400],
    fontSize: FontSizes.xs,
    fontWeight: 'bold',
  },
  vendorChoiceTextActive: {
    color: Colors.accent,
  },
  approvalChoiceGrid: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  approvalChoiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: Spacing.sm,
    backgroundColor: Colors.surface,
  },
  approvalChoiceButtonActive: {
    borderColor: Colors.orange[300],
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
  },
  approvalChoiceSelect: {
    flex: 1,
    minWidth: 0,
  },
  approvalChoiceLabel: {
    color: Colors.gray[300],
    fontSize: FontSizes.xs,
    fontWeight: 'bold',
    marginBottom: 0,
  },
  approvalChoiceLabelActive: {
    color: Colors.orange[300],
  },
  approvalChoiceDescription: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    lineHeight: 16,
  },
  approvalStatusBox: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.25)',
    borderRadius: 8,
    padding: Spacing.sm,
  },
  approvalStatusBoxApproved: {
    backgroundColor: 'rgba(0, 255, 157, 0.08)',
    borderColor: 'rgba(0, 255, 157, 0.25)',
  },
  approvalStatusText: {
    flex: 1,
    color: Colors.gray[300],
    fontSize: FontSizes.xs,
    lineHeight: 16,
  },
  saveReviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.orange[300],
    borderRadius: 8,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  saveReviewButtonText: {
    color: Colors.black,
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
  },
  reviewHistoryBox: {
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.2)',
    borderRadius: 8,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
    backgroundColor: Colors.surface,
  },
  reviewHistoryTitle: {
    color: Colors.gray[300],
    fontSize: FontSizes.xs,
    fontWeight: 'bold',
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  reviewHistoryItem: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.xs,
    marginTop: Spacing.xs,
  },
  reviewHistoryItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: 2,
  },
  reviewHistoryStatus: {
    flex: 1,
    color: Colors.orange[300],
    fontSize: FontSizes.xs,
    fontWeight: 'bold',
  },
  reviewHistoryDate: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
  },
  reviewHistoryMeta: {
    color: Colors.gray[400],
    fontSize: FontSizes.xs,
    lineHeight: 16,
  },
  reviewHistoryNotes: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    lineHeight: 16,
    marginTop: 2,
  },
  reviewHistoryEmpty: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    lineHeight: 16,
  },
  quoteInput: {
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    color: Colors.text,
    fontSize: FontSizes.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  quoteNotesInput: {
    minHeight: 76,
    textAlignVertical: 'top',
  },
  quotePacketText: {
    color: Colors.gray[300],
    fontSize: FontSizes.xs,
    lineHeight: 17,
    marginBottom: Spacing.md,
  },
  quotePacketButton: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radii.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  quotePacketButtonDisabled: {
    backgroundColor: Colors.gray[700],
  },
  quotePacketButtonText: {
    color: '#ffffff',
    fontFamily: Fonts.bold,
    fontSize: FontSizes.sm,
  },
  manufacturerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  manufacturerCard: {
    width: '48%',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: Spacing.md,
    alignItems: 'center',
    position: 'relative',
  },
  manufacturerName: {
    fontFamily: 'monospace',
    fontSize: FontSizes.sm,
    color: Colors.white,
    marginTop: Spacing.sm,
    marginBottom: 2,
  },
  manufacturerSubtitle: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    textAlign: 'center',
  },
  externalIcon: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  manufacturerNote: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    textAlign: 'center',
    lineHeight: 16,
  },
  actionsPanel: {
    backgroundColor: Colors.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
  },
  actionsTitle: {
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
    color: Colors.gray[300],
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: Spacing.md,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
    maxWidth: '100%',
  },
  nextSectionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
    marginBottom: Spacing.sm,
    maxWidth: '100%',
  },
  nextSectionButtonLocked: {
    borderColor: 'rgba(245, 158, 11, 0.35)',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    opacity: 0.85,
  },
  nextSectionCompleteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.accent,
    marginBottom: Spacing.sm,
    maxWidth: '100%',
  },
  nextSectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.35)',
  },
  nextSectionIconComplete: {
    backgroundColor: 'rgba(0, 255, 136, 0.12)',
    borderColor: 'rgba(0, 255, 157, 0.35)',
  },
  nextSectionIconLocked: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  actionContent: {
    flex: 1,
    minWidth: 0,
  },
  actionButtonText: {
    fontSize: FontSizes.sm,
    color: Colors.white,
    fontWeight: 'bold',
    flexShrink: 1,
  },
  actionButtonSubtext: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    marginTop: 2,
    flexShrink: 1,
  },
});
