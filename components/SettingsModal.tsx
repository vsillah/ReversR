import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, Linking, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { AppColors } from '../constants/theme';
import {
  CommercialAccessGrantSummary,
  CommercialProfile,
  CommercialTesterInviteSummary,
  TesterInvitePlatform,
  createCommercialTesterInvite,
  listCommercialAccessGrants,
  listCommercialTesterInvites,
  revokeCommercialAccessGrant,
  revokeCommercialTesterInvite,
  saveCommercialAccessGrant,
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
import { formatJourneyCreditLabel, formatResetCountdown } from '../utils/commercialUsage';
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

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function SettingsModal({ visible, onClose }: SettingsModalProps) {
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
  const [accessStatus, setAccessStatus] = useState<string | null>(null);
  const [accessGrants, setAccessGrants] = useState<CommercialAccessGrantSummary[]>([]);
  const [testerInvites, setTesterInvites] = useState<CommercialTesterInviteSummary[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePlatform, setInvitePlatform] = useState<TesterInvitePlatform>('both');
  const [grantClientId, setGrantClientId] = useState('');
  const [grantEmail, setGrantEmail] = useState('');
  const [grantProfileName, setGrantProfileName] = useState('');
  const [grantShopName, setGrantShopName] = useState('');
  const [grantStartingPassword, setGrantStartingPassword] = useState('');
  const [countdownNow, setCountdownNow] = useState(Date.now());

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
      loadSettings();
      loadAiRuntimeStatus();
      refreshAccount();
    } else {
      setCredentialValue('');
    }
  }, [visible]);

  useEffect(() => {
    setCommercialProfile(profile);
  }, [profile, visible]);

  useEffect(() => {
    const timer = setInterval(() => setCountdownNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

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
      setAccessStatus('Access password cleared. This profile is now showing the normal guest/free experience.');
    } catch (e: any) {
      setAccessStatus(e?.message || 'Unable to clear access password.');
    }
  };

  const handleRedeemTesterInvite = async () => {
    setAccessStatus(null);
    try {
      await redeemTesterInvite(testerInviteCode);
      setTesterInviteCode('');
      setAccessPassword('');
      setNewAccessPassword('');
      setAccessStatus('Tester access activated on this device. No starter password is needed.');
    } catch (e: any) {
      setAccessStatus(e?.message || 'Unable to redeem tester invite.');
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

    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      setAdminStatus('Tester email is required to create an invite code.');
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
      setAdminStatus(`Created tester invite for ${result.invite.email}. Copy this activation code now: ${result.invite.activationCode}`);
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

    if (!grantStartingPassword.trim()) {
      setAdminStatus('Starting password is required for a commercial access grant.');
      return;
    }

    setAdminLoading(true);
    setAdminStatus(null);
    try {
      const result = await saveCommercialAccessGrant(token, {
        clientId: grantClientId.trim(),
        email: grantEmail.trim(),
        profileName: grantProfileName.trim(),
        shopName: grantShopName.trim(),
        startingPassword: grantStartingPassword.trim(),
      });
      setGrantStartingPassword('');
      setAccessGrants(prev => {
        const others = prev.filter(item => item.grantId !== result.grant.grantId);
        return [result.grant, ...others].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      });
      setAdminStatus(`Saved tester grant for ${result.grant.clientId || result.grant.email || result.grant.profileName || result.grant.shopName}. Give the starting password to the tester and have them reset it.`);
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
    try {
      await saveProfile(commercialProfile);
      setCommercialStatus('Saved repair shop profile and refreshed plan usage.');
    } catch (e: any) {
      setCommercialStatus(e?.message || 'Unable to save repair shop profile.');
    }
  };

  const handleCommercialAction = async (action: () => Promise<void>) => {
    setCommercialStatus(null);
    try {
      await action();
    } catch (e: any) {
      setCommercialStatus(e?.message || 'Billing action is not available yet.');
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
    ? 'No monthly reset limit'
    : formatResetCountdown(account?.usage.resetAt, countdownNow);

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

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
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
                <Text style={styles.policyTitle}>Repair Shop Account</Text>
              </View>
              <Text style={styles.policyText}>
                Profiles power monthly reconstruction credits, shop entitlements, and future cloud history. Billing is managed on the ReversR web account page.
              </Text>

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

              <Text style={styles.compactLabel}>Your name</Text>
              <TextInput
                style={styles.input}
                value={commercialProfile.name}
                onChangeText={(name) => setCommercialProfile(prev => ({ ...prev, name }))}
                accessibilityLabel="Commercial profile name"
                placeholder="Repair shop owner"
                placeholderTextColor={Colors.gray[500]}
              />

              <Text style={styles.compactLabel}>Work email</Text>
              <TextInput
                style={styles.input}
                value={commercialProfile.email}
                onChangeText={(email) => setCommercialProfile(prev => ({ ...prev, email }))}
                accessibilityLabel="Commercial profile email"
                placeholder="owner@example.com"
                placeholderTextColor={Colors.gray[500]}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <Text style={styles.compactLabel}>Shop name</Text>
              <TextInput
                style={styles.input}
                value={commercialProfile.shopName}
                onChangeText={(shopName) => setCommercialProfile(prev => ({ ...prev, shopName }))}
                accessibilityLabel="Repair shop name"
                placeholder="Precision Repair Shop"
                placeholderTextColor={Colors.gray[500]}
              />

              <View style={styles.accessPanel}>
                <View style={styles.policyHeader}>
                  <Ionicons name="lock-open-outline" size={18} color={Colors.accent} />
                  <Text style={styles.policyTitle}>Access Password</Text>
                </View>
                <Text style={styles.helpText}>
                  Client ID: {account?.profile.id || 'loading'}
                </Text>
                <Text style={styles.helpText}>
                  Use a tester invite code from ReversR admin to activate this device without sharing a client ID. Starter passwords remain available for legacy tester grants.
                </Text>
                {account?.access?.requiresPasswordReset && (
                  <Text style={styles.adminStatusText}>Starter password reset required for this tester grant.</Text>
                )}

                <Text style={styles.compactLabel}>Tester invite code</Text>
                <TextInput
                  style={styles.input}
                  value={testerInviteCode}
                  onChangeText={setTesterInviteCode}
                  accessibilityLabel="Tester invite code"
                  placeholder="Paste activation code"
                  placeholderTextColor={Colors.gray[500]}
                  autoCapitalize="none"
                />

                <View style={styles.adminActionRow}>
                  <TouchableOpacity
                    style={[styles.saveCredentialButton, styles.grantButton, accountLoading && styles.disabledButton]}
                    onPress={handleRedeemTesterInvite}
                    disabled={accountLoading}
                    accessibilityRole="button"
                    accessibilityLabel="Redeem tester invite code"
                  >
                    <Ionicons name="ticket-outline" size={17} color={Colors.black} />
                    <Text style={styles.saveCredentialButtonText}>Redeem Invite</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.superAdminDivider} />

                <Text style={styles.compactLabel}>Current or starter password</Text>
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

                <Text style={styles.compactLabel}>New password</Text>
                <TextInput
                  style={styles.input}
                  value={newAccessPassword}
                  onChangeText={setNewAccessPassword}
                  accessibilityLabel="New commercial access password"
                  placeholder="Reset after first activation"
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
                    onPress={handleResetAccessPassword}
                    disabled={accountLoading}
                    accessibilityRole="button"
                    accessibilityLabel="Reset commercial access password"
                  >
                    <Ionicons name="refresh-outline" size={16} color={Colors.accent} />
                    <Text style={styles.adminButtonText}>Reset</Text>
                  </TouchableOpacity>
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
                </View>
                {accessStatus && <Text style={styles.adminStatusText}>{accessStatus}</Text>}
              </View>

              <View style={styles.commercialActionRow}>
                <TouchableOpacity
                  style={[styles.adminButton, accountLoading && styles.disabledButton]}
                  onPress={handleSaveCommercialProfile}
                  disabled={accountLoading}
                  accessibilityRole="button"
                  accessibilityLabel="Save repair shop profile"
                >
                  <Ionicons name="save-outline" size={16} color={Colors.accent} />
                  <Text style={styles.adminButtonText}>{accountLoading ? 'Saving...' : 'Save Profile'}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.adminButton, accountLoading && styles.disabledButton]}
                  onPress={() => handleCommercialAction(openBillingPortal)}
                  disabled={accountLoading || !isWebBillingAvailable}
                  accessibilityRole="button"
                  accessibilityLabel="Open web billing portal"
                >
                  <Ionicons name="card-outline" size={16} color={Colors.accent} />
                  <Text style={styles.adminButtonText}>Billing</Text>
                </TouchableOpacity>
              </View>

              {Platform.OS === 'web' ? (
                <View style={styles.webPlanRow}>
                  {account?.plans.filter(plan => plan.id !== 'free').map(plan => (
                    <TouchableOpacity
                      key={plan.id}
                      style={styles.webPlanButton}
                      onPress={() => handleCommercialAction(() => beginCheckout(plan.id))}
                      accessibilityRole="button"
                      accessibilityLabel={`Start ${plan.label} checkout`}
                    >
                      <Text style={styles.webPlanButtonTitle}>{plan.label}</Text>
                      <Text style={styles.webPlanButtonMeta}>${plan.priceMonthly}/mo</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <Text style={styles.helpText}>
                  Mobile tester builds show plan and credit status only. Stripe checkout stays on the hosted web account page for store review safety.
                </Text>
              )}

              {(commercialStatus || accountError) && (
                <Text style={styles.adminStatusText}>{commercialStatus || accountError}</Text>
              )}
            </View>

            {localProviderSettingsEnabled ? (
              <>
                <Text style={styles.label}>AI Provider</Text>
                <View style={styles.providerRow}>
                  <TouchableOpacity
                    style={[styles.providerButton, provider === 'gemini' && styles.providerButtonActive]}
                    onPress={() => setProvider('gemini')}
                    accessibilityRole="button"
                    accessibilityLabel="Use Gemini cloud AI provider"
                    accessibilityState={{ selected: provider === 'gemini' }}
                  >
                    <Text style={[styles.providerButtonText, provider === 'gemini' && styles.providerButtonTextActive]}>Gemini (Cloud)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.providerButton, provider === 'ollama' && styles.providerButtonActive]}
                    onPress={() => setProvider('ollama')}
                    accessibilityRole="button"
                    accessibilityLabel="Use Ollama local AI provider"
                    accessibilityState={{ selected: provider === 'ollama' }}
                  >
                    <Text style={[styles.providerButtonText, provider === 'ollama' && styles.providerButtonTextActive]}>Ollama (Local)</Text>
                  </TouchableOpacity>
                </View>

                {provider === 'ollama' && (
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
                      Note: Local image generation is not supported by Ollama. Image analysis requires a vision model like 'llava'. Ensure Ollama is running on localhost:11434.
                    </Text>
                  </View>
                )}
              </>
            ) : (
              <View style={styles.liveAiPanel}>
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
              </View>
            )}

            <View style={styles.adminPanel}>
              <View style={styles.policyHeader}>
                <Ionicons name="settings-outline" size={18} color={Colors.accent} />
                <Text style={styles.policyTitle}>Inventory Source</Text>
              </View>
              <Text style={styles.policyText}>
                Advanced admin settings for the preconfigured inventory source used during Phase 2 matching. Team plans can connect CSV, API, or ERP inventory sources.
              </Text>

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
            </View>

            {adminCredentialSettingsEnabled && (
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

                <View style={styles.superAdminDivider} />
                <View style={styles.policyHeader}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={Colors.accent} />
                  <Text style={styles.policyTitle}>Super Admin Tester Access</Text>
                </View>
                <Text style={styles.policyText}>
                  Grant tester access by client ID, email, profile name, or shop name. The starting password is hashed on the backend and must be reset by the tester.
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
                  Legacy grants are still available when a tester cannot redeem an invite code.
                </Text>

                <Text style={styles.compactLabel}>Client ID</Text>
                <TextInput
                  style={styles.input}
                  value={grantClientId}
                  onChangeText={setGrantClientId}
                  accessibilityLabel="Commercial access grant client ID"
                  placeholder="client_..."
                  placeholderTextColor={Colors.gray[500]}
                  autoCapitalize="none"
                />

                <Text style={styles.compactLabel}>Email</Text>
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

                <Text style={styles.compactLabel}>Profile name</Text>
                <TextInput
                  style={styles.input}
                  value={grantProfileName}
                  onChangeText={setGrantProfileName}
                  accessibilityLabel="Commercial access grant profile name"
                  placeholder="test3r"
                  placeholderTextColor={Colors.gray[500]}
                />

                <Text style={styles.compactLabel}>Shop name</Text>
                <TextInput
                  style={styles.input}
                  value={grantShopName}
                  onChangeText={setGrantShopName}
                  accessibilityLabel="Commercial access grant shop name"
                  placeholder="QA Repair Shop"
                  placeholderTextColor={Colors.gray[500]}
                />

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
                          {grant.clientId || grant.email || grant.profileName || grant.shopName}
                        </Text>
                        <Text style={styles.credentialMetaText}>
                          {grant.active ? 'active' : 'revoked'} | {grant.mustResetPassword ? 'reset required' : 'password reset'} | {grant.planId}
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
              </View>
            )}

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
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: Colors.gray[900],
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: '88%',
    borderWidth: 1,
    borderColor: Colors.gray[800],
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
    backgroundColor: Colors.gray[900],
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
