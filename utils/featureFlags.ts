import Constants from 'expo-constants';

const appExtra = (Constants.expoConfig?.extra || {}) as Record<string, unknown>;

const readBooleanFlag = (value: unknown) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
};

export const isWelcomeIntroEnabled = () => readBooleanFlag(
  process.env.EXPO_PUBLIC_ENABLE_WELCOME_INTRO || appExtra.enableWelcomeIntro
);
