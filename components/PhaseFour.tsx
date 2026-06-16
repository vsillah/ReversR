import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Linking,
  TextInput,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, Spacing, FontSizes, Radii, Fonts } from '../constants/theme';
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
import ManufacturingStudio from './ManufacturingStudio';
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
}

type ArtifactStatus = {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  ready: boolean;
};

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
}: Props) {
  const { colors: Colors } = useAppTheme();
  const { account } = useCommercialization();
  const styles = createStyles(Colors);
  const scrollViewRef = useRef<ScrollView>(null);
  const [localBom, setLocalBom] = useState<BillOfMaterials | null>(bom);
  const has2D = !!imageUrl || multiAngleImages.some(img => !!img.imageData);
  const has3D = !!threeDScene;
  const [status, setStatus] = useState<'idle' | 'generating' | 'complete'>(
    bom ? 'complete' : 'idle'
  );
  const [error, setError] = useState<string | null>(null);
  const [creditUpgradeUrl, setCreditUpgradeUrl] = useState<string | null>(null);
  const [alert, setAlert] = useState<{visible: boolean, title: string, message: string, type: 'info' | 'error' | 'success'} | null>(null);
  const [bomExpanded, setBomExpanded] = useState(true);
  const [loadingStep, setLoadingStep] = useState<string>('analyzing');
  const [selectedVendorName, setSelectedVendorName] = useState('');
  const [quoteRecipientEmail, setQuoteRecipientEmail] = useState('');
  const [quoteAdminNotes, setQuoteAdminNotes] = useState('');
  const [reviewerApprovalStatus, setReviewerApprovalStatus] = useState<ReviewerApprovalStatus>('pending_review');
  const [reviewerName, setReviewerName] = useState('');
  const [reviewerRole, setReviewerRole] = useState('');
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [savedReviewRecords, setSavedReviewRecords] = useState<ReviewerApprovalRecord[]>(reviewerApprovalRecords);
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
  const canPrepareVendorRequest = !!localBom && !!savedVendorApprovalRecord && canExportQuotePacket;

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
      setStatus('complete');
      onBOMGenerated(bomResult);
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
      const csvHeader = 'Part Number,Part Name,Description,Quantity,Material,Est. Cost,Supplier,Lead Time,Notes\n';
      const csvRows = localBom.items.map(item =>
        `"${item.partNumber}","${item.partName}","${item.description}",${item.quantity},"${item.material}","${item.estimatedCost}","${item.supplier}","${item.leadTime}","${item.notes}"`
      ).join('\n');
      const csvContent = csvHeader + csvRows + `\n\nTotal Estimated Cost: ${localBom.totalEstimatedCost}\nManufacturing Notes: ${localBom.manufacturingNotes}`;

      const name = innovation.conceptName.replace(/\s+/g, '_');
      const fileUri = FileSystem.documentDirectory + `${name}_BOM.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csvContent);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        setAlert({visible: true, title: 'Saved', message: 'Bill of Materials saved to device.', type: 'success'});
      }
    } catch (e) {
      console.error('BOM Export error:', e);
      setAlert({visible: true, title: 'Error', message: 'Failed to export Bill of Materials.', type: 'error'});
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

      const name = innovation.conceptName.replace(/\s+/g, '_');
      const fileUri = FileSystem.documentDirectory + `${name}_complete.json`;
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(exportData, null, 2));

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        setAlert({visible: true, title: 'Saved', message: 'Complete reconstruction package saved to device.', type: 'success'});
      }
    } catch (e) {
      console.error('Export error:', e);
      setAlert({visible: true, title: 'Error', message: 'Failed to export package.', type: 'error'});
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
      const name = innovation.conceptName.replace(/\s+/g, '_');
      const fileUri = FileSystem.documentDirectory + `${name}_manufacturer_quote_packet.json`;
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(packet, null, 2));

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        setAlert({visible: true, title: 'Saved', message: 'Manufacturer quote packet saved to device.', type: 'success'});
      }
    } catch (e) {
      console.error('Quote packet export error:', e);
      setAlert({visible: true, title: 'Error', message: 'Failed to export manufacturer quote packet.', type: 'error'});
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
      has3D ? '- 3D scene visual reference' : '- 3D scene visual reference: pending',
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

  return (
    <ScrollView ref={scrollViewRef} style={styles.container} showsVerticalScrollIndicator={false} testID="reversr-tour-build">
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Ionicons name="hammer-outline" size={24} color={Colors.primary} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>Phase 4: Build</Text>
            <Text style={styles.description}>BOM, assembly sequence, pricing, and fulfillment handoff</Text>
          </View>
        </View>
      </View>

      <View style={styles.conceptCard}>
        <Text style={styles.conceptName}>{innovation.conceptName}</Text>
        <Text style={styles.conceptDesc}>{innovation.conceptDescription}</Text>
      </View>

      {innovation.assemblySteps && innovation.assemblySteps.length > 0 && (
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
      )}

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

      <ManufacturingStudio handoff={manufacturingHandoff} scene={threeDScene} />

      <View style={styles.bomPanel}>
        <TouchableOpacity 
          style={styles.panelHeader} 
          onPress={() => localBom && setBomExpanded(!bomExpanded)}
          activeOpacity={localBom ? 0.7 : 1}
          accessibilityRole="button"
          accessibilityLabel={localBom ? 'Toggle bill of materials details' : 'Bill of materials panel'}
          accessibilityState={{ disabled: !localBom, expanded: localBom ? bomExpanded : undefined }}
        >
          <View style={styles.terminalDots}>
            <View style={[styles.dot, { backgroundColor: '#ef4444' }]} />
            <View style={[styles.dot, { backgroundColor: '#eab308' }]} />
            <View style={[styles.dot, { backgroundColor: '#22c55e' }]} />
          </View>
          <Text style={styles.panelTitle}>Bill of Materials (BOM)</Text>
          {localBom && (
            <View style={styles.bomToggleContainer}>
              <Text style={styles.bomItemCount}>{localBom.items.length} items</Text>
              <Ionicons 
                name={bomExpanded ? 'chevron-up' : 'chevron-down'} 
                size={20} 
                color={Colors.gray[400]} 
              />
            </View>
          )}
        </TouchableOpacity>

        {status === 'generating' ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.orange[300]} />
            <Text style={styles.loadingText}>Generating Bill of Materials...</Text>
            <Text style={styles.loadingSubtext}>Calculating parts, costs & suppliers</Text>
          </View>
        ) : localBom ? (
          bomExpanded ? (
            <View style={styles.bomContent}>
              <View style={styles.bomHeader}>
                <Text style={styles.bomProjectName}>{localBom.projectName}</Text>
                <Text style={styles.bomMeta}>v{localBom.version} | {localBom.dateGenerated}</Text>
              </View>

              <View style={styles.bomItemsContainer}>
                {localBom.items.map((item, index) => (
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
            <View style={styles.bomCollapsed}>
              <View style={styles.bomCollapsedRow}>
                <Ionicons name="checkmark-circle" size={18} color={Colors.accent} />
                <Text style={styles.bomCollapsedText}>{localBom.items.length} parts</Text>
                <Text style={styles.bomCollapsedDivider}>|</Text>
                <Text style={styles.bomCollapsedCost}>{localBom.totalEstimatedCost}</Text>
              </View>
              <Text style={styles.bomCollapsedHint}>Tap header to expand</Text>
            </View>
          )
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

      {localBom && (
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
      )}

      {/* Manufacturing Readiness Tracker */}
      {(() => {
        const artifacts: ArtifactStatus[] = [
          { id: '2d', name: '2D', icon: 'image-outline', ready: has2D },
          { id: '3d', name: '3D', icon: 'cube-outline', ready: has3D },
          { id: 'specs', name: 'Specs', icon: 'document-text-outline', ready: !!spec },
          { id: 'bom', name: 'BOM', icon: 'list-outline', ready: !!localBom },
        ];
        const readyCount = artifacts.filter(a => a.ready).length;
        const percentage = Math.round((readyCount / artifacts.length) * 100);
        
        const handleArtifactPress = (artifactId: string, isReady: boolean) => {
          if (isReady) {
            const readyMessages: Record<string, string> = {
              '2d': '2D visualization is complete.',
              '3d': '3D scene is complete.',
              'specs': 'Specifications are complete.',
              'bom': 'Bill of Materials is complete.',
            };
            setAlert({visible: true, title: 'Already Generated', message: readyMessages[artifactId] || 'This artifact is ready.', type: 'success'});
            return;
          }
          
          if (artifactId === 'bom') {
            if (status === 'generating') {
              setAlert({visible: true, title: 'Please Wait', message: 'BOM generation is already in progress.', type: 'info'});
              return;
            }
            handleGenerateBOM();
          } else {
            onGoToDesign();
          }
        };
        
        return (
          <View style={styles.readinessPanel}>
            <View style={styles.readinessHeader}>
              <View style={styles.readinessLeft}>
                <Ionicons name="rocket-outline" size={18} color={Colors.gray[400]} />
                <View>
                  <Text style={styles.readinessTitle}>Manufacturing Readiness</Text>
                  <Text style={styles.readinessSubtitle}>Tap missing artifacts to generate them</Text>
                </View>
              </View>
              <View style={styles.readinessBadge}>
                <Text style={styles.readinessPercent}>{percentage}% Ready</Text>
              </View>
            </View>
            <View style={styles.artifactGrid}>
              {artifacts.map((artifact) => {
                const isBomGenerating = artifact.id === 'bom' && status === 'generating';
                return (
                  <TouchableOpacity 
                    key={artifact.id} 
                    style={[
                      styles.artifactItem,
                      artifact.ready && styles.artifactItemReady,
                      !artifact.ready && !isBomGenerating && styles.artifactItemTappable,
                      isBomGenerating && styles.artifactItemGenerating,
                    ]}
                    onPress={() => handleArtifactPress(artifact.id, artifact.ready)}
                    activeOpacity={0.7}
                    disabled={isBomGenerating}
                    accessibilityRole="button"
                    accessibilityLabel={`${artifact.name} artifact ${artifact.ready ? 'ready' : 'missing'}`}
                    accessibilityHint={artifact.ready ? 'Shows artifact status' : artifact.id === 'bom' ? 'Generates the bill of materials' : 'Returns to design to generate this artifact'}
                    accessibilityState={{ disabled: isBomGenerating, selected: artifact.ready }}
                  >
                    {isBomGenerating ? (
                      <ActivityIndicator size="small" color={Colors.secondary} />
                    ) : (
                      <Ionicons 
                        name={artifact.ready ? 'checkmark-circle' : artifact.icon} 
                        size={24} 
                        color={artifact.ready ? Colors.accent : Colors.gray[600]} 
                      />
                    )}
                    <Text style={[
                      styles.artifactName,
                      artifact.ready && styles.artifactNameReady,
                      isBomGenerating && styles.artifactNameGenerating,
                    ]}>{isBomGenerating ? 'Generating...' : artifact.name}</Text>
                    {!artifact.ready && !isBomGenerating && (
                      <Ionicons 
                        name={artifact.id === 'bom' ? 'add-circle-outline' : 'arrow-back-circle-outline'} 
                        size={14} 
                        color={Colors.gray[500]} 
                        style={styles.artifactAction}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      })()}

      {/* Send to Manufacturer Section */}
      <View style={styles.manufacturerPanel}>
        <View style={styles.manufacturerHeader}>
          <Ionicons name="business-outline" size={18} color={Colors.gray[400]} />
          <Text style={styles.manufacturerTitle}>Manufacturer Handoff</Text>
        </View>
        <View style={styles.reviewerApprovalCard}>
          <View style={styles.quotePacketHeader}>
            <Ionicons name="shield-checkmark-outline" size={20} color={Colors.orange[300]} />
            <Text style={styles.quotePacketTitle}>Reviewer Approval</Text>
          </View>
          <Text style={styles.quotePacketText}>
            Record the review decision before preparing a vendor request. Approval permits vendor quote review only; fabrication and production release remain blocked until qualified CAD, DfM, treatment, and first-article gates pass.
          </Text>
          <View style={styles.approvalChoiceGrid}>
            {REVIEWER_APPROVAL_OPTIONS.map(option => {
              const isSelected = reviewerApprovalStatus === option.status;
              return (
                <TouchableOpacity
                  key={option.status}
                  style={[styles.approvalChoiceButton, isSelected && styles.approvalChoiceButtonActive]}
                  onPress={() => setReviewerApprovalStatus(option.status)}
                  accessibilityRole="button"
                  accessibilityLabel={`Set reviewer approval status to ${option.label}`}
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text style={[styles.approvalChoiceLabel, isSelected && styles.approvalChoiceLabelActive]}>
                    {option.label}
                  </Text>
                  <Text style={styles.approvalChoiceDescription}>{option.description}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.quoteFieldLabel}>Reviewer name</Text>
          <TextInput
            style={styles.quoteInput}
            value={reviewerName}
            onChangeText={setReviewerName}
            accessibilityLabel="Reviewer name"
            placeholder="Reviewer name"
            placeholderTextColor={Colors.gray[600]}
          />
          <Text style={styles.quoteFieldLabel}>Reviewer role</Text>
          <TextInput
            style={styles.quoteInput}
            value={reviewerRole}
            onChangeText={setReviewerRole}
            accessibilityLabel="Reviewer role"
            placeholder="CAD reviewer, machinist, engineer, or vendor"
            placeholderTextColor={Colors.gray[600]}
          />
          <Text style={styles.quoteFieldLabel}>Reviewer notes</Text>
          <TextInput
            style={[styles.quoteInput, styles.quoteNotesInput]}
            value={reviewerNotes}
            onChangeText={setReviewerNotes}
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
              {savedVendorApprovalRecord
                ? `Vendor request preparation is enabled by saved review ${savedVendorApprovalRecord.recordId}. Fabrication is still not approved.`
                : 'Vendor request preparation remains locked until an Approved for vendor review record is saved.'}
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
              {!localBom ? 'Generate BOM First' : canPrepareVendorRequest ? 'Prepare Request Email' : 'Saved Approval Required'}
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

      <View style={styles.actionsPanel}>
        <Text style={styles.actionsTitle}>What's Next?</Text>
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

      <View style={{ height: 50 }} />

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
    </ScrollView>
  );
}

const createStyles = (Colors: AppColors) => StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: Spacing.lg,
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
    marginBottom: Spacing.xs,
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
  conceptCard: {
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
    color: Colors.orange[300],
    marginBottom: Spacing.sm,
  },
  conceptDesc: {
    fontSize: FontSizes.sm,
    color: Colors.gray[300],
  },
  readinessPanel: {
    backgroundColor: Colors.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
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
  artifactGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  artifactItem: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.gray[800],
    borderRadius: 8,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  artifactItemReady: {
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
    borderColor: Colors.accent,
  },
  artifactItemTappable: {
    borderStyle: 'dashed',
  },
  artifactItemGenerating: {
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderColor: Colors.secondary,
    borderStyle: 'solid',
  },
  artifactAction: {
    marginTop: 2,
  },
  artifactNameGenerating: {
    color: Colors.secondary,
  },
  artifactName: {
    fontFamily: 'monospace',
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  artifactNameReady: {
    color: Colors.accent,
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
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  manufacturerTitle: {
    fontSize: FontSizes.md,
    fontWeight: 'bold',
    color: Colors.white,
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
  reviewerApprovalCard: {
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
    borderRadius: 8,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  quotePacketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
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
  approvalChoiceLabel: {
    color: Colors.gray[300],
    fontSize: FontSizes.xs,
    fontWeight: 'bold',
    marginBottom: 2,
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
