import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { AppColors, Spacing, FontSizes } from '../constants/theme';
import { useAppTheme } from '../hooks/useAppTheme';

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

type ReleaseManifest = {
  version?: string;
  releaseDate?: string;
  androidVersionCode?: number;
  iosBuildNumber?: string;
  message?: string;
  updateUrl?: string;
};

const expoConfig = Constants.expoConfig;
const releaseExtra = (expoConfig?.extra || {}) as Record<string, unknown>;
const staticReleaseExtra = staticAppConfig.expo?.extra || {};
const appVersion = expoConfig?.version || staticAppConfig.expo?.version || 'dev';
const releaseDate = typeof releaseExtra.releaseDate === 'string'
  ? releaseExtra.releaseDate
  : typeof staticReleaseExtra.releaseDate === 'string'
    ? staticReleaseExtra.releaseDate
    : undefined;
const configuredReleaseManifestUrl = typeof releaseExtra.releaseManifestUrl === 'string'
  ? releaseExtra.releaseManifestUrl
  : typeof staticReleaseExtra.releaseManifestUrl === 'string'
    ? staticReleaseExtra.releaseManifestUrl
    : 'https://reversr.vercel.app/release.json';
const androidVersionCode = expoConfig?.android?.versionCode || staticAppConfig.expo?.android?.versionCode;
const iosBuildNumber = expoConfig?.ios?.buildNumber || staticAppConfig.expo?.ios?.buildNumber;

const getReleaseManifestUrl = () => {
  if (
    Platform.OS === 'web'
    && typeof window !== 'undefined'
    && window.location?.origin
    && window.location.origin.includes('localhost')
  ) {
    return `${window.location.origin}/release.json`;
  }

  return configuredReleaseManifestUrl;
};

const parseBuildNumber = (value: number | string | undefined) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

const formatReleaseDate = (dateValue?: string) => {
  if (!dateValue) {
    return 'date unavailable';
  }

  const normalizedDate = /^\d{4}-\d{2}-\d{2}$/.test(dateValue)
    ? `${dateValue}T00:00:00Z`
    : dateValue;
  const parsedDate = new Date(normalizedDate);

  if (Number.isNaN(parsedDate.getTime())) {
    return dateValue;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsedDate);
};

const compareVersions = (latestVersion?: string, currentVersion?: string) => {
  if (!latestVersion || !currentVersion) {
    return false;
  }

  const latestParts = latestVersion.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const currentParts = currentVersion.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const maxLength = Math.max(latestParts.length, currentParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const latestPart = latestParts[index] || 0;
    const currentPart = currentParts[index] || 0;

    if (latestPart > currentPart) {
      return true;
    }

    if (latestPart < currentPart) {
      return false;
    }
  }

  return false;
};

const isCurrentBuildOutdated = (latestRelease: ReleaseManifest | null) => {
  if (!latestRelease) {
    return false;
  }

  if (Platform.OS === 'android') {
    const latestAndroidBuild = parseBuildNumber(latestRelease.androidVersionCode);
    const currentAndroidBuild = parseBuildNumber(androidVersionCode);

    if (latestAndroidBuild && currentAndroidBuild) {
      return latestAndroidBuild > currentAndroidBuild;
    }
  }

  if (Platform.OS === 'ios') {
    const latestIosBuild = parseBuildNumber(latestRelease.iosBuildNumber);
    const currentIosBuild = parseBuildNumber(iosBuildNumber);

    if (latestIosBuild && currentIosBuild) {
      return latestIosBuild > currentIosBuild;
    }
  }

  return compareVersions(latestRelease.version, appVersion);
};

export default function WelcomeScreen({ onStart, onHistory, onSettings, onTour }: WelcomeScreenProps) {
  const { colors: Colors } = useAppTheme();
  const [latestRelease, setLatestRelease] = React.useState<ReleaseManifest | null>(null);
  const isOutdated = React.useMemo(() => isCurrentBuildOutdated(latestRelease), [latestRelease]);
  const styles = createStyles(Colors);
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

  React.useEffect(() => {
    const releaseManifestUrl = getReleaseManifestUrl();

    if (!releaseManifestUrl) {
      return undefined;
    }

    const controller = new AbortController();

    fetch(releaseManifestUrl, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((release: ReleaseManifest | null) => {
        if (release) {
          setLatestRelease(release);
        }
      })
      .catch(() => undefined);

    return () => {
      controller.abort();
    };
  }, []);

  const openUpdateUrl = React.useCallback(() => {
    if (latestRelease?.updateUrl) {
      Linking.openURL(latestRelease.updateUrl).catch(() => undefined);
    }
  }, [latestRelease?.updateUrl]);

  return (
    <ScrollView 
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.content}>
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

        {isOutdated && (
          <View
            style={styles.updateBanner}
            accessibilityRole="alert"
            testID="welcome-update-banner"
          >
            <Ionicons name="cloud-download-outline" size={22} color={Colors.warning} />
            <View style={styles.updateBannerText}>
              <Text style={styles.updateTitle}>Tester update available</Text>
              <Text style={styles.updateDescription}>
                This install is older than the latest tester release. Update before validating new changes.
              </Text>
              {latestRelease?.updateUrl && (
                <TouchableOpacity
                  style={styles.updateButton}
                  onPress={openUpdateUrl}
                  accessibilityRole="button"
                  accessibilityLabel="Open Google Play tester update link"
                >
                  <Text style={styles.updateButtonText}>Open tester link</Text>
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
            onPress={onStart}
            accessibilityRole="button"
            accessibilityLabel="Start new machine reconstruction"
          >
            <Text style={styles.buttonText}>New Reconstruction</Text>
            <Ionicons name="arrow-forward" size={20} color={Colors.accent} />
          </TouchableOpacity>

          {onHistory && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={onHistory}
              accessibilityRole="button"
              accessibilityLabel="Open reconstruction history"
            >
              <Ionicons name="time-outline" size={20} color={Colors.gray[400]} />
              <Text style={styles.secondaryButtonText}>History</Text>
            </TouchableOpacity>
          )}

          {onSettings && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={onSettings}
              accessibilityRole="button"
              accessibilityLabel="Open settings"
            >
              <Ionicons name="settings-outline" size={20} color={Colors.gray[400]} />
              <Text style={styles.secondaryButtonText}>Settings</Text>
            </TouchableOpacity>
          )}

          {onTour && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={onTour}
              accessibilityRole="button"
              accessibilityLabel="Start guided tour"
              testID="reversr-tour-start"
            >
              <Ionicons name="compass-outline" size={20} color={Colors.gray[400]} />
              <Text style={styles.secondaryButtonText}>Tour</Text>
            </TouchableOpacity>
          )}
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
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    minWidth: 104,
  },
  secondaryButtonText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[400],
  },
  releaseFooter: {
    marginTop: Spacing.md,
    fontSize: FontSizes.xs,
    color: Colors.dim,
    textAlign: 'center',
    lineHeight: 16,
  },
});
