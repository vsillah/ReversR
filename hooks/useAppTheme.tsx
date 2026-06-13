import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ColorSchemeName, useColorScheme } from 'react-native';
import { AppColors, ThemeMode, ThemePalettes } from '../constants/theme';

export const THEME_MODE_STORAGE_KEY = 'appearance_theme_mode';

interface AppThemeContextValue {
  mode: ThemeMode;
  colors: AppColors;
  setMode: (mode: ThemeMode) => Promise<void>;
  isDark: boolean;
  hasUserPreference: boolean;
}

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

const resolveSystemMode = (scheme: ColorSchemeName): ThemeMode => (
  scheme === 'light' || scheme === 'dark' ? scheme : 'dark'
);

const isThemeMode = (value: string | null): value is ThemeMode => value === 'light' || value === 'dark';

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [storedMode, setStoredMode] = useState<ThemeMode | null>(null);
  const [hasLoadedPreference, setHasLoadedPreference] = useState(false);

  useEffect(() => {
    let isMounted = true;

    AsyncStorage.getItem(THEME_MODE_STORAGE_KEY)
      .then(value => {
        if (isMounted && isThemeMode(value)) {
          setStoredMode(value);
        }
      })
      .catch(error => {
        console.error('Failed to load appearance theme', error);
      })
      .finally(() => {
        if (isMounted) setHasLoadedPreference(true);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const mode = storedMode || resolveSystemMode(systemScheme);

  const setMode = useCallback(async (nextMode: ThemeMode) => {
    setStoredMode(nextMode);
    await AsyncStorage.setItem(THEME_MODE_STORAGE_KEY, nextMode);
  }, []);

  const value = useMemo<AppThemeContextValue>(() => ({
    mode,
    colors: ThemePalettes[mode],
    setMode,
    isDark: mode === 'dark',
    hasUserPreference: hasLoadedPreference && storedMode !== null,
  }), [hasLoadedPreference, mode, setMode, storedMode]);

  return (
    <AppThemeContext.Provider value={value}>
      {children}
    </AppThemeContext.Provider>
  );
}

export function useAppTheme() {
  const value = useContext(AppThemeContext);
  if (!value) {
    throw new Error('useAppTheme must be used within AppThemeProvider');
  }
  return value;
}
