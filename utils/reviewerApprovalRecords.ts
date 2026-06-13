import { InnovationResult } from '../hooks/useGemini';
import { ManufacturingHandoff } from './manufacturingHandoff';

export type ReviewerApprovalStatus =
  | 'pending_review'
  | 'approved_for_vendor_review'
  | 'changes_requested'
  | 'blocked';

export type ReviewerApproval = {
  status: ReviewerApprovalStatus;
  reviewerName?: string;
  reviewerRole?: string;
  reviewedAt?: string;
  notes?: string;
  approvalScope: string;
  approvedForVendorSubmission: boolean;
  approvedForFabrication: false;
  requiredBeforeRelease: string[];
};

export type ReviewerApprovalRecord = ReviewerApproval & {
  recordType: 'cad_reviewer_approval';
  recordVersion: '0.1-review';
  recordId: string;
  reconstructionId: string;
  savedAt: string;
  machine: {
    machineId?: string;
    machineName?: string;
    inventorySource?: string;
    confidenceScore?: number;
  };
  packageContext: {
    conceptName: string;
    quotePacketVersion: '0.2-review';
    manufacturingHandoffVersion: string;
  };
  cadGateSnapshot: {
    status: ManufacturingHandoff['aiCadGate']['status'];
    confidence: ManufacturingHandoff['aiCadGate']['confidence'];
    recommendedCadLane: ManufacturingHandoff['aiCadGate']['recommendedCadLane'];
  };
  materialTreatmentSnapshot: string[];
  releaseBoundary: string;
};

export const REVIEWER_APPROVAL_SCOPE =
  'Reviewer approval is limited to vendor quote/request readiness. It does not approve fabrication, production ordering, machine operation, or safety-critical release.';

export const REVIEWER_RELEASE_REQUIREMENTS = [
  'Qualified CAD review confirms source dimensions and CAD editability.',
  'Material treatment compatibility and tolerance impact are confirmed.',
  'DfM/vendor review accepts process, finish, lead time, and inspection assumptions.',
  'First-article inspection plan is accepted before fabrication or machine operation.',
];

export const buildReviewerApproval = (
  status: ReviewerApprovalStatus,
  reviewerName: string,
  reviewerRole: string,
  notes: string,
  reviewedAt?: string
): ReviewerApproval => ({
  status,
  reviewerName: reviewerName.trim() || undefined,
  reviewerRole: reviewerRole.trim() || undefined,
  reviewedAt: reviewedAt || (status === 'pending_review' ? undefined : new Date().toISOString()),
  notes: notes.trim() || undefined,
  approvalScope: REVIEWER_APPROVAL_SCOPE,
  approvedForVendorSubmission: status === 'approved_for_vendor_review',
  approvedForFabrication: false,
  requiredBeforeRelease: REVIEWER_RELEASE_REQUIREMENTS,
});

export const createReviewerApprovalRecord = ({
  reconstructionId,
  innovation,
  manufacturingHandoff,
  approval,
}: {
  reconstructionId: string;
  innovation: InnovationResult;
  manufacturingHandoff: ManufacturingHandoff;
  approval: ReviewerApproval;
}): ReviewerApprovalRecord => {
  const savedAt = new Date().toISOString();
  return {
    ...approval,
    reviewedAt: approval.reviewedAt || savedAt,
    recordType: 'cad_reviewer_approval',
    recordVersion: '0.1-review',
    recordId: `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    reconstructionId,
    savedAt,
    machine: {
      machineId: innovation.machineId,
      machineName: innovation.machineName,
      inventorySource: innovation.inventorySource,
      confidenceScore: innovation.confidenceScore,
    },
    packageContext: {
      conceptName: innovation.conceptName,
      quotePacketVersion: '0.2-review',
      manufacturingHandoffVersion: manufacturingHandoff.packetVersion,
    },
    cadGateSnapshot: {
      status: manufacturingHandoff.aiCadGate.status,
      confidence: manufacturingHandoff.aiCadGate.confidence,
      recommendedCadLane: manufacturingHandoff.aiCadGate.recommendedCadLane,
    },
    materialTreatmentSnapshot: manufacturingHandoff.materialTreatmentGuidance.map(item =>
      `${item.partName}: ${item.treatment}; vendor confirmation required: ${item.vendorConfirmationRequired}`
    ),
    releaseBoundary: manufacturingHandoff.aiCadGate.finalReleaseBoundary,
  };
};

export const getLatestReviewerApprovalRecord = (
  records: ReviewerApprovalRecord[] = []
): ReviewerApprovalRecord | null => {
  if (records.length === 0) return null;
  return [...records].sort((a, b) =>
    new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
  )[0];
};

export const getLatestSavedVendorApproval = (
  records: ReviewerApprovalRecord[] = []
): ReviewerApprovalRecord | null => {
  return [...records]
    .filter(record => record.approvedForVendorSubmission)
    .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())[0] || null;
};
