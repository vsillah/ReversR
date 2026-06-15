import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { AppColors, Spacing, FontSizes } from '../constants/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { formatReleaseDate, useLaunchUpdateCoordinator } from '../hooks/useLaunchUpdateCoordinator';

const staticAppConfig = require('../app.json') as {
  expo?: {
    version?: string;
    android?: {
      versionCode?: number;
    };
    ios?: {
      buildNumber?: string;
    };
    extra?: Record<string, unknown>;
  };
};

interface WelcomeScreenProps {
  onStart: () => void;
  onHistory?: () => void;
  onSettings?: () => void;
  onTour?: () => void;
  userDisplayName?: string;
  userIsAuthenticated?: boolean;
}

const phases = [
  {
    number: 1,
    title: 'SCAN',
    icon: 'search' as const,
    description: 'Capture or describe a machine and identify visible assemblies, parts, and signals.',
  },
  {
    number: 2,
    title: 'INVENTORY',
    icon: 'git-branch-outline' as const,
    description: 'Connect an admin-approved machine inventory and match the scan to a known record.',
  },
  {
    number: 3,
    title: 'DESIGN',
    icon: 'pencil' as const,
    description: 'Generate reconstruction specs, visual references, and 3D modeling handoff files.',
  },
  {
    number: 4,
    title: 'BUILD',
    icon: 'hammer-outline' as const,
    description: 'Build a BOM, assembly sequence, pricing estimate, and fabrication handoff.',
  },
];

const expoConfig = Constants.expoConfig;
const releaseExtra = (expoConfig?.extra || {}) as Record<string, unknown>;
const staticReleaseExtra = staticAppConfig.expo?.extra || {};
const appVersion = expoConfig?.version || staticAppConfig.expo?.version || 'dev';
const releaseDate = typeof releaseExtra.releaseDate === 'string'
  ? releaseExtra.releaseDate
  : typeof staticReleaseExtra.releaseDate === 'string'
    ? staticReleaseExtra.releaseDate
    : undefined;
const androidVersionCode = expoConfig?.android?.versionCode || staticAppConfig.expo?.android?.versionCode;
const iosBuildNumber = expoConfig?.ios?.buildNumber || staticAppConfig.expo?.ios?.buildNumber;

export default function WelcomeScreen({
  onStart,
  onHistory,
  onSettings,
  onTour,
  userDisplayName = 'Guest',
  userIsAuthenticated = false,
}: WelcomeScreenProps) {
  const { colors: Colors } = useAppTheme();
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
  const buildLabel = Platform.select({
    android: androidVersionCode ? `Android ${androidVersionCode}` : undefined,
    ios: iosBuildNumber ? `iOS ${iosBuildNumber}` : undefined,
    default: undefined,
  });
  const footerLabel = [
    `Version ${appVersion}`,
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

  return (
    <ScrollView 
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.content}>
        {hasMenuActions && (
          <View style={styles.topBar}>
            <View style={styles.topActions}>
              {onSettings && (
                <TouchableOpacity
                  style={[styles.profileButton, userIsAuthenticated && styles.profileButtonActive]}
                  onPress={() => handleMenuAction(onSettings)}
                  accessibilityRole="button"
                  accessibilityLabel={userIsAuthenticated ? `Open account settings for ${userDisplayName}` : 'Open account settings as guest'}
                  testID="welcome-profile-chip"
                >
                  <Ionicons
                    name={profileIcon}
                    size={18}
                    color={userIsAuthenticated ? Colors.accent : Colors.gray[400]}
                  />
                  <Text
                    style={[styles.profileButtonText, userIsAuthenticated && styles.profileButtonTextActive]}
                    numberOfLines={1}
                  >
                    {userDisplayName}
                  </Text>
                </TouchableOpacity>
              )}

              <View style={styles.menuHost}>
                <TouchableOpacity
                  style={[styles.menuButton, menuOpen && styles.menuButtonActive]}
                  onPress={() => setMenuOpen(current => !current)}
                  accessibilityRole="button"
                  accessibilityLabel={menuOpen ? 'Close welcome menu' : 'Open welcome menu'}
                  accessibilityState={{ expanded: menuOpen }}
                  testID="welcome-actions-menu-button"
                >
                  <Ionicons name={menuOpen ? 'close-outline' : 'menu-outline'} size={24} color={Colors.accent} />
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
                        <Ionicons name="time-outline" size={18} color={Colors.accent} />
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
                        <Ionicons name="settings-outline" size={18} color={Colors.accent} />
                        <Text style={styles.menuItemText}>Settings</Text>
                      </TouchableOpacity>
                    )}

                    {onTour && (
                      <TouchableOpacity
                        style={styles.menuItem}
                        onPress={() => handleMenuAction(onTour)}
                        accessibilityRole="button"
                        accessibilityLabel="Start guided tour"
                        testID="reversr-tour-start"
                      >
                        <Ionicons name="compass-outline" size={18} color={Colors.accent} />
                        <Text style={styles.menuItemText}>Tour</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        <View style={styles.logoSection} testID="reversr-tour-welcome">
          <Image
            source={require('../assets/logo-transparent.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>
            REVERS<Text style={styles.titleAccent}>R</Text>
          </Text>
          <Text style={styles.subtitle}>Machine Reconstruction Engine</Text>
        </View>

        <Text style={styles.description}>
          Scan a machine. Match it to inventory. Rebuild the path from parts to assembly.
          {'\n\n'}
          An AI-assisted workflow for reconstruction packages, BOMs, pricing, and 3D modeling handoff.
        </Text>

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

        <View style={styles.phasesContainer}>
          {phases.map((phase) => (
            <View key={phase.number} style={styles.phaseCard}>
              <View style={styles.phaseHeader}>
                <Ionicons name={phase.icon} size={18} color={Colors.accent} />
                <Text style={styles.phaseTitle}>
                  {phase.number}. {phase.title}
                </Text>
              </View>
              <Text style={styles.phaseDescription}>{phase.description}</Text>
            </View>
          ))}
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => {
              setMenuOpen(false);
              onStart();
            }}
            accessibilityRole="button"
            accessibilityLabel="Start new machine reconstruction"
          >
            <Text style={styles.buttonText}>New Reconstruction</Text>
            <Ionicons name="arrow-forward" size={20} color={Colors.accent} />
          </TouchableOpacity>
        </View>

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

const createStyles = (Colors: AppColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  content: {
    alignItems: 'center',
  },
  topBar: {
    width: '100%',
    minHeight: 44,
    alignItems: 'flex-end',
    marginBottom: Spacing.xs,
    zIndex: 20,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    maxWidth: '100%',
  },
  profileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    height: 44,
    maxWidth: 152,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.panel,
    paddingHorizontal: Spacing.sm,
  },
  profileButtonActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.mode === 'dark' ? 'rgba(16, 185, 129, 0.10)' : '#ecfdf5',
  },
  profileButtonText: {
    color: Colors.gray[400],
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
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.panel,
  },
  menuButtonActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.mode === 'dark' ? 'rgba(16, 185, 129, 0.12)' : '#ecfdf5',
  },
  menuPanel: {
    position: 'absolute',
    top: 50,
    right: 0,
    width: 184,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    backgroundColor: Colors.panel,
    paddingVertical: Spacing.xs,
    shadowColor: Colors.black,
    shadowOpacity: Colors.mode === 'dark' ? 0.35 : 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
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
  logoSection: {
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  logo: {
    width: 100,
    height: 100,
    marginBottom: Spacing.xs,
  },
  title: {
    fontFamily: 'monospace',
    fontSize: 36,
    fontWeight: 'bold',
    color: Colors.white,
    letterSpacing: 3,
  },
  titleAccent: {
    color: Colors.accent,
  },
  subtitle: {
    fontSize: FontSizes.lg,
    color: Colors.dim,
    fontStyle: 'italic',
    marginTop: Spacing.xs,
  },
  description: {
    fontSize: FontSizes.sm,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.md,
    lineHeight: 20,
    opacity: 0.8,
  },
  updateBanner: {
    width: '100%',
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: Colors.mode === 'dark' ? 'rgba(253, 186, 116, 0.12)' : '#fff7ed',
    borderWidth: 1,
    borderColor: Colors.warning,
    borderRadius: 8,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  updateBannerReady: {
    backgroundColor: Colors.mode === 'dark' ? 'rgba(16, 185, 129, 0.12)' : '#ecfdf5',
    borderColor: Colors.accent,
  },
  updateBannerError: {
    backgroundColor: Colors.mode === 'dark' ? 'rgba(239, 68, 68, 0.12)' : '#fef2f2',
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
    borderRadius: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.xs,
  },
  updateButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: Colors.warning,
  },
  phasesContainer: {
    width: '100%',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  phaseCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: Spacing.sm,
  },
  phaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  phaseTitle: {
    fontFamily: 'monospace',
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
    color: Colors.accent,
  },
  phaseDescription: {
    fontSize: FontSizes.sm,
    color: Colors.dim,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.mode === 'dark' ? 'transparent' : Colors.surface,
    borderWidth: 2,
    borderColor: Colors.accent,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
    minWidth: 0,
    maxWidth: '100%',
    flexBasis: 220,
    flexGrow: 1,
  },
  buttonText: {
    fontFamily: 'monospace',
    fontSize: FontSizes.md,
    fontWeight: 'bold',
    color: Colors.accent,
    letterSpacing: 1,
    flexShrink: 1,
    textAlign: 'center',
  },
  releaseFooter: {
    marginTop: Spacing.md,
    fontSize: FontSizes.xs,
    color: Colors.dim,
    textAlign: 'center',
    lineHeight: 16,
  },
});
