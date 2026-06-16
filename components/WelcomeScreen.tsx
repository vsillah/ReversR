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
import { AppColors, Radii, Spacing, FontSizes, Typography, makeShadows } from '../constants/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { Badge, Card, GradientButton, HeroBackdrop, ScoreRing, SectionHeader, StatTile, StepRow } from './ui';
import { getAllInnovations, SavedInnovation } from '../hooks/useStorage';
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

// Drop a hero render at assets/hero-machine.png and set this to
// require('../assets/hero-machine.png') to swap the blueprint backdrop for art.
const HERO_IMAGE: number | null = null;

interface WelcomeScreenProps {
  onStart: () => void;
  onHistory?: () => void;
  onSettings?: () => void;
  onProfile?: () => void;
  onTour?: () => void;
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
  userDisplayName = 'Guest',
  userIsAuthenticated = false,
  userAvatarUri = '',
  bottomBarInset = 0,
}: WelcomeScreenProps) {
  const { colors: Colors, mode: themeMode, setMode: setThemeMode } = useAppTheme();
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
  const hasMenuActions = Boolean(onHistory || onSettings || onTour);
  const profileIcon = userIsAuthenticated ? 'person-circle-outline' : 'person-outline';
  const buildLabel = getInstalledBuildLabel();
  const greeting = greetingForHour(new Date().getHours());
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

  const stats = React.useMemo(() => {
    const total = recent.length;
    const completed = recent.filter(item => item.phase >= 4).length;
    return { total, completed, inProgress: total - completed };
  }, [recent]);

  const evidence = React.useMemo(() => recent.slice(0, 3).map(item => {
    const approvals = item.reviewerApprovalRecords?.length || 0;
    const hasBom = Boolean(item.bom);
    const has3d = Boolean(item.threeDScene);
    const verified = approvals > 0 || (hasBom && item.phase >= 4);
    const artifact = approvals > 0
      ? `${approvals} approval${approvals > 1 ? 's' : ''}`
      : hasBom ? 'Bill of materials'
        : has3d ? '3D scene set'
          : `${PHASE_NAMES[Math.min(item.phase, 4) - 1]} in progress`;
    return {
      id: item.id,
      title: reconstructionTitle(item),
      artifact,
      when: relativeTime(item.updatedAt || item.createdAt),
      verified,
      icon: (approvals > 0 ? 'shield-checkmark-outline'
        : hasBom ? 'document-text-outline'
          : has3d ? 'cube-outline'
            : 'construct-outline') as keyof typeof Ionicons.glyphMap,
    };
  }), [recent]);

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
      label: 'Projects',
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

      <View style={styles.hero} testID="reversr-tour-welcome">
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { transform: [{ translateY: heroTranslate }, { scale: heroScale }] },
          ]}
        >
          {HERO_IMAGE ? (
            <ImageBackground source={HERO_IMAGE} style={StyleSheet.absoluteFill} resizeMode="cover">
              <View style={styles.heroImageScrim} />
            </ImageBackground>
          ) : (
            <HeroBackdrop radius={0} />
          )}
        </Animated.View>
        <View style={styles.heroContent}>
          <Badge label="AI-assisted rebuild" tone="primary" icon="sparkles-outline" />
          <Text style={styles.heroHello}>{greeting}, {userDisplayName}</Text>
          <Text style={styles.heroTitle}>Let&apos;s rebuild</Text>
          <Text style={styles.heroBody}>
            Guided by intelligent steps. Backed by proven data — from scan to BOM to 3D handoff.
          </Text>
          <GradientButton
            label="New Reconstruction"
            icon="arrow-forward"
            onPress={() => {
              setMenuOpen(false);
              onStart();
            }}
            accessibilityLabel="Start new machine reconstruction"
            style={styles.heroButton}
          />
        </View>
      </View>

      <View style={styles.statRow}>
        <StatTile label="Projects" value={stats.total} icon="albums-outline" />
        <StatTile label="In progress" value={stats.inProgress} tone="primary" icon="sync-outline" />
        <StatTile label="Completed" value={stats.completed} tone="success" icon="checkmark-done-outline" />
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

      <Card style={styles.pathCard}>
        <View style={styles.pathHeader}>
          <View style={styles.pathHeaderText}>
            <Text style={styles.pathOverline}>Reconstruction path</Text>
            <Text style={styles.pathTitle}>4 guided phases</Text>
            <Text style={styles.pathSubtitle}>Start with a scan — the rest unlock as you go.</Text>
          </View>
          <ScoreRing progress={0} value="0/4" caption="Phases" size={84} />
        </View>
        <View style={styles.stepList}>
          {phases.map((phase) => (
            <StepRow
              key={phase.number}
              index={phase.number}
              title={phase.title}
              subtitle={phase.short}
              state={phase.number === 1 ? 'current' : 'locked'}
              onPress={phase.number === 1 ? () => { setMenuOpen(false); onStart(); } : undefined}
              accessibilityLabel={phase.number === 1
                ? `Start with ${phase.title}: ${phase.short}`
                : `${phase.title} locked: ${phase.short}`}
            />
          ))}
        </View>
      </Card>

      <View style={styles.section}>
        <SectionHeader
          title="Evidence"
          actionLabel={onHistory && recent.length > 0 ? 'View all' : undefined}
          onAction={onHistory && recent.length > 0 ? () => handleMenuAction(onHistory) : undefined}
        />
        {evidence.length > 0 ? (
          <View style={styles.evidenceList}>
            {evidence.map(item => (
              <Card key={item.id} style={styles.evidenceCard} padded={false} onPress={onHistory ? () => handleMenuAction(onHistory) : undefined} accessibilityLabel={`${item.title}, ${item.artifact}`}>
                <View style={styles.evidenceInner}>
                  <View style={styles.evidenceIcon}>
                    <Ionicons name={item.icon} size={18} color={Colors.primary} />
                  </View>
                  <View style={styles.evidenceText}>
                    <Text style={styles.evidenceTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.evidenceMeta} numberOfLines={1}>{item.artifact} · {item.when}</Text>
                  </View>
                  {item.verified
                    ? <Badge label="Verified" tone="success" icon="checkmark-circle" />
                    : <Badge label="In progress" tone="primary" dot />}
                </View>
              </Card>
            ))}
          </View>
        ) : (
          <Card style={styles.emptyEvidence}>
            <View style={styles.emptyEvidenceIcon}>
              <Ionicons name="documents-outline" size={22} color={Colors.dimText} />
            </View>
            <Text style={styles.emptyEvidenceTitle}>No evidence yet</Text>
            <Text style={styles.emptyEvidenceText}>
              Reconstruction artifacts — BOMs, 3D scenes, and reviewer approvals — appear here as you build.
            </Text>
          </Card>
        )}
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
    </Animated.ScrollView>
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
    hero: {
      position: 'relative',
      minHeight: 280,
      borderRadius: Radii.xl,
      borderWidth: 1,
      borderColor: Colors.hairline,
      overflow: 'hidden',
      marginBottom: Spacing.lg,
      justifyContent: 'flex-end',
      ...shadows.elevated,
    },
    heroImageScrim: {
      ...StyleSheet.absoluteFill,
      backgroundColor: Colors.mode === 'dark' ? 'rgba(6,8,12,0.55)' : 'rgba(8,12,20,0.28)',
    },
    heroContent: {
      padding: Spacing.lg,
      gap: Spacing.sm,
    },
    heroHello: {
      ...Typography.label,
      color: Colors.mutedText,
      marginTop: Spacing.xs,
    },
    heroTitle: {
      fontSize: 34,
      fontWeight: '800',
      lineHeight: 40,
      color: Colors.text,
    },
    heroBody: {
      ...Typography.body,
      color: Colors.mutedText,
      maxWidth: '94%',
    },
    heroButton: {
      marginTop: Spacing.md,
    },
    statRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
      marginBottom: Spacing.lg,
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
    pathCard: {
      marginBottom: Spacing.lg,
      gap: Spacing.md,
    },
    pathHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Spacing.md,
    },
    pathHeaderText: {
      flex: 1,
      gap: 2,
    },
    pathOverline: {
      ...Typography.overline,
      color: Colors.dimText,
      textTransform: 'uppercase',
    },
    pathTitle: {
      ...Typography.heading,
      color: Colors.text,
    },
    pathSubtitle: {
      ...Typography.caption,
      color: Colors.dimText,
    },
    stepList: {
      gap: Spacing.sm,
    },
    section: {
      marginBottom: Spacing.lg,
    },
    evidenceList: {
      gap: Spacing.sm,
    },
    evidenceCard: {},
    evidenceInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      padding: Spacing.md,
    },
    evidenceIcon: {
      width: 40,
      height: 40,
      borderRadius: Radii.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.primarySoft,
    },
    evidenceText: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    evidenceTitle: {
      fontSize: FontSizes.md,
      fontWeight: '700',
      color: Colors.text,
    },
    evidenceMeta: {
      fontSize: FontSizes.xs,
      color: Colors.dimText,
    },
    emptyEvidence: {
      alignItems: 'center',
      gap: Spacing.xs,
      paddingVertical: Spacing.lg,
    },
    emptyEvidenceIcon: {
      width: 44,
      height: 44,
      borderRadius: Radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.elevated,
      marginBottom: Spacing.xs,
    },
    emptyEvidenceTitle: {
      fontSize: FontSizes.md,
      fontWeight: '700',
      color: Colors.text,
    },
    emptyEvidenceText: {
      fontSize: FontSizes.sm,
      color: Colors.dimText,
      textAlign: 'center',
      lineHeight: 19,
      maxWidth: '90%',
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
