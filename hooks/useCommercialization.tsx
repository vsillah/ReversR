import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBase } from '../utils/apiBase';

export type CommercialPlanId = 'free' | 'pro_shop' | 'team' | 'tester';

export interface CommercialPlan {
  id: CommercialPlanId;
  label: string;
  monthlyCredits: number | null;
  creditPeriod?: 'day' | 'week' | 'month';
  seats: number;
  priceMonthly: number;
  internal?: boolean;
  unlimitedCredits?: boolean;
  features: string[];
}

export interface CommercialProfile {
  id?: string;
  name: string;
  email: string;
  role?: string;
  shopName: string;
}

export interface CommercialEntitlements {
  planId: CommercialPlanId;
  planLabel: string;
  monthlyCredits: number | null;
  creditPeriod?: 'day' | 'week' | 'month';
  unlimitedCredits?: boolean;
  seats: number;
  canExportQuotePacket: boolean;
  canUseInventoryConnectors: boolean;
  canUseCloudHistory: boolean;
  canManageTeam: boolean;
  canUseCadReviewQueue: boolean;
  canUseAdminConsole?: boolean;
}

export interface CommercialUsage {
  month: string;
  period?: 'day' | 'week' | 'month';
  periodKey?: string;
  usedCredits: number;
  remainingCredits: number | null;
  monthlyCredits: number | null;
  unlimitedCredits?: boolean;
  resetAt: string;
  resetInSeconds: number;
  events: Array<{
    id: string;
    feature: string;
    credits: number;
    createdAt: string;
  }>;
}

export interface CommercialAccount {
  status: 'ok';
  profile: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  shop: {
    id: string;
    name: string;
    billingOwnerUserId: string;
  };
  billing: {
    planId: CommercialPlanId;
    basePlanId?: CommercialPlanId;
    planLabel: string;
    subscriptionStatus: string;
    currentPeriodEnd: string;
    hasStripeCustomer: boolean;
    billingLinks?: CommercialBillingLinks;
  };
  entitlements: CommercialEntitlements;
  usage: CommercialUsage;
  plans: CommercialPlan[];
  creditCosts: Record<string, number>;
  access: {
    type: string;
    grantId: string;
    role?: string;
    requiresPasswordReset: boolean;
  } | null;
}

export interface CommercialBillingLinks {
  accountUrl: string;
  upgradeUrl: string;
  canManageOnWeb: boolean;
  plans: Array<{
    id: CommercialPlanId;
    label: string;
    priceMonthly: number;
    monthlyCredits: number | null;
    creditPeriod?: 'day' | 'week' | 'month';
    seats: number;
  }>;
}

export interface CommercialCreditConfig {
  planCreditRules: Record<string, {
    credits: number | null;
    period: 'day' | 'week' | 'month';
  }>;
}

export interface CommercialAccessGrantSummary {
  grantId: string;
  clientId: string;
  email: string;
  profileName: string;
  shopName: string;
  planId: CommercialPlanId;
  role?: 'tester' | 'super_admin';
  active: boolean;
  mustResetPassword: boolean;
  createdAt: string;
  updatedAt: string;
  lastActivatedAt: string;
}

export interface CommercialAccessGrantPayload {
  clientId?: string;
  email?: string;
  profileName?: string;
  shopName?: string;
  role?: 'tester' | 'super_admin';
  startingPassword: string;
}

export type TesterInvitePlatform = 'ios' | 'android' | 'both' | 'web';

export interface CommercialTesterInviteSummary {
  inviteId: string;
  email: string;
  platform: TesterInvitePlatform;
  status: 'pending' | 'redeemed' | 'revoked' | 'expired';
  active: boolean;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  redeemedAt: string;
  redeemedClientId: string;
  grantId: string;
  activationCode?: string;
  inviteUrl?: string;
}

export interface CommercialTesterInviteCreatePayload {
  email: string;
  platform?: TesterInvitePlatform;
  expiresInDays?: number;
}

export interface CommercialCreditConfigPayload {
  planId: CommercialPlanId;
  credits: number;
  period: 'day' | 'week' | 'month';
}

interface CommercialContextValue {
  account: CommercialAccount | null;
  profile: CommercialProfile;
  loading: boolean;
  error: string | null;
  isWebBillingAvailable: boolean;
  refreshAccount: () => Promise<void>;
  saveProfile: (profile: CommercialProfile) => Promise<void>;
  beginCheckout: (planId: CommercialPlanId) => Promise<void>;
  openBillingPortal: () => Promise<void>;
  activateAccessPassword: (password: string) => Promise<void>;
  redeemTesterInvite: (token: string) => Promise<void>;
  resetAccessPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  clearAccessPassword: () => Promise<void>;
}

const PROFILE_STORAGE_KEY = 'reversr_commercial_profile';
const CLIENT_ID_STORAGE_KEY = 'reversr_commercial_client_id';
const ACCESS_PASSWORD_STORAGE_KEY = 'reversr_commercial_access_password';

const defaultProfile: CommercialProfile = {
  name: 'Repair shop user',
  email: '',
  shopName: 'ReversR Repair Shop',
};

const CommercialContext = createContext<CommercialContextValue | null>(null);

const generateClientId = () => `client_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;

export const getCommercialClientId = async () => {
  const existing = await AsyncStorage.getItem(CLIENT_ID_STORAGE_KEY);
  if (existing) return existing;
  const next = generateClientId();
  await AsyncStorage.setItem(CLIENT_ID_STORAGE_KEY, next);
  return next;
};

export const loadCommercialProfile = async (): Promise<CommercialProfile> => {
  const saved = await AsyncStorage.getItem(PROFILE_STORAGE_KEY);
  if (!saved) return defaultProfile;
  try {
    return { ...defaultProfile, ...JSON.parse(saved) };
  } catch {
    return defaultProfile;
  }
};

export const getCommercialRequestHeaders = async (extraHeaders: Record<string, string> = {}) => {
  const [clientId, profile, accessPassword] = await Promise.all([
    getCommercialClientId(),
    loadCommercialProfile(),
    AsyncStorage.getItem(ACCESS_PASSWORD_STORAGE_KEY),
  ]);
  const headers: Record<string, string> = {
    ...extraHeaders,
    'X-ReversR-Client-Id': clientId,
    'X-ReversR-Profile-Name': profile.name || defaultProfile.name,
    'X-ReversR-Profile-Email': profile.email || '',
    'X-ReversR-Shop-Name': profile.shopName || defaultProfile.shopName,
  };
  if (accessPassword) {
    headers['X-ReversR-Access-Password'] = accessPassword;
  }
  return headers;
};

const buildBillingReturnUrl = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/account`;
  }
  return 'https://reversr.vercel.app/account';
};

const adminHeaders = (adminToken: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${adminToken}`,
});

export const listCommercialAccessGrants = async (
  adminToken: string
): Promise<{ status: 'ok'; grants: CommercialAccessGrantSummary[] }> => {
  const response = await fetch(`${getApiBase()}/api/admin/commercial/access-grants`, {
    method: 'GET',
    headers: adminHeaders(adminToken),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to load commercial access grants.');
  return data;
};

export const saveCommercialAccessGrant = async (
  adminToken: string,
  payload: CommercialAccessGrantPayload
): Promise<{ status: 'ok'; grant: CommercialAccessGrantSummary }> => {
  const response = await fetch(`${getApiBase()}/api/admin/commercial/access-grants`, {
    method: 'POST',
    headers: adminHeaders(adminToken),
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to save commercial access grant.');
  return data;
};

export const revokeCommercialAccessGrant = async (
  adminToken: string,
  grantId: string
): Promise<{ status: 'ok'; grantId: string; revoked: boolean }> => {
  const response = await fetch(`${getApiBase()}/api/admin/commercial/access-grants/${encodeURIComponent(grantId)}`, {
    method: 'DELETE',
    headers: adminHeaders(adminToken),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to revoke commercial access grant.');
  return data;
};

export const listCommercialTesterInvites = async (
  adminToken: string
): Promise<{ status: 'ok'; invites: CommercialTesterInviteSummary[] }> => {
  const response = await fetch(`${getApiBase()}/api/admin/commercial/tester-invites`, {
    method: 'GET',
    headers: adminHeaders(adminToken),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to load tester invites.');
  return data;
};

export const createCommercialTesterInvite = async (
  adminToken: string,
  payload: CommercialTesterInviteCreatePayload
): Promise<{ status: 'ok'; invite: CommercialTesterInviteSummary; invites: CommercialTesterInviteSummary[] }> => {
  const response = await fetch(`${getApiBase()}/api/admin/commercial/tester-invites`, {
    method: 'POST',
    headers: adminHeaders(adminToken),
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to create tester invite.');
  return data;
};

export const revokeCommercialTesterInvite = async (
  adminToken: string,
  inviteId: string
): Promise<{ status: 'ok'; inviteId: string; revoked: boolean; invite?: CommercialTesterInviteSummary }> => {
  const response = await fetch(`${getApiBase()}/api/admin/commercial/tester-invites/${encodeURIComponent(inviteId)}`, {
    method: 'DELETE',
    headers: adminHeaders(adminToken),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to revoke tester invite.');
  return data;
};

export const loadCommercialCreditConfig = async (
  adminToken: string
): Promise<{ status: 'ok'; config: CommercialCreditConfig; plans: CommercialPlan[] }> => {
  const response = await fetch(`${getApiBase()}/api/admin/commercial/credit-config`, {
    method: 'GET',
    headers: adminHeaders(adminToken),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to load journey credit configuration.');
  return data;
};

export const saveCommercialCreditConfig = async (
  adminToken: string,
  payload: CommercialCreditConfigPayload
): Promise<{ status: 'ok'; config: CommercialCreditConfig; plans: CommercialPlan[] }> => {
  const response = await fetch(`${getApiBase()}/api/admin/commercial/credit-config`, {
    method: 'POST',
    headers: adminHeaders(adminToken),
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to save journey credit configuration.');
  return data;
};

export function CommercialProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<CommercialAccount | null>(null);
  const [profile, setProfileState] = useState<CommercialProfile>(defaultProfile);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshAccount = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await getCommercialRequestHeaders();
      const response = await fetch(`${getApiBase()}/api/me`, { headers });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Account request failed (${response.status})`);
      }
      const data = await response.json();
      setAccount(data);
    } catch (requestError: any) {
      setError(requestError?.message || 'Unable to load commercial account.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCommercialProfile()
      .then(savedProfile => {
        setProfileState(savedProfile);
        return refreshAccount();
      })
      .catch(() => refreshAccount());
  }, [refreshAccount]);

  const saveProfile = useCallback(async (nextProfile: CommercialProfile) => {
    const cleanProfile = {
      name: nextProfile.name.trim() || defaultProfile.name,
      email: nextProfile.email.trim().toLowerCase(),
      shopName: nextProfile.shopName.trim() || defaultProfile.shopName,
    };
    await AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(cleanProfile));
    setProfileState(cleanProfile);
    setLoading(true);
    setError(null);
    try {
      const headers = await getCommercialRequestHeaders({ 'Content-Type': 'application/json' });
      const response = await fetch(`${getApiBase()}/api/commercial/profile`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ profile: cleanProfile }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Profile save failed (${response.status})`);
      }
      setAccount(await response.json());
    } catch (requestError: any) {
      setError(requestError?.message || 'Unable to save profile.');
    } finally {
      setLoading(false);
    }
  }, []);

  const beginCheckout = useCallback(async (planId: CommercialPlanId) => {
    if (Platform.OS !== 'web') {
      throw new Error('Stripe checkout is managed on the ReversR web account page for mobile store compliance.');
    }
    const headers = await getCommercialRequestHeaders({ 'Content-Type': 'application/json' });
    const returnUrl = buildBillingReturnUrl();
    const response = await fetch(`${getApiBase()}/api/billing/checkout-session`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        planId,
        successUrl: `${returnUrl}?checkout=success`,
        cancelUrl: `${returnUrl}?checkout=cancelled`,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.url) throw new Error(data.error || 'Unable to start Stripe Checkout.');
    await Linking.openURL(data.url);
  }, []);

  const openBillingPortal = useCallback(async () => {
    if (Platform.OS !== 'web') {
      throw new Error('Billing is managed on the ReversR web account page for mobile store compliance.');
    }
    const headers = await getCommercialRequestHeaders({ 'Content-Type': 'application/json' });
    const response = await fetch(`${getApiBase()}/api/billing/portal-session`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ returnUrl: buildBillingReturnUrl() }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.url) throw new Error(data.error || 'Unable to open billing portal.');
    await Linking.openURL(data.url);
  }, []);

  const activateAccessPassword = useCallback(async (password: string) => {
    const cleanPassword = password.trim();
    if (!cleanPassword) throw new Error('Enter the access password from the ReversR admin.');
    const headers = await getCommercialRequestHeaders({ 'Content-Type': 'application/json' });
    headers['X-ReversR-Access-Password'] = cleanPassword;
    const response = await fetch(`${getApiBase()}/api/commercial/access/activate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ accessPassword: cleanPassword }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.account) throw new Error(data.error || 'Unable to activate commercial access.');
    await AsyncStorage.setItem(ACCESS_PASSWORD_STORAGE_KEY, cleanPassword);
    setAccount(data.account);
    setError(null);
  }, []);

  const resetAccessPassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const cleanCurrentPassword = currentPassword.trim();
    const cleanNewPassword = newPassword.trim();
    if (!cleanCurrentPassword || !cleanNewPassword) throw new Error('Enter the current and new access passwords.');
    const headers = await getCommercialRequestHeaders({ 'Content-Type': 'application/json' });
    headers['X-ReversR-Access-Password'] = cleanCurrentPassword;
    const response = await fetch(`${getApiBase()}/api/commercial/access/reset-password`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        currentPassword: cleanCurrentPassword,
        newPassword: cleanNewPassword,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.account) throw new Error(data.error || 'Unable to reset access password.');
    await AsyncStorage.setItem(ACCESS_PASSWORD_STORAGE_KEY, cleanNewPassword);
    setAccount(data.account);
    setError(null);
  }, []);

  const redeemTesterInvite = useCallback(async (token: string) => {
    const cleanToken = token.trim();
    if (!cleanToken) throw new Error('Enter the tester invite code from ReversR admin.');
    const headers = await getCommercialRequestHeaders({ 'Content-Type': 'application/json' });
    const response = await fetch(`${getApiBase()}/api/commercial/tester-invites/redeem`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ token: cleanToken }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.account) throw new Error(data.error || 'Unable to redeem tester invite.');
    await AsyncStorage.removeItem(ACCESS_PASSWORD_STORAGE_KEY);
    setAccount(data.account);
    setError(null);
  }, []);

  const clearAccessPassword = useCallback(async () => {
    await AsyncStorage.removeItem(ACCESS_PASSWORD_STORAGE_KEY);
    await refreshAccount();
  }, [refreshAccount]);

  const value = useMemo<CommercialContextValue>(() => ({
    account,
    profile,
    loading,
    error,
    isWebBillingAvailable: Platform.OS === 'web',
    refreshAccount,
    saveProfile,
    beginCheckout,
    openBillingPortal,
    activateAccessPassword,
    redeemTesterInvite,
    resetAccessPassword,
    clearAccessPassword,
  }), [account, profile, loading, error, refreshAccount, saveProfile, beginCheckout, openBillingPortal, activateAccessPassword, redeemTesterInvite, resetAccessPassword, clearAccessPassword]);

  return (
    <CommercialContext.Provider value={value}>
      {children}
    </CommercialContext.Provider>
  );
}

export const useCommercialization = () => {
  const context = useContext(CommercialContext);
  if (!context) {
    throw new Error('useCommercialization must be used inside CommercialProvider.');
  }
  return context;
};
