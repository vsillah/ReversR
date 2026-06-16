import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ImageBackground,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { AppColors, DarkColors, Fonts, Radii, Spacing, FontSizes, Typography, makeShadows } from '../constants/theme';
import { AppThemeContext, useAppTheme } from '../hooks/useAppTheme';
import { Badge, Card, HeroBackdrop, HorizontalStepper } from './ui';
import { getAllInnovations, SavedInnovation } from '../hooks/useStorage';
import { useCommercialization } from '../hooks/useCommercialization';
import { formatResetCountdown } from '../utils/commercialUsage';
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

// Selected Canva hero render. Swap the require path to use a different file in
// assets/hero/canva/. Set to null to fall back to the blueprint backdrop.
const HERO_IMAGE: number | null = require('../assets/hero/canva/hero-heavy-gearbox-pump-assembly.png');

interface WelcomeScreenProps {
  onStart: () => void;
  onHistory?: () => void;
  onSettings?: () => void;
  onProfile?: () => void;
  onTour?: () => void;
  onResume?: (item: SavedInnovation) => void;
  userDisplayName?: string;
  userIsAuthenticated?: boolean;
  userAvatarUri?: string;
  bottomBarInset?: number;
}

const phases = [
  {
    number: 1,
    title: 'Scan',
    icon: 'scan-outline' as const,
    short: 'Capture or describe the machine',
  },
  {
    number: 2,
    title: 'Inventory',
    icon: 'git-branch-outline' as const,
    short: 'Match the scan to a record',
  },
  {
    number: 3,
    title: 'Design',
    icon: 'pencil' as const,
    short: 'Specs, references, and 3D handoff',
  },
  {
    number: 4,
    title: 'Build',
    icon: 'hammer-outline' as const,
    short: 'BOM, assembly, and pricing',
  },
];

const PHASE_NAMES = ['Scan', 'Inventory', 'Design', 'Build'];
const PHASE_STEP_LABELS = ['SCAN', 'INVENTORY', 'DESIGN', 'BUILD'];
const PHASE_STEP_SUBLABELS = ['Capture & identify', 'Catalog parts', 'Engineer & plan', 'Rebuild & test'];

const expoConfig = Constants.expoConfig;
const releaseExtra = (expoConfig?.extra || {}) as Record<string, unknown>;
const staticReleaseExtra = staticAppConfig.expo?.extra || {};
const releaseDate = typeof releaseExtra.releaseDate === 'string'
  ? releaseExtra.releaseDate
  : typeof staticReleaseExtra.releaseDate === 'string'
    ? staticReleaseExtra.releaseDate
    : undefined;

const relativeTime = (iso: string): string => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
};

const reconstructionTitle = (item: SavedInnovation): string =>
  item.analysis?.productName
  || item.innovation?.conceptName
  || (item.input ? item.input.slice(0, 40) : '')
  || 'Untitled reconstruction';

export default function WelcomeScreen({
  onStart,
  onHistory,
  onSettings,
  onProfile,
  onTour,
  onResume,
  userDisplayName = 'Guest',
  userIsAuthenticated = false,
  userAvatarUri = '',
  bottomBarInset = 0,
}: WelcomeScreenProps) {
  // Home is dark-first / cinematic regardless of the global appearance setting.
  const { mode: themeMode, setMode: setThemeMode, hasUserPreference } = useAppTheme();
  const Colors = DarkColors;
  const darkThemeValue = React.useMemo(() => ({
    mode: 'dark' as const,
    colors: DarkColors,
    setMode: setThemeMode,
    isDark: true,
    hasUserPreference,
  }), [setThemeMode, hasUserPreference]);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [recent, setRecent] = React.useState<SavedInnovation[]>([]);
  const scrollY = React.useRef(new Animated.Value(0)).current;
  const updateCoordinator = useLaunchUpdateCoordinator();
  const showUpdateBanner = [
    'ota-downloading',
    'ota-ready',
    'native-available',
    'native-required',
    'error',
  ].includes(updateCoordinator.status);
  const styles = createStyles(Colors);
  const profileIcon = userIsAuthenticated ? 'person-circle-outline' : 'person-outline';
  const buildLabel = getInstalledBuildLabel();
  const footerLabel = [
    `Version ${installedAppVersion}`,
    buildLabel,
    `Released ${formatReleaseDate(releaseDate)}`,
  ].filter(Boolean).join(' - ');

  React.useEffect(() => {
    let mounted = true;
    getAllInnovations()
      .then(items => { if (mounted) setRecent(items); })
      .catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  const currentProject = React.useMemo(
    () => recent.find(item => item.phase < 4) || recent[0] || null,
    [recent],
  );

  const { account } = useCommercialization();
  const usage = account?.usage;
  const creditUnlimited = usage?.unlimitedCredits ?? false;
  const creditRemaining = usage?.remainingCredits ?? null;
  const creditTotal = usage?.monthlyCredits ?? null;
  const creditProgress = creditTotal && creditTotal > 0 && creditRemaining != null
    ? Math.max(0, Math.min(1, creditRemaining / creditTotal))
    : 0;
  const creditResetLabel = usage?.resetAt ? formatResetCountdown(usage.resetAt) : null;

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

  const heroTranslate = scrollY.interpolate({
    inputRange: [-200, 0, 240],
    outputRange: [0, 0, 96],
    extrapolateLeft: 'clamp',
  });
  const heroScale = scrollY.interpolate({
    inputRange: [-220, 0],
    outputRange: [1.32, 1],
    extrapolateRight: 'clamp',
  });

  return (
    <AppThemeContext.Provider value={darkThemeValue}>
    <Animated.ScrollView
      style={styles.container}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: Spacing.xl + bottomBarInset }]}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        { useNativeDriver: true },
      )}
    >
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          {onSettings && (
            <TouchableOpacity
              style={styles.gearButton}
              onPress={() => handleMenuAction(onSettings)}
              accessibilityRole="button"
              accessibilityLabel="Open settings"
            >
              <Ionicons name="settings-outline" size={20} color={Colors.text} />
            </TouchableOpacity>
          )}
          <View style={styles.brandTextWrap}>
            <Text style={styles.brandWordmark}>
              REVERS<Text style={styles.brandWordmarkAccent}>R</Text>
            </Text>
            <Text style={styles.brandSubtitle}>MACHINE RECONSTRUCTION</Text>
          </View>
        </View>

        <View style={styles.menuHost}>
          <TouchableOpacity
            style={[styles.avatarPill, menuOpen && styles.avatarPillActive]}
            onPress={() => setMenuOpen(current => !current)}
            accessibilityRole="button"
            accessibilityLabel={`Open account menu for ${userDisplayName}`}
            accessibilityState={{ expanded: menuOpen }}
            testID="welcome-actions-menu-button"
          >
            <View style={styles.avatarWrap}>
              {userAvatarUri ? (
                <Image source={{ uri: userAvatarUri }} style={styles.avatarImage} resizeMode="cover" />
              ) : (
                <Ionicons name={profileIcon} size={20} color={userIsAuthenticated ? Colors.accent : Colors.mutedText} />
              )}
              {userIsAuthenticated ? <View style={styles.avatarStatusDot} /> : null}
            </View>
            {userIsAuthenticated ? (
              <Text style={styles.avatarName} numberOfLines={1}>{userDisplayName}</Text>
            ) : null}
            <Ionicons name={menuOpen ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.mutedText} />
          </TouchableOpacity>

          {menuOpen && (
            <View style={styles.menuPanel} testID="welcome-actions-menu">
              {(onProfile || onSettings) && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleMenuAction(onProfile || onSettings)}
                  accessibilityRole="button"
                  accessibilityLabel={userIsAuthenticated ? `Open profile for ${userDisplayName}` : 'Open guest profile'}
                  testID="welcome-profile-chip"
                >
                  <Ionicons name="person-circle-outline" size={18} color={Colors.primary} />
                  <Text style={styles.menuItemText}>{userIsAuthenticated ? 'Profile' : 'Guest profile'}</Text>
                </TouchableOpacity>
              )}

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

              {onTour && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleMenuAction(onTour)}
                  accessibilityRole="button"
                  accessibilityLabel="Start guided tour"
                  testID="reversr-tour-start"
                >
                  <Ionicons name="compass-outline" size={18} color={Colors.primary} />
                  <Text style={styles.menuItemText}>Guided tour</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => { setMenuOpen(false); handleToggleTheme(); }}
                accessibilityRole="button"
                accessibilityLabel={nextThemeMode === 'dark' ? 'Use dark mode' : 'Use light mode'}
                testID="welcome-appearance-toggle"
              >
                <Ionicons
                  name={nextThemeMode === 'dark' ? 'moon-outline' : 'sunny-outline'}
                  size={18}
                  color={Colors.primary}
                />
                <Text style={styles.menuItemText}>{nextThemeMode === 'dark' ? 'Dark appearance' : 'Light appearance'}</Text>
              </TouchableOpacity>

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
            </View>
          )}
        </View>
      </View>

      <View style={styles.hero} testID="reversr-tour-welcome">
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { transform: [{ translateY: heroTranslate }, { scale: heroScale }] },
          ]}
        >
          <HeroBackdrop radius={0} />
          {HERO_IMAGE ? (
            <Image
              source={HERO_IMAGE}
              style={[StyleSheet.absoluteFill, { transform: [{ scale: 1.14 }, { translateY: -18 }] }]}
              resizeMode="cover"
            />
          ) : null}
        </Animated.View>
        <LinearGradient
          colors={['rgba(8,9,12,0.20)', 'rgba(8,9,12,0)', 'rgba(8,9,12,0.10)', 'rgba(8,9,12,0.66)', 'rgba(8,9,12,0.98)']}
          locations={[0, 0.18, 0.46, 0.76, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.heroContent}>
          <Badge label="AI-assisted rebuild" tone="accent" icon="sparkles-outline" style={styles.heroBadge} />
          <Text style={styles.heroTitle}>
            Reconstruct.{'\n'}Restore.{'\n'}Rebuild with{'\n'}
            <Text style={styles.heroTitleAccent}>confidence.</Text>
          </Text>
          <Text style={styles.heroBody}>
            From first scan to final build, document every step.
          </Text>

          {currentProject ? (
            <TouchableOpacity
              style={styles.cpCard}
              activeOpacity={0.9}
              onPress={() => (onResume ? onResume(currentProject) : handleMenuAction(onHistory))}
              accessibilityRole="button"
              accessibilityLabel={`Continue current project ${reconstructionTitle(currentProject)}, phase ${Math.min(currentProject.phase, 4)} of 4`}
            >
              <View style={styles.cpTopRow}>
                <View style={styles.cpIcon}>
                  <Ionicons name="scan-outline" size={20} color={Colors.accent} />
                </View>
                <View style={styles.cpHead}>
                  <Text style={styles.cpOverline}>Current project</Text>
                  <Text style={styles.cpName} numberOfLines={1}>{reconstructionTitle(currentProject)}</Text>
                </View>
                <View style={[styles.cpStatus, currentProject.phase >= 4 && styles.cpStatusDone]}>
                  <View style={[styles.cpStatusDot, { backgroundColor: currentProject.phase >= 4 ? Colors.success : Colors.accent }]} />
                  <Text style={styles.cpStatusText}>{currentProject.phase >= 4 ? 'Complete' : 'In progress'}</Text>
                </View>
              </View>

              <View style={styles.cpProgressRow}>
                <View style={styles.cpTrack}>
                  <View style={[styles.cpFill, { width: `${Math.round((Math.min(currentProject.phase, 4) / 4) * 100)}%` }]} />
                </View>
                <Text style={styles.cpPhaseLabel}>Phase {Math.min(currentProject.phase, 4)} of 4</Text>
              </View>

              <View style={styles.cpFootRow}>
                <Text style={styles.cpMeta} numberOfLines={1}>
                  {PHASE_NAMES[Math.min(currentProject.phase, 4) - 1]} · {relativeTime(currentProject.updatedAt || currentProject.createdAt)}
                </Text>
                <View style={styles.cpContinue}>
                  <Text style={styles.cpContinueText}>Continue</Text>
                  <Ionicons name="arrow-forward" size={15} color={Colors.accent} />
                </View>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.cpEmptyCard}>
              <View style={styles.cpTopRow}>
                <View style={styles.cpIcon}>
                  <Ionicons name="sparkles-outline" size={20} color={Colors.accent} />
                </View>
                <View style={styles.cpHead}>
                  <Text style={styles.cpOverline}>Get started</Text>
                  <Text style={styles.cpName} numberOfLines={1}>Your first reconstruction</Text>
                </View>
              </View>
              <Text style={styles.cpEmptySub}>Scan a machine, describe it, or try a sample build.</Text>
              <View style={styles.cpQuickRow}>
                {([
                  { icon: 'camera-outline' as const, label: 'Scan', hint: 'Use camera' },
                  { icon: 'create-outline' as const, label: 'Describe', hint: 'Type details' },
                  { icon: 'cube-outline' as const, label: 'Sample', hint: 'Try a demo' },
                ]).map(action => (
                  <TouchableOpacity
                    key={action.label}
                    style={styles.cpQuickTile}
                    activeOpacity={0.85}
                    onPress={() => { setMenuOpen(false); onStart(); }}
                    accessibilityRole="button"
                    accessibilityLabel={`Start new machine reconstruction — ${action.label}, ${action.hint}`}
                  >
                    <Ionicons name={action.icon} size={20} color={Colors.accent} />
                    <Text style={styles.cpQuickLabel}>{action.label}</Text>
                    <Text style={styles.cpQuickHint}>{action.hint}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>
      </View>

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

      <Card style={styles.stepperCard}>
        <HorizontalStepper
          steps={PHASE_STEP_LABELS}
          subLabels={PHASE_STEP_SUBLABELS}
          currentStep={currentProject ? Math.min(currentProject.phase, 4) : 1}
        />
      </Card>

      <Card
        style={styles.newCard}
        tone="highlight"
        padded={false}
        onPress={() => { setMenuOpen(false); onStart(); }}
        accessibilityLabel="Start new machine reconstruction"
      >
        <View style={styles.newCardInner}>
          <View style={styles.newCardIcon}>
            <Ionicons name="cube-outline" size={26} color={Colors.primary} />
          </View>
          <View style={styles.newCardText}>
            <Text style={styles.newCardTitle}>New Reconstruction</Text>
            <Text style={styles.newCardBody}>Start a new scan or describe the machine you&apos;re working on.</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={Colors.primary} />
        </View>
      </Card>

      <Card style={styles.listCard} padded={false}>
        <View style={styles.listHeader}>
          <View style={styles.listHeaderLeft}>
            <Ionicons name="time-outline" size={18} color={Colors.accent} />
            <Text style={styles.listHeaderTitle}>Recent Projects</Text>
          </View>
          {onHistory && recent.length > 0 ? (
            <TouchableOpacity onPress={() => handleMenuAction(onHistory)} accessibilityRole="button" accessibilityLabel="Open reconstruction history" hitSlop={8}>
              <Text style={styles.listHeaderAction}>View All</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {recent.length > 0 ? (
          recent.slice(0, 3).map((item, idx) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.projectRow, idx > 0 && styles.projectRowDivider]}
              onPress={() => handleMenuAction(onHistory)}
              accessibilityRole="button"
              accessibilityLabel={`${reconstructionTitle(item)}, ${PHASE_NAMES[Math.min(item.phase, 4) - 1]}`}
            >
              <View style={styles.projectThumb}>
                <Ionicons name="cube-outline" size={18} color={Colors.mutedText} />
              </View>
              <View style={styles.projectText}>
                <Text style={styles.projectName} numberOfLines={1}>{reconstructionTitle(item)}</Text>
                <Text style={styles.projectMeta} numberOfLines={1}>
                  {PHASE_NAMES[Math.min(item.phase, 4) - 1]} · {relativeTime(item.updatedAt || item.createdAt)}
                </Text>
              </View>
              <View style={[styles.projectDot, {
                backgroundColor: item.phase >= 4 ? Colors.success : item.phase >= 2 ? Colors.primary : Colors.dimText,
              }]} />
            </TouchableOpacity>
          ))
        ) : (
          <TouchableOpacity
            style={styles.projectEmpty}
            activeOpacity={0.85}
            onPress={() => { setMenuOpen(false); onStart(); }}
            accessibilityRole="button"
            accessibilityLabel="Start new machine reconstruction"
          >
            <View style={styles.projectEmptyIcon}>
              <Ionicons name="cube-outline" size={20} color={Colors.dimText} />
            </View>
            <View style={styles.projectEmptyTextWrap}>
              <Text style={styles.projectEmptyTitle}>No projects yet</Text>
              <Text style={styles.projectEmptyText}>Your saved reconstructions will appear here.</Text>
            </View>
            <Text style={styles.listHeaderAction}>Start</Text>
          </TouchableOpacity>
        )}
      </Card>

      <View style={styles.twoColRow}>
        {onTour ? (
          <Card style={styles.infoCard} padded={false} onPress={() => handleMenuAction(onTour)} accessibilityLabel="Start guided tour" testID="reversr-tour-start">
            <View style={styles.infoCardInner}>
              <View style={styles.infoCardHeader}>
                <Ionicons name="compass-outline" size={18} color={Colors.primary} />
                <Ionicons name="chevron-forward" size={16} color={Colors.dimText} />
              </View>
              <Text style={styles.infoCardTitle}>Guided Tour</Text>
              <Text style={styles.infoCardBody} numberOfLines={3}>Learn how ReversR accelerates your rebuild workflow.</Text>
              <Text style={styles.infoCardLink}>Start Tour</Text>
            </View>
          </Card>
        ) : null}

        <Card style={styles.infoCard} padded={false} onPress={() => router.push('/support')} accessibilityLabel="Open workflow support resources">
          <View style={styles.infoCardInner}>
            <View style={styles.infoCardHeader}>
              <Ionicons name="headset-outline" size={18} color={Colors.primary} />
              <Ionicons name="chevron-forward" size={16} color={Colors.dimText} />
            </View>
            <Text style={styles.infoCardTitle}>Workflow Support</Text>
            <Text style={styles.infoCardBody} numberOfLines={3}>Access documentation, policies, and help resources.</Text>
            <Text style={styles.infoCardLink}>Browse Resources</Text>
          </View>
        </Card>
      </View>

      <Card style={styles.creditCard}>
        <View style={styles.creditHeaderRow}>
          <View style={styles.creditHeaderLeft}>
            <View style={styles.creditIcon}>
              <Ionicons name="hourglass-outline" size={18} color={Colors.accent} />
            </View>
            <Text style={styles.creditTitle}>Journey Credits</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/account')} accessibilityRole="button" accessibilityLabel="Manage journey credits" style={styles.creditManageButton}>
            <Text style={styles.creditManageText}>Manage Credits</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.creditValueRow}>
          <Text style={styles.creditValue}>
            {creditUnlimited ? '∞' : creditRemaining ?? '—'}
            {!creditUnlimited && creditTotal != null ? <Text style={styles.creditValueTotal}> /{creditTotal}</Text> : null}
          </Text>
          {creditResetLabel ? <Text style={styles.creditReset}>{creditResetLabel}</Text> : null}
        </View>
        {!creditUnlimited ? (
          <View style={styles.creditTrack}>
            <View style={[styles.creditFill, { width: `${Math.round(creditProgress * 100)}%` }]} />
          </View>
        ) : null}
      </Card>

      <Text
        style={styles.releaseFooter}
        accessibilityLabel={`Installed tester build ${footerLabel}`}
        testID="welcome-release-footer"
      >
        {footerLabel}
      </Text>
    </Animated.ScrollView>
    </AppThemeContext.Provider>
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
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 44,
      marginBottom: Spacing.md,
      zIndex: 20,
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      flexShrink: 1,
    },
    gearButton: {
      width: 44,
      height: 44,
      borderRadius: Radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.surface,
    },
    brandTextWrap: {
      flexShrink: 1,
      minWidth: 0,
    },
    brandWordmark: {
      fontFamily: Fonts.display,
      fontSize: 20,
      color: Colors.text,
      letterSpacing: 1,
    },
    brandWordmarkAccent: {
      color: Colors.accent,
    },
    brandSubtitle: {
      fontFamily: Fonts.bold,
      fontSize: 9,
      letterSpacing: 2,
      color: Colors.dimText,
      marginTop: 1,
    },
    menuHost: {
      position: 'relative',
      alignItems: 'flex-end',
    },
    avatarPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      height: 44,
      maxWidth: 168,
      borderRadius: Radii.pill,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.surface,
      paddingLeft: 5,
      paddingRight: Spacing.sm,
    },
    avatarPillActive: {
      borderColor: Colors.primary,
      backgroundColor: Colors.primarySoft,
    },
    avatarWrap: {
      width: 34,
      height: 34,
      borderRadius: Radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.elevated,
      overflow: 'hidden',
    },
    avatarImage: {
      width: 34,
      height: 34,
      borderRadius: Radii.pill,
    },
    avatarStatusDot: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      width: 10,
      height: 10,
      borderRadius: Radii.pill,
      backgroundColor: Colors.accent,
      borderWidth: 2,
      borderColor: Colors.background,
    },
    avatarName: {
      color: Colors.text,
      fontFamily: Fonts.semibold,
      fontSize: FontSizes.sm,
      flexShrink: 1,
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
    hero: {
      position: 'relative',
      minHeight: 560,
      borderRadius: Radii.xl,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.08)',
      overflow: 'hidden',
      marginBottom: Spacing.md,
      justifyContent: 'flex-end',
      ...shadows.floating,
    },
    heroContent: {
      padding: Spacing.lg,
      gap: Spacing.sm,
    },
    heroBadge: {
      marginBottom: Spacing.xs,
    },
    heroTitle: {
      fontFamily: Fonts.display,
      fontSize: 36,
      lineHeight: 41,
      letterSpacing: -0.6,
      color: '#ffffff',
    },
    heroTitleAccent: {
      color: Colors.accent,
    },
    heroBody: {
      ...Typography.body,
      color: 'rgba(255,255,255,0.84)',
      maxWidth: '90%',
    },
    cpCard: {
      marginTop: Spacing.md,
      padding: Spacing.md,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.14)',
      backgroundColor: 'rgba(12,15,20,0.66)',
      gap: Spacing.sm,
    },
    cpTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    cpIcon: {
      width: 42,
      height: 42,
      borderRadius: Radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,255,157,0.14)',
      borderWidth: 1,
      borderColor: 'rgba(0,255,157,0.30)',
    },
    cpHead: {
      flex: 1,
      minWidth: 0,
    },
    cpOverline: {
      fontFamily: Fonts.bold,
      fontSize: 10,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: 'rgba(255,255,255,0.55)',
    },
    cpName: {
      fontFamily: Fonts.bold,
      fontSize: FontSizes.lg,
      color: '#ffffff',
    },
    cpStatus: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 4,
      borderRadius: Radii.pill,
      backgroundColor: 'rgba(0,255,157,0.12)',
    },
    cpStatusDone: {
      backgroundColor: Colors.successSoft,
    },
    cpStatusDot: {
      width: 7,
      height: 7,
      borderRadius: 999,
    },
    cpStatusText: {
      fontFamily: Fonts.bold,
      fontSize: 10,
      color: '#ffffff',
    },
    cpProgressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    cpTrack: {
      flex: 1,
      height: 6,
      borderRadius: Radii.pill,
      backgroundColor: 'rgba(255,255,255,0.14)',
      overflow: 'hidden',
    },
    cpFill: {
      height: '100%',
      borderRadius: Radii.pill,
      backgroundColor: Colors.accent,
    },
    cpPhaseLabel: {
      fontFamily: Fonts.semibold,
      fontSize: FontSizes.xs,
      color: 'rgba(255,255,255,0.7)',
    },
    cpFootRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Spacing.sm,
    },
    cpMeta: {
      flex: 1,
      fontSize: FontSizes.xs,
      color: 'rgba(255,255,255,0.62)',
    },
    cpContinue: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    cpContinueText: {
      fontFamily: Fonts.bold,
      fontSize: FontSizes.sm,
      color: Colors.accent,
    },
    cpEmptyCard: {
      marginTop: Spacing.md,
      padding: Spacing.md,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.14)',
      backgroundColor: 'rgba(12,15,20,0.66)',
      gap: Spacing.sm,
    },
    cpEmptySub: {
      fontSize: FontSizes.sm,
      color: 'rgba(255,255,255,0.7)',
      lineHeight: 18,
    },
    cpQuickRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
      marginTop: 2,
    },
    cpQuickTile: {
      flex: 1,
      alignItems: 'center',
      gap: 3,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.xs,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.12)',
      backgroundColor: 'rgba(255,255,255,0.04)',
    },
    cpQuickLabel: {
      fontFamily: Fonts.semibold,
      fontSize: FontSizes.sm,
      color: '#ffffff',
    },
    cpQuickHint: {
      fontSize: 10,
      color: 'rgba(255,255,255,0.55)',
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
    stepperCard: {
      marginBottom: Spacing.md,
      paddingVertical: Spacing.lg,
    },
    newCard: {
      marginBottom: Spacing.md,
    },
    newCardInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      padding: Spacing.md,
    },
    newCardIcon: {
      width: 52,
      height: 52,
      borderRadius: Radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.primarySoft,
      borderWidth: 1,
      borderColor: Colors.primary,
    },
    newCardText: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    newCardTitle: {
      ...Typography.heading,
      color: Colors.text,
    },
    newCardBody: {
      ...Typography.caption,
      color: Colors.mutedText,
      lineHeight: 17,
    },
    listCard: {
      marginBottom: Spacing.md,
    },
    listHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.md,
      paddingBottom: Spacing.sm,
    },
    listHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    listHeaderTitle: {
      ...Typography.heading,
      color: Colors.text,
    },
    listHeaderAction: {
      ...Typography.label,
      color: Colors.primary,
    },
    projectRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
    },
    projectRowDivider: {
      borderTopWidth: 1,
      borderTopColor: Colors.hairline,
    },
    projectThumb: {
      width: 40,
      height: 40,
      borderRadius: Radii.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.elevated,
    },
    projectText: {
      flex: 1,
      minWidth: 0,
      gap: 1,
    },
    projectName: {
      fontFamily: Fonts.semibold,
      fontSize: FontSizes.md,
      color: Colors.text,
    },
    projectMeta: {
      fontSize: FontSizes.xs,
      color: Colors.dimText,
    },
    projectDot: {
      width: 10,
      height: 10,
      borderRadius: Radii.pill,
    },
    projectEmpty: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      paddingHorizontal: Spacing.md,
      paddingBottom: Spacing.md,
      paddingTop: Spacing.xs,
    },
    projectEmptyIcon: {
      width: 40,
      height: 40,
      borderRadius: Radii.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.elevated,
    },
    projectEmptyTextWrap: {
      flex: 1,
      minWidth: 0,
      gap: 1,
    },
    projectEmptyTitle: {
      fontFamily: Fonts.semibold,
      fontSize: FontSizes.md,
      color: Colors.text,
    },
    projectEmptyText: {
      fontSize: FontSizes.xs,
      color: Colors.dimText,
      lineHeight: 16,
    },
    twoColRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
      marginBottom: Spacing.lg,
    },
    infoCard: {
      flex: 1,
      minWidth: 0,
    },
    infoCardInner: {
      padding: Spacing.md,
      gap: 6,
    },
    infoCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    infoCardTitle: {
      fontSize: FontSizes.md,
      fontWeight: '700',
      color: Colors.text,
      marginTop: 2,
    },
    infoCardBody: {
      fontSize: FontSizes.xs,
      color: Colors.dimText,
      lineHeight: 16,
    },
    infoCardLink: {
      fontSize: FontSizes.sm,
      fontWeight: '700',
      color: Colors.primary,
      marginTop: 2,
    },
    creditCard: {
      marginBottom: Spacing.md,
      gap: Spacing.sm,
    },
    creditHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Spacing.sm,
    },
    creditHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      flexShrink: 1,
    },
    creditIcon: {
      width: 34,
      height: 34,
      borderRadius: Radii.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.accentSoft,
    },
    creditTitle: {
      ...Typography.heading,
      color: Colors.text,
    },
    creditManageButton: {
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: Radii.pill,
      paddingHorizontal: Spacing.md,
      paddingVertical: 7,
    },
    creditManageText: {
      ...Typography.label,
      color: Colors.text,
    },
    creditValueRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: Spacing.sm,
    },
    creditValue: {
      fontFamily: Fonts.extrabold,
      fontSize: 30,
      color: Colors.text,
    },
    creditValueTotal: {
      fontFamily: Fonts.bold,
      fontSize: FontSizes.lg,
      color: Colors.dimText,
    },
    creditReset: {
      fontSize: FontSizes.xs,
      color: Colors.dimText,
      flexShrink: 1,
      textAlign: 'right',
    },
    creditTrack: {
      height: 6,
      borderRadius: Radii.pill,
      backgroundColor: Colors.elevated,
      overflow: 'hidden',
    },
    creditFill: {
      height: '100%',
      borderRadius: Radii.pill,
      backgroundColor: Colors.accent,
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
