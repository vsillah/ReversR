import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSizes } from '../constants/theme';
import { SavedInnovation, getAllInnovations, deleteInnovation } from '../hooks/useStorage';
import { SIT_PATTERN_LABELS, SITPattern } from '../hooks/useGemini';
import AlertModal from './AlertModal';

// Reverse lookup: maps human-readable labels to pattern keys for legacy data
const LABEL_TO_PATTERN: Record<string, SITPattern> = {
  'Subtraction': 'subtraction',
  'Task Unification': 'task_unification',
  'Multiplication': 'multiplication',
  'Division': 'division',
  'Attribute Dependency': 'attribute_dependency',
};

// Get display label for a pattern, handling both key format and legacy label format
const getPatternLabel = (pattern: string | null | undefined): string | null => {
  if (!pattern) return null;
  
  // First try direct lookup (pattern is a key like 'subtraction')
  if (SIT_PATTERN_LABELS[pattern as SITPattern]) {
    return SIT_PATTERN_LABELS[pattern as SITPattern];
  }
  
  // Try reverse lookup (pattern is a label like 'Subtraction')
  if (LABEL_TO_PATTERN[pattern]) {
    return pattern; // It's already a valid label
  }
  
  return null; // Unknown format, don't display
};

// Get pattern from an innovation item, checking both selectedPattern and innovation.patternUsed
const getItemPattern = (item: SavedInnovation): string | null => {
  // Prefer selectedPattern (normalized key format)
  if (item.selectedPattern) {
    return item.selectedPattern;
  }
  // Fallback to innovation.patternUsed for legacy data
  if (item.innovation?.patternUsed) {
    return item.innovation.patternUsed;
  }
  return null;
};

interface Props {
  onBack: () => void;
  onResume: (innovation: SavedInnovation) => void;
  refreshKey?: number;
}

export default function HistoryScreen({ onBack, onResume, refreshKey }: Props) {
  const [innovations, setInnovations] = useState<SavedInnovation[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteAlert, setDeleteAlert] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    loadInnovations();
  }, [refreshKey]);

  const loadInnovations = async () => {
    setLoading(true);
    const data = await getAllInnovations();
    setInnovations(data);
    setLoading(false);
  };

  const handleDelete = (id: string, name: string) => {
    setDeleteAlert({
      visible: true,
      title: 'Delete Innovation',
      message: `Are you sure you want to delete "${name}"?`,
      onConfirm: async () => {
        setDeleteAlert(null);
        await deleteInnovation(id);
        loadInnovations();
      },
    });
  };

  const PHASE_LABELS = ['Scan', 'Reverse', 'Design', 'Build'];

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  };

  const getArtifacts = (item: SavedInnovation): string[] => {
    const artifacts: string[] = [];
    if (item.spec) artifacts.push('Specs');
    if (item.bom) artifacts.push('BOM');
    if (item.imageUrl) artifacts.push('2D');
    if (item.threeDScene) artifacts.push('3D');
    return artifacts;
  };

  const getInnovationTitle = (item: SavedInnovation): string => {
    if (item.innovation?.conceptName) {
      return item.innovation.conceptName;
    }
    if (item.analysis?.productName) {
      return item.analysis.productName;
    }
    if (item.input) {
      return item.input.substring(0, 30) + (item.input.length > 30 ? '...' : '');
    }
    return 'Untitled Innovation';
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.white} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>Innovation History</Text>
          <Text style={styles.subtitle}>{innovations.length} saved innovations</Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Loading...</Text>
          </View>
        ) : innovations.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cube-outline" size={64} color={Colors.gray[700]} />
            <Text style={styles.emptyTitle}>No innovations yet</Text>
            <Text style={styles.emptyText}>
              Start analyzing products to build your innovation history
            </Text>
            <TouchableOpacity style={styles.startButton} onPress={onBack}>
              <Text style={styles.startButtonText}>Start Innovating</Text>
            </TouchableOpacity>
          </View>
        ) : (
          innovations.map((item) => (
            <View key={item.id} style={styles.card}>
              {/* Header: Title + Pattern Badge + Delete */}
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {getInnovationTitle(item)}
                  </Text>
                  {getPatternLabel(getItemPattern(item)) && (
                    <View style={styles.patternBadge}>
                      <Text style={styles.patternBadgeText}>
                        {getPatternLabel(getItemPattern(item))}
                      </Text>
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={() => handleDelete(item.id, getInnovationTitle(item))}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={styles.deleteButton}
                  >
                    <Ionicons name="trash-outline" size={18} color={Colors.gray[600]} />
                  </TouchableOpacity>
                </View>
                <View style={styles.dateRow}>
                  <Ionicons name="calendar-outline" size={12} color={Colors.gray[500]} />
                  <Text style={styles.dateText}>{formatDate(item.updatedAt)}</Text>
                </View>
              </View>

              {/* Description */}
              {item.innovation && (
                <View style={styles.cardBody}>
                  <Text style={styles.conceptDesc} numberOfLines={3}>
                    {item.innovation.conceptDescription}
                  </Text>
                </View>
              )}

              {/* Phase Progress Indicator */}
              <View style={styles.progressSection}>
                <View style={styles.progressRow}>
                  {PHASE_LABELS.map((label, index) => {
                    const phaseNum = index + 1;
                    const isComplete = item.phase > phaseNum;
                    const isCurrent = item.phase === phaseNum;
                    return (
                      <React.Fragment key={label}>
                        <View style={styles.progressItem}>
                          <View style={[
                            styles.progressCircle,
                            isComplete && styles.progressCircleComplete,
                            isCurrent && styles.progressCircleCurrent,
                          ]}>
                            {isComplete ? (
                              <Ionicons name="checkmark" size={12} color={Colors.accent} />
                            ) : isCurrent ? (
                              <Ionicons name="play" size={10} color={Colors.white} />
                            ) : (
                              <View style={styles.progressDot} />
                            )}
                          </View>
                          <Text style={[
                            styles.progressLabel,
                            (isComplete || isCurrent) && styles.progressLabelActive,
                          ]}>{label}</Text>
                        </View>
                        {index < PHASE_LABELS.length - 1 && (
                          <View style={[
                            styles.progressConnector,
                            isComplete && styles.progressConnectorComplete,
                          ]} />
                        )}
                      </React.Fragment>
                    );
                  })}
                </View>
              </View>

              {/* Footer: Artifacts + Continue Button */}
              <View style={styles.cardFooter}>
                <View style={styles.artifactsRow}>
                  {getArtifacts(item).map((artifact) => (
                    <View key={artifact} style={styles.artifactTag}>
                      <Ionicons name="document-text-outline" size={10} color={Colors.gray[500]} />
                      <Text style={styles.artifactText}>{artifact}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity 
                  style={styles.continueButton}
                  onPress={() => onResume(item)}
                >
                  <Text style={styles.continueText}>Continue</Text>
                  <Ionicons name="arrow-forward" size={14} color={Colors.accent} />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <AlertModal
        visible={deleteAlert?.visible || false}
        title={deleteAlert?.title || ''}
        message={deleteAlert?.message || ''}
        type="error"
        buttons={[
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => setDeleteAlert(null),
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => deleteAlert?.onConfirm(),
          },
        ]}
        onClose={() => setDeleteAlert(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.panel,
    gap: Spacing.md,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: FontSizes.xl,
    fontWeight: 'bold',
    color: Colors.white,
  },
  subtitle: {
    fontSize: FontSizes.sm,
    color: Colors.dim,
    marginTop: 2,
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl * 3,
  },
  emptyTitle: {
    fontSize: FontSizes.lg,
    fontWeight: 'bold',
    color: Colors.white,
    marginTop: Spacing.lg,
  },
  emptyText: {
    fontSize: FontSizes.sm,
    color: Colors.dim,
    textAlign: 'center',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  startButton: {
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: 8,
    marginTop: Spacing.xl,
  },
  startButtonText: {
    color: Colors.black,
    fontWeight: '600',
    fontSize: FontSizes.md,
  },
  card: {
    backgroundColor: Colors.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  cardHeader: {
    padding: Spacing.lg,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  cardTitle: {
    fontFamily: 'monospace',
    fontSize: FontSizes.md,
    fontWeight: 'bold',
    color: Colors.accent,
    flexShrink: 1,
  },
  patternBadge: {
    backgroundColor: 'rgba(0, 255, 136, 0.15)',
    borderWidth: 1,
    borderColor: Colors.accent,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 12,
  },
  patternBadgeText: {
    fontSize: FontSizes.xs,
    color: Colors.accent,
    fontWeight: '600',
  },
  deleteButton: {
    marginLeft: 'auto',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  cardBody: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  conceptDesc: {
    fontSize: FontSizes.sm,
    color: Colors.gray[300],
    lineHeight: 20,
  },
  progressSection: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressItem: {
    alignItems: 'center',
    gap: 4,
  },
  progressCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gray[700],
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressCircleComplete: {
    borderColor: Colors.accent,
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
  },
  progressCircleCurrent: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent,
  },
  progressDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray[600],
  },
  progressLabel: {
    fontSize: 9,
    color: Colors.gray[600],
    textTransform: 'uppercase',
  },
  progressLabelActive: {
    color: Colors.accent,
  },
  progressConnector: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.gray[700],
    marginHorizontal: 4,
    marginBottom: 16,
  },
  progressConnectorComplete: {
    backgroundColor: Colors.accent,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  artifactsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  artifactTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  artifactText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 255, 136, 0.15)',
    borderWidth: 1,
    borderColor: Colors.accent,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 6,
  },
  continueText: {
    fontSize: FontSizes.xs,
    color: Colors.accent,
    fontWeight: '600',
  },
});
