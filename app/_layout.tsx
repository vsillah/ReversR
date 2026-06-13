import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AppColors } from '../constants/theme';
import { AppThemeProvider, useAppTheme } from '../hooks/useAppTheme';
import { CommercialProvider } from '../hooks/useCommercialization';

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <CommercialProvider>
        <ThemedRootLayout />
      </CommercialProvider>
    </AppThemeProvider>
  );
}

function ThemedRootLayout() {
  const { colors, isDark } = useAppTheme();
  const styles = createStyles(colors);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const createStyles = (Colors: AppColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
