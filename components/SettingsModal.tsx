import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, Linking, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { AppColors } from '../constants/theme';
import {
  CommercialAccessGrantSummary,
  CommercialPlan,
  CommercialPlanId,
  CommercialProfile,
  CommercialCreditConfig,
  CommercialTesterInviteSummary,
  TesterInvitePlatform,
  createCommercialTesterInvite,
  loadCommercialCreditConfig,
  listCommercialAccessGrants,
  listCommercialTesterInvites,
  lookupCommercialTesterInvite,
  revokeCommercialAccessGrant,
  revokeCommercialTesterInvite,
  saveCommercialAccessGrant,
  saveCommercialCreditConfig,
  useCommercialization,
} from '../hooks/useCommercialization';
import { useAppTheme } from '../hooks/useAppTheme';
import {
  AiRuntimeStatus,
  AdminCredentialSummary,
  InventoryConnector,
  deleteInventoryCredential,
  getAiRuntimeStatus,
  getApiBase,
  isAdminCredentialSettingsEnabled,
  isLocalProviderSettingsEnabled,
  listInventoryCredentials,
  saveInventoryCredential,
} from '../hooks/useGemini';
import { formatCreditPeriod, formatJourneyCreditLabel, formatResetCountdown } from '../utils/commercialUsage';
import {
  AUTH_MODE_OPTIONS,
  CONNECTOR_TYPE_OPTIONS,
  defaultAuthModeForConnectorType,
  defaultConnector,
  getAuthModeLabel,
  getConnectorTypeLabel,
  loadInventoryConnector,
  saveInventoryConnector,
} from '../utils/inventoryConnector';

export type SettingsSection = 'account' | 'inventory' | 'admin' | 'legal';
type SettingsTooltip = 'billing' | 'email' | 'invite' | 'password' | null;

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  initialSection?: SettingsSection;
}

const FALLBACK_COMMERCIAL_PLANS: CommercialPlan[] = [
  {
    id: 'free',
    label: 'Free',
    monthlyCredits: 5,
    creditPeriod: 'week',
    seats: 1,
    priceMonthly: 0,
    features: ['Five reconstruction journeys/week', 'Demo/public inventory', 'Basic preview exports'],
  },
  {
    id: 'pro_shop',
    label: 'Pro Shop',
    monthlyCredits: 100,
    creditPeriod: 'month',
    seats: 1,
    priceMonthly: 49,
    features: ['Full BOM/spec export', 'Quote packet export', 'Cloud-ready shop history', 'Reviewer approval records'],
  },
  {
    id: 'team',
    label: 'Team',
    monthlyCredits: 500,
    creditPeriod: 'month',
    seats: 3,
    priceMonthly: 149,
    features: ['Shared shop history', 'Inventory connectors', 'Admin controls', 'Team seat management'],
  },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizeEmail = (value = '') => value.trim().toLowerCase();
const isValidEmail = (value = '') => EMAIL_PATTERN.test(normalizeEmail(value));

export default function SettingsModal({ visible, onClose, initialSection = 'account' }: SettingsModalProps) {
  const { colors: Colors, mode: themeMode, setMode: setThemeMode } = useAppTheme();
  const {
    account,
    profile,
    loading: accountLoading,
    error: accountError,
    isWebBillingAvailable,
    refreshAccount,
    saveProfile,
    beginCheckout,
    openBillingPortal,
    activateAccessPassword,
    redeemTesterInvite,
    resetAccessPassword,
    clearAccessPassword,
  } = useCommercialization();
  const styles = createStyles(Colors);
  const [provider, setProvider] = useState<'gemini' | 'ollama'>('gemini');
  const [ollamaModel, setOllamaModel] = useState('qwen3.5:0.8b');
  const [inventoryConnector, setInventoryConnector] = useState<InventoryConnector>(defaultConnector);
  const [inventoryDropdown, setInventoryDropdown] = useState<'connectorType' | 'authMode' | null>(null);
  const [adminToken, setAdminToken] = useState('');
  const [adminStatus, setAdminStatus] = useState<string | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [registryEnabled, setRegistryEnabled] = useState<boolean | null>(null);
  const [credentials, setCredentials] = useState<AdminCredentialSummary[]>([]);
  const [credentialRef, setCredentialRef] = useState('');
  const [credentialMode, setCredentialMode] = useState<'api_key' | 'oauth'>('api_key');
  const [credentialValue, setCredentialValue] = useState('');
  const [credentialHeaderName, setCredentialHeaderName] = useState('X-API-Key');
  const appExtra = (Constants.expoConfig?.extra || {}) as Record<string, string | undefined>;
  const localProviderSettingsEnabled = isLocalProviderSettingsEnabled();
  const adminCredentialSettingsEnabled = isAdminCredentialSettingsEnabled();
  const canUseInventoryConnectors = account?.entitlements.canUseInventoryConnectors ?? false;
  const [aiRuntimeStatus, setAiRuntimeStatus] = useState<AiRuntimeStatus | null>(null);
  const [aiStatusLoading, setAiStatusLoading] = useState(false);
  const [commercialProfile, setCommercialProfile] = useState<CommercialProfile>(profile);
  const [commercialStatus, setCommercialStatus] = useState<string | null>(null);
  const [accessPassword, setAccessPassword] = useState('');
  const [newAccessPassword, setNewAccessPassword] = useState('');
  const [testerInviteCode, setTesterInviteCode] = useState('');
  const [accessMethod, setAccessMethod] = useState<'invite' | 'password'>('invite');
  const [passwordResetOpen, setPasswordResetOpen] = useState(false);
  const [accessStatus, setAccessStatus] = useState<string | null>(null);
  const [emailTouched, setEmailTouched] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState<SettingsTooltip>(null);
  const [accessGrants, setAccessGrants] = useState<CommercialAccessGrantSummary[]>([]);
  const [testerInvites, setTesterInvites] = useState<CommercialTesterInviteSummary[]>([]);
  const [creditConfig, setCreditConfig] = useState<CommercialCreditConfig | null>(null);
  const [creditPlanId, setCreditPlanId] = useState<CommercialPlanId>('free');
  const [creditAllowance, setCreditAllowance] = useState('5');
  const [creditPeriod, setCreditPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePlatform, setInvitePlatform] = useState<TesterInvitePlatform>('both');
  const [grantEmail, setGrantEmail] = useState('');
  const [grantRole, setGrantRole] = useState<'tester' | 'super_admin'>('tester');
  const [grantStartingPassword, setGrantStartingPassword] = useState('');
  const [countdownNow, setCountdownNow] = useState(Date.now());
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('account');
  const [inventoryEditing, setInventoryEditing] = useState(false);

  const policyLinks = [
    {
      label: 'Privacy Policy',
      url: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL || appExtra.privacyPolicyUrl,
      icon: 'shield-checkmark-outline' as const,
    },
    {
      label: 'Terms of Service',
      url: process.env.EXPO_PUBLIC_TERMS_URL || appExtra.termsUrl,
      icon: 'document-text-outline' as const,
    },
    {
      label: 'Support',
      url: process.env.EXPO_PUBLIC_SUPPORT_URL || appExtra.supportUrl,
      icon: 'help-circle-outline' as const,
    },
  ];

  useEffect(() => {
    if (visible) {
      setSettingsSection(initialSection);
      loadSettings();
      loadAiRuntimeStatus();
      refreshAccount();
    } else {
      setCredentialValue('');
    }
  }, [visible, initialSection]);

  useEffect(() => {
    setCommercialProfile(profile);
  }, [profile, visible]);

  useEffect(() => {
    const timer = setInterval(() => setCountdownNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (account?.access?.requiresPasswordReset) {
      setAccessMethod('password');
      setPasswordResetOpen(true);
    }
  }, [account?.access?.requiresPasswordReset]);

  const loadSettings = async () => {
    try {
      const savedProvider = await AsyncStorage.getItem('ai_provider');
      const savedModel = await AsyncStorage.getItem('ollama_model');
      const savedConnector = await loadInventoryConnector();
      setInventoryConnector(savedConnector);
      if (localProviderSettingsEnabled && savedProvider) {
        setProvider(savedProvider === 'ollama' ? 'ollama' : 'gemini');
      } else {
        setProvider('gemini');
      }
      if (savedModel) setOllamaModel(savedModel);
    } catch (e) {
      console.error('Failed to load settings', e);
    }
  };

  const loadAiRuntimeStatus = async () => {
    setAiStatusLoading(true);
    try {
      setAiRuntimeStatus(await getAiRuntimeStatus());
    } finally {
      setAiStatusLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      if (localProviderSettingsEnabled) {
        await AsyncStorage.setItem('ai_provider', provider);
        await AsyncStorage.setItem('ollama_model', ollamaModel);
      } else {
        await AsyncStorage.setItem('ai_provider', 'gemini');
        await AsyncStorage.removeItem('ollama_model');
      }
      await saveInventoryConnector({
        ...inventoryConnector,
        sourceName: inventoryConnector.sourceName.trim() || defaultConnector.sourceName,
        sourceUrl: inventoryConnector.sourceUrl.trim() || defaultConnector.sourceUrl,
        credentialRef: inventoryConnector.credentialRef?.trim() || '',
        notes: inventoryConnector.notes?.trim() || '',
      });
      onClose();
    } catch (e) {
      console.error('Failed to save settings', e);
    }
  };

  const updateInventoryConnector = (patch: Partial<InventoryConnector>) => {
    setInventoryConnector(prev => ({ ...prev, ...patch }));
  };

  const handleCancelInventoryEdit = async () => {
    setInventoryConnector(await loadInventoryConnector());
    setInventoryDropdown(null);
    setInventoryEditing(false);
  };

  const handleConnectorTypeChange = (connectorType: InventoryConnector['connectorType']) => {
    if (connectorType !== 'demo' && !canUseInventoryConnectors) {
      setCommercialStatus('CSV, API, and ERP inventory connectors are a Team plan entitlement. The public demo inventory remains available.');
      setInventoryDropdown(null);
      return;
    }
    setInventoryConnector(prev => ({
      ...prev,
      connectorType,
      authMode: defaultAuthModeForConnectorType(connectorType),
      credentialRef: connectorType === 'demo' || connectorType === 'csv' ? '' : prev.credentialRef,
    }));
    setInventoryDropdown(null);
  };

  const handleAuthModeChange = (authMode: InventoryConnector['authMode']) => {
    setInventoryConnector(prev => ({
      ...prev,
      authMode,
      credentialRef: authMode === 'none' ? '' : prev.credentialRef,
    }));
    setInventoryDropdown(null);
  };

  const renderDropdown = <T extends string>({
    id,
    label,
    value,
    options,
    getLabel,
    onChange,
  }: {
    id: 'connectorType' | 'authMode';
    label: string;
    value: T;
    options: Array<{ value: T; label: string; detail: string }>;
    getLabel: (value: T) => string;
    onChange: (value: T) => void;
  }) => {
    const isOpen = inventoryDropdown === id;
    return (
      <View style={styles.dropdownBlock}>
        <Text style={styles.compactLabel}>{label}</Text>
        <TouchableOpacity
          style={styles.dropdownButton}
          onPress={() => setInventoryDropdown(isOpen ? null : id)}
          accessibilityRole="button"
          accessibilityLabel={`Choose ${label.toLowerCase()}`}
          accessibilityState={{ expanded: isOpen }}
        >
          <Text style={styles.dropdownButtonText}>{getLabel(value)}</Text>
          <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.gray[400]} />
        </TouchableOpacity>
        {isOpen && (
          <View style={styles.dropdownMenu}>
            {options.map(option => (
              <TouchableOpacity
                key={option.value}
                style={[styles.dropdownOption, option.value === value && styles.dropdownOptionActive]}
                onPress={() => onChange(option.value)}
                accessibilityRole="button"
                accessibilityLabel={`Set ${label.toLowerCase()} to ${option.label}`}
                accessibilityState={{ selected: option.value === value }}
              >
                <Text style={[styles.dropdownOptionLabel, option.value === value && styles.dropdownOptionLabelActive]}>
                  {option.label}
                </Text>
                <Text style={styles.dropdownOptionDetail}>{option.detail}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  const requireAdminToken = () => {
    const token = adminToken.trim();
    if (!token) {
      setAdminStatus('Enter the API admin token to manage backend credentials and commercial access grants.');
      return null;
    }
    return token;
  };

  const loadCredentials = async () => {
    const token = requireAdminToken();
    if (!token) return;

    setAdminLoading(true);
    setAdminStatus(null);
    try {
      const result = await listInventoryCredentials(token);
      setCredentials(result.credentials || []);
      setRegistryEnabled(result.registryEnabled);
      setAdminStatus(
        result.registryEnabled
          ? `Loaded ${result.credentials?.length || 0} backend credential reference${result.credentials?.length === 1 ? '' : 's'}.`
          : 'Registry reads are available, but runtime writes need INVENTORY_CONNECTOR_SECRETS_FILE on the API server.'
      );
    } catch (e: any) {
      setRegistryEnabled(null);
      setAdminStatus(e?.message || 'Unable to load backend credential references.');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleSaveCredential = async () => {
    const token = requireAdminToken();
    if (!token) return;

    const ref = credentialRef.trim();
    const secretValue = credentialValue.trim();
    if (!ref || !secretValue) {
      setAdminStatus('Credential ref and secret value are required.');
      return;
    }

    setAdminLoading(true);
    setAdminStatus(null);
    try {
      const payload = credentialMode === 'api_key'
        ? {
            credentialRef: ref,
            headerName: credentialHeaderName.trim() || 'X-API-Key',
            value: secretValue,
          }
        : {
            credentialRef: ref,
            accessToken: secretValue,
            scheme: 'Bearer',
          };
      const result = await saveInventoryCredential(token, payload);
      setCredentialValue('');
      setCredentials(prev => {
        const others = prev.filter(item => item.credentialRef !== result.credential.credentialRef);
        return [result.credential, ...others].sort((left, right) => left.credentialRef.localeCompare(right.credentialRef));
      });
      setRegistryEnabled(true);
      setAdminStatus(`Saved backend credential reference "${result.credential.credentialRef}". Raw secret was not stored in the app.`);
    } catch (e: any) {
      setAdminStatus(e?.message || 'Unable to save backend credential reference.');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleDeleteCredential = async (ref: string) => {
    const token = requireAdminToken();
    if (!token) return;

    setAdminLoading(true);
    setAdminStatus(null);
    try {
      const result = await deleteInventoryCredential(token, ref);
      setCredentials(prev => prev.filter(item => item.credentialRef !== ref));
      setAdminStatus(result.deleted ? `Deleted backend credential reference "${ref}".` : `No registry-file credential existed for "${ref}".`);
    } catch (e: any) {
      setAdminStatus(e?.message || `Unable to delete backend credential reference "${ref}".`);
    } finally {
      setAdminLoading(false);
    }
  };

  const handleActivateAccessPassword = async () => {
    setAccessStatus(null);
    try {
      await activateAccessPassword(accessPassword);
      setPasswordResetOpen(true);
      setAccessStatus('Access activated. Reset the starter password before continuing QA.');
    } catch (e: any) {
      setAccessStatus(e?.message || 'Unable to activate access password.');
    }
  };

  const handleResetAccessPassword = async () => {
    setAccessStatus(null);
    try {
      await resetAccessPassword(accessPassword, newAccessPassword);
      setAccessPassword(newAccessPassword);
      setNewAccessPassword('');
      setPasswordResetOpen(false);
      setAccessStatus('Access password reset. Future requests will use the new password on this device.');
    } catch (e: any) {
      setAccessStatus(e?.message || 'Unable to reset access password.');
    }
  };

  const handleClearAccessPassword = async () => {
    setAccessStatus(null);
    try {
      await clearAccessPassword();
      setAccessPassword('');
      setNewAccessPassword('');
      setPasswordResetOpen(false);
      setAccessMethod('invite');
      setAccessStatus('Access password cleared. This profile is now showing the normal guest/free experience.');
    } catch (e: any) {
      setAccessStatus(e?.message || 'Unable to clear access password.');
    }
  };

  const handleRedeemTesterInvite = async () => {
    setAccessStatus(null);
    setEmailTouched(true);
    const email = normalizeEmail(commercialProfile.email);
    if (!isValidEmail(email)) {
      setAccessStatus('Enter a valid work email before redeeming an invite code.');
      return;
    }
    const cleanCode = testerInviteCode.trim();
    if (!cleanCode) {
      setAccessStatus('Tap Find Admin Code or paste an admin-issued invite code, then tap Redeem Admin Code.');
      return;
    }
    try {
      await saveProfile({ ...commercialProfile, email });
      await redeemTesterInvite(cleanCode);
      setTesterInviteCode('');
      setAccessPassword('');
      setNewAccessPassword('');
      setPasswordResetOpen(false);
      setAccessStatus('Tester access activated on this device. No starter password is needed.');
    } catch (e: any) {
      setAccessStatus(e?.message || 'Unable to redeem tester invite.');
    }
  };

  const handleLookupTesterInvite = async () => {
    setAccessStatus(null);
    setEmailTouched(true);
    const email = normalizeEmail(commercialProfile.email);
    if (!isValidEmail(email)) {
      setAccessStatus('Enter a valid work email before finding an admin code.');
      return;
    }

    try {
      await saveProfile({ ...commercialProfile, email });
      const result = await lookupCommercialTesterInvite(email);
      const activationCode = result.invite.activationCode?.trim();
      if (!activationCode) {
        setAccessStatus('An admin invite exists for this email, but its code is not retrievable. Ask a ReversR admin to recreate it.');
        return;
      }
      setAccessMethod('invite');
      setTesterInviteCode(activationCode);
      setAccessStatus('Admin code found and filled. Tap Redeem Admin Code to activate this device.');
    } catch (e: any) {
      setAccessStatus(e?.message || 'Unable to find an admin code for this email.');
    }
  };

  const loadAccessGrants = async () => {
    const token = requireAdminToken();
    if (!token) return;

    setAdminLoading(true);
    setAdminStatus(null);
    try {
      const result = await listCommercialAccessGrants(token);
      setAccessGrants(result.grants || []);
      setAdminStatus(`Loaded ${result.grants?.length || 0} commercial access grant${result.grants?.length === 1 ? '' : 's'}.`);
    } catch (e: any) {
      setAdminStatus(e?.message || 'Unable to load commercial access grants.');
    } finally {
      setAdminLoading(false);
    }
  };

  const loadTesterInvites = async () => {
    const token = requireAdminToken();
    if (!token) return;

    setAdminLoading(true);
    setAdminStatus(null);
    try {
      const result = await listCommercialTesterInvites(token);
      setTesterInvites(result.invites || []);
      setAdminStatus(`Loaded ${result.invites?.length || 0} tester invite${result.invites?.length === 1 ? '' : 's'}.`);
    } catch (e: any) {
      setAdminStatus(e?.message || 'Unable to load tester invites.');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleCreateTesterInvite = async () => {
    const token = requireAdminToken();
    if (!token) return;

    const email = normalizeEmail(inviteEmail);
    if (!email || !isValidEmail(email)) {
      setAdminStatus('Enter a valid tester email before creating an invite code.');
      return;
    }

    setAdminLoading(true);
    setAdminStatus(null);
    try {
      const result = await createCommercialTesterInvite(token, {
        email,
        platform: invitePlatform,
      });
      setInviteEmail('');
      setTesterInvites(prev => {
        const returnedInvites = result.invites || [result.invite];
        const inviteIds = new Set(returnedInvites.map(invite => invite.inviteId));
        const others = prev.filter(item => !inviteIds.has(item.inviteId));
        return [...returnedInvites, ...others].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      });
      setAdminStatus(`Created tester invite for ${result.invite.email}. The tester can now enter that work email and tap Find Admin Code.`);
    } catch (e: any) {
      setAdminStatus(e?.message || 'Unable to create tester invite.');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleRevokeTesterInvite = async (inviteId: string) => {
    const token = requireAdminToken();
    if (!token) return;

    setAdminLoading(true);
    setAdminStatus(null);
    try {
      const result = await revokeCommercialTesterInvite(token, inviteId);
      setTesterInvites(prev => prev.map(item => (
        item.inviteId === inviteId
          ? { ...item, active: false, status: result.invite?.status || 'revoked', updatedAt: new Date().toISOString() }
          : item
      )));
      setAdminStatus(result.revoked ? `Revoked tester invite ${inviteId}.` : `No active invite existed for ${inviteId}.`);
    } catch (e: any) {
      setAdminStatus(e?.message || 'Unable to revoke tester invite.');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleSaveAccessGrant = async () => {
    const token = requireAdminToken();
    if (!token) return;

    const email = normalizeEmail(grantEmail);
    if (!email || !isValidEmail(email)) {
      setAdminStatus('Enter a valid grant email before creating a fallback password grant.');
      return;
    }

    if (!grantStartingPassword.trim()) {
      setAdminStatus('Starting password is required for a commercial access grant.');
      return;
    }

    setAdminLoading(true);
    setAdminStatus(null);
    try {
      const result = await saveCommercialAccessGrant(token, {
        email,
        role: grantRole,
        startingPassword: grantStartingPassword.trim(),
      });
      setGrantStartingPassword('');
      setAccessGrants(prev => {
        const others = prev.filter(item => item.grantId !== result.grant.grantId);
        return [result.grant, ...others].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      });
      setAdminStatus(`Saved ${result.grant.role === 'super_admin' ? 'super admin' : 'tester'} grant for ${result.grant.clientId || result.grant.email || result.grant.profileName || result.grant.shopName}. Give the starting password to the user and have them reset it.`);
    } catch (e: any) {
      setAdminStatus(e?.message || 'Unable to save commercial access grant.');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleRevokeAccessGrant = async (grantId: string) => {
    const token = requireAdminToken();
    if (!token) return;

    setAdminLoading(true);
    setAdminStatus(null);
    try {
      const result = await revokeCommercialAccessGrant(token, grantId);
      setAccessGrants(prev => prev.map(item => (
        item.grantId === grantId ? { ...item, active: false, updatedAt: new Date().toISOString() } : item
      )));
      setAdminStatus(result.revoked ? `Revoked commercial access grant ${grantId}.` : `No active grant existed for ${grantId}.`);
    } catch (e: any) {
      setAdminStatus(e?.message || 'Unable to revoke commercial access grant.');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleSaveCommercialProfile = async () => {
    setCommercialStatus(null);
    setEmailTouched(true);
    const email = normalizeEmail(commercialProfile.email);
    if (!isValidEmail(email)) {
      setCommercialStatus('Enter a valid work email before saving account access.');
      return;
    }
    try {
      await saveProfile({ ...commercialProfile, email, name: commercialProfile.name.trim() });
      setCommercialStatus('Saved account profile and refreshed plan usage.');
    } catch (e: any) {
      setCommercialStatus(e?.message || 'Unable to save account profile.');
    }
  };

  const handleCommercialAction = async (action: () => Promise<void>, successMessage = 'Action completed.') => {
    setCommercialStatus(null);
    try {
      await action();
      setCommercialStatus(successMessage);
    } catch (e: any) {
      setCommercialStatus(e?.message || 'Billing action is not available yet.');
    }
  };

  const periodLabel = (period?: string | null) => `per ${formatCreditPeriod(period)}`;

  const planCreditLabel = (plan: Pick<CommercialPlan, 'monthlyCredits' | 'creditPeriod'>) => {
    if (plan.monthlyCredits === null) return 'Unlimited journey credits';
    return `${plan.monthlyCredits} journey ${plan.monthlyCredits === 1 ? 'credit' : 'credits'} ${periodLabel(plan.creditPeriod)}`;
  };

  const openWebUpgrade = async (planId: CommercialPlanId) => {
    const accountUrl = account?.billing.billingLinks?.accountUrl || 'https://reversr.vercel.app/account';
    const separator = accountUrl.includes('?') ? '&' : '?';
    await Linking.openURL(`${accountUrl}${separator}upgrade=${encodeURIComponent(planId)}`);
  };

  const handlePlanAction = (plan: CommercialPlan) => {
    const isCurrentPlan = plan.id === (account?.billing.planId || 'free');
    if (Platform.OS === 'web' && account && !isCurrentPlan && plan.id !== 'free') {
      return handleCommercialAction(() => beginCheckout(plan.id), `Opened ${plan.label} checkout on web.`);
    }
    return handleCommercialAction(() => openWebUpgrade(plan.id), `Opened ${plan.label} plan page on web.`);
  };

  const syncCreditConfigForm = (config: CommercialCreditConfig, planId: CommercialPlanId = creditPlanId) => {
    const rule = config.planCreditRules?.[planId] || config.planCreditRules?.free;
    setCreditConfig(config);
    setCreditAllowance(String(rule?.credits ?? 5));
    setCreditPeriod(rule?.period || 'week');
  };

  const loadJourneyCreditConfig = async () => {
    const token = requireAdminToken();
    if (!token) return;

    setAdminLoading(true);
    setAdminStatus(null);
    try {
      const result = await loadCommercialCreditConfig(token);
      syncCreditConfigForm(result.config);
      setAdminStatus('Loaded journey credit configuration.');
    } catch (e: any) {
      setAdminStatus(e?.message || 'Unable to load journey credit configuration.');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleCreditPlanChange = (planId: CommercialPlanId) => {
    setCreditPlanId(planId);
    if (creditConfig) syncCreditConfigForm(creditConfig, planId);
  };

  const saveJourneyCreditConfig = async () => {
    const token = requireAdminToken();
    if (!token) return;

    const credits = Number(creditAllowance);
    if (!Number.isFinite(credits) || credits < 0) {
      setAdminStatus('Journey credit allowance must be zero or greater.');
      return;
    }

    setAdminLoading(true);
    setAdminStatus(null);
    try {
      const result = await saveCommercialCreditConfig(token, {
        planId: creditPlanId,
        credits: Math.floor(credits),
        period: creditPeriod,
      });
      syncCreditConfigForm(result.config, creditPlanId);
      await refreshAccount();
      setAdminStatus(`Saved ${creditPlanId.replace('_', ' ')} journey credits: ${Math.floor(credits)} ${periodLabel(creditPeriod)}.`);
    } catch (e: any) {
      setAdminStatus(e?.message || 'Unable to save journey credit configuration.');
    } finally {
      setAdminLoading(false);
    }
  };

  const usageIsUnlimited = Boolean(account?.usage.unlimitedCredits || account?.entitlements.unlimitedCredits);
  const usagePercent = usageIsUnlimited
    ? 100
    : account?.usage.monthlyCredits
    ? Math.min(100, Math.round((account.usage.usedCredits / account.usage.monthlyCredits) * 100))
    : 0;
  const usageLabel = usageIsUnlimited
    ? formatJourneyCreditLabel(account?.usage)
    : formatJourneyCreditLabel(account?.usage);
  const resetLabel = usageIsUnlimited
    ? 'No credit reset limit'
    : formatResetCountdown(account?.usage.resetAt, countdownNow);
  const normalizedCommercialEmail = normalizeEmail(commercialProfile.email);
  const commercialEmailIsValid = isValidEmail(normalizedCommercialEmail);
  const showEmailError = emailTouched && !commercialEmailIsValid;
  const isSuperAdmin = account?.access?.role === 'super_admin';
  const canUseAdminConsole = Boolean(adminCredentialSettingsEnabled || account?.entitlements.canUseAdminConsole || account?.access?.role === 'super_admin');
  const visiblePlans = account?.plans?.length ? account.plans : FALLBACK_COMMERCIAL_PLANS;
  const settingsSections: Array<{ id: SettingsSection; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
    { id: 'account', label: 'Account', icon: 'person-circle-outline' },
    { id: 'inventory', label: 'Inventory', icon: 'git-branch-outline' },
    ...(canUseAdminConsole ? [{ id: 'admin' as const, label: 'Admin', icon: 'shield-checkmark-outline' as const }] : []),
    { id: 'legal', label: 'Legal', icon: 'document-text-outline' },
  ];

  const toggleTooltip = (tooltip: Exclude<SettingsTooltip, null>) => {
    setActiveTooltip(prev => (prev === tooltip ? null : tooltip));
  };

  const renderInfoButton = (tooltip: Exclude<SettingsTooltip, null>, label: string) => (
    <TouchableOpacity
      style={styles.infoButton}
      onPress={() => toggleTooltip(tooltip)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: activeTooltip === tooltip }}
    >
      <Ionicons name="information-circle-outline" size={17} color={Colors.accent} />
    </TouchableOpacity>
  );

  const renderTooltip = (tooltip: Exclude<SettingsTooltip, null>, text: string) => (
    activeTooltip === tooltip ? (
      <View style={styles.tooltipBubble}>
        <Text style={styles.tooltipText}>{text}</Text>
      </View>
    ) : null
  );

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContent} testID="reversr-tour-settings">
          <View style={styles.header}>
            <Text style={styles.title}>Settings</Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close settings"
            >
              <Ionicons name="close" size={24} color={Colors.white} />
            </TouchableOpacity>
          </View>

          <View style={styles.settingsSectionTabs}>
            {settingsSections.map(section => (
              <TouchableOpacity
                key={section.id}
                style={[styles.settingsSectionTab, settingsSection === section.id && styles.settingsSectionTabActive]}
                onPress={() => setSettingsSection(section.id)}
                accessibilityRole="button"
                accessibilityLabel={`Show ${section.label} settings`}
                accessibilityState={{ selected: settingsSection === section.id }}
              >
                <Ionicons
                  name={section.icon}
                  size={15}
                  color={settingsSection === section.id ? Colors.black : Colors.gray[400]}
                />
                <Text style={[styles.settingsSectionTabText, settingsSection === section.id && styles.settingsSectionTabTextActive]}>
                  {section.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            {settingsSection === 'account' && (
              <>
            <View style={styles.appearancePanel}>
              <View style={styles.policyHeader}>
                <Ionicons name="contrast-outline" size={18} color={Colors.accent} />
                <Text style={styles.policyTitle}>Appearance</Text>
              </View>
              <View style={styles.themeToggleRow}>
                {(['light', 'dark'] as const).map(mode => (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.themeToggleButton, themeMode === mode && styles.themeToggleButtonActive]}
                    onPress={() => setThemeMode(mode)}
                    accessibilityRole="button"
                    accessibilityLabel={mode === 'light' ? 'Use light mode' : 'Use dark mode'}
                    accessibilityState={{ selected: themeMode === mode }}
                  >
                    <Ionicons
                      name={mode === 'light' ? 'sunny-outline' : 'moon-outline'}
                      size={16}
                      color={themeMode === mode ? Colors.black : Colors.gray[400]}
                    />
                    <Text style={[styles.themeToggleText, themeMode === mode && styles.themeToggleTextActive]}>
                      {mode === 'light' ? 'Light' : 'Dark'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.accountPanel}>
              <View style={styles.policyHeader}>
                <Ionicons name="briefcase-outline" size={18} color={Colors.accent} />
                <Text style={styles.policyTitle}>Billing Plan Tier</Text>
                {renderInfoButton('billing', 'Show billing plan details')}
              </View>
              {renderTooltip('billing', 'Review the current tier, journey credits, and upgrade options. Billing changes are completed on the ReversR web account page.')}

              <View style={styles.planSummaryRow}>
                <View style={styles.planBadge}>
                  <Text style={styles.planBadgeLabel}>{account?.billing.planLabel || 'Free'}</Text>
                  <Text style={styles.planBadgeMeta}>
                    {account?.billing.subscriptionStatus && account.billing.subscriptionStatus !== 'none'
                      ? account.billing.subscriptionStatus
                      : 'journey trial'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.refreshAiButton}
                  onPress={refreshAccount}
                  disabled={accountLoading}
                  accessibilityRole="button"
                  accessibilityLabel="Refresh account and credit usage"
                >
                  <Ionicons name="refresh-outline" size={15} color={Colors.accent} />
                </TouchableOpacity>
              </View>

              <View style={styles.usageMeterBlock}>
                <View style={styles.usageMeterHeader}>
                  <Text style={styles.usageMeterLabel}>Reconstruction journey credits</Text>
                  <Text style={styles.usageMeterCount}>
                    {usageLabel}
                  </Text>
                </View>
                <View style={styles.usageTrack}>
                  <View style={[styles.usageFill, { width: `${usagePercent}%` }]} />
                </View>
                <Text style={styles.helpText}>
                  One journey credit starts a reconstruction. Specs, sketches, BOMs, and exports in that journey do not spend additional credits. {resetLabel}.
                </Text>
              </View>

              <View style={styles.planListHeader}>
                <Text style={styles.planListTitle}>Plans</Text>
                <Text style={styles.planListMeta}>Upgrade options open on web.</Text>
              </View>
              <View style={styles.planCardsGrid}>
                {visiblePlans.map(plan => {
                  const isCurrentPlan = plan.id === (account?.billing.planId || 'free');
                  return (
                    <View key={plan.id} style={[styles.planCard, isCurrentPlan && styles.planCardActive]}>
                      <View style={styles.planCardHeader}>
                        <View style={styles.planCardTitleBlock}>
                          <Text style={styles.planCardTitle}>{plan.label}</Text>
                          <Text style={styles.planCardPrice}>
                            {plan.priceMonthly === 0 ? 'Free' : `$${plan.priceMonthly}/mo`}
                          </Text>
                        </View>
                        {isCurrentPlan && (
                          <View style={styles.currentPlanBadge}>
                            <Text style={styles.currentPlanBadgeText}>Current</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.planCardCredits}>{planCreditLabel(plan)}</Text>
                      <View style={styles.planFeatureList}>
                        {plan.features.slice(0, 4).map(feature => (
                          <View key={feature} style={styles.planFeatureRow}>
                            <Ionicons name="checkmark-circle-outline" size={13} color={Colors.success} />
                            <Text style={styles.planFeatureText}>{feature}</Text>
                          </View>
                        ))}
                      </View>
                      <TouchableOpacity
                        style={[styles.planActionButton, isCurrentPlan && styles.planActionButtonMuted]}
                        onPress={() => handlePlanAction(plan)}
                        disabled={accountLoading}
                        accessibilityRole="button"
                        accessibilityLabel={isCurrentPlan ? `Manage ${plan.label} plan on web` : `Upgrade to ${plan.label} on web`}
                      >
                        <Ionicons
                          name={Platform.OS === 'web' && plan.id !== 'free' && !isCurrentPlan ? 'card-outline' : 'open-outline'}
                          size={15}
                          color={Colors.accent}
                        />
                        <Text style={styles.planActionButtonText}>
                          {isCurrentPlan ? 'Manage on Web' : Platform.OS === 'web' && plan.id !== 'free' ? 'Start Checkout' : 'Continue on Web'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>

              <Text style={styles.compactLabel}>Display name</Text>
              <TextInput
                style={styles.input}
                value={commercialProfile.name}
                onChangeText={(name) => setCommercialProfile(prev => ({ ...prev, name }))}
                accessibilityLabel="Commercial profile display name"
                placeholder="Your name"
                placeholderTextColor={Colors.gray[500]}
              />

              <View style={styles.labelWithInfo}>
                <Text style={styles.compactLabel}>Work email</Text>
                {renderInfoButton('email', 'Show work email details')}
              </View>
              {renderTooltip('email', 'Use the same email that a ReversR admin used when creating the tester invite. The app validates the format before saving or redeeming a code.')}
              <TextInput
                style={[styles.input, showEmailError && styles.inputError]}
                value={commercialProfile.email}
                onChangeText={(email) => setCommercialProfile(prev => ({ ...prev, email }))}
                onBlur={() => setEmailTouched(true)}
                accessibilityLabel="Commercial profile email"
                placeholder="owner@example.com"
                placeholderTextColor={Colors.gray[500]}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              {commercialProfile.email.length > 0 && (
                <Text style={showEmailError ? styles.validationErrorText : styles.validationSuccessText}>
                  {showEmailError ? 'Enter a valid email address.' : 'Email format looks valid.'}
                </Text>
              )}

              <View style={styles.accessPanel}>
                <View style={styles.policyHeader}>
                  <Ionicons name="lock-open-outline" size={18} color={Colors.accent} />
                  <Text style={styles.policyTitle}>Tester Activation</Text>
                  {renderInfoButton('invite', 'Show invite code details')}
                </View>
                {renderTooltip('invite', 'A ReversR admin must create an invite for your work email first. Enter that email, tap Find Admin Code, then redeem the code on this device.')}
                <View style={styles.activationStepRow}>
                  <View style={styles.activationStep}>
                    <Ionicons
                      name={commercialEmailIsValid ? 'checkmark-circle-outline' : 'ellipse-outline'}
                      size={14}
                      color={commercialEmailIsValid ? Colors.success : Colors.gray[500]}
                    />
                    <Text style={styles.activationStepText}>Email</Text>
                  </View>
                  <View style={styles.activationStep}>
                    <Ionicons
                      name={testerInviteCode.trim() ? 'checkmark-circle-outline' : 'ellipse-outline'}
                      size={14}
                      color={testerInviteCode.trim() ? Colors.success : Colors.gray[500]}
                    />
                    <Text style={styles.activationStepText}>Admin code</Text>
                  </View>
                  <View style={styles.activationStep}>
                    <Ionicons name="arrow-forward-circle-outline" size={14} color={Colors.accent} />
                    <Text style={styles.activationStepText}>Redeem</Text>
                  </View>
                </View>
                {account?.access?.role === 'super_admin' && (
                  <Text style={styles.adminStatusText}>Super admin access is active on this device.</Text>
                )}
                {account?.access?.requiresPasswordReset && (
                  <Text style={styles.adminStatusText}>Starter password reset required for this tester grant.</Text>
                )}

                <View style={styles.accessMethodRow}>
                  {(['invite', 'password'] as const).map(method => (
                    <TouchableOpacity
                      key={method}
                      style={[styles.accessMethodButton, accessMethod === method && styles.accessMethodButtonActive]}
                      onPress={() => {
                        setAccessMethod(method);
                        setPasswordResetOpen(method === 'password' && Boolean(account?.access?.requiresPasswordReset));
                        setAccessStatus(method === 'invite'
                          ? 'Admin invite code selected. Enter a valid work email, find the admin code, then redeem it.'
                          : 'Starter password selected. Use this only if a ReversR admin gave you a starter password.');
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={method === 'invite' ? 'Use tester invite code' : 'Use starter password'}
                      accessibilityState={{ selected: accessMethod === method }}
                    >
                      <Ionicons
                        name={method === 'invite' ? 'ticket-outline' : 'key-outline'}
                        size={15}
                        color={accessMethod === method ? Colors.black : Colors.gray[400]}
                      />
                      <Text style={[styles.accessMethodText, accessMethod === method && styles.accessMethodTextActive]}>
                        {method === 'invite' ? 'Admin Code' : 'Starter Password'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {accessMethod === 'invite' ? (
                  <>
                    <View style={styles.labelWithInfo}>
                      <Text style={styles.compactLabel}>Admin-issued invite code</Text>
                      {renderInfoButton('invite', 'Show invite code details')}
                    </View>
                    <TextInput
                      style={styles.input}
                      value={testerInviteCode}
                      onChangeText={setTesterInviteCode}
                      accessibilityLabel="Tester invite code"
                      placeholder="Find or paste admin code"
                      placeholderTextColor={Colors.gray[500]}
                      autoCapitalize="none"
                    />

                    <View style={styles.adminActionRow}>
                      <TouchableOpacity
                        style={[styles.adminButton, styles.grantButton, accountLoading && styles.disabledButton]}
                        onPress={handleLookupTesterInvite}
                        disabled={accountLoading}
                        accessibilityRole="button"
                        accessibilityLabel="Find tester admin code for this email"
                      >
                        <Ionicons name="search-outline" size={16} color={Colors.accent} />
                        <Text style={styles.adminButtonText}>Find Admin Code</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.saveCredentialButton, styles.grantButton, accountLoading && styles.disabledButton]}
                        onPress={handleRedeemTesterInvite}
                        disabled={accountLoading}
                        accessibilityRole="button"
                        accessibilityLabel="Redeem tester invite code"
                      >
                        <Ionicons name="ticket-outline" size={17} color={Colors.black} />
                        <Text style={styles.saveCredentialButtonText}>Redeem Admin Code</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.labelWithInfo}>
                      <Text style={styles.compactLabel}>Current or starter password</Text>
                      {renderInfoButton('password', 'Show starter password details')}
                    </View>
                    {renderTooltip('password', 'Starter passwords are for legacy tester or super-admin grants. If you have a normal tester invite, use Admin Code instead.')}
                    <TextInput
                      style={styles.input}
                      value={accessPassword}
                      onChangeText={setAccessPassword}
                      accessibilityLabel="Commercial access password"
                      placeholder="Access password"
                      placeholderTextColor={Colors.gray[500]}
                      autoCapitalize="none"
                      secureTextEntry
                    />

                    <View style={styles.adminActionRow}>
                      <TouchableOpacity
                        style={[styles.adminButton, accountLoading && styles.disabledButton]}
                        onPress={handleActivateAccessPassword}
                        disabled={accountLoading}
                        accessibilityRole="button"
                        accessibilityLabel="Activate commercial access password"
                      >
                        <Ionicons name="key-outline" size={16} color={Colors.accent} />
                        <Text style={styles.adminButtonText}>Activate</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.adminButton, accountLoading && styles.disabledButton]}
                        onPress={() => setPasswordResetOpen(prev => !prev)}
                        disabled={accountLoading}
                        accessibilityRole="button"
                        accessibilityLabel="Show password reset fields"
                        accessibilityState={{ expanded: passwordResetOpen }}
                      >
                        <Ionicons name={passwordResetOpen ? 'chevron-up-outline' : 'refresh-outline'} size={16} color={Colors.accent} />
                        <Text style={styles.adminButtonText}>Reset</Text>
                      </TouchableOpacity>
                      {account?.access && (
                        <TouchableOpacity
                          style={[styles.adminButton, accountLoading && styles.disabledButton]}
                          onPress={handleClearAccessPassword}
                          disabled={accountLoading}
                          accessibilityRole="button"
                          accessibilityLabel="Clear commercial access password"
                        >
                          <Ionicons name="person-outline" size={16} color={Colors.accent} />
                          <Text style={styles.adminButtonText}>Guest</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {passwordResetOpen && (
                      <>
                        <Text style={styles.compactLabel}>New password</Text>
                        <TextInput
                          style={styles.input}
                          value={newAccessPassword}
                          onChangeText={setNewAccessPassword}
                          accessibilityLabel="New commercial access password"
                          placeholder="Set your replacement password"
                          placeholderTextColor={Colors.gray[500]}
                          autoCapitalize="none"
                          secureTextEntry
                        />
                        <View style={styles.adminActionRow}>
                          <TouchableOpacity
                            style={[styles.saveCredentialButton, styles.grantButton, accountLoading && styles.disabledButton]}
                            onPress={handleResetAccessPassword}
                            disabled={accountLoading}
                            accessibilityRole="button"
                            accessibilityLabel="Confirm commercial access password reset"
                          >
                            <Ionicons name="checkmark-circle-outline" size={17} color={Colors.black} />
                            <Text style={styles.saveCredentialButtonText}>Save New Password</Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                  </>
                )}

                <View style={styles.clientIdRow}>
                  <Text style={styles.clientIdText}>Device client ID: {account?.profile.id || 'loading'}</Text>
                </View>

                {accessStatus && <Text style={styles.adminStatusText}>{accessStatus}</Text>}
              </View>

              <View style={styles.commercialActionRow}>
                <TouchableOpacity
                  style={[styles.adminButton, accountLoading && styles.disabledButton]}
                  onPress={handleSaveCommercialProfile}
                  disabled={accountLoading}
                  accessibilityRole="button"
                  accessibilityLabel="Save account profile"
                >
                  <Ionicons name="save-outline" size={16} color={Colors.accent} />
                  <Text style={styles.adminButtonText}>{accountLoading ? 'Saving...' : 'Save Account'}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.adminButton, accountLoading && styles.disabledButton]}
                  onPress={() => handleCommercialAction(openBillingPortal, 'Opened the web billing portal.')}
                  disabled={accountLoading || !isWebBillingAvailable}
                  accessibilityRole="button"
                  accessibilityLabel="Open web billing portal"
                >
                  <Ionicons name="card-outline" size={16} color={Colors.accent} />
                  <Text style={styles.adminButtonText}>Billing</Text>
                </TouchableOpacity>
              </View>

              {(commercialStatus || accountError) && (
                <Text style={styles.adminStatusText}>{commercialStatus || accountError}</Text>
              )}
            </View>
              </>
            )}

            {settingsSection === 'inventory' && (
              <>
            <View style={styles.liveAiPanel}>
              <View style={styles.policyHeader}>
                <Ionicons name="hardware-chip-outline" size={18} color={Colors.accent} />
                <Text style={styles.policyTitle}>AI Runtime</Text>
              </View>
              <Text style={styles.policyText}>
                Tester builds use managed Gemini by default. Local AI is available for admin or local development workflows.
              </Text>
              <View style={styles.providerOptionList}>
                <TouchableOpacity
                  style={[styles.providerOptionCard, provider === 'gemini' && styles.providerOptionCardActive]}
                  onPress={() => setProvider('gemini')}
                  accessibilityRole="button"
                  accessibilityLabel="Use Gemini cloud AI provider"
                  accessibilityState={{ selected: provider === 'gemini' }}
                >
                  <View style={styles.providerOptionHeader}>
                    <Ionicons name="cloud-done-outline" size={17} color={provider === 'gemini' ? Colors.accent : Colors.gray[400]} />
                    <Text style={[styles.providerOptionTitle, provider === 'gemini' && styles.providerOptionTitleActive]}>Gemini</Text>
                    <Text style={styles.providerOptionBadge}>{provider === 'gemini' ? 'Selected' : 'Cloud'}</Text>
                  </View>
                  <Text style={styles.providerOptionDetail}>Managed cloud analysis, reconstruction, and design generation.</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.providerOptionCard, provider === 'ollama' && styles.providerOptionCardActive]}
                  onPress={() => localProviderSettingsEnabled && setProvider('ollama')}
                  disabled={!localProviderSettingsEnabled}
                  accessibilityRole="button"
                  accessibilityLabel="Use local AI provider"
                  accessibilityState={{ selected: provider === 'ollama', disabled: !localProviderSettingsEnabled }}
                >
                  <View style={styles.providerOptionHeader}>
                    <Ionicons name="desktop-outline" size={17} color={provider === 'ollama' ? Colors.accent : Colors.gray[400]} />
                    <Text style={[styles.providerOptionTitle, provider === 'ollama' && styles.providerOptionTitleActive]}>Local AI</Text>
                    <Text style={styles.providerOptionBadge}>{localProviderSettingsEnabled ? 'Available' : 'Admin'}</Text>
                  </View>
                  <Text style={styles.providerOptionDetail}>Ollama/local model routing for development or private network deployments.</Text>
                </TouchableOpacity>
              </View>

              {provider === 'ollama' && localProviderSettingsEnabled ? (
                <View style={styles.ollamaSettings}>
                  <Text style={styles.label}>Ollama Model</Text>
                  <TextInput
                    style={styles.input}
                    value={ollamaModel}
                    onChangeText={setOllamaModel}
                    placeholder="e.g. llama3, mistral"
                    placeholderTextColor={Colors.gray[500]}
                  />
                  <Text style={styles.helpText}>
                    Local image generation is not supported by Ollama. Image analysis requires a vision model like 'llava'. Ensure Ollama is running on localhost:11434.
                  </Text>
                </View>
              ) : (
                <>
                <View style={styles.policyHeader}>
                  <Ionicons
                    name={aiRuntimeStatus?.status === 'connected' ? 'cloud-done-outline' : 'cloud-offline-outline'}
                    size={18}
                    color={aiRuntimeStatus?.status === 'connected' ? Colors.accent : Colors.orange[300]}
                  />
                  <Text style={styles.policyTitle}>Managed Gemini</Text>
                </View>
                <View style={styles.liveAiStatusRow}>
                  <View style={[
                    styles.liveAiBadge,
                    aiRuntimeStatus?.status === 'connected' ? styles.liveAiBadgeConnected : styles.liveAiBadgeWarn,
                  ]}>
                    <Text style={styles.liveAiBadgeText}>
                      {aiStatusLoading ? 'Checking live AI' : aiRuntimeStatus?.message || 'Live AI unavailable. Contact ReversR admin.'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.refreshAiButton}
                    onPress={loadAiRuntimeStatus}
                    disabled={aiStatusLoading}
                    accessibilityRole="button"
                    accessibilityLabel="Refresh live AI status"
                  >
                    <Ionicons name="refresh-outline" size={15} color={Colors.accent} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.apiHostText}>API host: {getApiBase()}</Text>
                <Text style={styles.helpText}>
                  Gemini runs through the hosted ReversR API. No model keys are stored in this app.
                </Text>
                </>
              )}
            </View>

            <View style={styles.adminPanel}>
              <View style={styles.policyHeader}>
                <Ionicons name="settings-outline" size={18} color={Colors.accent} />
                <Text style={styles.policyTitle}>Inventory Source</Text>
              </View>
              <Text style={styles.policyText}>
                Phase 2 uses this active inventory source for matching. Keep it locked unless you need to change the source or connector settings.
              </Text>
              <View style={styles.inventoryLockHeader}>
                <View style={styles.inventoryLockBadge}>
                  <Ionicons name={inventoryEditing ? 'create-outline' : 'lock-closed-outline'} size={15} color={Colors.accent} />
                  <Text style={styles.inventoryLockText}>{inventoryEditing ? 'Editing source' : 'Active source locked'}</Text>
                </View>
                {inventoryEditing ? (
                  <TouchableOpacity
                    style={styles.smallOutlineButton}
                    onPress={handleCancelInventoryEdit}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel inventory source changes"
                  >
                    <Text style={styles.smallOutlineButtonText}>Cancel</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.smallOutlineButton}
                    onPress={() => setInventoryEditing(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Change inventory source"
                  >
                    <Text style={styles.smallOutlineButtonText}>Change Source</Text>
                  </TouchableOpacity>
                )}
              </View>

              {!inventoryEditing ? (
                <View style={styles.inventorySummaryList}>
                  <View style={styles.inventorySummaryRow}>
                    <Text style={styles.inventorySummaryLabel}>Source</Text>
                    <Text style={styles.inventorySummaryValue}>{inventoryConnector.sourceName || defaultConnector.sourceName}</Text>
                  </View>
                  <View style={styles.inventorySummaryRow}>
                    <Text style={styles.inventorySummaryLabel}>Connector</Text>
                    <Text style={styles.inventorySummaryValue}>{getConnectorTypeLabel(inventoryConnector.connectorType)}</Text>
                  </View>
                  <View style={styles.inventorySummaryRow}>
                    <Text style={styles.inventorySummaryLabel}>Authentication</Text>
                    <Text style={styles.inventorySummaryValue}>{getAuthModeLabel(inventoryConnector.authMode)}</Text>
                  </View>
                  {inventoryConnector.connectorType !== 'demo' && (
                    <View style={styles.inventorySummaryRow}>
                      <Text style={styles.inventorySummaryLabel}>URI</Text>
                      <Text style={styles.inventorySummaryValue}>{inventoryConnector.sourceUrl || 'Not configured'}</Text>
                    </View>
                  )}
                </View>
              ) : (
                <>
                  <Text style={styles.compactLabel}>Source name</Text>
                  <TextInput
                    style={styles.input}
                    value={inventoryConnector.sourceName}
                    onChangeText={(sourceName) => updateInventoryConnector({ sourceName })}
                    accessibilityLabel="Inventory source name"
                    placeholder="FarmBot Genesis Public Inventory"
                    placeholderTextColor={Colors.gray[500]}
                  />

                  {inventoryConnector.connectorType !== 'demo' && (
                    <>
                      <Text style={styles.compactLabel}>Inventory URL or connector URI</Text>
                      <TextInput
                        style={styles.input}
                        value={inventoryConnector.sourceUrl}
                        onChangeText={(sourceUrl) => updateInventoryConnector({ sourceUrl })}
                        accessibilityLabel="Inventory connector URL"
                        placeholder="https://example.com/inventory.json"
                        placeholderTextColor={Colors.gray[500]}
                        autoCapitalize="none"
                      />
                    </>
                  )}

                  {renderDropdown<InventoryConnector['connectorType']>({
                    id: 'connectorType',
                    label: 'Connector type',
                    value: inventoryConnector.connectorType,
                    options: CONNECTOR_TYPE_OPTIONS,
                    getLabel: getConnectorTypeLabel,
                    onChange: handleConnectorTypeChange,
                  })}

                  {inventoryConnector.connectorType !== 'demo' && renderDropdown<InventoryConnector['authMode']>({
                    id: 'authMode',
                    label: 'Authentication',
                    value: inventoryConnector.authMode,
                    options: AUTH_MODE_OPTIONS,
                    getLabel: getAuthModeLabel,
                    onChange: handleAuthModeChange,
                  })}

                  {inventoryConnector.authMode !== 'none' && (
                    <>
                      <Text style={styles.compactLabel}>Backend credential reference</Text>
                      <TextInput
                        style={styles.input}
                        value={inventoryConnector.credentialRef || ''}
                        onChangeText={(credentialRef) => updateInventoryConnector({ credentialRef })}
                        accessibilityLabel="Inventory backend credential reference"
                        placeholder="partsledger-prod-api-key"
                        placeholderTextColor={Colors.gray[500]}
                        autoCapitalize="none"
                      />
                    </>
                  )}

                  <Text style={styles.compactLabel}>Admin notes</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={inventoryConnector.notes || ''}
                    onChangeText={(notes) => updateInventoryConnector({ notes })}
                    accessibilityLabel="Inventory admin notes"
                    placeholder="Notes for admins reviewing this connector"
                    placeholderTextColor={Colors.gray[500]}
                    multiline
                  />
                </>
              )}
            </View>
              </>
            )}

            {settingsSection === 'admin' && canUseAdminConsole && (
              <View style={styles.adminPanel}>
                <View style={styles.policyHeader}>
                  <Ionicons name="server-outline" size={18} color={Colors.accent} />
                  <Text style={styles.policyTitle}>Admin Connector Credentials</Text>
                </View>
                <Text style={styles.policyText}>
                  Register API-key or OAuth credential references on the backend. The workflow stores only the reference name in the app.
                </Text>
                <Text style={styles.apiHostText}>API host: {getApiBase()}</Text>

                <Text style={styles.compactLabel}>Admin token</Text>
                <TextInput
                  style={styles.input}
                  value={adminToken}
                  onChangeText={setAdminToken}
                  placeholder="Session-only API admin token"
                  placeholderTextColor={Colors.gray[500]}
                  autoCapitalize="none"
                  secureTextEntry
                />

                <View style={styles.adminActionRow}>
                  <TouchableOpacity
                    style={[styles.adminButton, adminLoading && styles.disabledButton]}
                    onPress={loadCredentials}
                    disabled={adminLoading}
                    accessibilityRole="button"
                    accessibilityLabel="Load backend credential references"
                  >
                    <Ionicons name="refresh-outline" size={16} color={Colors.accent} />
                    <Text style={styles.adminButtonText}>{adminLoading ? 'Working...' : 'Load Refs'}</Text>
                  </TouchableOpacity>
                  <View style={[styles.registryBadge, registryEnabled === false && styles.registryBadgeWarn]}>
                    <Text style={styles.registryBadgeText}>
                      {registryEnabled === null ? 'not checked' : registryEnabled ? 'registry on' : 'writes off'}
                    </Text>
                  </View>
                </View>

                <View style={styles.superAdminDivider} />
                <View style={styles.policyHeader}>
                  <Ionicons name="speedometer-outline" size={18} color={Colors.accent} />
                  <Text style={styles.policyTitle}>Journey Credit Rules</Text>
                </View>
                <Text style={styles.policyText}>
                  Configure the credit allowance and reset frequency without shipping a new app build. Default Free is 5 credits per week.
                </Text>

                <Text style={styles.compactLabel}>Plan</Text>
                <View style={styles.themeToggleRow}>
                  {(account?.plans || []).map(plan => (
                    <TouchableOpacity
                      key={plan.id}
                      style={[styles.themeToggleButton, creditPlanId === plan.id && styles.themeToggleButtonActive]}
                      onPress={() => handleCreditPlanChange(plan.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Configure ${plan.label} journey credits`}
                      accessibilityState={{ selected: creditPlanId === plan.id }}
                    >
                      <Text style={[styles.themeToggleText, creditPlanId === plan.id && styles.themeToggleTextActive]}>
                        {plan.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.compactLabel}>Journey credits</Text>
                <TextInput
                  style={styles.input}
                  value={creditAllowance}
                  onChangeText={setCreditAllowance}
                  accessibilityLabel="Journey credit allowance"
                  placeholder="5"
                  placeholderTextColor={Colors.gray[500]}
                  keyboardType="number-pad"
                />

                <Text style={styles.compactLabel}>Reset frequency</Text>
                <View style={styles.themeToggleRow}>
                  {(['day', 'week', 'month'] as const).map(period => (
                    <TouchableOpacity
                      key={period}
                      style={[styles.themeToggleButton, creditPeriod === period && styles.themeToggleButtonActive]}
                      onPress={() => setCreditPeriod(period)}
                      accessibilityRole="button"
                      accessibilityLabel={`Reset journey credits per ${period}`}
                      accessibilityState={{ selected: creditPeriod === period }}
                    >
                      <Text style={[styles.themeToggleText, creditPeriod === period && styles.themeToggleTextActive]}>
                        {period === 'day' ? 'Daily' : period === 'week' ? 'Weekly' : 'Monthly'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.adminActionRow}>
                  <TouchableOpacity
                    style={[styles.saveCredentialButton, styles.grantButton, adminLoading && styles.disabledButton]}
                    onPress={saveJourneyCreditConfig}
                    disabled={adminLoading}
                    accessibilityRole="button"
                    accessibilityLabel="Save journey credit rule"
                  >
                    <Ionicons name="save-outline" size={17} color={Colors.black} />
                    <Text style={styles.saveCredentialButtonText}>Save Credit Rule</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.adminButton, adminLoading && styles.disabledButton]}
                    onPress={loadJourneyCreditConfig}
                    disabled={adminLoading}
                    accessibilityRole="button"
                    accessibilityLabel="Load journey credit rules"
                  >
                    <Ionicons name="refresh-outline" size={16} color={Colors.accent} />
                    <Text style={styles.adminButtonText}>Load Rules</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.compactLabel}>Credential reference</Text>
                <TextInput
                  style={styles.input}
                  value={credentialRef}
                  onChangeText={setCredentialRef}
                  placeholder="partsledger-prod-api-key"
                  placeholderTextColor={Colors.gray[500]}
                  autoCapitalize="none"
                />

                <View style={styles.providerRow}>
                  {(['api_key', 'oauth'] as const).map(mode => (
                    <TouchableOpacity
                      key={mode}
                      style={[styles.providerButton, credentialMode === mode && styles.providerButtonActive]}
                      onPress={() => setCredentialMode(mode)}
                      accessibilityRole="button"
                      accessibilityLabel={mode === 'api_key' ? 'Use API key credential mode' : 'Use OAuth credential mode'}
                      accessibilityState={{ selected: credentialMode === mode }}
                    >
                      <Text style={[styles.providerButtonText, credentialMode === mode && styles.providerButtonTextActive]}>
                        {mode === 'api_key' ? 'API Key' : 'OAuth'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {credentialMode === 'api_key' && (
                  <>
                    <Text style={styles.compactLabel}>Header name</Text>
                    <TextInput
                      style={styles.input}
                      value={credentialHeaderName}
                      onChangeText={setCredentialHeaderName}
                      placeholder="X-API-Key"
                      placeholderTextColor={Colors.gray[500]}
                      autoCapitalize="none"
                    />
                  </>
                )}

                <Text style={styles.compactLabel}>{credentialMode === 'api_key' ? 'API key value' : 'OAuth bearer token'}</Text>
                <TextInput
                  style={styles.input}
                  value={credentialValue}
                  onChangeText={setCredentialValue}
                  placeholder="Sent to backend, then cleared from this form"
                  placeholderTextColor={Colors.gray[500]}
                  autoCapitalize="none"
                  secureTextEntry
                />

                <TouchableOpacity
                  style={[styles.saveCredentialButton, adminLoading && styles.disabledButton]}
                  onPress={handleSaveCredential}
                  disabled={adminLoading}
                  accessibilityRole="button"
                  accessibilityLabel="Save backend credential reference"
                >
                  <Ionicons name="key-outline" size={17} color={Colors.black} />
                  <Text style={styles.saveCredentialButtonText}>Save Credential Ref</Text>
                </TouchableOpacity>

                {adminStatus && <Text style={styles.adminStatusText}>{adminStatus}</Text>}

                <View style={styles.credentialList}>
                  {credentials.map(item => (
                    <View key={item.credentialRef} style={styles.credentialCard}>
                      <View style={styles.credentialInfo}>
                        <Text style={styles.credentialRefText}>{item.credentialRef}</Text>
                        <Text style={styles.credentialMetaText}>
                          {(item.authModes || []).join(', ') || 'credential'} | {(item.headerNames || []).join(', ') || 'headers hidden'} | {item.source || 'backend'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.deleteCredentialButton}
                        onPress={() => handleDeleteCredential(item.credentialRef)}
                        disabled={adminLoading}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete credential reference ${item.credentialRef}`}
                      >
                        <Ionicons name="trash-outline" size={15} color={Colors.red[500]} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>

                {isSuperAdmin && (
                  <>
                    <View style={styles.superAdminDivider} />
                    <View style={styles.policyHeader}>
                      <Ionicons name="shield-checkmark-outline" size={18} color={Colors.accent} />
                      <Text style={styles.policyTitle}>Super Admin Tester Access</Text>
                    </View>
                    <Text style={styles.policyText}>
                      Pre-authorize a tester by work email. The tester enters the same email in Settings, taps Find Admin Code, and redeems the code in the app.
                    </Text>

                    <Text style={styles.compactLabel}>Tester invite email</Text>
                    <TextInput
                      style={styles.input}
                      value={inviteEmail}
                      onChangeText={setInviteEmail}
                      accessibilityLabel="Tester invite email"
                      placeholder="tester@example.com"
                      placeholderTextColor={Colors.gray[500]}
                      autoCapitalize="none"
                      keyboardType="email-address"
                    />

                    <Text style={styles.compactLabel}>Tester path</Text>
                    <View style={styles.themeToggleRow}>
                      {(['both', 'ios', 'android'] as const).map(platform => (
                        <TouchableOpacity
                          key={platform}
                          style={[styles.themeToggleButton, invitePlatform === platform && styles.themeToggleButtonActive]}
                          onPress={() => setInvitePlatform(platform)}
                          accessibilityRole="button"
                          accessibilityLabel={`Set tester invite path to ${platform}`}
                          accessibilityState={{ selected: invitePlatform === platform }}
                        >
                          <Ionicons
                            name={platform === 'ios' ? 'logo-apple' : platform === 'android' ? 'logo-android' : 'phone-portrait-outline'}
                            size={16}
                            color={invitePlatform === platform ? Colors.black : Colors.gray[400]}
                          />
                          <Text style={[styles.themeToggleText, invitePlatform === platform && styles.themeToggleTextActive]}>
                            {platform === 'both' ? 'Both' : platform === 'ios' ? 'iOS' : 'Android'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <View style={styles.adminActionRow}>
                      <TouchableOpacity
                        style={[styles.saveCredentialButton, styles.grantButton, adminLoading && styles.disabledButton]}
                        onPress={handleCreateTesterInvite}
                        disabled={adminLoading}
                        accessibilityRole="button"
                        accessibilityLabel="Create tester invite code"
                      >
                        <Ionicons name="ticket-outline" size={17} color={Colors.black} />
                        <Text style={styles.saveCredentialButtonText}>Create Invite</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.adminButton, adminLoading && styles.disabledButton]}
                        onPress={loadTesterInvites}
                        disabled={adminLoading}
                        accessibilityRole="button"
                        accessibilityLabel="Load tester invites"
                      >
                        <Ionicons name="refresh-outline" size={16} color={Colors.accent} />
                        <Text style={styles.adminButtonText}>Load Invites</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.credentialList}>
                      {testerInvites.map(invite => (
                        <View key={invite.inviteId} style={styles.credentialCard}>
                          <View style={styles.credentialInfo}>
                            <Text style={styles.credentialRefText}>{invite.email}</Text>
                            <Text style={styles.credentialMetaText}>
                              {invite.status} | {invite.platform} | expires {invite.expiresAt ? new Date(invite.expiresAt).toLocaleDateString() : 'unknown'}
                            </Text>
                            {invite.activationCode && (
                              <Text selectable style={styles.inviteCodeText}>
                                Code: {invite.activationCode}
                              </Text>
                            )}
                          </View>
                          <TouchableOpacity
                            style={styles.deleteCredentialButton}
                            onPress={() => handleRevokeTesterInvite(invite.inviteId)}
                            disabled={adminLoading || !invite.active || invite.status !== 'pending'}
                            accessibilityRole="button"
                            accessibilityLabel={`Revoke tester invite ${invite.inviteId}`}
                          >
                            <Ionicons name="remove-circle-outline" size={15} color={Colors.red[500]} />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>

                    <View style={styles.superAdminDivider} />
                    <Text style={styles.policyText}>
                      Fallback password grants are only for exception cases where a tester cannot redeem an invite code.
                    </Text>

                    <Text style={styles.compactLabel}>Grant email</Text>
                    <TextInput
                      style={styles.input}
                      value={grantEmail}
                      onChangeText={setGrantEmail}
                      accessibilityLabel="Commercial access grant email"
                      placeholder="tester@example.com"
                      placeholderTextColor={Colors.gray[500]}
                      autoCapitalize="none"
                      keyboardType="email-address"
                    />

                    <Text style={styles.compactLabel}>Access role</Text>
                    <View style={styles.themeToggleRow}>
                      {(['tester', 'super_admin'] as const).map(role => (
                        <TouchableOpacity
                          key={role}
                          style={[styles.themeToggleButton, grantRole === role && styles.themeToggleButtonActive]}
                          onPress={() => setGrantRole(role)}
                          accessibilityRole="button"
                          accessibilityLabel={role === 'super_admin' ? 'Create a super admin grant' : 'Create a tester grant'}
                          accessibilityState={{ selected: grantRole === role }}
                        >
                          <Ionicons
                            name={role === 'super_admin' ? 'shield-checkmark-outline' : 'flask-outline'}
                            size={16}
                            color={grantRole === role ? Colors.black : Colors.gray[400]}
                          />
                          <Text style={[styles.themeToggleText, grantRole === role && styles.themeToggleTextActive]}>
                            {role === 'super_admin' ? 'Super Admin' : 'Tester'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={styles.compactLabel}>Starting password</Text>
                    <TextInput
                      style={styles.input}
                      value={grantStartingPassword}
                      onChangeText={setGrantStartingPassword}
                      accessibilityLabel="Commercial access grant starting password"
                      placeholder="Give this to the tester once"
                      placeholderTextColor={Colors.gray[500]}
                      autoCapitalize="none"
                      secureTextEntry
                    />

                    <View style={styles.adminActionRow}>
                      <TouchableOpacity
                        style={[styles.saveCredentialButton, styles.grantButton, adminLoading && styles.disabledButton]}
                        onPress={handleSaveAccessGrant}
                        disabled={adminLoading}
                        accessibilityRole="button"
                        accessibilityLabel="Save commercial tester access grant"
                      >
                        <Ionicons name="person-add-outline" size={17} color={Colors.black} />
                        <Text style={styles.saveCredentialButtonText}>Grant Tester Access</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.adminButton, adminLoading && styles.disabledButton]}
                        onPress={loadAccessGrants}
                        disabled={adminLoading}
                        accessibilityRole="button"
                        accessibilityLabel="Load commercial tester access grants"
                      >
                        <Ionicons name="refresh-outline" size={16} color={Colors.accent} />
                        <Text style={styles.adminButtonText}>Load Grants</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.credentialList}>
                      {accessGrants.map(grant => (
                        <View key={grant.grantId} style={styles.credentialCard}>
                          <View style={styles.credentialInfo}>
                            <Text style={styles.credentialRefText}>
                              {grant.email || grant.clientId || grant.profileName || grant.shopName}
                            </Text>
                            <Text style={styles.credentialMetaText}>
                              {grant.active ? 'active' : 'revoked'} | {grant.role === 'super_admin' ? 'super admin' : 'tester'} | {grant.mustResetPassword ? 'reset required' : 'password reset'} | {grant.planId}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={styles.deleteCredentialButton}
                            onPress={() => handleRevokeAccessGrant(grant.grantId)}
                            disabled={adminLoading || !grant.active}
                            accessibilityRole="button"
                            accessibilityLabel={`Revoke commercial tester access grant ${grant.grantId}`}
                          >
                            <Ionicons name="remove-circle-outline" size={15} color={Colors.red[500]} />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </View>
            )}

            {settingsSection === 'legal' && (
            <View style={styles.policyPanel}>
              <View style={styles.policyHeader}>
                <Ionicons name="camera-outline" size={18} color={Colors.accent} />
                <Text style={styles.policyTitle}>Camera & Data Use</Text>
              </View>
              <Text style={styles.policyText}>
                Camera access is used to scan machines for inventory matching and reconstruction planning. Exports and quote packets require user action before anything is shared.
              </Text>
              <View style={styles.linkList}>
                {policyLinks.map(link => (
                  <TouchableOpacity
                    key={link.label}
                    style={styles.policyLink}
                    onPress={() => link.url && Linking.openURL(link.url)}
                    disabled={!link.url}
                  >
                    <Ionicons name={link.icon} size={16} color={Colors.accent} />
                    <Text style={styles.policyLinkText}>{link.label}</Text>
                    <Ionicons name="open-outline" size={14} color={Colors.gray[500]} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            )}
          </ScrollView>

          <TouchableOpacity
            style={styles.saveButton}
            onPress={saveSettings}
            accessibilityRole="button"
            accessibilityLabel="Save settings"
          >
            <Text style={styles.saveButtonText}>Save Changes</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (Colors: AppColors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: Colors.panel,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: '88%',
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.mode === 'dark' ? '#000000' : '#0f172a',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: Colors.mode === 'dark' ? 0.45 : 0.18,
    shadowRadius: 24,
    elevation: 16,
    zIndex: 1001,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.white,
  },
  body: {
    maxHeight: 440,
  },
  bodyContent: {
    paddingBottom: 144,
  },
  settingsSectionTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  settingsSectionTab: {
    flexGrow: 1,
    minWidth: 92,
    minHeight: 38,
    borderWidth: 1,
    borderColor: Colors.gray[700],
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.input,
  },
  settingsSectionTabActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent,
  },
  settingsSectionTabText: {
    color: Colors.gray[400],
    fontSize: 12,
    fontWeight: '900',
  },
  settingsSectionTabTextActive: {
    color: Colors.black,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.gray[300],
    marginBottom: 12,
  },
  appearancePanel: {
    borderWidth: 1,
    borderColor: Colors.gray[800],
    borderRadius: 8,
    padding: 14,
    marginBottom: 24,
    backgroundColor: Colors.mode === 'dark' ? 'rgba(0,0,0,0.25)' : Colors.surface,
  },
  themeToggleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  themeToggleButton: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderColor: Colors.gray[700],
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.input,
  },
  themeToggleButtonActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  themeToggleText: {
    color: Colors.gray[400],
    fontSize: 13,
    fontWeight: '800',
  },
  themeToggleTextActive: {
    color: Colors.black,
  },
  accountPanel: {
    borderWidth: 1,
    borderColor: Colors.gray[800],
    borderRadius: 8,
    padding: 14,
    marginBottom: 24,
    backgroundColor: Colors.mode === 'dark' ? 'rgba(0,0,0,0.25)' : Colors.surface,
  },
  planSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  planBadge: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: Colors.accent + '14',
  },
  planBadgeLabel: {
    color: Colors.accent,
    fontSize: 14,
    fontWeight: '900',
  },
  planBadgeMeta: {
    color: Colors.gray[400],
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  usageMeterBlock: {
    marginBottom: 12,
  },
  usageMeterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 6,
  },
  usageMeterLabel: {
    color: Colors.gray[300],
    fontSize: 12,
    fontWeight: '800',
  },
  usageMeterCount: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: '900',
  },
  usageTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: Colors.gray[800],
    overflow: 'hidden',
    marginBottom: 6,
  },
  usageFill: {
    height: '100%',
    backgroundColor: Colors.accent,
  },
  planListHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  planListTitle: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '900',
  },
  planListMeta: {
    color: Colors.gray[500],
    fontSize: 10,
    fontWeight: '800',
  },
  planCardsGrid: {
    gap: 10,
    marginBottom: 14,
  },
  planCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 12,
    backgroundColor: Colors.surface,
  },
  planCardActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + '10',
  },
  planCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  planCardTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  planCardTitle: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '900',
  },
  planCardPrice: {
    color: Colors.gray[400],
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  currentPlanBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: Colors.accent,
  },
  currentPlanBadgeText: {
    color: Colors.black,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  planCardCredits: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 8,
  },
  planFeatureList: {
    gap: 5,
    marginBottom: 10,
  },
  planFeatureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  planFeatureText: {
    flex: 1,
    color: Colors.gray[400],
    fontSize: 11,
    lineHeight: 15,
  },
  planActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 8,
    paddingVertical: 9,
  },
  planActionButtonMuted: {
    backgroundColor: Colors.mode === 'dark' ? 'rgba(255,255,255,0.03)' : Colors.panel,
  },
  planActionButtonText: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: '900',
  },
  commercialActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
    marginBottom: 10,
  },
  webPlanRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  webPlanButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: Colors.accent + '12',
  },
  webPlanButtonTitle: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: '900',
  },
  webPlanButtonMeta: {
    color: Colors.gray[400],
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },
  providerRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  providerButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.gray[700],
    alignItems: 'center',
  },
  providerButtonActive: {
    backgroundColor: Colors.accent + '20',
    borderColor: Colors.accent,
  },
  providerButtonText: {
    color: Colors.gray[400],
    fontWeight: '600',
  },
  providerButtonTextActive: {
    color: Colors.accent,
  },
  ollamaSettings: {
    marginBottom: 24,
  },
  liveAiPanel: {
    borderWidth: 1,
    borderColor: Colors.gray[800],
    borderRadius: 8,
    padding: 14,
    marginBottom: 24,
    backgroundColor: Colors.mode === 'dark' ? 'rgba(0,0,0,0.25)' : Colors.surface,
  },
  liveAiStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  liveAiBadge: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  liveAiBadgeConnected: {
    backgroundColor: Colors.green[900],
  },
  liveAiBadgeWarn: {
    backgroundColor: Colors.orange[900],
  },
  liveAiBadgeText: {
    color: Colors.gray[300],
    fontSize: 12,
    fontWeight: '700',
  },
  refreshAiButton: {
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 8,
    padding: 8,
  },
  input: {
    backgroundColor: Colors.gray[800],
    borderWidth: 1,
    borderColor: Colors.gray[700],
    borderRadius: 8,
    padding: 12,
    color: Colors.white,
    fontSize: 16,
    marginBottom: 8,
  },
  inputError: {
    borderColor: Colors.danger,
  },
  textArea: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  dropdownBlock: {
    marginBottom: 10,
  },
  dropdownButton: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: Colors.gray[700],
    borderRadius: 8,
    backgroundColor: Colors.gray[800],
    paddingVertical: 11,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  dropdownButtonText: {
    flex: 1,
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  dropdownMenu: {
    borderWidth: 1,
    borderColor: Colors.gray[700],
    borderRadius: 8,
    marginTop: 6,
    overflow: 'hidden',
    backgroundColor: Colors.gray[900],
  },
  dropdownOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[800],
  },
  dropdownOptionActive: {
    backgroundColor: Colors.accent + '18',
  },
  dropdownOptionLabel: {
    color: Colors.gray[300],
    fontSize: 13,
    fontWeight: '800',
  },
  dropdownOptionLabelActive: {
    color: Colors.accent,
  },
  dropdownOptionDetail: {
    color: Colors.gray[500],
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  helpText: {
    color: Colors.gray[500],
    fontSize: 12,
    lineHeight: 18,
  },
  adminPanel: {
    borderWidth: 1,
    borderColor: Colors.gray[800],
    borderRadius: 8,
    padding: 14,
    marginBottom: 24,
    backgroundColor: Colors.mode === 'dark' ? 'rgba(0,0,0,0.25)' : Colors.surface,
  },
  accessPanel: {
    borderWidth: 1,
    borderColor: Colors.gray[800],
    borderRadius: 8,
    padding: 12,
    marginTop: 10,
    marginBottom: 14,
    backgroundColor: Colors.mode === 'dark' ? Colors.gray[900] : Colors.panel,
  },
  accessMethodRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    marginBottom: 12,
  },
  accessMethodButton: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderColor: Colors.gray[700],
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: Colors.input,
  },
  accessMethodButtonActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent,
  },
  accessMethodText: {
    color: Colors.gray[400],
    fontSize: 12,
    fontWeight: '800',
  },
  accessMethodTextActive: {
    color: Colors.black,
  },
  clientIdRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.gray[800],
    paddingTop: 10,
    marginTop: 2,
  },
  clientIdText: {
    color: Colors.gray[500],
    fontSize: 10,
    lineHeight: 14,
  },
  apiHostText: {
    color: Colors.gray[500],
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 12,
  },
  compactLabel: {
    color: Colors.gray[300],
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  labelWithInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  infoButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
  },
  tooltipBubble: {
    borderWidth: 1,
    borderColor: Colors.gray[800],
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
    backgroundColor: Colors.mode === 'dark' ? Colors.gray[900] : Colors.panel,
  },
  tooltipText: {
    color: Colors.gray[400],
    fontSize: 11,
    lineHeight: 16,
  },
  validationErrorText: {
    color: Colors.danger,
    fontSize: 11,
    fontWeight: '700',
    marginTop: -2,
    marginBottom: 8,
  },
  validationSuccessText: {
    color: Colors.success,
    fontSize: 11,
    fontWeight: '700',
    marginTop: -2,
    marginBottom: 8,
  },
  activationStepRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    marginBottom: 10,
  },
  activationStep: {
    flex: 1,
    minHeight: 34,
    borderWidth: 1,
    borderColor: Colors.gray[800],
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: Colors.surface,
  },
  activationStepText: {
    color: Colors.gray[400],
    fontSize: 10,
    fontWeight: '900',
  },
  adminActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  adminButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  adminButtonText: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.55,
  },
  providerOptionList: {
    gap: 8,
    marginBottom: 12,
  },
  providerOptionCard: {
    borderWidth: 1,
    borderColor: Colors.gray[800],
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 11,
    backgroundColor: Colors.surface,
  },
  providerOptionCardActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + '10',
  },
  providerOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 5,
  },
  providerOptionTitle: {
    flex: 1,
    color: Colors.gray[300],
    fontSize: 13,
    fontWeight: '900',
  },
  providerOptionTitleActive: {
    color: Colors.white,
  },
  providerOptionBadge: {
    color: Colors.accent,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  providerOptionDetail: {
    color: Colors.gray[500],
    fontSize: 11,
    lineHeight: 16,
  },
  inventoryLockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  inventoryLockBadge: {
    flex: 1,
    minHeight: 34,
    borderWidth: 1,
    borderColor: Colors.gray[800],
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: Colors.surface,
  },
  inventoryLockText: {
    color: Colors.gray[300],
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  smallOutlineButton: {
    minHeight: 34,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  smallOutlineButtonText: {
    color: Colors.accent,
    fontSize: 11,
    fontWeight: '900',
  },
  inventorySummaryList: {
    borderWidth: 1,
    borderColor: Colors.gray[800],
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  inventorySummaryRow: {
    paddingVertical: 10,
    paddingHorizontal: 11,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[800],
  },
  inventorySummaryLabel: {
    color: Colors.gray[500],
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  inventorySummaryValue: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  registryBadge: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: Colors.green[900],
  },
  registryBadgeWarn: {
    backgroundColor: Colors.orange[900],
  },
  registryBadgeText: {
    color: Colors.gray[300],
    fontSize: 11,
    fontWeight: '700',
  },
  saveCredentialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingVertical: 12,
    marginTop: 4,
  },
  grantButton: {
    flex: 1,
    marginTop: 0,
  },
  saveCredentialButtonText: {
    color: Colors.black,
    fontSize: 13,
    fontWeight: '800',
  },
  adminStatusText: {
    color: Colors.gray[400],
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
  },
  credentialList: {
    gap: 8,
    marginTop: 12,
  },
  superAdminDivider: {
    height: 1,
    backgroundColor: Colors.gray[800],
    marginVertical: 18,
  },
  credentialCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.gray[800],
    backgroundColor: Colors.gray[900],
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  credentialInfo: {
    flex: 1,
    minWidth: 0,
  },
  credentialRefText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  credentialMetaText: {
    color: Colors.gray[500],
    fontSize: 10,
    lineHeight: 14,
    marginTop: 2,
  },
  inviteCodeText: {
    color: Colors.accent,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
    fontWeight: '800',
  },
  deleteCredentialButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.red[900],
  },
  policyPanel: {
    borderWidth: 1,
    borderColor: Colors.gray[800],
    borderRadius: 8,
    padding: 14,
    marginBottom: 24,
    backgroundColor: Colors.mode === 'dark' ? 'rgba(0,0,0,0.25)' : Colors.surface,
  },
  policyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  policyTitle: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
  policyText: {
    color: Colors.gray[400],
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  linkList: {
    gap: 8,
  },
  policyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: Colors.gray[800],
  },
  policyLinkText: {
    flex: 1,
    color: Colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: Colors.black,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
