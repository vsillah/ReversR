import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, Spacing, FontSizes, Radii } from '../constants/theme';
import { useAndroidKeyboardInset } from '../hooks/useAndroidKeyboardInset';
import { useAppTheme } from '../hooks/useAppTheme';
import { SavedInnovation, getAllInnovations, deleteInnovation } from '../hooks/useStorage';
import { MACHINE_WORKFLOW_LABELS, MachineWorkflowKey } from '../hooks/useGemini';
import {
  ReviewerApprovalRecord,
  ReviewerApprovalStatus,
  getLatestReviewerApprovalRecord,
  getLatestSavedVendorApproval,
} from '../utils/reviewerApprovalRecords';
import AlertModal from './AlertModal';
import { ensureFocusedFieldVisible } from '../utils/focusVisibility';

const LABEL_TO_WORKFLOW: Record<string, MachineWorkflowKey> = {
  'Inventory Match': 'inventory_match',
};

const getPatternLabel = (pattern: string | null | undefined): string | null => {
  if (!pattern) return null;
  if (MACHINE_WORKFLOW_LABELS[pattern as MachineWorkflowKey]) {
    return MACHINE_WORKFLOW_LABELS[pattern as MachineWorkflowKey];
  }
  if (LABEL_TO_WORKFLOW[pattern]) {
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

const normalizePatternKey = (pattern: string | null): MachineWorkflowKey | null => {
  if (!pattern) return null;
  if (MACHINE_WORKFLOW_LABELS[pattern as MachineWorkflowKey]) {
    return pattern as MachineWorkflowKey;
  }
  if (LABEL_TO_WORKFLOW[pattern]) {
    return LABEL_TO_WORKFLOW[pattern];
  }
  return null;
};

type SortOption = 'newest' | 'oldest' | 'phase_asc' | 'phase_desc';
type HistoryViewMode = 'history' | 'review_queue';
type ReviewQueueStatus = 'needs_package' | 'needs_review' | 'changes_requested' | 'blocked' | 'approved_vendor';

const SORT_OPTIONS: { key: SortOption; label: string; icon: string }[] = [
  { key: 'newest', label: 'Newest', icon: 'arrow-down' },
  { key: 'oldest', label: 'Oldest', icon: 'arrow-up' },
  { key: 'phase_desc', label: 'Most Progress', icon: 'trending-up' },
  { key: 'phase_asc', label: 'Least Progress', icon: 'trending-down' },
];

const PHASE_FILTERS = [
  { key: 1, label: 'Scan' },
  { key: 2, label: 'Inventory' },
  { key: 3, label: 'Design' },
  { key: 4, label: 'Build' },
];

const PATTERN_FILTERS: { key: MachineWorkflowKey; label: string }[] = [
  { key: 'inventory_match', label: 'Inventory Match' },
];

const REVIEW_QUEUE_STATUS_META: Record<ReviewQueueStatus, {
  label: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: 'neutral' | 'warning' | 'danger' | 'success';
}> = {
  needs_package: {
    label: 'Needs Package',
    detail: 'Spec or BOM is missing before reviewer approval.',
    icon: 'cube-outline',
    tone: 'neutral',
  },
  needs_review: {
    label: 'Needs Review',
    detail: 'Package is ready for a saved reviewer decision.',
    icon: 'shield-outline',
    tone: 'warning',
  },
  changes_requested: {
    label: 'Changes Requested',
    detail: 'Reviewer requested edits before vendor submission.',
    icon: 'create-outline',
    tone: 'warning',
  },
  blocked: {
    label: 'Blocked',
    detail: 'A saved review record blocks vendor submission.',
    icon: 'alert-circle-outline',
    tone: 'danger',
  },
  approved_vendor: {
    label: 'Approved For Vendor',
    detail: 'Saved approval allows vendor quote/request drafting only.',
    icon: 'checkmark-circle-outline',
    tone: 'success',
  },
};

interface Props {
  onBack: () => void;
  onResume: (innovation: SavedInnovation) => void;
  refreshKey?: number;
  bottomBarInset?: number;
}

export default function HistoryScreen({ onBack, onResume, refreshKey, bottomBarInset = 0 }: Props) {
  const { colors: Colors } = useAppTheme();
  const styles = createStyles(Colors);
  const historyScrollRef = useRef<ScrollView>(null);
  const keyboardInset = useAndroidKeyboardInset(24);
  const historyFocusVisibilityProps = {
    onFocusCapture: (event: any) => ensureFocusedFieldVisible(historyScrollRef, event),
  } as any;
  const handleHistoryFieldFocus = (event?: any) => ensureFocusedFieldVisible(historyScrollRef, event);
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
  const [selectedPatterns, setSelectedPatterns] = useState<MachineWorkflowKey[]>([]);
  const [viewMode, setViewMode] = useState<HistoryViewMode>('history');

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
      title: 'Delete Reconstruction',
      message: `Are you sure you want to delete "${name}"?`,
      onConfirm: async () => {
        setDeleteAlert(null);
        await deleteInnovation(id);
        loadInnovations();
      },
    });
  };

  const PHASE_LABELS = ['Scan', 'Inventory', 'Design', 'Build'];

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  };

  const formatReviewDate = (dateString?: string): string => {
    if (!dateString) return 'No saved record';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    return `${formatDate(dateString)} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const getArtifacts = (item: SavedInnovation): string[] => {
    const artifacts: string[] = [];
    if (item.spec) artifacts.push('Specs');
    if (item.bom) artifacts.push('BOM');
    if (item.reviewerApprovalRecords?.length) artifacts.push('Reviews');
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
    return 'Untitled Reconstruction';
  };

  const getSearchableText = (item: SavedInnovation): string => {
    const parts: string[] = [];
    if (item.innovation?.conceptName) parts.push(item.innovation.conceptName);
    if (item.innovation?.conceptDescription) parts.push(item.innovation.conceptDescription);
    if (item.analysis?.productName) parts.push(item.analysis.productName);
    if (item.innovation?.machineName) parts.push(item.innovation.machineName);
    if (item.innovation?.machineId) parts.push(item.innovation.machineId);
    if (item.reviewerApprovalRecords?.length) {
      parts.push(...item.reviewerApprovalRecords.flatMap(record => [
        record.status,
        record.reviewerName || '',
        record.reviewerRole || '',
        record.notes || '',
      ]));
    }
    if (item.input) parts.push(item.input);
    return parts.join(' ').toLowerCase();
  };

  const getReviewQueueStatus = (item: SavedInnovation): ReviewQueueStatus => {
    const latestRecord = getLatestReviewerApprovalRecord(item.reviewerApprovalRecords || []);
    const savedApproval = getLatestSavedVendorApproval(item.reviewerApprovalRecords || []);

    if (savedApproval) return 'approved_vendor';
    if (latestRecord?.status === 'blocked') return 'blocked';
    if (latestRecord?.status === 'changes_requested') return 'changes_requested';
    if (!item.spec || !item.bom) return 'needs_package';
    return 'needs_review';
  };

  const getLatestReviewMeta = (records: ReviewerApprovalRecord[] = []) => {
    const latest = getLatestReviewerApprovalRecord(records);
    if (!latest) {
      return {
        label: 'No saved reviewer decision',
        detail: 'Reviewer approval has not been saved yet.',
      };
    }
    return {
      label: `${formatReviewStatus(latest.status)} by ${latest.reviewerName || 'unnamed reviewer'}`,
      detail: `${latest.recordId} | ${formatReviewDate(latest.savedAt)}`,
    };
  };

  const formatReviewStatus = (status: ReviewerApprovalStatus): string => {
    switch (status) {
      case 'approved_for_vendor_review':
        return 'Approved for vendor review';
      case 'changes_requested':
        return 'Changes requested';
      case 'blocked':
        return 'Blocked';
      default:
        return 'Pending review';
    }
  };

  const togglePhaseFilter = (phase: number) => {
    setSelectedPhases(prev => 
      prev.includes(phase) 
        ? prev.filter(p => p !== phase)
        : [...prev, phase]
    );
  };

  const togglePatternFilter = (pattern: MachineWorkflowKey) => {
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

  const reviewQueueItems = useMemo(() => {
    let result = innovations.filter(item => (
      item.phase >= 4 || !!item.spec || !!item.bom || !!item.reviewerApprovalRecords?.length
    ));

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(item => getSearchableText(item).includes(query));
    }

    const statusRank: Record<ReviewQueueStatus, number> = {
      blocked: 0,
      changes_requested: 1,
      needs_review: 2,
      needs_package: 3,
      approved_vendor: 4,
    };

    return result.sort((a, b) => {
      const statusDelta = statusRank[getReviewQueueStatus(a)] - statusRank[getReviewQueueStatus(b)];
      if (statusDelta !== 0) return statusDelta;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [innovations, searchQuery]);

  const activeFilterCount = selectedPhases.length + selectedPatterns.length;
  const needsReviewCount = reviewQueueItems.filter(item => {
    const status = getReviewQueueStatus(item);
    return status === 'needs_review' || status === 'changes_requested' || status === 'blocked';
  }).length;
  const approvedReviewCount = reviewQueueItems.filter(item => getReviewQueueStatus(item) === 'approved_vendor').length;

  return (
    <View style={styles.container} testID="reversr-tour-history">
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>{viewMode === 'history' ? 'Reconstruction History' : 'Review Queue'}</Text>
          <Text style={styles.subtitle}>
            {viewMode === 'history'
              ? filteredAndSortedInnovations.length === innovations.length
                ? `${innovations.length} saved reconstructions`
                : `${filteredAndSortedInnovations.length} of ${innovations.length} reconstructions`
              : `${reviewQueueItems.length} packages | ${needsReviewCount} need action | ${approvedReviewCount} approved for vendor`
            }
          </Text>
        </View>
      </View>

      {innovations.length > 0 && (
        <View style={styles.searchSection}>
          <View style={styles.viewSwitch}>
            <TouchableOpacity
              style={[styles.viewSwitchButton, viewMode === 'history' && styles.viewSwitchButtonActive]}
              onPress={() => setViewMode('history')}
              accessibilityRole="button"
              accessibilityState={{ selected: viewMode === 'history' }}
            >
              <Ionicons
                name="time-outline"
                size={14}
                color={viewMode === 'history' ? '#ffffff' : Colors.mutedText}
              />
              <Text style={[styles.viewSwitchText, viewMode === 'history' && styles.viewSwitchTextActive]}>
                History
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewSwitchButton, viewMode === 'review_queue' && styles.viewSwitchButtonActive]}
              onPress={() => setViewMode('review_queue')}
              accessibilityRole="button"
              accessibilityState={{ selected: viewMode === 'review_queue' }}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={14}
                color={viewMode === 'review_queue' ? '#ffffff' : Colors.mutedText}
              />
              <Text style={[styles.viewSwitchText, viewMode === 'review_queue' && styles.viewSwitchTextActive]}>
                Review Queue
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={Colors.gray[500]} />
            <TextInput
              style={styles.searchInput}
              placeholder={viewMode === 'history' ? 'Search reconstructions...' : 'Search review packages...'}
              placeholderTextColor={Colors.gray[600]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={handleHistoryFieldFocus}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={Colors.gray[500]} />
              </TouchableOpacity>
            )}
          </View>

          {viewMode === 'history' ? (
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
                      color={sortBy === option.key ? '#ffffff' : Colors.mutedText}
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
          ) : (
            <View style={styles.queueSummaryRow}>
              <View style={styles.queueSummaryItem}>
                <Text style={styles.queueSummaryValue}>{needsReviewCount}</Text>
                <Text style={styles.queueSummaryLabel}>Needs Action</Text>
              </View>
              <View style={styles.queueSummaryItem}>
                <Text style={styles.queueSummaryValue}>{approvedReviewCount}</Text>
                <Text style={styles.queueSummaryLabel}>Vendor Ready</Text>
              </View>
              <View style={styles.queueSummaryItem}>
                <Text style={styles.queueSummaryValue}>{reviewQueueItems.length}</Text>
                <Text style={styles.queueSummaryLabel}>Packages</Text>
              </View>
            </View>
          )}

          {viewMode === 'history' && showFilters && (
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
                <Text style={styles.filterGroupLabel}>Match Type</Text>
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

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
      <ScrollView
        ref={historyScrollRef}
        style={styles.content}
        contentContainerStyle={{ paddingBottom: bottomBarInset + keyboardInset }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        {...historyFocusVisibilityProps}
      >
        {loading ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Loading...</Text>
          </View>
        ) : innovations.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cube-outline" size={64} color={Colors.gray[700]} />
            <Text style={styles.emptyTitle}>No reconstructions yet</Text>
            <Text style={styles.emptyText}>
              Start scanning machines to build your reconstruction history
            </Text>
            <TouchableOpacity style={styles.startButton} onPress={onBack}>
              <Text style={styles.startButtonText}>Start Scanning</Text>
            </TouchableOpacity>
          </View>
        ) : viewMode === 'review_queue' && reviewQueueItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="shield-checkmark-outline" size={64} color={Colors.gray[700]} />
            <Text style={styles.emptyTitle}>No review packages</Text>
            <Text style={styles.emptyText}>
              Build-phase reconstructions and saved reviewer decisions will appear here.
            </Text>
          </View>
        ) : viewMode === 'review_queue' ? (
          reviewQueueItems.map((item) => {
            const queueStatus = getReviewQueueStatus(item);
            const statusMeta = REVIEW_QUEUE_STATUS_META[queueStatus];
            const latestReviewMeta = getLatestReviewMeta(item.reviewerApprovalRecords || []);
            const latestRecord = getLatestReviewerApprovalRecord(item.reviewerApprovalRecords || []);
            const missingPackageItems = [
              !item.spec ? 'Specs' : '',
              !item.bom ? 'BOM' : '',
            ].filter(Boolean);

            return (
              <View key={item.id} style={styles.reviewQueueCard}>
                <View style={styles.reviewQueueHeader}>
                  <View style={styles.reviewQueueTitleWrap}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {getInnovationTitle(item)}
                    </Text>
                    <Text style={styles.reviewQueueMachine} numberOfLines={1}>
                      {item.innovation?.machineName || item.analysis?.productName || 'Machine identity pending'}
                    </Text>
                  </View>
                  <View style={[
                    styles.reviewStatusBadge,
                    statusMeta.tone === 'success' && styles.reviewStatusBadgeSuccess,
                    statusMeta.tone === 'warning' && styles.reviewStatusBadgeWarning,
                    statusMeta.tone === 'danger' && styles.reviewStatusBadgeDanger,
                  ]}>
                    <Ionicons
                      name={statusMeta.icon}
                      size={14}
                      color={statusMeta.tone === 'success' ? Colors.accent : statusMeta.tone === 'danger' ? Colors.danger : Colors.orange[300]}
                    />
                    <Text style={[
                      styles.reviewStatusText,
                      statusMeta.tone === 'success' && styles.reviewStatusTextSuccess,
                      statusMeta.tone === 'danger' && styles.reviewStatusTextDanger,
                    ]}>
                      {statusMeta.label}
                    </Text>
                  </View>
                </View>

                <Text style={styles.reviewQueueDetail}>{statusMeta.detail}</Text>

                <View style={styles.reviewQueueGrid}>
                  <View style={styles.reviewQueueMetric}>
                    <Text style={styles.reviewQueueMetricLabel}>Package</Text>
                    <Text style={styles.reviewQueueMetricValue}>
                      {missingPackageItems.length ? `Missing ${missingPackageItems.join(', ')}` : 'Spec + BOM ready'}
                    </Text>
                  </View>
                  <View style={styles.reviewQueueMetric}>
                    <Text style={styles.reviewQueueMetricLabel}>Latest Review</Text>
                    <Text style={styles.reviewQueueMetricValue}>{latestReviewMeta.label}</Text>
                  </View>
                  <View style={styles.reviewQueueMetric}>
                    <Text style={styles.reviewQueueMetricLabel}>Release Boundary</Text>
                    <Text style={styles.reviewQueueMetricValue}>
                      {latestRecord?.approvedForFabrication ? 'Fabrication approved' : 'Fabrication blocked'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.reviewQueueRecordMeta} numberOfLines={2}>
                  {latestReviewMeta.detail}
                </Text>

                <View style={styles.reviewQueueFooter}>
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
                    onPress={() => onResume({ ...item, phase: 4 })}
                  >
                    <Text style={styles.continueText}>Open Review</Text>
                    <Ionicons name="arrow-forward" size={14} color={Colors.accent} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
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
      </KeyboardAvoidingView>

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

const createStyles = (Colors: AppColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.hairline,
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
    color: Colors.text,
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
  viewSwitch: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  viewSwitchButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingVertical: Spacing.sm,
  },
  viewSwitchButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  viewSwitchText: {
    color: Colors.mutedText,
    fontSize: FontSizes.xs,
    fontWeight: '600',
  },
  viewSwitchTextActive: {
    color: '#ffffff',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.input,
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
    color: Colors.text,
    fontFamily: 'monospace',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  queueSummaryRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  queueSummaryItem: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
  },
  queueSummaryValue: {
    color: Colors.accent,
    fontSize: FontSizes.md,
    fontWeight: 'bold',
  },
  queueSummaryLabel: {
    color: Colors.gray[500],
    fontSize: 10,
    textTransform: 'uppercase',
    marginTop: 2,
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
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Spacing.xs,
  },
  sortChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  sortChipText: {
    fontSize: FontSizes.xs,
    color: Colors.mutedText,
  },
  sortChipTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterButtonActive: {
    borderColor: Colors.primary,
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    fontSize: 10,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  filtersPanel: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.surface,
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
    color: Colors.text,
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
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radii.md,
    marginTop: Spacing.xl,
  },
  startButtonText: {
    color: '#ffffff',
    fontWeight: '700',
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
  reviewQueueCard: {
    backgroundColor: Colors.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
    padding: Spacing.lg,
  },
  reviewQueueHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  reviewQueueTitleWrap: {
    flex: 1,
  },
  reviewQueueMachine: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
  reviewStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
    maxWidth: '42%',
  },
  reviewStatusBadgeSuccess: {
    borderColor: 'rgba(0, 255, 136, 0.35)',
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
  },
  reviewStatusBadgeWarning: {
    borderColor: 'rgba(251, 191, 36, 0.35)',
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
  },
  reviewStatusBadgeDanger: {
    borderColor: 'rgba(239, 68, 68, 0.35)',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  reviewStatusText: {
    color: Colors.orange[300],
    fontSize: 10,
    fontWeight: 'bold',
  },
  reviewStatusTextSuccess: {
    color: Colors.accent,
  },
  reviewStatusTextDanger: {
    color: Colors.danger,
  },
  reviewQueueDetail: {
    color: Colors.gray[300],
    fontSize: FontSizes.xs,
    lineHeight: 17,
    marginBottom: Spacing.md,
  },
  reviewQueueGrid: {
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  reviewQueueMetric: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: Spacing.sm,
  },
  reviewQueueMetricLabel: {
    color: Colors.gray[500],
    fontSize: 10,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  reviewQueueMetricValue: {
    color: Colors.gray[200],
    fontSize: FontSizes.xs,
    lineHeight: 16,
  },
  reviewQueueRecordMeta: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    lineHeight: 16,
    marginBottom: Spacing.md,
  },
  reviewQueueFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.md,
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
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
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
