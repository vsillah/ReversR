import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { AppColors, Radii, Spacing, FontSizes, Typography, makeShadows } from '../constants/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { Badge, Card, PrimaryButton, SectionHeader } from './ui';
import {
  formatReleaseDate,
  getInstalledBuildLabel,
  installedAppVersion,
  useLaunchUpdateCoordinator,
} from '../hooks/useLaunchUpdateCoordinator';

const staticAppConfig = require('../app.json') as {
  expo?: {
    version?: string;
    extra?: Record<string, unknown>;
  };
};

interface WelcomeScreenProps {
  onStart: () => void;
  onHistory?: () => void;
  onSettings?: () => void;
  onProfile?: () => void;
  onTour?: () => void;
  userDisplayName?: string;
  userIsAuthenticated?: boolean;
  userAvatarUri?: string;
}

const phases = [
  {
    number: 1,
    title: 'Scan',
    icon: 'scan-outline' as const,
    description: 'Capture or describe a machine and identify visible assemblies, parts, and signals.',
  },
  {
    number: 2,
    title: 'Inventory',
    icon: 'git-branch-outline' as const,
    description: 'Connect an admin-approved machine inventory and match the scan to a known record.',
  },
  {
    number: 3,
    title: 'Design',
    icon: 'pencil' as const,
    description: 'Generate reconstruction specs, visual references, and 3D modeling handoff files.',
  },
  {
    number: 4,
    title: 'Build',
    icon: 'hammer-outline' as const,
    description: 'Build a BOM, assembly sequence, pricing estimate, and fabrication handoff.',
  },
];

const expoConfig = Constants.expoConfig;
const releaseExtra = (expoConfig?.extra || {}) as Record<string, unknown>;
const staticReleaseExtra = staticAppConfig.expo?.extra || {};
const releaseDate = typeof releaseExtra.releaseDate === 'string'
  ? releaseExtra.releaseDate
  : typeof staticReleaseExtra.releaseDate === 'string'
    ? staticReleaseExtra.releaseDate
    : undefined;

const greetingForHour = (hour: number): string => {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

export default function WelcomeScreen({
  onStart,
  onHistory,
  onSettings,
  onProfile,
  onTour,
  userDisplayName = 'Guest',
  userIsAuthenticated = false,
  userAvatarUri = '',
}: WelcomeScreenProps) {
  const { colors: Colors, mode: themeMode, setMode: setThemeMode } = useAppTheme();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const updateCoordinator = useLaunchUpdateCoordinator();
  const showUpdateBanner = [
    'ota-downloading',
    'ota-ready',
    'native-available',
    'native-required',
    'error',
  ].includes(updateCoordinator.status);
  const styles = createStyles(Colors);
  const hasMenuActions = Boolean(onHistory || onSettings || onTour);
  const profileIcon = userIsAuthenticated ? 'person-circle-outline' : 'person-outline';
  const buildLabel = getInstalledBuildLabel();
  const greeting = greetingForHour(new Date().getHours());
  const footerLabel = [
    `Version ${installedAppVersion}`,
    buildLabel,
    `Released ${formatReleaseDate(releaseDate)}`,
  ].filter(Boolean).join(' - ');

  const handleUpdateAction = React.useCallback(() => {
    if (updateCoordinator.status === 'ota-ready') {
      updateCoordinator.applyOtaUpdate().catch(() => undefined);
      return;
    }

    if (updateCoordinator.status === 'error') {
      updateCoordinator.checkNow().catch(() => undefined);
      return;
    }

    updateCoordinator.openNativeUpdate().catch(() => undefined);
  }, [updateCoordinator]);

  const handleMenuAction = React.useCallback((action?: () => void) => {
    setMenuOpen(false);
    action?.();
  }, []);

  const nextThemeMode = themeMode === 'dark' ? 'light' : 'dark';
  const handleToggleTheme = React.useCallback(() => {
    setThemeMode(nextThemeMode).catch(error => {
      console.error('Failed to update appearance theme', error);
    });
  }, [nextThemeMode, setThemeMode]);

  const quickActions: Array<{
    key: string;
    label: string;
    description: string;
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
    testID?: string;
    accessibilityLabel: string;
  }> = [];
  if (onHistory) {
    quickActions.push({
      key: 'history',
      label: 'History',
      description: 'Resume saved reconstructions',
      icon: 'time-outline',
      onPress: () => handleMenuAction(onHistory),
      accessibilityLabel: 'Open reconstruction history',
    });
  }
  if (onTour) {
    quickActions.push({
      key: 'tour',
      label: 'Guided tour',
      description: 'Learn the four-phase flow',
      icon: 'compass-outline',
      onPress: () => handleMenuAction(onTour),
      testID: 'reversr-tour-start',
      accessibilityLabel: 'Start guided tour',
    });
  }
  if (onSettings) {
    quickActions.push({
      key: 'settings',
      label: 'Settings',
      description: 'Account, AI, and inventory',
      icon: 'settings-outline',
      onPress: () => handleMenuAction(onSettings),
      accessibilityLabel: 'Open settings',
    });
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.content}>
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <Image
              source={require('../assets/logo-transparent.png')}
              style={styles.brandLogo}
              resizeMode="contain"
            />
            <Text style={styles.brandWordmark}>
              REVERS<Text style={styles.brandWordmarkAccent}>R</Text>
            </Text>
          </View>

          <View style={styles.topActions}>
            {(onProfile || onSettings) && (
              <TouchableOpacity
                style={[styles.profileButton, userIsAuthenticated && styles.profileButtonActive]}
                onPress={() => handleMenuAction(onProfile || onSettings)}
                accessibilityRole="button"
                accessibilityLabel={userIsAuthenticated ? `Open profile for ${userDisplayName}` : 'Open guest profile'}
                testID="welcome-profile-chip"
              >
                {userAvatarUri ? (
                  <Image source={{ uri: userAvatarUri }} style={styles.profileAvatarThumb} resizeMode="cover" />
                ) : (
                  <Ionicons
                    name={profileIcon}
                    size={18}
                    color={userIsAuthenticated ? Colors.accent : Colors.mutedText}
                  />
                )}
                <Text
                  style={[styles.profileButtonText, userIsAuthenticated && styles.profileButtonTextActive]}
                  numberOfLines={1}
                >
                  {userDisplayName}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleToggleTheme}
              accessibilityRole="button"
              accessibilityLabel={nextThemeMode === 'dark' ? 'Use dark mode' : 'Use light mode'}
              testID="welcome-appearance-toggle"
            >
              <Ionicons
                name={nextThemeMode === 'dark' ? 'moon-outline' : 'sunny-outline'}
                size={20}
                color={Colors.text}
              />
            </TouchableOpacity>

            {hasMenuActions && (
              <View style={styles.menuHost}>
                <TouchableOpacity
                  style={[styles.iconButton, menuOpen && styles.iconButtonActive]}
                  onPress={() => setMenuOpen(current => !current)}
                  accessibilityRole="button"
                  accessibilityLabel={menuOpen ? 'Close welcome menu' : 'Open welcome menu'}
                  accessibilityState={{ expanded: menuOpen }}
                  testID="welcome-actions-menu-button"
                >
                  <Ionicons name={menuOpen ? 'close-outline' : 'menu-outline'} size={22} color={Colors.text} />
                </TouchableOpacity>

                {menuOpen && (
                  <View style={styles.menuPanel} testID="welcome-actions-menu">
                    {onHistory && (
                      <TouchableOpacity
                        style={styles.menuItem}
                        onPress={() => handleMenuAction(onHistory)}
                        accessibilityRole="button"
                        accessibilityLabel="Open reconstruction history"
                      >
                        <Ionicons name="time-outline" size={18} color={Colors.primary} />
                        <Text style={styles.menuItemText}>History</Text>
                      </TouchableOpacity>
                    )}

                    {onSettings && (
                      <TouchableOpacity
                        style={styles.menuItem}
                        onPress={() => handleMenuAction(onSettings)}
                        accessibilityRole="button"
                        accessibilityLabel="Open settings"
                      >
                        <Ionicons name="settings-outline" size={18} color={Colors.primary} />
                        <Text style={styles.menuItemText}>Settings</Text>
                      </TouchableOpacity>
                    )}

                    {onTour && (
                      <TouchableOpacity
                        style={styles.menuItem}
                        onPress={() => handleMenuAction(onTour)}
                        accessibilityRole="button"
                        accessibilityLabel="Start guided tour"
                      >
                        <Ionicons name="compass-outline" size={18} color={Colors.primary} />
                        <Text style={styles.menuItemText}>Tour</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            )}
          </View>
        </View>

        <View style={styles.greetingBlock}>
          <Text style={styles.greetingHello}>{greeting},</Text>
          <Text style={styles.greetingName} numberOfLines={1}>{userDisplayName}</Text>
          <Text style={styles.greetingTagline}>Machine reconstruction. Smarter. Faster. Proven.</Text>
        </View>

        <Card style={styles.heroCard} testID="reversr-tour-welcome">
          <View style={styles.heroTop}>
            <View style={styles.heroIconWrap}>
              <Ionicons name="construct-outline" size={26} color={Colors.primary} />
            </View>
            <Badge label="AI-assisted" tone="primary" icon="sparkles-outline" />
          </View>
          <Text style={styles.heroTitle}>Let&apos;s rebuild</Text>
          <Text style={styles.heroBody}>
            Scan a machine, match it to inventory, and rebuild the path from parts to assembly — with
            reconstruction packages, BOMs, pricing, and 3D modeling handoff.
          </Text>
          <PrimaryButton
            label="New Reconstruction"
            icon="arrow-forward"
            onPress={() => {
              setMenuOpen(false);
              onStart();
            }}
            accessibilityLabel="Start new machine reconstruction"
            style={styles.heroButton}
          />
        </Card>

        {showUpdateBanner && (
          <View
            style={[
              styles.updateBanner,
              updateCoordinator.status === 'error' && styles.updateBannerError,
              updateCoordinator.status === 'ota-ready' && styles.updateBannerReady,
            ]}
            accessibilityRole="alert"
            testID="welcome-update-banner"
          >
            <Ionicons
              name={updateCoordinator.status === 'ota-ready' ? 'refresh-circle-outline' : 'cloud-download-outline'}
              size={22}
              color={updateCoordinator.status === 'error' ? Colors.danger : Colors.warning}
            />
            <View style={styles.updateBannerText}>
              <Text style={styles.updateTitle}>{updateCoordinator.updateTitle}</Text>
              <Text style={styles.updateDescription}>
                {updateCoordinator.updateDescription}
              </Text>
              {updateCoordinator.errorMessage && (
                <Text style={styles.updateMeta}>
                  {updateCoordinator.errorMessage}
                </Text>
              )}
              {updateCoordinator.status !== 'ota-downloading' && (
                <TouchableOpacity
                  style={styles.updateButton}
                  onPress={handleUpdateAction}
                  accessibilityRole="button"
                  accessibilityLabel={updateCoordinator.updateActionLabel}
                >
                  <Text style={styles.updateButtonText}>{updateCoordinator.updateActionLabel}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <SectionHeader title="Reconstruction path" />
          <View style={styles.phaseList}>
            {phases.map((phase, index) => (
              <View key={phase.number} style={styles.phaseRow}>
                <View style={styles.phaseRail}>
                  <View style={styles.phaseNode}>
                    <Ionicons name={phase.icon} size={16} color={Colors.primary} />
                  </View>
                  {index < phases.length - 1 ? <View style={styles.phaseConnector} /> : null}
                </View>
                <View style={styles.phaseTextWrap}>
                  <Text style={styles.phaseTitle}>
                    {phase.number}. {phase.title}
                  </Text>
                  <Text style={styles.phaseDescription}>{phase.description}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {quickActions.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Shortcuts" />
            <View style={styles.shortcutGrid}>
              {quickActions.map(action => (
                <Card
                  key={action.key}
                  style={styles.shortcutCard}
                  padded={false}
                  onPress={action.onPress}
                  accessibilityLabel={action.accessibilityLabel}
                  testID={action.testID}
                >
                  <View style={styles.shortcutInner}>
                    <View style={styles.shortcutIcon}>
                      <Ionicons name={action.icon} size={18} color={Colors.primary} />
                    </View>
                    <Text style={styles.shortcutLabel}>{action.label}</Text>
                    <Text style={styles.shortcutDescription} numberOfLines={2}>{action.description}</Text>
                  </View>
                </Card>
              ))}
            </View>
          </View>
        )}

        <Text
          style={styles.releaseFooter}
          accessibilityLabel={`Installed tester build ${footerLabel}`}
          testID="welcome-release-footer"
        >
          {footerLabel}
        </Text>
      </View>
    </ScrollView>
  );
}

const createStyles = (Colors: AppColors) => {
  const shadows = makeShadows(Colors);
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.background,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.md,
      paddingBottom: Spacing.xl,
    },
    content: {
      width: '100%',
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 44,
      marginBottom: Spacing.lg,
      zIndex: 20,
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      flexShrink: 1,
    },
    brandLogo: {
      width: 34,
      height: 34,
    },
    brandWordmark: {
      fontFamily: 'monospace',
      fontSize: 20,
      fontWeight: 'bold',
      color: Colors.text,
      letterSpacing: 2,
    },
    brandWordmarkAccent: {
      color: Colors.accent,
    },
    topActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: Spacing.sm,
      flexShrink: 0,
    },
    profileButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      height: 40,
      maxWidth: 132,
      borderRadius: Radii.pill,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.surface,
      paddingHorizontal: Spacing.sm,
    },
    profileButtonActive: {
      borderColor: Colors.accent,
      backgroundColor: Colors.accentSoft,
    },
    profileAvatarThumb: {
      width: 24,
      height: 24,
      borderRadius: 999,
      backgroundColor: Colors.elevated,
    },
    profileButtonText: {
      color: Colors.mutedText,
      fontSize: FontSizes.xs,
      fontWeight: '700',
      flexShrink: 1,
    },
    profileButtonTextActive: {
      color: Colors.accent,
    },
    menuHost: {
      position: 'relative',
      alignItems: 'flex-end',
    },
    iconButton: {
      width: 40,
      height: 40,
      borderRadius: Radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.surface,
    },
    iconButtonActive: {
      borderColor: Colors.primary,
      backgroundColor: Colors.primarySoft,
    },
    menuPanel: {
      position: 'absolute',
      top: 48,
      right: 0,
      width: 184,
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: Radii.md,
      backgroundColor: Colors.panel,
      paddingVertical: Spacing.xs,
      ...shadows.elevated,
      zIndex: 30,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      minHeight: 44,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
    },
    menuItemText: {
      color: Colors.text,
      fontSize: FontSizes.sm,
      fontWeight: '700',
    },
    greetingBlock: {
      marginBottom: Spacing.md,
    },
    greetingHello: {
      ...Typography.body,
      color: Colors.mutedText,
    },
    greetingName: {
      ...Typography.display,
      color: Colors.text,
    },
    greetingTagline: {
      ...Typography.caption,
      color: Colors.dimText,
      marginTop: 2,
    },
    heroCard: {
      marginBottom: Spacing.lg,
      gap: Spacing.sm,
    },
    heroTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    heroIconWrap: {
      width: 46,
      height: 46,
      borderRadius: Radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.primarySoft,
    },
    heroTitle: {
      ...Typography.title,
      color: Colors.text,
      marginTop: Spacing.xs,
    },
    heroBody: {
      ...Typography.body,
      color: Colors.mutedText,
    },
    heroButton: {
      marginTop: Spacing.sm,
    },
    updateBanner: {
      width: '100%',
      flexDirection: 'row',
      gap: Spacing.sm,
      backgroundColor: Colors.warningSoft,
      borderWidth: 1,
      borderColor: Colors.warning,
      borderRadius: Radii.md,
      padding: Spacing.md,
      marginBottom: Spacing.lg,
    },
    updateBannerReady: {
      backgroundColor: Colors.accentSoft,
      borderColor: Colors.accent,
    },
    updateBannerError: {
      backgroundColor: Colors.dangerSoft,
      borderColor: Colors.danger,
    },
    updateBannerText: {
      flex: 1,
      gap: Spacing.xs,
    },
    updateTitle: {
      fontSize: FontSizes.md,
      fontWeight: '700',
      color: Colors.text,
    },
    updateDescription: {
      fontSize: FontSizes.sm,
      color: Colors.mutedText,
      lineHeight: 18,
    },
    updateMeta: {
      fontSize: FontSizes.xs,
      color: Colors.dim,
      lineHeight: 16,
    },
    updateButton: {
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: Colors.warning,
      borderRadius: Radii.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      marginTop: Spacing.xs,
    },
    updateButtonText: {
      fontSize: FontSizes.sm,
      fontWeight: '700',
      color: Colors.warning,
    },
    section: {
      marginBottom: Spacing.lg,
    },
    phaseList: {
      backgroundColor: Colors.surface,
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: Radii.lg,
      padding: Spacing.md,
      ...shadows.card,
    },
    phaseRow: {
      flexDirection: 'row',
      gap: Spacing.md,
    },
    phaseRail: {
      alignItems: 'center',
      width: 36,
    },
    phaseNode: {
      width: 36,
      height: 36,
      borderRadius: Radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.primarySoft,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    phaseConnector: {
      flex: 1,
      width: 2,
      minHeight: 16,
      marginVertical: 4,
      backgroundColor: Colors.border,
    },
    phaseTextWrap: {
      flex: 1,
      paddingBottom: Spacing.md,
      gap: 2,
    },
    phaseTitle: {
      fontSize: FontSizes.lg,
      fontWeight: '700',
      color: Colors.text,
    },
    phaseDescription: {
      fontSize: FontSizes.sm,
      color: Colors.dimText,
      lineHeight: 20,
    },
    shortcutGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
    },
    shortcutCard: {
      flexGrow: 1,
      flexBasis: '30%',
      minWidth: 100,
    },
    shortcutInner: {
      padding: Spacing.md,
      gap: 6,
    },
    shortcutIcon: {
      width: 36,
      height: 36,
      borderRadius: Radii.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.primarySoft,
      marginBottom: 2,
    },
    shortcutLabel: {
      fontSize: FontSizes.md,
      fontWeight: '700',
      color: Colors.text,
    },
    shortcutDescription: {
      fontSize: FontSizes.xs,
      color: Colors.dimText,
      lineHeight: 15,
    },
    releaseFooter: {
      marginTop: Spacing.sm,
      fontSize: FontSizes.xs,
      color: Colors.dim,
      textAlign: 'center',
      lineHeight: 16,
    },
  });
};
