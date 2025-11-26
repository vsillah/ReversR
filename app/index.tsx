import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSizes } from '../constants/theme';
import PhaseOne from '../components/PhaseOne';
import PhaseTwo from '../components/PhaseTwo';
import PhaseThree from '../components/PhaseThree';
import {
  AnalysisResult,
  InnovationResult,
  TechnicalSpec,
  ThreeDSceneDescriptor,
  SITPattern,
} from '../hooks/useGemini';

interface MutationContext {
  phase: number;
  input: string;
  analysis: AnalysisResult | null;
  selectedPattern: SITPattern | null;
  innovation: InnovationResult | null;
  spec: TechnicalSpec | null;
  threeDScene: ThreeDSceneDescriptor | null;
  imageUrl: string | null;
}

export default function HomeScreen() {
  const [context, setContext] = useState<MutationContext>({
    phase: 1,
    input: '',
    analysis: null,
    selectedPattern: null,
    innovation: null,
    spec: null,
    threeDScene: null,
    imageUrl: null,
  });
  const [isLoading, setIsLoading] = useState(false);

  const handlePhaseOneComplete = (input: string, analysis: AnalysisResult) => {
    setContext(prev => ({
      ...prev,
      input,
      analysis,
      phase: 2,
    }));
  };

  const handlePhaseTwoComplete = (innovation: InnovationResult) => {
    setContext(prev => ({
      ...prev,
      innovation,
      selectedPattern: innovation.patternUsed,
      phase: 3,
    }));
  };

  const handlePhaseThreeComplete = (
    spec: TechnicalSpec,
    scene: ThreeDSceneDescriptor | null,
    imageUrl: string | null
  ) => {
    setContext(prev => ({
      ...prev,
      spec,
      threeDScene: scene,
      imageUrl,
    }));
  };

  const handleReset = () => {
    setContext({
      phase: 1,
      input: '',
      analysis: null,
      selectedPattern: null,
      innovation: null,
      spec: null,
      threeDScene: null,
      imageUrl: null,
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <View style={styles.iconBox}>
            <Ionicons name="hardware-chip-outline" size={24} color={Colors.accent} />
          </View>
          <View>
            <Text style={styles.title}>
              REVERS<Text style={styles.titleAccent}>R</Text>
            </Text>
            <Text style={styles.subtitle}>SYSTEMATIC INVENTIVE THINKING</Text>
          </View>
        </View>
      </View>

      <View style={styles.progressBar}>
        {[1, 2, 3].map(step => (
          <View key={step} style={styles.stepContainer}>
            <View
              style={[
                styles.stepCircle,
                context.phase >= step && styles.stepCircleActive,
                context.phase > step && styles.stepCircleComplete,
              ]}
            >
              <Text
                style={[
                  styles.stepNumber,
                  context.phase >= step && styles.stepNumberActive,
                ]}
              >
                {step}
              </Text>
            </View>
            <Text
              style={[
                styles.stepLabel,
                context.phase >= step && styles.stepLabelActive,
              ]}
            >
              {step === 1 ? 'SCAN' : step === 2 ? 'MUTATE' : 'ARCHITECT'}
            </Text>
          </View>
        ))}
        <View style={styles.progressLine} />
        <View
          style={[
            styles.progressLineFill,
            { width: `${((context.phase - 1) / 2) * 100}%` },
          ]}
        />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {context.phase === 1 && (
          <PhaseOne
            onComplete={handlePhaseOneComplete}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
          />
        )}
        {context.phase === 2 && context.analysis && (
          <PhaseTwo
            analysis={context.analysis}
            onComplete={handlePhaseTwoComplete}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            onReset={handleReset}
          />
        )}
        {context.phase === 3 && context.innovation && (
          <PhaseThree
            innovation={context.innovation}
            onComplete={handlePhaseThreeComplete}
            onReset={handleReset}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.panel,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  iconBox: {
    backgroundColor: 'rgba(0, 255, 157, 0.2)',
    padding: Spacing.sm,
    borderRadius: 8,
  },
  title: {
    fontFamily: 'monospace',
    fontSize: FontSizes.xl,
    fontWeight: 'bold',
    color: Colors.white,
    letterSpacing: 2,
  },
  titleAccent: {
    color: Colors.accent,
  },
  subtitle: {
    fontSize: FontSizes.xs,
    color: Colors.dim,
    letterSpacing: 3,
  },
  progressBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    position: 'relative',
  },
  stepContainer: {
    alignItems: 'center',
    zIndex: 1,
  },
  stepCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.black,
    borderWidth: 2,
    borderColor: Colors.gray[800],
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCircleActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  stepCircleComplete: {
    backgroundColor: Colors.green[500],
    borderColor: Colors.green[500],
  },
  stepNumber: {
    fontFamily: 'monospace',
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
    color: Colors.gray[600],
  },
  stepNumberActive: {
    color: Colors.black,
  },
  stepLabel: {
    marginTop: Spacing.xs,
    fontSize: FontSizes.xs,
    fontWeight: 'bold',
    color: Colors.gray[700],
    letterSpacing: 1,
  },
  stepLabelActive: {
    color: Colors.white,
  },
  progressLine: {
    position: 'absolute',
    top: 44,
    left: 60,
    right: 60,
    height: 2,
    backgroundColor: Colors.gray[900],
    zIndex: 0,
  },
  progressLineFill: {
    position: 'absolute',
    top: 44,
    left: 60,
    height: 2,
    backgroundColor: Colors.accent,
    zIndex: 0,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
});
