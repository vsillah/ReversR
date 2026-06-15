import React from 'react';
import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

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

export type ReleaseManifest = {
  version?: string;
  releaseDate?: string;
  androidVersionCode?: number;
  iosBuildNumber?: string;
  testerBuildAvailable?: boolean;
  androidTesterBuildAvailable?: boolean;
  iosTesterBuildAvailable?: boolean;
  message?: string;
  updateUrl?: string;
  androidUpdateUrl?: string;
  iosUpdateUrl?: string;
  testFlightUrl?: string;
  nativeUpdateRequired?: boolean;
};

export type LaunchUpdateStatus =
  | 'idle'
  | 'checking'
  | 'current'
  | 'ota-available'
  | 'ota-downloading'
  | 'ota-ready'
  | 'native-available'
  | 'native-required'
  | 'unavailable'
  | 'error';

export type LaunchUpdateCoordinator = {
  status: LaunchUpdateStatus;
  latestRelease: ReleaseManifest | null;
  isNativeBuildOutdated: boolean;
  isOtaUpdateReady: boolean;
  canCheckOta: boolean;
  updateTitle: string;
  updateDescription: string;
  updateActionLabel: string;
  errorMessage: string | null;
  releaseManifestUrl: string;
  nativeUpdateUrl: string | null;
  checkNow: () => Promise<void>;
  applyOtaUpdate: () => Promise<void>;
  openNativeUpdate: () => Promise<void>;
};

const expoConfig = Constants.expoConfig;
const releaseExtra = (expoConfig?.extra || {}) as Record<string, unknown>;
const staticReleaseExtra = staticAppConfig.expo?.extra || {};
const appVersion = expoConfig?.version || staticAppConfig.expo?.version || 'dev';
const androidVersionCode = expoConfig?.android?.versionCode || staticAppConfig.expo?.android?.versionCode;
const iosBuildNumber = expoConfig?.ios?.buildNumber || staticAppConfig.expo?.ios?.buildNumber;
const configuredReleaseManifestUrl = typeof releaseExtra.releaseManifestUrl === 'string'
  ? releaseExtra.releaseManifestUrl
  : typeof staticReleaseExtra.releaseManifestUrl === 'string'
    ? staticReleaseExtra.releaseManifestUrl
    : 'https://reversr.vercel.app/release.json';

const TESTFLIGHT_URL = 'https://testflight.apple.com/join/twj2dNQY';
const PLAY_INTERNAL_TEST_URL = 'https://play.google.com/apps/internaltest/4700334027214849380';

export const getReleaseManifestUrl = () => {
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

export const parseBuildNumber = (value: number | string | undefined) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

export const formatReleaseDate = (dateValue?: string) => {
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

export const isCurrentBuildOutdated = (latestRelease: ReleaseManifest | null) => {
  if (!latestRelease) {
    return false;
  }

  if (Platform.OS === 'android') {
    const androidAvailable = typeof latestRelease.androidTesterBuildAvailable === 'boolean'
      ? latestRelease.androidTesterBuildAvailable
      : latestRelease.testerBuildAvailable === true;

    if (!androidAvailable) {
      return false;
    }

    const latestAndroidBuild = parseBuildNumber(latestRelease.androidVersionCode);
    const currentAndroidBuild = parseBuildNumber(androidVersionCode);

    if (latestAndroidBuild && currentAndroidBuild) {
      return latestAndroidBuild > currentAndroidBuild;
    }
  }

  if (Platform.OS === 'ios') {
    const iosAvailable = typeof latestRelease.iosTesterBuildAvailable === 'boolean'
      ? latestRelease.iosTesterBuildAvailable
      : latestRelease.testerBuildAvailable === true;

    if (!iosAvailable) {
      return false;
    }

    const latestIosBuild = parseBuildNumber(latestRelease.iosBuildNumber);
    const currentIosBuild = parseBuildNumber(iosBuildNumber);

    if (latestIosBuild && currentIosBuild) {
      return latestIosBuild > currentIosBuild;
    }
  }

  if (!latestRelease.testerBuildAvailable) {
    return false;
  }

  return compareVersions(latestRelease.version, appVersion);
};

const resolveNativeUpdateUrl = (latestRelease: ReleaseManifest | null) => {
  if (Platform.OS === 'android') {
    return latestRelease?.androidUpdateUrl || latestRelease?.updateUrl || PLAY_INTERNAL_TEST_URL;
  }

  if (Platform.OS === 'ios') {
    return latestRelease?.iosUpdateUrl || latestRelease?.testFlightUrl || TESTFLIGHT_URL;
  }

  return latestRelease?.updateUrl || null;
};

const canUseExpoUpdates = () => Platform.OS !== 'web' && Updates.isEnabled && !__DEV__;

const getStatusCopy = (
  status: LaunchUpdateStatus,
  latestRelease: ReleaseManifest | null,
) => {
  if (status === 'ota-ready') {
    return {
      title: 'Update ready',
      description: 'A compatible app update has already downloaded. Restart ReversR to apply it before testing.',
      actionLabel: 'Restart to update',
    };
  }

  if (status === 'ota-downloading') {
    return {
      title: 'Downloading update',
      description: 'ReversR found a compatible app update and is downloading it in the background.',
      actionLabel: 'Downloading',
    };
  }

  if (status === 'native-required') {
    return {
      title: 'Update required',
      description: latestRelease?.message || 'This build is too old for the current tester lane. Install the latest store build before continuing.',
      actionLabel: Platform.OS === 'ios' ? 'Open TestFlight' : 'Open tester update',
    };
  }

  if (status === 'native-available') {
    return {
      title: 'Tester update available',
      description: latestRelease?.message || 'A newer native tester build is available. The store handles this update after you confirm it.',
      actionLabel: Platform.OS === 'ios' ? 'Open TestFlight' : 'Open tester update',
    };
  }

  if (status === 'error') {
    return {
      title: 'Update check unavailable',
      description: 'ReversR could not complete the launch update check. You can keep testing this build or retry from this screen.',
      actionLabel: 'Retry',
    };
  }

  return {
    title: 'Checking for updates',
    description: 'ReversR checks for compatible app updates on launch and keeps native store updates behind the platform update flow.',
    actionLabel: 'Check again',
  };
};

export function useLaunchUpdateCoordinator(): LaunchUpdateCoordinator {
  const [latestRelease, setLatestRelease] = React.useState<ReleaseManifest | null>(null);
  const [status, setStatus] = React.useState<LaunchUpdateStatus>('idle');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const releaseManifestUrl = React.useMemo(() => getReleaseManifestUrl(), []);
  const checkStartedRef = React.useRef(false);

  const fetchLatestRelease = React.useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(releaseManifestUrl, { signal });

    if (!response.ok) {
      throw new Error(`Release manifest returned ${response.status}`);
    }

    const release = (await response.json()) as ReleaseManifest;
    setLatestRelease(release);
    return release;
  }, [releaseManifestUrl]);

  const checkNow = React.useCallback(async () => {
    setStatus('checking');
    setErrorMessage(null);

    try {
      const release = await fetchLatestRelease();
      const nativeOutdated = isCurrentBuildOutdated(release);

      if (nativeOutdated) {
        setStatus(release.nativeUpdateRequired ? 'native-required' : 'native-available');
        return;
      }

      if (!canUseExpoUpdates()) {
        setStatus('current');
        return;
      }

      const updateCheck = await Updates.checkForUpdateAsync();

      if (!updateCheck.isAvailable) {
        setStatus('current');
        return;
      }

      setStatus('ota-downloading');
      const fetchResult = await Updates.fetchUpdateAsync();

      setStatus(fetchResult.isNew ? 'ota-ready' : 'current');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unknown update error');
      setStatus('error');
    }
  }, [fetchLatestRelease]);

  React.useEffect(() => {
    if (checkStartedRef.current) {
      return undefined;
    }

    checkStartedRef.current = true;
    const controller = new AbortController();

    const run = async () => {
      setStatus('checking');
      setErrorMessage(null);

      try {
        const release = await fetchLatestRelease(controller.signal);
        const nativeOutdated = isCurrentBuildOutdated(release);

        if (nativeOutdated) {
          setStatus(release.nativeUpdateRequired ? 'native-required' : 'native-available');
          return;
        }

        if (!canUseExpoUpdates()) {
          setStatus('current');
          return;
        }

        const updateCheck = await Updates.checkForUpdateAsync();

        if (!updateCheck.isAvailable) {
          setStatus('current');
          return;
        }

        setStatus('ota-downloading');
        const fetchResult = await Updates.fetchUpdateAsync();
        setStatus(fetchResult.isNew ? 'ota-ready' : 'current');
      } catch (error) {
        if (!controller.signal.aborted) {
          setErrorMessage(error instanceof Error ? error.message : 'Unknown update error');
          setStatus('error');
        }
      }
    };

    run();

    return () => {
      controller.abort();
    };
  }, [fetchLatestRelease]);

  const applyOtaUpdate = React.useCallback(async () => {
    if (status !== 'ota-ready') {
      await checkNow();
      return;
    }

    await Updates.reloadAsync();
  }, [checkNow, status]);

  const openNativeUpdate = React.useCallback(async () => {
    const updateUrl = resolveNativeUpdateUrl(latestRelease);

    if (updateUrl) {
      await Linking.openURL(updateUrl);
    }
  }, [latestRelease]);

  const isNativeBuildOutdated = React.useMemo(
    () => isCurrentBuildOutdated(latestRelease),
    [latestRelease],
  );
  const nativeUpdateUrl = React.useMemo(() => resolveNativeUpdateUrl(latestRelease), [latestRelease]);
  const copy = React.useMemo(() => getStatusCopy(status, latestRelease), [latestRelease, status]);

  return {
    status,
    latestRelease,
    isNativeBuildOutdated,
    isOtaUpdateReady: status === 'ota-ready',
    canCheckOta: canUseExpoUpdates(),
    updateTitle: copy.title,
    updateDescription: copy.description,
    updateActionLabel: copy.actionLabel,
    errorMessage,
    releaseManifestUrl,
    nativeUpdateUrl,
    checkNow,
    applyOtaUpdate,
    openNativeUpdate,
  };
}
