import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import {
  CommercialAccount,
  getCommercialClientId,
  getCommercialRequestHeaders,
  loadCommercialProfile,
} from './useCommercialization';
import { getApiBase } from '../utils/apiBase';

export type SupportIssueSeverity = 'low' | 'normal' | 'high' | 'critical';
export type SupportIssueStatus = 'open' | 'triaging' | 'ai_remediated' | 'executing' | 'engineering_queued' | 'execution_failed' | 'resolved';
export type SupportRemediationActionType =
  | 'populate_resolution_fields'
  | 'create_user_notification'
  | 'create_agent_handoff'
  | 'set_issue_status'
  | 'append_audit_event';

export interface SupportRemediationAction {
  actionId: string;
  type: SupportRemediationActionType;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  params: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string;
  createdAt: string;
  completedAt: string;
}

export interface SupportRemediationJob {
  jobId: string;
  issueId: string;
  status: string;
  branchName: string;
  title: string;
  problemStatement: string;
  suspectedFiles: string[];
  implementationPlan: string[];
  acceptanceCriteria: string[];
  prBodyDraft: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportIssueRemediation {
  summary: string;
  rootCause: string;
  resolutionType?: 'operational' | 'code';
  resolutionSteps: string[];
  userMessage: string;
  followUpChecks: string[];
  automationActions: string[];
  suspectedFiles?: string[];
  implementationPlan?: string[];
  acceptanceCriteria?: string[];
  prTitle?: string;
  prBodyDraft?: string;
  confidence: 'low' | 'medium' | 'high';
  generatedAt?: string;
  generatedBy?: string;
}

export interface SupportIssue {
  issueId: string;
  status: SupportIssueStatus;
  severity: SupportIssueSeverity;
  title: string;
  description: string;
  clientId: string;
  profileName: string;
  profileEmail: string;
  shopName: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string;
  resolutionSummary: string;
  userMessage: string;
  sessionLog?: Record<string, unknown>;
  sessionLogKeys: string[];
  aiRemediation: SupportIssueRemediation | null;
  remediationActions: SupportRemediationAction[];
  remediationJobId: string;
  remediationJob: SupportRemediationJob | null;
}

export interface SupportNotification {
  notificationId: string;
  issueId: string;
  clientId: string;
  title: string;
  message: string;
  status: 'unread' | 'read';
  createdAt: string;
  readAt: string;
}

export interface SupportSessionLogInput {
  account: CommercialAccount | null;
  currentScreen?: string;
  workflowPhase?: number;
  lastAction?: string;
  recentErrors?: string[];
  notes?: string;
}

export const buildSupportSessionLog = async ({
  account,
  currentScreen = 'Settings',
  workflowPhase,
  lastAction = '',
  recentErrors = [],
  notes = '',
}: SupportSessionLogInput) => {
  const [deviceClientId, profile] = await Promise.all([
    getCommercialClientId(),
    loadCommercialProfile(),
  ]);

  return {
    platform: Platform.OS,
    appVersion: Application.nativeApplicationVersion || Constants.expoConfig?.version || 'dev',
    nativeBuildVersion: Application.nativeBuildVersion || '',
    runtimeVersion: typeof Constants.expoConfig?.runtimeVersion === 'string'
      ? Constants.expoConfig.runtimeVersion
      : JSON.stringify(Constants.expoConfig?.runtimeVersion || ''),
    deviceClientId,
    profileEmail: profile.email || account?.profile.email || '',
    profileName: profile.name || account?.profile.name || '',
    shopName: profile.shopName || account?.shop.name || '',
    accountRole: account?.access?.role || account?.profile.role || 'guest',
    planId: account?.billing.planId || 'free',
    currentScreen,
    workflowPhase: workflowPhase ? String(workflowPhase) : '',
    lastAction,
    recentErrors,
    notes,
  };
};

const adminHeaders = async (adminToken: string) => {
  const cleanToken = adminToken.trim();
  if (cleanToken) {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cleanToken}`,
    };
  }
  return getCommercialRequestHeaders({ 'Content-Type': 'application/json' });
};

export const submitSupportIssue = async (payload: {
  title: string;
  description: string;
  severity: SupportIssueSeverity;
  sessionLog: Record<string, unknown>;
}): Promise<{ status: 'ok'; issue: SupportIssue }> => {
  const response = await fetch(`${getApiBase()}/api/support/issues`, {
    method: 'POST',
    headers: await getCommercialRequestHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.issue) throw new Error(data.error || 'Unable to submit support issue.');
  return data;
};

export const listSupportNotifications = async (): Promise<{ status: 'ok'; notifications: SupportNotification[] }> => {
  const response = await fetch(`${getApiBase()}/api/support/notifications`, {
    method: 'GET',
    headers: await getCommercialRequestHeaders(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to load support notifications.');
  return data;
};

export const markSupportNotificationRead = async (
  notificationId: string
): Promise<{ status: 'ok'; notification: SupportNotification }> => {
  const response = await fetch(`${getApiBase()}/api/support/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: 'POST',
    headers: await getCommercialRequestHeaders({ 'Content-Type': 'application/json' }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.notification) throw new Error(data.error || 'Unable to mark support notification read.');
  return data;
};

export const listAdminSupportIssues = async (
  adminToken: string
): Promise<{ status: 'ok'; issues: SupportIssue[] }> => {
  const response = await fetch(`${getApiBase()}/api/admin/support/issues`, {
    method: 'GET',
    headers: await adminHeaders(adminToken),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to load issue reports.');
  return data;
};

export const loadAdminSupportIssue = async (
  adminToken: string,
  issueId: string
): Promise<{ status: 'ok'; issue: SupportIssue }> => {
  const response = await fetch(`${getApiBase()}/api/admin/support/issues/${encodeURIComponent(issueId)}`, {
    method: 'GET',
    headers: await adminHeaders(adminToken),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.issue) throw new Error(data.error || 'Unable to load issue report.');
  return data;
};

export const remediateAdminSupportIssue = async (
  adminToken: string,
  issueId: string
): Promise<{ status: 'ok'; issue: SupportIssue }> => {
  const response = await fetch(`${getApiBase()}/api/admin/support/issues/${encodeURIComponent(issueId)}/remediate`, {
    method: 'POST',
    headers: await adminHeaders(adminToken),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.issue) throw new Error(data.error || 'Unable to run AI remediation.');
  return data;
};

export const executeAdminSupportIssueRemediation = async (
  adminToken: string,
  issueId: string
): Promise<{ status: 'ok'; issue: SupportIssue }> => {
  const response = await fetch(`${getApiBase()}/api/admin/support/issues/${encodeURIComponent(issueId)}/execute-remediation`, {
    method: 'POST',
    headers: await adminHeaders(adminToken),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.issue) throw new Error(data.error || 'Unable to execute AI remediation.');
  return data;
};

export const listAdminSupportRemediationJobs = async (
  adminToken: string
): Promise<{ status: 'ok'; jobs: SupportRemediationJob[] }> => {
  const response = await fetch(`${getApiBase()}/api/admin/support/remediation-jobs`, {
    method: 'GET',
    headers: await adminHeaders(adminToken),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to load support remediation jobs.');
  return data;
};

export const resolveAdminSupportIssue = async (
  adminToken: string,
  issueId: string,
  payload: {
    resolutionSummary?: string;
    userMessage?: string;
  }
): Promise<{ status: 'ok'; issue: SupportIssue; notification: SupportNotification }> => {
  const response = await fetch(`${getApiBase()}/api/admin/support/issues/${encodeURIComponent(issueId)}/resolve`, {
    method: 'POST',
    headers: await adminHeaders(adminToken),
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.issue) throw new Error(data.error || 'Unable to resolve issue report.');
  return data;
};
