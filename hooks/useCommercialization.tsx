import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBase } from '../utils/apiBase';

export type CommercialPlanId = 'free' | 'pro_shop' | 'team' | 'tester';

export interface CommercialPlan {
  id: CommercialPlanId;
  label: string;
  monthlyCredits: number | null;
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
  unlimitedCredits?: boolean;
  seats: number;
  canExportQuotePacket: boolean;
  canUseInventoryConnectors: boolean;
  canUseCloudHistory: boolean;
  canManageTeam: boolean;
  canUseCadReviewQueue: boolean;
}

export interface CommercialUsage {
  month: string;
  usedCredits: number;
  remainingCredits: number | null;
  monthlyCredits: number | null;
  unlimitedCredits?: boolean;
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
    seats: number;
  }>;
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
}

const PROFILE_STORAGE_KEY = 'reversr_commercial_profile';
const CLIENT_ID_STORAGE_KEY = 'reversr_commercial_client_id';

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
  const [clientId, profile] = await Promise.all([getCommercialClientId(), loadCommercialProfile()]);
  return {
    ...extraHeaders,
    'X-ReversR-Client-Id': clientId,
    'X-ReversR-Profile-Name': profile.name || defaultProfile.name,
    'X-ReversR-Profile-Email': profile.email || '',
    'X-ReversR-Shop-Name': profile.shopName || defaultProfile.shopName,
  };
};

const buildBillingReturnUrl = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/account`;
  }
  return 'https://reversr.vercel.app/account';
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
  }), [account, profile, loading, error, refreshAccount, saveProfile, beginCheckout, openBillingPortal]);

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
