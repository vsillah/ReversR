import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, Spacing, FontSizes, Radii, Fonts, makeShadows } from '../constants/theme';
import { useAppTheme } from '../hooks/useAppTheme';

export type LoadingPhase = 'scan' | 'reverse' | 'design' | 'build';

export interface LoadingStep {
  id: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

interface Props {
  visible: boolean;
  phase: LoadingPhase;
  currentStep: string;
  steps?: LoadingStep[];
}

const getPhaseConfig = (Colors: AppColors): Record<LoadingPhase, { icon: keyof typeof Ionicons.glyphMap; color: string }> => ({
  scan: { icon: 'scan-outline', color: Colors.primary },
  reverse: { icon: 'repeat-sharp', color: Colors.secondary },
  design: { icon: 'color-palette-outline', color: Colors.green[400] },
  build: { icon: 'construct-outline', color: Colors.orange[300] },
});

export default function LoadingOverlay({ visible, phase, currentStep, steps }: Props) {
  const { colors: Colors } = useAppTheme();
  const styles = createStyles(Colors);
  const PHASE_CONFIG = getPhaseConfig(Colors);
  const spinAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();

      const spinLoop = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      spinLoop.start();

      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoop.start();

      return () => {
        spinLoop.stop();
        pulseLoop.stop();
      };
    }
  }, [visible]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const config = PHASE_CONFIG[phase];
  const currentStepIndex = steps?.findIndex(s => s.id === currentStep) ?? -1;
  const currentStepLabel = steps?.[currentStepIndex]?.label || currentStep;

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none">
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <View style={styles.content}>
          <Animated.View
            style={[
              styles.iconContainer,
              {
                transform: [
                  { scale: pulseAnim },
                  { rotate: phase === 'reverse' ? spin : '0deg' },
                ],
                borderColor: config.color,
              },
            ]}
          >
            <Ionicons name={config.icon} size={48} color={config.color} />
          </Animated.View>

          <Text style={[styles.stepText, { color: config.color }]}>
            {currentStepLabel}
          </Text>

          {steps && steps.length > 0 && (
            <View style={styles.stepsContainer}>
              {steps.map((step, index) => {
                const isActive = index === currentStepIndex;
                const isComplete = index < currentStepIndex;
                return (
                  <View key={step.id} style={styles.stepRow}>
                    <View
                      style={[
                        styles.stepDot,
                        isComplete && styles.stepDotComplete,
                        isActive && [styles.stepDotActive, { backgroundColor: config.color }],
                      ]}
                    >
                      {isComplete && (
                        <Ionicons name="checkmark" size={10} color={Colors.mode === 'dark' ? Colors.white : '#ffffff'} />
                      )}
                    </View>
                    <Text
                      style={[
                        styles.stepLabel,
                        isActive && styles.stepLabelActive,
                        isComplete && styles.stepLabelComplete,
                      ]}
                    >
                      {step.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          <View style={styles.dotsContainer}>
            <Animated.View
              style={[
                styles.loadingDot,
                { backgroundColor: config.color, opacity: pulseAnim },
              ]}
            />
            <Animated.View
              style={[
                styles.loadingDot,
                {
                  backgroundColor: config.color,
                  opacity: pulseAnim.interpolate({
                    inputRange: [1, 1.15],
                    outputRange: [0.5, 1],
                  }),
                },
              ]}
            />
            <Animated.View
              style={[
                styles.loadingDot,
                {
                  backgroundColor: config.color,
                  opacity: pulseAnim.interpolate({
                    inputRange: [1, 1.15],
                    outputRange: [0.3, 0.7],
                  }),
                },
              ]}
            />
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const createStyles = (Colors: AppColors) => {
  const shadows = makeShadows(Colors);
  return StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.scrim,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  content: {
    alignItems: 'center',
    padding: Spacing.xl,
    width: '100%',
    maxWidth: 300,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xl,
    backgroundColor: Colors.panel,
    ...shadows.floating,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.mode === 'dark' ? 'rgba(0, 0, 0, 0.5)' : Colors.surface,
    marginBottom: Spacing.lg,
  },
  stepText: {
    fontSize: FontSizes.md,
    fontFamily: Fonts.semibold,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  stepsContainer: {
    alignSelf: 'stretch',
    marginBottom: Spacing.lg,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  stepDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: Colors.inputBorder,
    marginRight: Spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepDotActive: {
    borderWidth: 0,
  },
  stepDotComplete: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  stepLabel: {
    fontSize: FontSizes.sm,
    color: Colors.dimText,
  },
  stepLabelActive: {
    color: Colors.text,
    fontWeight: '600',
  },
  stepLabelComplete: {
    color: Colors.mutedText,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  });
};
