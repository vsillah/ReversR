import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AppColors } from '../constants/theme';
import { AppThemeProvider, useAppTheme } from '../hooks/useAppTheme';
import { CommercialProvider } from '../hooks/useCommercialization';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <AppThemeProvider>
      <CommercialProvider>
        <ThemedRootLayout />
      </CommercialProvider>
    </AppThemeProvider>
  );
}

function ThemedRootLayout() {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        {/* Cinematic ambient backdrop so the centered app column never sits in a blank field on wide screens. */}
        <LinearGradient
          colors={['#0d1320', '#08090c', '#0a0d14']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
          <StatusBar style="light" />
          <View style={styles.shell}>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
              }}
            />
          </View>
        </SafeAreaView>
      </View>
    </SafeAreaProvider>
  );
}

const createStyles = (Colors: AppColors) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#08090c',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  shell: {
    flex: 1,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    backgroundColor: Colors.background,
  },
});
