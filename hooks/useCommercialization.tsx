import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { ErrorCode, ProductSubscription, Purchase, useIAP } from 'expo-iap';
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
  avatarUri?: string;
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

let androidIapModuleAvailable: boolean | null = null;

const isExpoIapMissingModuleError = (error: unknown) => {
  return error instanceof Error && error.message.includes("Cannot find native module 'ExpoIap'");
};

const isAndroidIapModuleAvailable = () => {
  if (Platform.OS !== 'android') return false;
  if (androidIapModuleAvailable !== null) return androidIapModuleAvailable;
  try {
    const { requireNativeModule } = require('expo-modules-core') as {
      requireNativeModule: (moduleName: string) => unknown;
    };
    requireNativeModule('ExpoIap');
    androidIapModuleAvailable = true;
  } catch (error) {
    if (!isExpoIapMissingModuleError(error)) throw error;
    androidIapModuleAvailable = false;
  }
  return androidIapModuleAvailable;
};

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
  emailDelivery?: {
    status: 'sent' | 'failed' | 'not_configured';
    provider?: 'resend' | 'file' | 'manual' | string;
    sentAt?: string;
    updatedAt?: string;
    message?: string;
    messageId?: string;
  };
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
  isAndroidInAppBillingAvailable: boolean;
  androidInAppBillingStatus: AndroidInAppBillingStatus;
  androidInAppBillingMessage: string;
  refreshAccount: () => Promise<void>;
  saveProfile: (profile: CommercialProfile) => Promise<void>;
  beginCheckout: (planId: CommercialPlanId) => Promise<void>;
  beginAndroidInAppUpgrade: (planId: CommercialPlanId) => Promise<void>;
  openBillingPortal: () => Promise<void>;
  activateAccessPassword: (password: string) => Promise<void>;
  redeemTesterInvite: (token: string) => Promise<void>;
  resetAccessPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  clearAccessPassword: () => Promise<void>;
}

export type AndroidInAppBillingStatus = 'unavailable' | 'connecting' | 'ready' | 'processing' | 'success' | 'error';

interface AndroidInAppBillingBridge {
  beginUpgrade: (planId: CommercialPlanId) => Promise<void>;
}

const PROFILE_STORAGE_KEY = 'reversr_commercial_profile';
const CLIENT_ID_STORAGE_KEY = 'reversr_commercial_client_id';
const ACCESS_PASSWORD_STORAGE_KEY = 'reversr_commercial_access_password';
const ANDROID_PLAY_SUBSCRIPTION_PRODUCT_IDS: Partial<Record<CommercialPlanId, string>> = {
  pro_shop: String(Constants.expoConfig?.extra?.androidPlayProductProShop || 'reversr_pro_shop_monthly'),
  team: String(Constants.expoConfig?.extra?.androidPlayProductTeam || 'reversr_team_monthly'),
};
const ANDROID_PLAY_PRODUCT_TO_PLAN = Object.entries(ANDROID_PLAY_SUBSCRIPTION_PRODUCT_IDS)
  .reduce<Record<string, CommercialPlanId>>((result, [planId, productId]) => {
    if (productId) result[productId] = planId as CommercialPlanId;
    return result;
  }, {});
const ANDROID_PLAY_SUBSCRIPTION_SKUS = Object.values(ANDROID_PLAY_SUBSCRIPTION_PRODUCT_IDS).filter(Boolean) as string[];

const defaultProfile: CommercialProfile = {
  name: 'Repair shop user',
  email: '',
  shopName: 'ReversR Repair Shop',
  avatarUri: '',
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

const commercialAdminHeaders = async (adminToken: string) => {
  const cleanToken = adminToken.trim();
  if (cleanToken) {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cleanToken}`,
    };
  }
  return getCommercialRequestHeaders({ 'Content-Type': 'application/json' });
};

export const listCommercialAccessGrants = async (
  adminToken: string
): Promise<{ status: 'ok'; grants: CommercialAccessGrantSummary[] }> => {
  const response = await fetch(`${getApiBase()}/api/admin/commercial/access-grants`, {
    method: 'GET',
    headers: await commercialAdminHeaders(adminToken),
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
    headers: await commercialAdminHeaders(adminToken),
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
    headers: await commercialAdminHeaders(adminToken),
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
    headers: await commercialAdminHeaders(adminToken),
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
    headers: await commercialAdminHeaders(adminToken),
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
    headers: await commercialAdminHeaders(adminToken),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to revoke tester invite.');
  return data;
};

export const sendCommercialTesterInviteEmail = async (
  adminToken: string,
  inviteId: string
): Promise<{ status: 'ok'; invite: CommercialTesterInviteSummary }> => {
  const response = await fetch(`${getApiBase()}/api/admin/commercial/tester-invites/${encodeURIComponent(inviteId)}/send`, {
    method: 'POST',
    headers: await commercialAdminHeaders(adminToken),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.invite) throw new Error(data.error || 'Unable to send tester invite email.');
  return data;
};

export const lookupCommercialTesterInvite = async (
  email: string
): Promise<{ status: 'ok'; invite: CommercialTesterInviteSummary }> => {
  const headers = await getCommercialRequestHeaders({ 'Content-Type': 'application/json' });
  const response = await fetch(`${getApiBase()}/api/commercial/tester-invites/lookup`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.invite) throw new Error(data.error || 'Unable to find a tester invite for this email.');
  return data;
};

export const loadCommercialCreditConfig = async (
  adminToken: string
): Promise<{ status: 'ok'; config: CommercialCreditConfig; plans: CommercialPlan[] }> => {
  const response = await fetch(`${getApiBase()}/api/admin/commercial/credit-config`, {
    method: 'GET',
    headers: await commercialAdminHeaders(adminToken),
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
    headers: await commercialAdminHeaders(adminToken),
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to save journey credit configuration.');
  return data;
};

const verifyAndroidPlaySubscription = async ({
  planId,
  productId,
  purchase,
}: {
  planId: CommercialPlanId;
  productId: string;
  purchase: Purchase;
}): Promise<{ status: 'ok'; account: CommercialAccount }> => {
  const purchaseToken = purchase.purchaseToken;
  if (!purchaseToken) throw new Error('Google Play did not return a purchase token.');

  const headers = await getCommercialRequestHeaders({ 'Content-Type': 'application/json' });
  const response = await fetch(`${getApiBase()}/api/billing/google-play/subscription`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      planId,
      productId,
      purchaseToken,
      transactionId: purchase.transactionId,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.account) {
    throw new Error(data.error || 'Unable to verify Google Play subscription.');
  }
  return data;
};

export function CommercialProvider({ children }: { children: React.ReactNode }) {
  const androidIapAvailable = isAndroidIapModuleAvailable();
  const [account, setAccount] = useState<CommercialAccount | null>(null);
  const [profile, setProfileState] = useState<CommercialProfile>(defaultProfile);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [androidInAppBillingStatus, setAndroidInAppBillingStatus] = useState<AndroidInAppBillingStatus>(
    androidIapAvailable ? 'connecting' : 'unavailable'
  );
  const [androidInAppBillingMessage, setAndroidInAppBillingMessage] = useState(
    androidIapAvailable
      ? 'Connecting to Google Play Billing.'
      : Platform.OS === 'android'
        ? 'Google Play in-app billing is unavailable in this runtime.'
        : 'Google Play in-app billing is available only in the Android app.'
  );
  const [androidBillingBridge, setAndroidBillingBridge] = useState<AndroidInAppBillingBridge | null>(null);

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
      avatarUri: nextProfile.avatarUri || '',
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

  const beginAndroidInAppUpgrade = useCallback(async (planId: CommercialPlanId) => {
    if (Platform.OS !== 'android') {
      throw new Error('Google Play in-app upgrades are available only in the Android app.');
    }
    if (!androidBillingBridge) {
      throw new Error(androidInAppBillingMessage || 'Google Play Billing is still connecting.');
    }
    await androidBillingBridge.beginUpgrade(planId);
  }, [androidBillingBridge, androidInAppBillingMessage]);

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
    isAndroidInAppBillingAvailable: Platform.OS === 'android' && androidInAppBillingStatus === 'ready',
    androidInAppBillingStatus,
    androidInAppBillingMessage,
    refreshAccount,
    saveProfile,
    beginCheckout,
    beginAndroidInAppUpgrade,
    openBillingPortal,
    activateAccessPassword,
    redeemTesterInvite,
    resetAccessPassword,
    clearAccessPassword,
  }), [account, profile, loading, error, androidInAppBillingStatus, androidInAppBillingMessage, refreshAccount, saveProfile, beginCheckout, beginAndroidInAppUpgrade, openBillingPortal, activateAccessPassword, redeemTesterInvite, resetAccessPassword, clearAccessPassword]);

  return (
    <CommercialContext.Provider value={value}>
      {children}
      {androidIapAvailable && (
        <AndroidInAppBillingBridgeHost
          account={account}
          setAccount={setAccount}
          refreshAccount={refreshAccount}
          setBridge={setAndroidBillingBridge}
          setStatus={setAndroidInAppBillingStatus}
          setMessage={setAndroidInAppBillingMessage}
        />
      )}
    </CommercialContext.Provider>
  );
}

function AndroidInAppBillingBridgeHost({
  account,
  setAccount,
  refreshAccount,
  setBridge,
  setStatus,
  setMessage,
}: {
  account: CommercialAccount | null;
  setAccount: React.Dispatch<React.SetStateAction<CommercialAccount | null>>;
  refreshAccount: () => Promise<void>;
  setBridge: React.Dispatch<React.SetStateAction<AndroidInAppBillingBridge | null>>;
  setStatus: React.Dispatch<React.SetStateAction<AndroidInAppBillingStatus>>;
  setMessage: React.Dispatch<React.SetStateAction<string>>;
}) {
  const pendingPlanRef = React.useRef<CommercialPlanId | null>(null);
  const finishTransactionRef = React.useRef<((args: { purchase: Purchase; isConsumable?: boolean }) => Promise<void>) | null>(null);
  const beginUpgradeRef = React.useRef<(planId: CommercialPlanId) => Promise<void>>(async () => {
    throw new Error('Google Play Billing is still connecting.');
  });

  const iap = useIAP({
    onPurchaseSuccess: async (purchase) => {
      const planId = pendingPlanRef.current || ANDROID_PLAY_PRODUCT_TO_PLAN[purchase.productId];
      const productId = purchase.productId;
      if (!planId || !productId) {
        setStatus('error');
        setMessage('Google Play returned a purchase that does not map to a ReversR plan.');
        return;
      }

      setStatus('processing');
      setMessage('Verifying Google Play subscription with ReversR.');
      try {
        const result = await verifyAndroidPlaySubscription({ planId, productId, purchase });
        setAccount(result.account);
        await finishTransactionRef.current?.({ purchase, isConsumable: false });
        await refreshAccount();
        setStatus('success');
        setMessage(`${result.account.billing.planLabel} is active through Google Play.`);
      } catch (error: any) {
        setStatus('error');
        setMessage(error?.message || 'Google Play subscription verification failed.');
      } finally {
        pendingPlanRef.current = null;
      }
    },
    onPurchaseError: (purchaseError) => {
      if (purchaseError.code === ErrorCode.UserCancelled) {
        setStatus('ready');
        setMessage('Google Play purchase cancelled.');
        return;
      }
      setStatus('error');
      setMessage(purchaseError.message || 'Google Play purchase failed.');
      pendingPlanRef.current = null;
    },
    onError: (billingError) => {
      setStatus('error');
      setMessage(billingError.message || 'Google Play Billing is not available.');
    },
  });

  useEffect(() => {
    finishTransactionRef.current = iap.finishTransaction;
  }, [iap.finishTransaction]);

  useEffect(() => {
    if (!iap.connected) {
      setStatus('connecting');
      setMessage('Connecting to Google Play Billing.');
      return;
    }

    if (ANDROID_PLAY_SUBSCRIPTION_SKUS.length === 0) {
      setStatus('error');
      setMessage('Google Play product IDs are not configured for ReversR plans.');
      return;
    }

    iap.fetchProducts({ skus: ANDROID_PLAY_SUBSCRIPTION_SKUS, type: 'subs' })
      .then(() => iap.getAvailablePurchases())
      .then(() => iap.getActiveSubscriptions(ANDROID_PLAY_SUBSCRIPTION_SKUS))
      .then(() => {
        setStatus('ready');
        setMessage('Google Play Billing is ready for in-app upgrades.');
      })
      .catch((error: any) => {
        setStatus('error');
        setMessage(error?.message || 'Unable to load Google Play subscriptions.');
      });
  }, [iap.connected]);

  const beginUpgrade = useCallback(async (planId: CommercialPlanId) => {
    const productId = ANDROID_PLAY_SUBSCRIPTION_PRODUCT_IDS[planId];
    if (!productId) throw new Error('This plan is not configured as a Google Play subscription.');
    if (!iap.connected) throw new Error('Google Play Billing is still connecting.');

    const subscription = iap.subscriptions.find(item => item.id === productId);
    if (!subscription) {
      throw new Error('Google Play subscription product is not available yet. Confirm the product is active in Play Console and this build was installed from a testing track.');
    }

    const currentPurchase = iap.availablePurchases.find(purchase => (
      purchase.productId !== productId && Boolean(ANDROID_PLAY_PRODUCT_TO_PLAN[purchase.productId])
    ));
    const subscriptionOffers = subscriptionOffersForPurchase(subscription);
    if (subscriptionOffers.length === 0) {
      throw new Error('Google Play subscription offer is missing. Add and activate a base plan or offer in Play Console.');
    }

    pendingPlanRef.current = planId;
    setStatus('processing');
    setMessage(`Opening Google Play checkout for ${account?.plans.find(plan => plan.id === planId)?.label || 'this plan'}.`);

    await iap.requestPurchase({
      request: {
        google: {
          skus: [productId],
          subscriptionOffers,
          ...(currentPurchase?.purchaseToken ? {
            purchaseToken: currentPurchase.purchaseToken,
            replacementMode: 1,
          } : {}),
        },
      },
      type: 'subs',
    });
  }, [account?.plans, iap]);

  beginUpgradeRef.current = beginUpgrade;

  useEffect(() => {
    setBridge(() => ({
      beginUpgrade: (planId) => beginUpgradeRef.current(planId),
    }));
    return () => setBridge(null);
  }, [setBridge]);

  return null;
}

const subscriptionOffersForPurchase = (subscription: ProductSubscription) => (
  (subscription.subscriptionOffers || [])
    .map(offer => ({
      sku: subscription.id,
      offerToken: offer.offerTokenAndroid || '',
    }))
    .filter(offer => Boolean(offer.offerToken))
);

export const useCommercialization = () => {
  const context = useContext(CommercialContext);
  if (!context) {
    throw new Error('useCommercialization must be used inside CommercialProvider.');
  }
  return context;
};
