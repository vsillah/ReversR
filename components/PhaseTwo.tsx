import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSizes } from '../constants/theme';
import {
  AnalysisResult,
  InnovationResult,
  SITPattern,
  SIT_PATTERNS,
  SIT_PATTERN_LABELS,
  applySITPattern,
} from '../hooks/useGemini';

interface Props {
  analysis: AnalysisResult;
  onComplete: (innovation: InnovationResult) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  onBack: () => void;
  onReset: () => void;
}

const PATTERN_DETAILS: Record<SITPattern, { description: string; steps: string[] }> = {
  'subtraction': {
    description: "Remove an essential component from the system.",
    steps: [
      "List the product's internal components.",
      "Identify an ESSENTIAL component (not just an accessory).",
      "Remove the component completely from the virtual product.",
      "Ask: 'What is the benefit of this new form?' or 'How can we replace the missing function using existing resources?'"
    ],
  },
  'task_unification': {
    description: "Assign a new task to an existing resource.",
    steps: [
      "List all internal components and external resources.",
      "Select one component or resource.",
      "Assign it an additional task it doesn't currently perform.",
      "Evaluate: 'Does this new role create value or solve a problem?'"
    ],
  },
  'multiplication': {
    description: "Copy a component but change a specific attribute.",
    steps: [
      "Choose a component from the product.",
      "Create a copy of that component.",
      "Modify one attribute of the copy (size, material, location, etc.).",
      "Explore: 'What new functionality does this variation enable?'"
    ],
  },
  'division': {
    description: "Divide the product or a component physically or functionally.",
    steps: [
      "Select the product or a key component.",
      "Divide it into separate physical or functional parts.",
      "Rearrange the parts in space or time.",
      "Consider: 'Does this separation create new use cases or benefits?'"
    ],
  },
  'attribute_dependency': {
    description: "Create a correlation between two independent variables.",
    steps: [
      "List the product's attributes (color, size, speed, etc.).",
      "Identify two currently independent attributes.",
      "Create a dependency: when one changes, the other responds.",
      "Assess: 'Does this dynamic relationship add value?'"
    ],
  },
};

export default function PhaseTwo({
  analysis,
  onComplete,
  isLoading,
  setIsLoading,
  onBack,
  onReset,
}: Props) {
  const [selectedPattern, setSelectedPattern] = useState<SITPattern>('subtraction');
  const [error, setError] = useState<string | null>(null);
  const [manualSelection, setManualSelection] = useState(false);
  const [selectedComponents, setSelectedComponents] = useState<number[]>([]);
  const [selectedResources, setSelectedResources] = useState<number[]>([]);

  const toggleComponent = (index: number) => {
    setSelectedComponents(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  const toggleResource = (index: number) => {
    setSelectedResources(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  const handleSelectionModeChange = (isManual: boolean) => {
    setManualSelection(isManual);
    if (!isManual) {
      setSelectedComponents([]);
      setSelectedResources([]);
    }
  };

  const handleApply = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await applySITPattern(
        analysis, 
        selectedPattern,
        manualSelection && selectedComponents.length > 0 ? selectedComponents : undefined,
        manualSelection && selectedResources.length > 0 ? selectedResources : undefined
      );
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
          <Ionicons name="repeat-sharp" size={28} color={Colors.secondary} />
          <View style={styles.headerText}>
            <Text style={styles.title}>Phase 2: Reverse</Text>
            <Text style={styles.description}>
              Force a change. Select a SIT pattern to reverse the Closed World.
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.panel}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Closed World Components</Text>
          <View style={styles.selectionToggle}>
            <Text style={[styles.toggleLabel, !manualSelection && styles.toggleLabelActive]}>Auto</Text>
            <Switch
              value={manualSelection}
              onValueChange={handleSelectionModeChange}
              trackColor={{ false: Colors.gray[700], true: 'rgba(157,0,255,0.4)' }}
              thumbColor={manualSelection ? Colors.secondary : Colors.gray[400]}
            />
            <Text style={[styles.toggleLabel, manualSelection && styles.toggleLabelActive]}>Manual</Text>
          </View>
        </View>
        
        {manualSelection && (
          <Text style={styles.selectionHint}>
            Tap to select components and resources to focus on
          </Text>
        )}
        
        <ScrollView
          style={styles.componentsList}
          showsVerticalScrollIndicator={false}
        >
          {analysis.components.map((c, i) => {
            const isSelected = selectedComponents.includes(i);
            return (
              <TouchableOpacity
                key={i}
                style={[
                  styles.componentItem,
                  manualSelection && styles.componentItemSelectable,
                  manualSelection && isSelected && styles.componentItemSelected,
                  manualSelection && !isSelected && styles.componentItemDimmed,
                ]}
                onPress={() => manualSelection && toggleComponent(i)}
                disabled={!manualSelection}
                activeOpacity={manualSelection ? 0.7 : 1}
              >
                {manualSelection && (
                  <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                    {isSelected && <Ionicons name="checkmark" size={14} color={Colors.white} />}
                  </View>
                )}
                <View style={styles.componentInfo}>
                  <Text style={[styles.componentName, manualSelection && !isSelected && styles.textDimmed]}>
                    {c.name}
                  </Text>
                  <Text style={[styles.componentDesc, manualSelection && !isSelected && styles.textDimmed]}>
                    {c.description}
                  </Text>
                </View>
                {c.isEssential && (
                  <View style={styles.essentialBadge}>
                    <Text style={styles.essentialText}>Essential</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {analysis.neighborhoodResources && analysis.neighborhoodResources.length > 0 && (
          <View style={styles.resourcesSection}>
            <View style={styles.resourcesHeader}>
              <Ionicons name="cloud-outline" size={14} color={Colors.gray[400]} />
              <Text style={styles.resourcesTitle}>Neighborhood Resources</Text>
            </View>
            <View style={styles.resourcesTags}>
              {analysis.neighborhoodResources.map((nr, i) => {
                const isSelected = selectedResources.includes(i);
                return (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.resourceTag,
                      manualSelection && isSelected && styles.resourceTagSelected,
                      manualSelection && !isSelected && styles.resourceTagDimmed,
                    ]}
                    onPress={() => manualSelection && toggleResource(i)}
                    disabled={!manualSelection}
                    activeOpacity={manualSelection ? 0.7 : 1}
                  >
                    {manualSelection && (
                      <View style={[styles.checkboxSmall, isSelected && styles.checkboxSelected]}>
                        {isSelected && <Ionicons name="checkmark" size={10} color={Colors.white} />}
                      </View>
                    )}
                    <Text style={[
                      styles.resourceTagText,
                      manualSelection && !isSelected && styles.textDimmed
                    ]}>
                      {nr}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
        
        {manualSelection && (selectedComponents.length > 0 || selectedResources.length > 0) && (
          <View style={styles.selectionSummary}>
            <Text style={styles.selectionSummaryText}>
              Selected: {selectedComponents.length} component{selectedComponents.length !== 1 ? 's' : ''}, {selectedResources.length} resource{selectedResources.length !== 1 ? 's' : ''}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Select SIT Pattern</Text>
        <View style={styles.patternGrid}>
          {SIT_PATTERNS.map(pattern => (
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
                {SIT_PATTERN_LABELS[pattern]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.breakdownPanel}>
          <View style={styles.breakdownHeader}>
            <Ionicons name="information-circle" size={18} color={Colors.secondary} />
            <Text style={styles.breakdownTitle}>{SIT_PATTERN_LABELS[selectedPattern]} Breakdown</Text>
          </View>
          <Text style={styles.breakdownQuote}>
            "{PATTERN_DETAILS[selectedPattern].description}"
          </Text>
          <View style={styles.breakdownSteps}>
            {PATTERN_DETAILS[selectedPattern].steps.map((step, index) => (
              <View key={index} style={styles.stepItem}>
                <Text style={styles.stepArrow}>→</Text>
                <Text style={styles.stepNumber}>{index + 1}.</Text>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
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
              <Text style={styles.applyButtonText}>Reversing...</Text>
            </View>
          ) : (
            <View style={styles.buttonContent}>
              <Text style={styles.applyButtonText}>Apply Reversal</Text>
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
  navButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
  },
  navButtonText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[400],
  },
  panel: {
    backgroundColor: Colors.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
    color: Colors.gray[300],
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: Spacing.md,
  },
  selectionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  toggleLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  toggleLabelActive: {
    color: Colors.secondary,
    fontWeight: '600',
  },
  selectionHint: {
    fontSize: FontSizes.xs,
    color: Colors.gray[400],
    fontStyle: 'italic',
    marginBottom: Spacing.sm,
  },
  componentsList: {
    flexGrow: 0,
    flexShrink: 1,
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
  componentItemSelectable: {
    borderStyle: 'dashed',
  },
  componentItemSelected: {
    borderColor: Colors.secondary,
    borderStyle: 'solid',
    backgroundColor: 'rgba(157,0,255,0.1)',
  },
  componentItemDimmed: {
    opacity: 0.5,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.gray[600],
    marginRight: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSmall: {
    width: 16,
    height: 16,
    borderRadius: 3,
    borderWidth: 2,
    borderColor: Colors.gray[600],
    marginRight: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
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
    lineHeight: FontSizes.xs * 1.4,
    flexWrap: 'wrap',
  },
  textDimmed: {
    color: Colors.gray[600],
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 4,
  },
  resourceTagSelected: {
    borderColor: Colors.secondary,
    backgroundColor: 'rgba(157,0,255,0.1)',
  },
  resourceTagDimmed: {
    opacity: 0.5,
  },
  resourceTagText: {
    fontFamily: 'monospace',
    fontSize: FontSizes.xs,
    color: Colors.gray[400],
  },
  selectionSummary: {
    marginTop: Spacing.md,
    padding: Spacing.sm,
    backgroundColor: 'rgba(157,0,255,0.15)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.secondary,
  },
  selectionSummaryText: {
    fontSize: FontSizes.xs,
    color: Colors.secondary,
    textAlign: 'center',
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
  breakdownPanel: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: Colors.secondary,
    borderRadius: 8,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  breakdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  breakdownTitle: {
    fontFamily: 'monospace',
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
    color: Colors.secondary,
  },
  breakdownQuote: {
    fontSize: FontSizes.sm,
    color: Colors.gray[300],
    fontStyle: 'italic',
    marginBottom: Spacing.md,
    paddingLeft: Spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: Colors.secondary,
  },
  breakdownSteps: {
    gap: Spacing.sm,
  },
  stepItem: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  stepArrow: {
    fontSize: FontSizes.sm,
    color: Colors.secondary,
    width: 16,
  },
  stepNumber: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
    width: 18,
  },
  stepText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.gray[300],
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
