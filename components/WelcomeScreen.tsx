import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSizes } from '../constants/theme';

interface WelcomeScreenProps {
  onStart: () => void;
  onHistory?: () => void;
}

const phases = [
  {
    number: 1,
    title: 'SCAN',
    icon: 'search' as const,
    description: 'Analyze existing products to define the Closed World boundary and essential components.',
  },
  {
    number: 2,
    title: 'REVERSE',
    icon: 'repeat-sharp' as const,
    description: 'Apply patterns like Subtraction and Task Unification to force novel utility.',
  },
  {
    number: 3,
    title: 'DESIGN',
    icon: 'pencil' as const,
    description: 'Generate technical specifications, sketches, and interactive 3D prototypes.',
  },
  {
    number: 4,
    title: 'BUILD',
    icon: 'hammer-outline' as const,
    description: 'Generate Bill of Materials and prepare for manufacturing.',
  },
];

export default function WelcomeScreen({ onStart, onHistory }: WelcomeScreenProps) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoSection}>
          <Image
            source={require('../assets/logo-transparent.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>
            REVERS<Text style={styles.titleAccent}>R</Text>
          </Text>
          <Text style={styles.subtitle}>Systematic Inventive Thinking Engine</Text>
        </View>

        <Text style={styles.description}>
          Deconstruct reality. Apply rigorous mutation patterns. Design the impossible.
          {'\n\n'}
          An AI-powered tool for generating high-fidelity product innovations within a Closed World.
        </Text>

        <View style={styles.phasesContainer}>
          {phases.map((phase) => (
            <View key={phase.number} style={styles.phaseCard}>
              <View style={styles.phaseHeader}>
                <Ionicons name={phase.icon} size={18} color={Colors.accent} />
                <Text style={styles.phaseTitle}>
                  {phase.number}. {phase.title}
                </Text>
              </View>
              <Text style={styles.phaseDescription}>{phase.description}</Text>
            </View>
          ))}
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.button} onPress={onStart}>
            <Text style={styles.buttonText}>New Innovation</Text>
            <Ionicons name="arrow-forward" size={20} color={Colors.accent} />
          </TouchableOpacity>

          {onHistory && (
            <TouchableOpacity style={styles.historyButton} onPress={onHistory}>
              <Ionicons name="time-outline" size={20} color={Colors.gray[400]} />
              <Text style={styles.historyButtonText}>History</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  content: {
    alignItems: 'center',
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  logo: {
    width: 160,
    height: 160,
    marginBottom: Spacing.md,
  },
  title: {
    fontFamily: 'monospace',
    fontSize: 48,
    fontWeight: 'bold',
    color: Colors.white,
    letterSpacing: 4,
  },
  titleAccent: {
    color: Colors.accent,
  },
  subtitle: {
    fontSize: FontSizes.lg,
    color: Colors.dim,
    fontStyle: 'italic',
    marginTop: Spacing.xs,
  },
  description: {
    fontSize: FontSizes.md,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 22,
    opacity: 0.8,
  },
  phasesContainer: {
    width: '100%',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  phaseCard: {
    backgroundColor: 'rgba(26, 26, 26, 0.5)',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: Spacing.md,
  },
  phaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  phaseTitle: {
    fontFamily: 'monospace',
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
    color: Colors.accent,
  },
  phaseDescription: {
    fontSize: FontSizes.sm,
    color: Colors.dim,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: Colors.accent,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
  },
  buttonText: {
    fontFamily: 'monospace',
    fontSize: FontSizes.md,
    fontWeight: 'bold',
    color: Colors.accent,
    letterSpacing: 1,
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  historyButtonText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[400],
  },
});
