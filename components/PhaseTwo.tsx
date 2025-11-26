import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSizes } from '../constants/theme';
import {
  AnalysisResult,
  InnovationResult,
  SITPattern,
  applySITPattern,
} from '../hooks/useGemini';

interface Props {
  analysis: AnalysisResult;
  onComplete: (innovation: InnovationResult) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  onReset: () => void;
}

const PATTERN_DETAILS: Record<SITPattern, { description: string }> = {
  [SITPattern.SUBTRACTION]: {
    description: "Remove an essential component from the system.",
  },
  [SITPattern.TASK_UNIFICATION]: {
    description: "Assign a new task to an existing resource.",
  },
  [SITPattern.MULTIPLICATION]: {
    description: "Copy a component but change a specific attribute.",
  },
  [SITPattern.DIVISION]: {
    description: "Divide the product or a component physically or functionally.",
  },
  [SITPattern.ATTRIBUTE_DEPENDENCY]: {
    description: "Create a correlation between two independent variables.",
  },
};

export default function PhaseTwo({
  analysis,
  onComplete,
  isLoading,
  setIsLoading,
  onReset,
}: Props) {
  const [selectedPattern, setSelectedPattern] = useState<SITPattern>(
    SITPattern.SUBTRACTION
  );
  const [error, setError] = useState<string | null>(null);

  const handleApply = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await applySITPattern(analysis, selectedPattern);
      onComplete(result);
    } catch (e) {
      setError("Pattern application failed. Please try again.");
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="options-outline" size={28} color={Colors.secondary} />
          <View style={styles.headerText}>
            <Text style={styles.title}>Phase 2: Pattern Application</Text>
            <Text style={styles.description}>
              Force a change. Select a SIT pattern to mutate the Closed World.
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={onReset} style={styles.resetButton}>
          <Ionicons name="refresh" size={14} color={Colors.dim} />
          <Text style={styles.resetText}>Reset</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Closed World Components</Text>
        <ScrollView
          style={styles.componentsList}
          showsVerticalScrollIndicator={false}
        >
          {analysis.components.map((c, i) => (
            <View key={i} style={styles.componentItem}>
              <View style={styles.componentInfo}>
                <Text style={styles.componentName}>{c.name}</Text>
                <Text style={styles.componentDesc}>{c.description}</Text>
              </View>
              {c.isEssential && (
                <View style={styles.essentialBadge}>
                  <Text style={styles.essentialText}>Essential</Text>
                </View>
              )}
            </View>
          ))}
        </ScrollView>

        {analysis.neighborhoodResources && analysis.neighborhoodResources.length > 0 && (
          <View style={styles.resourcesSection}>
            <View style={styles.resourcesHeader}>
              <Ionicons name="cloud-outline" size={14} color={Colors.gray[400]} />
              <Text style={styles.resourcesTitle}>Neighborhood Resources</Text>
            </View>
            <View style={styles.resourcesTags}>
              {analysis.neighborhoodResources.map((nr, i) => (
                <View key={i} style={styles.resourceTag}>
                  <Text style={styles.resourceTagText}>{nr}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Select SIT Pattern</Text>
        <View style={styles.patternGrid}>
          {Object.values(SITPattern).map(pattern => (
            <TouchableOpacity
              key={pattern}
              style={[
                styles.patternButton,
                selectedPattern === pattern && styles.patternButtonActive,
              ]}
              onPress={() => setSelectedPattern(pattern)}
            >
              <Text
                style={[
                  styles.patternButtonText,
                  selectedPattern === pattern && styles.patternButtonTextActive,
                ]}
              >
                {pattern}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.patternInfo}>
          <Ionicons name="information-circle" size={16} color={Colors.secondary} />
          <View style={styles.patternInfoContent}>
            <Text style={styles.patternInfoTitle}>{selectedPattern}</Text>
            <Text style={styles.patternInfoDesc}>
              {PATTERN_DETAILS[selectedPattern].description}
            </Text>
          </View>
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          style={styles.applyButton}
          onPress={handleApply}
          disabled={isLoading}
        >
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={Colors.white} />
              <Text style={styles.applyButtonText}>Mutating...</Text>
            </View>
          ) : (
            <View style={styles.buttonContent}>
              <Text style={styles.applyButtonText}>Apply Mutation</Text>
              <Ionicons name="sparkles" size={18} color={Colors.white} />
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.lg,
    gap: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    flexDirection: 'row',
    gap: Spacing.md,
    flex: 1,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: FontSizes.xl,
    fontWeight: 'bold',
    color: Colors.white,
    marginBottom: Spacing.xs,
  },
  description: {
    fontSize: FontSizes.sm,
    color: Colors.dim,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resetText: {
    fontSize: FontSizes.xs,
    color: Colors.dim,
  },
  panel: {
    backgroundColor: Colors.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
    color: Colors.gray[300],
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: Spacing.md,
  },
  componentsList: {
    maxHeight: 200,
  },
  componentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: Spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.gray[800],
    marginBottom: Spacing.sm,
  },
  componentInfo: {
    flex: 1,
  },
  componentName: {
    fontFamily: 'monospace',
    fontSize: FontSizes.sm,
    color: Colors.blue[500],
    marginBottom: 2,
  },
  componentDesc: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  essentialBadge: {
    backgroundColor: 'rgba(30, 58, 138, 0.3)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  essentialText: {
    fontSize: FontSizes.xs,
    color: Colors.blue[500],
    textTransform: 'uppercase',
  },
  resourcesSection: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  resourcesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  resourcesTitle: {
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
    color: Colors.gray[300],
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  resourcesTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  resourceTag: {
    backgroundColor: Colors.dark,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 4,
  },
  resourceTagText: {
    fontFamily: 'monospace',
    fontSize: FontSizes.xs,
    color: Colors.gray[400],
  },
  patternGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  patternButton: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: Colors.gray[800],
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
  },
  patternButtonActive: {
    backgroundColor: 'rgba(157,0,255,0.2)',
    borderColor: Colors.secondary,
  },
  patternButtonText: {
    fontFamily: 'monospace',
    fontSize: FontSizes.sm,
    color: Colors.gray[400],
  },
  patternButtonTextActive: {
    color: Colors.white,
  },
  patternInfo: {
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    borderRadius: 8,
    marginBottom: Spacing.lg,
  },
  patternInfoContent: {
    flex: 1,
  },
  patternInfoTitle: {
    fontFamily: 'monospace',
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
    color: Colors.secondary,
    marginBottom: 4,
  },
  patternInfoDesc: {
    fontSize: FontSizes.sm,
    color: Colors.gray[300],
    fontStyle: 'italic',
  },
  errorText: {
    color: Colors.red[500],
    fontSize: FontSizes.sm,
    marginBottom: Spacing.sm,
  },
  applyButton: {
    backgroundColor: Colors.secondary,
    borderRadius: 8,
    padding: Spacing.md,
    alignItems: 'center',
  },
  applyButtonText: {
    color: Colors.white,
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
});
