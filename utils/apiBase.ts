import { Platform } from 'react-native';
import Constants from 'expo-constants';

const configuredApiBase = process.env.EXPO_PUBLIC_API_BASE_URL || Constants.expoConfig?.extra?.apiBaseUrl;

export const getApiBase = () => {
  const isLocalWeb = Platform.OS === 'web'
    && typeof window !== 'undefined'
    && window.location.origin.includes('localhost');

  return isLocalWeb
    ? 'http://localhost:3001'
    : configuredApiBase || 'https://reversr-rebuild-api.example.com';
};
