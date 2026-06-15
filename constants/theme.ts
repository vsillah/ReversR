export type ThemeMode = 'light' | 'dark';

export type AppColors = {
  mode: ThemeMode;
  background: string;
  panel: string;
  surface: string;
  elevated: string;
  border: string;
  text: string;
  mutedText: string;
  dimText: string;
  overlay: string;
  input: string;
  inputBorder: string;
  accent: string;
  secondary: string;
  danger: string;
  warning: string;
  success: string;
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
  background: '#0a0a0a',
  dark: '#0a0a0a',
  panel: '#111111',
  surface: '#171717',
  elevated: '#1f2937',
  border: '#2a2a2a',
  accent: '#00ff9d',
  secondary: '#9d00ff',
  text: '#e0e0e0',
  mutedText: '#d1d5db',
  dimText: '#666666',
  overlay: 'rgba(0,0,0,0.7)',
  input: '#0f172a',
  inputBorder: '#475569',
  danger: '#ef4444',
  warning: '#fdba74',
  success: '#4ade80',
  dim: '#666666',
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
  background: '#f8fafc',
  dark: '#f8fafc',
  panel: '#ffffff',
  surface: '#f1f5f9',
  elevated: '#e2e8f0',
  border: '#d7dee8',
  accent: '#007a55',
  secondary: '#7c3aed',
  text: '#111827',
  mutedText: '#334155',
  dimText: '#64748b',
  overlay: 'rgba(15,23,42,0.42)',
  input: '#ffffff',
  inputBorder: '#cbd5e1',
  danger: '#dc2626',
  warning: '#c2410c',
  success: '#15803d',
  dim: '#64748b',
  white: '#111827',
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
