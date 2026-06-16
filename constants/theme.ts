export type ThemeMode = 'light' | 'dark';

export type AppColors = {
  mode: ThemeMode;
  background: string;
  panel: string;
  surface: string;
  elevated: string;
  border: string;
  hairline: string;
  text: string;
  mutedText: string;
  dimText: string;
  overlay: string;
  scrim: string;
  input: string;
  inputBorder: string;
  accent: string;
  accentSoft: string;
  primary: string;
  primaryStrong: string;
  primarySoft: string;
  onPrimary: string;
  secondary: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  success: string;
  successSoft: string;
  shadowColor: string;
  dark: string;
  dim: string;
  white: string;
  black: string;
  blue: Record<500 | 600 | 900, string>;
  green: Record<400 | 500 | 600 | 900, string>;
  purple: Record<500 | 600 | 900, string>;
  red: Record<500 | 600 | 900, string>;
  orange: Record<300 | 900, string>;
  gray: Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900, string>;
};

export const DarkColors: AppColors = {
  mode: 'dark',
  background: '#08090c',
  dark: '#08090c',
  panel: '#101218',
  surface: '#161922',
  elevated: '#1d212c',
  border: '#262b36',
  hairline: 'rgba(255,255,255,0.06)',
  accent: '#00ff9d',
  accentSoft: 'rgba(0,255,157,0.12)',
  primary: '#3b82f6',
  primaryStrong: '#2563eb',
  primarySoft: 'rgba(59,130,246,0.14)',
  onPrimary: '#ffffff',
  secondary: '#9d00ff',
  text: '#eef1f6',
  mutedText: '#aeb6c4',
  dimText: '#6b7280',
  overlay: 'rgba(0,0,0,0.7)',
  scrim: 'rgba(4,6,10,0.72)',
  input: '#0f172a',
  inputBorder: '#475569',
  danger: '#ef4444',
  dangerSoft: 'rgba(239,68,68,0.14)',
  warning: '#fdba74',
  warningSoft: 'rgba(253,186,116,0.14)',
  success: '#4ade80',
  successSoft: 'rgba(74,222,128,0.14)',
  shadowColor: '#000000',
  dim: '#6b7280',
  white: '#ffffff',
  black: '#000000',
  blue: {
    500: '#3b82f6',
    600: '#2563eb',
    900: '#1e3a8a',
  },
  green: {
    400: '#4ade80',
    500: '#22c55e',
    600: '#16a34a',
    900: '#14532d',
  },
  purple: {
    500: '#a855f7',
    600: '#9333ea',
    900: '#581c87',
  },
  red: {
    500: '#ef4444',
    600: '#dc2626',
    900: '#7f1d1d',
  },
  orange: {
    300: '#fdba74',
    900: '#7c2d12',
  },
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  },
};

export const LightColors: AppColors = {
  mode: 'light',
  background: '#f4f6fb',
  dark: '#f4f6fb',
  panel: '#ffffff',
  surface: '#f1f5f9',
  elevated: '#e8edf5',
  border: '#dde3ec',
  hairline: 'rgba(15,23,42,0.08)',
  accent: '#007a55',
  accentSoft: 'rgba(0,122,85,0.10)',
  primary: '#2563eb',
  primaryStrong: '#1d4ed8',
  primarySoft: 'rgba(37,99,235,0.10)',
  onPrimary: '#ffffff',
  secondary: '#7c3aed',
  text: '#0f172a',
  mutedText: '#475569',
  dimText: '#64748b',
  overlay: 'rgba(15,23,42,0.42)',
  scrim: 'rgba(15,23,42,0.42)',
  input: '#ffffff',
  inputBorder: '#cbd5e1',
  danger: '#dc2626',
  dangerSoft: 'rgba(220,38,38,0.10)',
  warning: '#c2410c',
  warningSoft: 'rgba(194,65,12,0.10)',
  success: '#15803d',
  successSoft: 'rgba(21,128,61,0.10)',
  shadowColor: '#0f172a',
  dim: '#64748b',
  white: '#0f172a',
  black: '#ffffff',
  blue: {
    500: '#2563eb',
    600: '#1d4ed8',
    900: '#dbeafe',
  },
  green: {
    400: '#16a34a',
    500: '#15803d',
    600: '#166534',
    900: '#dcfce7',
  },
  purple: {
    500: '#7c3aed',
    600: '#6d28d9',
    900: '#ede9fe',
  },
  red: {
    500: '#dc2626',
    600: '#b91c1c',
    900: '#fee2e2',
  },
  orange: {
    300: '#c2410c',
    900: '#ffedd5',
  },
  gray: {
    50: '#ffffff',
    100: '#f8fafc',
    200: '#eef2f7',
    300: '#334155',
    400: '#475569',
    500: '#64748b',
    600: '#94a3b8',
    700: '#cbd5e1',
    800: '#e2e8f0',
    900: '#ffffff',
  },
};

export const ThemePalettes: Record<ThemeMode, AppColors> = {
  dark: DarkColors,
  light: LightColors,
};

export const Colors = DarkColors;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const FontSizes = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const Radii = {
  xs: 8,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
};

export const Typography = {
  display: { fontSize: 30, fontWeight: '700' as const, lineHeight: 36 },
  title: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28 },
  heading: { fontSize: 18, fontWeight: '700' as const, lineHeight: 24 },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const, lineHeight: 22 },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  label: { fontSize: 13, fontWeight: '600' as const, lineHeight: 18 },
  caption: { fontSize: 12, fontWeight: '500' as const, lineHeight: 16 },
  overline: { fontSize: 11, fontWeight: '700' as const, lineHeight: 14, letterSpacing: 1.1 },
};

type ShadowPreset = {
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  elevation: number;
};

export const makeShadows = (colors: AppColors): Record<'card' | 'elevated' | 'floating', ShadowPreset> => {
  const isDark = colors.mode === 'dark';
  return {
    card: {
      shadowColor: colors.shadowColor,
      shadowOpacity: isDark ? 0.3 : 0.08,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    elevated: {
      shadowColor: colors.shadowColor,
      shadowOpacity: isDark ? 0.4 : 0.12,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 8,
    },
    floating: {
      shadowColor: colors.shadowColor,
      shadowOpacity: isDark ? 0.5 : 0.18,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 16 },
      elevation: 14,
    },
  };
};
