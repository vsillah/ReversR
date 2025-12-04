import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSizes } from '../constants/theme';
import { SavedInnovation, getAllInnovations, deleteInnovation } from '../hooks/useStorage';
import { SIT_PATTERN_LABELS, SITPattern } from '../hooks/useGemini';

interface Props {
  onBack: () => void;
  onResume: (innovation: SavedInnovation) => void;
  refreshKey?: number;
}

export default function HistoryScreen({ onBack, onResume, refreshKey }: Props) {
  const [innovations, setInnovations] = useState<SavedInnovation[]>([]);
  const [loading, setLoading] = useState(true);

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
    Alert.alert(
      'Delete Innovation',
      `Are you sure you want to delete "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteInnovation(id);
            loadInnovations();
          },
        },
      ]
    );
  };

  const getPhaseLabel = (phase: number): string => {
    switch (phase) {
      case 1: return 'Scanning';
      case 2: return 'Mutating';
      case 3: return 'Architecting';
      default: return 'Complete';
    }
  };

  const getPhaseColor = (phase: number): string => {
    switch (phase) {
      case 1: return Colors.blue[500];
      case 2: return Colors.secondary;
      case 3: return Colors.green[500];
      default: return Colors.accent;
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
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
            <TouchableOpacity
              key={item.id}
              style={styles.card}
              onPress={() => onResume(item)}
              activeOpacity={0.7}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {getInnovationTitle(item)}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleDelete(item.id, getInnovationTitle(item))}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="trash-outline" size={18} color={Colors.gray[600]} />
                  </TouchableOpacity>
                </View>
                <View style={styles.cardMeta}>
                  <View
                    style={[
                      styles.phaseBadge,
                      { backgroundColor: `${getPhaseColor(item.phase)}20` },
                    ]}
                  >
                    <View
                      style={[
                        styles.phaseDot,
                        { backgroundColor: getPhaseColor(item.phase) },
                      ]}
                    />
                    <Text
                      style={[
                        styles.phaseText,
                        { color: getPhaseColor(item.phase) },
                      ]}
                    >
                      Phase {item.phase}: {getPhaseLabel(item.phase)}
                    </Text>
                  </View>
                  <Text style={styles.timestamp}>{formatDate(item.updatedAt)}</Text>
                </View>
              </View>

              {item.innovation && (
                <View style={styles.cardBody}>
                  <Text style={styles.conceptDesc} numberOfLines={2}>
                    {item.innovation.conceptDescription}
                  </Text>
                  {item.selectedPattern && (
                    <View style={styles.patternTag}>
                      <Ionicons name="git-branch-outline" size={12} color={Colors.secondary} />
                      <Text style={styles.patternTagText}>
                        {SIT_PATTERN_LABELS[item.selectedPattern]}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              <View style={styles.cardFooter}>
                <View style={styles.resumeHint}>
                  <Text style={styles.resumeText}>Tap to resume</Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.accent} />
                </View>
              </View>
            </TouchableOpacity>
          ))
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
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  cardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  cardTitle: {
    fontSize: FontSizes.md,
    fontWeight: 'bold',
    color: Colors.white,
    flex: 1,
    marginRight: Spacing.md,
  },
  cardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  phaseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 4,
    gap: 6,
  },
  phaseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  phaseText: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
  },
  timestamp: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  cardBody: {
    padding: Spacing.lg,
  },
  conceptDesc: {
    fontSize: FontSizes.sm,
    color: Colors.gray[300],
    lineHeight: 20,
  },
  patternTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.sm,
  },
  patternTagText: {
    fontSize: FontSizes.xs,
    color: Colors.secondary,
    fontFamily: 'monospace',
  },
  cardFooter: {
    padding: Spacing.md,
    paddingTop: 0,
  },
  resumeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  resumeText: {
    fontSize: FontSizes.xs,
    color: Colors.accent,
  },
});
