import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSizes } from '../constants/theme';
import { SavedInnovation, getAllInnovations, deleteInnovation } from '../hooks/useStorage';
import { SIT_PATTERN_LABELS, SITPattern } from '../hooks/useGemini';
import AlertModal from './AlertModal';

const LABEL_TO_PATTERN: Record<string, SITPattern> = {
  'Subtraction': 'subtraction',
  'Task Unification': 'task_unification',
  'Multiplication': 'multiplication',
  'Division': 'division',
  'Attribute Dependency': 'attribute_dependency',
};

const getPatternLabel = (pattern: string | null | undefined): string | null => {
  if (!pattern) return null;
  if (SIT_PATTERN_LABELS[pattern as SITPattern]) {
    return SIT_PATTERN_LABELS[pattern as SITPattern];
  }
  if (LABEL_TO_PATTERN[pattern]) {
    return pattern;
  }
  return null;
};

const getItemPattern = (item: SavedInnovation): string | null => {
  if (item.selectedPattern) {
    return item.selectedPattern;
  }
  if (item.innovation?.patternUsed) {
    return item.innovation.patternUsed;
  }
  return null;
};

const normalizePatternKey = (pattern: string | null): SITPattern | null => {
  if (!pattern) return null;
  if (SIT_PATTERN_LABELS[pattern as SITPattern]) {
    return pattern as SITPattern;
  }
  if (LABEL_TO_PATTERN[pattern]) {
    return LABEL_TO_PATTERN[pattern];
  }
  return null;
};

type SortOption = 'newest' | 'oldest' | 'phase_asc' | 'phase_desc';

const SORT_OPTIONS: { key: SortOption; label: string; icon: string }[] = [
  { key: 'newest', label: 'Newest', icon: 'arrow-down' },
  { key: 'oldest', label: 'Oldest', icon: 'arrow-up' },
  { key: 'phase_desc', label: 'Most Progress', icon: 'trending-up' },
  { key: 'phase_asc', label: 'Least Progress', icon: 'trending-down' },
];

const PHASE_FILTERS = [
  { key: 1, label: 'Scan' },
  { key: 2, label: 'Reverse' },
  { key: 3, label: 'Design' },
  { key: 4, label: 'Build' },
];

const PATTERN_FILTERS: { key: SITPattern; label: string }[] = [
  { key: 'subtraction', label: 'Subtraction' },
  { key: 'task_unification', label: 'Task Unification' },
  { key: 'multiplication', label: 'Multiplication' },
  { key: 'division', label: 'Division' },
  { key: 'attribute_dependency', label: 'Attribute Dep.' },
];

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

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedPhases, setSelectedPhases] = useState<number[]>([]);
  const [selectedPatterns, setSelectedPatterns] = useState<SITPattern[]>([]);

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

  const getSearchableText = (item: SavedInnovation): string => {
    const parts: string[] = [];
    if (item.innovation?.conceptName) parts.push(item.innovation.conceptName);
    if (item.innovation?.conceptDescription) parts.push(item.innovation.conceptDescription);
    if (item.analysis?.productName) parts.push(item.analysis.productName);
    if (item.input) parts.push(item.input);
    return parts.join(' ').toLowerCase();
  };

  const togglePhaseFilter = (phase: number) => {
    setSelectedPhases(prev => 
      prev.includes(phase) 
        ? prev.filter(p => p !== phase)
        : [...prev, phase]
    );
  };

  const togglePatternFilter = (pattern: SITPattern) => {
    setSelectedPatterns(prev =>
      prev.includes(pattern)
        ? prev.filter(p => p !== pattern)
        : [...prev, pattern]
    );
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setSelectedPhases([]);
    setSelectedPatterns([]);
    setSortBy('newest');
  };

  const hasActiveFilters = searchQuery.length > 0 || selectedPhases.length > 0 || selectedPatterns.length > 0;

  const filteredAndSortedInnovations = useMemo(() => {
    let result = [...innovations];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(item => getSearchableText(item).includes(query));
    }

    if (selectedPhases.length > 0) {
      result = result.filter(item => selectedPhases.includes(item.phase));
    }

    if (selectedPatterns.length > 0) {
      result = result.filter(item => {
        const patternKey = normalizePatternKey(getItemPattern(item));
        return patternKey && selectedPatterns.includes(patternKey);
      });
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        case 'oldest':
          return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        case 'phase_desc':
          return b.phase - a.phase;
        case 'phase_asc':
          return a.phase - b.phase;
        default:
          return 0;
      }
    });

    return result;
  }, [innovations, searchQuery, selectedPhases, selectedPatterns, sortBy]);

  const activeFilterCount = selectedPhases.length + selectedPatterns.length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.white} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>Innovation History</Text>
          <Text style={styles.subtitle}>
            {filteredAndSortedInnovations.length === innovations.length 
              ? `${innovations.length} saved innovations`
              : `${filteredAndSortedInnovations.length} of ${innovations.length} innovations`
            }
          </Text>
        </View>
      </View>

      {innovations.length > 0 && (
        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={Colors.gray[500]} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search innovations..."
              placeholderTextColor={Colors.gray[600]}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={Colors.gray[500]} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.controlsRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sortScroll}>
              {SORT_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.sortChip, sortBy === option.key && styles.sortChipActive]}
                  onPress={() => setSortBy(option.key)}
                >
                  <Ionicons 
                    name={option.icon as any} 
                    size={12} 
                    color={sortBy === option.key ? Colors.black : Colors.gray[400]} 
                  />
                  <Text style={[styles.sortChipText, sortBy === option.key && styles.sortChipTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.filterButton, showFilters && styles.filterButtonActive]}
              onPress={() => setShowFilters(!showFilters)}
            >
              <Ionicons 
                name="options" 
                size={16} 
                color={showFilters || activeFilterCount > 0 ? Colors.accent : Colors.gray[400]} 
              />
              {activeFilterCount > 0 && (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {showFilters && (
            <View style={styles.filtersPanel}>
              <View style={styles.filterGroup}>
                <Text style={styles.filterGroupLabel}>Phase</Text>
                <View style={styles.filterChips}>
                  {PHASE_FILTERS.map((phase) => (
                    <TouchableOpacity
                      key={phase.key}
                      style={[
                        styles.filterChip,
                        selectedPhases.includes(phase.key) && styles.filterChipActive
                      ]}
                      onPress={() => togglePhaseFilter(phase.key)}
                    >
                      <Text style={[
                        styles.filterChipText,
                        selectedPhases.includes(phase.key) && styles.filterChipTextActive
                      ]}>
                        {phase.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.filterGroup}>
                <Text style={styles.filterGroupLabel}>Pattern</Text>
                <View style={styles.filterChips}>
                  {PATTERN_FILTERS.map((pattern) => (
                    <TouchableOpacity
                      key={pattern.key}
                      style={[
                        styles.filterChip,
                        selectedPatterns.includes(pattern.key) && styles.filterChipActive
                      ]}
                      onPress={() => togglePatternFilter(pattern.key)}
                    >
                      <Text style={[
                        styles.filterChipText,
                        selectedPatterns.includes(pattern.key) && styles.filterChipTextActive
                      ]}>
                        {pattern.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {hasActiveFilters && (
                <TouchableOpacity style={styles.clearFiltersButton} onPress={clearAllFilters}>
                  <Ionicons name="refresh" size={14} color={Colors.orange[300]} />
                  <Text style={styles.clearFiltersText}>Clear all filters</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}

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
        ) : filteredAndSortedInnovations.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={64} color={Colors.gray[700]} />
            <Text style={styles.emptyTitle}>No matches found</Text>
            <Text style={styles.emptyText}>
              Try adjusting your search or filters
            </Text>
            <TouchableOpacity style={styles.clearButton} onPress={clearAllFilters}>
              <Text style={styles.clearButtonText}>Clear Filters</Text>
            </TouchableOpacity>
          </View>
        ) : (
          filteredAndSortedInnovations.map((item) => (
            <View key={item.id} style={styles.card}>
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

              {item.innovation && (
                <View style={styles.cardBody}>
                  <Text style={styles.conceptDesc} numberOfLines={3}>
                    {item.innovation.conceptDescription}
                  </Text>
                </View>
              )}

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
  searchSection: {
    backgroundColor: Colors.panel,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark,
    borderRadius: 8,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Spacing.sm,
    fontSize: FontSizes.sm,
    color: Colors.white,
    fontFamily: 'monospace',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  sortScroll: {
    flex: 1,
  },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.dark,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Spacing.xs,
  },
  sortChipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  sortChipText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[400],
  },
  sortChipTextActive: {
    color: Colors.black,
    fontWeight: '600',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    borderRadius: 8,
    backgroundColor: Colors.dark,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterButtonActive: {
    borderColor: Colors.accent,
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: Colors.accent,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    fontSize: 10,
    color: Colors.black,
    fontWeight: 'bold',
  },
  filtersPanel: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.dark,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterGroup: {
    marginBottom: Spacing.md,
  },
  filterGroupLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    marginBottom: Spacing.xs,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
  },
  filterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  filterChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.gray[700],
  },
  filterChipActive: {
    backgroundColor: 'rgba(0, 255, 136, 0.15)',
    borderColor: Colors.accent,
  },
  filterChipText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[400],
  },
  filterChipTextActive: {
    color: Colors.accent,
    fontWeight: '600',
  },
  clearFiltersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  clearFiltersText: {
    fontSize: FontSizes.xs,
    color: Colors.orange[300],
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
  clearButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.accent,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: 8,
    marginTop: Spacing.xl,
  },
  clearButtonText: {
    color: Colors.accent,
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
