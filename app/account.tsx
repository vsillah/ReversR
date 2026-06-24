import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../constants/theme';
import { CommercialPlanId, useCommercialization } from '../hooks/useCommercialization';
import { useAppTheme } from '../hooks/useAppTheme';
import { formatCreditPeriod, formatJourneyCreditLabel, formatResetCountdown } from '../utils/commercialUsage';
import { ensureFocusedFieldVisible } from '../utils/focusVisibility';

export default function AccountScreen() {
  const { colors: Colors } = useAppTheme();
  const styles = createStyles(Colors);
  const {
    account,
    profile,
    loading,
    error,
    isWebBillingAvailable,
    saveProfile,
    beginCheckout,
    openBillingPortal,
    refreshAccount,
  } = useCommercialization();
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [shopName, setShopName] = useState(profile.shopName);
  const [status, setStatus] = useState<string | null>(null);
  const [countdownNow, setCountdownNow] = useState(Date.now());
  const accountScrollRef = useRef<ScrollView>(null);
  const accountFocusVisibilityProps = {
    onFocusCapture: (event: any) => ensureFocusedFieldVisible(accountScrollRef, event),
  } as any;

  useEffect(() => {
    setName(profile.name);
    setEmail(profile.email);
    setShopName(profile.shopName);
  }, [profile]);

  useEffect(() => {
    const timer = setInterval(() => setCountdownNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const plans = account?.plans || [];
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
  const planCreditLabel = (plan: { monthlyCredits: number | null; creditPeriod?: string | null }) => {
    if (plan.monthlyCredits === null) return 'Unlimited journey credits';
    return `${plan.monthlyCredits} journey ${plan.monthlyCredits === 1 ? 'credit' : 'credits'}/${formatCreditPeriod(plan.creditPeriod)}`;
  };

  const handleSaveProfile = async () => {
    setStatus(null);
    await saveProfile({ name, email, shopName });
    setStatus('Profile saved.');
  };

  const handleBillingAction = async (action: () => Promise<void>) => {
    setStatus(null);
    try {
      await action();
    } catch (billingError: any) {
      setStatus(billingError?.message || 'Billing action is unavailable.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
    >
    <ScrollView
      ref={accountScrollRef}
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      {...accountFocusVisibilityProps}
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.kicker}>ReversR Commercial Account</Text>
          <Text style={styles.title}>Repair shop plan and credits</Text>
        </View>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={refreshAccount}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Refresh account"
        >
          <Ionicons name="refresh-outline" size={18} color={Colors.accent} />
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <View style={styles.planHeader}>
          <View>
            <Text style={styles.sectionTitle}>{account?.billing.planLabel || 'Free'}</Text>
            <Text style={styles.mutedText}>
              {account?.billing.subscriptionStatus && account.billing.subscriptionStatus !== 'none'
                ? account.billing.subscriptionStatus
                : 'Free journey trial'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => handleBillingAction(openBillingPortal)}
            disabled={!isWebBillingAvailable || loading}
            accessibilityRole="button"
            accessibilityLabel="Manage billing"
          >
            <Ionicons name="card-outline" size={16} color={Colors.accent} />
            <Text style={styles.secondaryButtonText}>Billing Portal</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.usageHeader}>
          <Text style={styles.label}>Reconstruction journey credits</Text>
          <Text style={styles.usageText}>
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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile</Text>
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          accessibilityLabel="Profile name"
          placeholder="Repair shop owner"
          placeholderTextColor={Colors.gray[500]}
        />
        <Text style={styles.label}>Work email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          accessibilityLabel="Profile email"
          placeholder="owner@example.com"
          placeholderTextColor={Colors.gray[500]}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Text style={styles.label}>Shop name</Text>
        <TextInput
          style={styles.input}
          value={shopName}
          onChangeText={setShopName}
          accessibilityLabel="Shop name"
          placeholder="Precision Repair Shop"
          placeholderTextColor={Colors.gray[500]}
        />
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleSaveProfile}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Save commercial profile"
        >
          <Text style={styles.primaryButtonText}>{loading ? 'Saving...' : 'Save Profile'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Upgrade Options</Text>
        <Text style={styles.helpText}>
          Stripe checkout is available only from this hosted web account page. Native tester builds show plan status and credits without external purchase links.
        </Text>
        <View style={styles.planGrid}>
          {plans.map(plan => (
            <View key={plan.id} style={styles.planOption}>
              <View style={styles.planOptionHeader}>
                <Text style={styles.planName}>{plan.label}</Text>
                <Text style={styles.planPrice}>
                  {plan.priceMonthly === 0 ? 'Free' : `$${plan.priceMonthly}/mo`}
                </Text>
              </View>
              <Text style={styles.mutedText}>
                {planCreditLabel(plan)} | {plan.seats} seat{plan.seats === 1 ? '' : 's'}
              </Text>
              <View style={styles.featureList}>
                {plan.features.map(feature => (
                  <View key={feature} style={styles.featureRow}>
                    <Ionicons name="checkmark-circle-outline" size={14} color={Colors.success} />
                    <Text style={styles.featureText}>{feature}</Text>
                  </View>
                ))}
              </View>
              {plan.id !== 'free' && (
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => handleBillingAction(() => beginCheckout(plan.id as CommercialPlanId))}
                  disabled={Platform.OS !== 'web' || loading}
                  accessibilityRole="button"
                  accessibilityLabel={`Start ${plan.label} checkout`}
                >
                  <Ionicons name="open-outline" size={16} color={Colors.accent} />
                  <Text style={styles.secondaryButtonText}>Start Checkout</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      </View>

      {(status || error) && <Text style={styles.statusText}>{status || error}</Text>}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (Colors: AppColors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    width: '100%',
    maxWidth: 920,
    alignSelf: 'center',
    padding: 20,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  kicker: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '900',
    marginTop: 4,
  },
  section: {
    borderWidth: 1,
    borderColor: Colors.gray[800],
    borderRadius: 8,
    padding: 16,
    backgroundColor: Colors.panel,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  mutedText: {
    color: Colors.gray[400],
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  usageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  label: {
    color: Colors.gray[300],
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
    marginTop: 10,
  },
  usageText: {
    color: Colors.accent,
    fontSize: 13,
    fontWeight: '900',
  },
  usageTrack: {
    height: 9,
    borderRadius: 999,
    backgroundColor: Colors.gray[800],
    overflow: 'hidden',
  },
  usageFill: {
    height: '100%',
    backgroundColor: Colors.accent,
  },
  helpText: {
    color: Colors.gray[500],
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
  },
  input: {
    backgroundColor: Colors.gray[800],
    borderWidth: 1,
    borderColor: Colors.gray[700],
    borderRadius: 8,
    padding: 12,
    color: Colors.text,
    fontSize: 15,
    marginBottom: 4,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 12,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    color: Colors.accent,
    fontSize: 13,
    fontWeight: '800',
  },
  iconButton: {
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 8,
    padding: 9,
  },
  planGrid: {
    gap: 12,
    marginTop: 12,
  },
  planOption: {
    borderWidth: 1,
    borderColor: Colors.gray[800],
    borderRadius: 8,
    padding: 14,
    backgroundColor: Colors.surface,
    gap: 10,
  },
  planOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  planName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  planPrice: {
    color: Colors.accent,
    fontSize: 14,
    fontWeight: '900',
  },
  featureList: {
    gap: 6,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  featureText: {
    flex: 1,
    color: Colors.gray[300],
    fontSize: 12,
    lineHeight: 16,
  },
  statusText: {
    color: Colors.gray[300],
    fontSize: 13,
    lineHeight: 19,
  },
});
