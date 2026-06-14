import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, FontSizes, Spacing } from '../constants/theme';
import { useAppTheme } from '../hooks/useAppTheme';

export type TourTargetId =
  | 'welcome'
  | 'settings'
  | 'phase-nav'
  | 'scan'
  | 'inventory'
  | 'design'
  | 'build'
  | 'history';

export type TourStep = {
  id: TourTargetId;
  eyebrow: string;
  title: string;
  body: string;
  structureId: string;
  phase?: number;
  opensSettings?: boolean;
  opensHistory?: boolean;
  checks: Array<{
    id: string;
    label: string;
  }>;
};

interface TourGuideProps {
  active: boolean;
  step: TourStep;
  stepIndex: number;
  stepCount: number;
  completedChecks: Set<string>;
  completedCount: number;
  totalCount: number;
  canFocusStep: boolean;
  focusBlockedReason?: string;
  onFocusStep: () => void;
  onToggleCheck: (stepIndex: number, checkId: string) => void;
  onToggleStepDone: (stepIndex: number) => void;
  onBack: () => void;
  onNext: () => void;
  onExit: () => void;
}

export function tourCheckKey(stepIndex: number, checkId: string) {
  return `${stepIndex}:${checkId}`;
}

export default function TourGuide({
  active,
  step,
  stepIndex,
  stepCount,
  completedChecks,
  completedCount,
  totalCount,
  canFocusStep,
  focusBlockedReason,
  onFocusStep,
  onToggleCheck,
  onToggleStepDone,
  onBack,
  onNext,
  onExit,
}: TourGuideProps) {
  const { colors: Colors } = useAppTheme();
  const styles = createStyles(Colors);
  if (!active) return null;

  const isLastStep = stepIndex === stepCount - 1;
  const stepCompleteCount = step.checks.filter(check => completedChecks.has(tourCheckKey(stepIndex, check.id))).length;
  const isStepComplete = stepCompleteCount === step.checks.length;
  const progressPercent = Math.round((completedCount / Math.max(1, totalCount)) * 100);
  const progressValue = `${progressPercent}%` as `${number}%`;

  return (
    <Modal
      visible={active}
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      statusBarTranslucent
    >
      <View style={styles.overlay} pointerEvents="box-none">
        <View
          style={styles.dock}
          accessibilityRole="summary"
          accessibilityLabel="ReversR guided tour"
          testID="reversr-tour-guide"
        >
      <View style={styles.kickerRow}>
        <Text style={styles.eyebrow}>
          {step.eyebrow} / Step {stepIndex + 1} of {stepCount}
        </Text>
        <Text style={styles.stepCounter}>{stepCompleteCount}/{step.checks.length} checks</Text>
      </View>

      <View style={styles.titleRow}>
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.totalCounter}>{completedCount}/{totalCount} done</Text>
      </View>

      <View style={styles.progressTrack} accessibilityLabel={`Tour progress ${progressValue}`}>
        <View style={[styles.progressFill, { width: progressValue }]} />
      </View>

      <Text style={styles.body}>{step.body}</Text>
      <Text style={styles.structureId}>Structure ID: {step.structureId}</Text>

      {!canFocusStep && focusBlockedReason ? (
        <View style={styles.blockedNotice}>
          <Ionicons name="lock-closed-outline" size={14} color={Colors.warning} />
          <Text style={styles.blockedNoticeText}>{focusBlockedReason}</Text>
        </View>
      ) : null}

      <View style={styles.checkList}>
        {step.checks.map(check => {
          const isComplete = completedChecks.has(tourCheckKey(stepIndex, check.id));
          return (
            <TouchableOpacity
              key={check.id}
              style={[styles.checkButton, isComplete && styles.checkButtonComplete]}
              onPress={() => onToggleCheck(stepIndex, check.id)}
              accessibilityRole="button"
              accessibilityLabel={`${isComplete ? 'Clear' : 'Complete'} tour check ${check.label}`}
              accessibilityState={{ selected: isComplete }}
            >
              <Ionicons
                name={isComplete ? 'checkmark-circle' : 'ellipse-outline'}
                size={15}
                color={isComplete ? Colors.black : Colors.gray[400]}
              />
              <Text style={[styles.checkText, isComplete && styles.checkTextComplete]}>{check.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, !canFocusStep && styles.actionButtonDisabled]}
          onPress={onFocusStep}
          disabled={!canFocusStep}
          accessibilityRole="button"
          accessibilityLabel="Focus the current tour step"
          accessibilityState={{ disabled: !canFocusStep }}
        >
          <Ionicons name="locate-outline" size={15} color={canFocusStep ? Colors.accent : Colors.gray[500]} />
          <Text style={[styles.actionButtonText, !canFocusStep && styles.actionButtonTextDisabled]}>Focus</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => onToggleStepDone(stepIndex)}
          accessibilityRole="button"
          accessibilityLabel={isStepComplete ? 'Undo all checks for this tour step' : 'Mark this tour step complete'}
        >
          <Ionicons name={isStepComplete ? 'close-circle-outline' : 'checkmark-done-outline'} size={15} color={Colors.accent} />
          <Text style={styles.actionButtonText}>{isStepComplete ? 'Undo' : 'Done'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, stepIndex === 0 && styles.actionButtonDisabled]}
          onPress={onBack}
          disabled={stepIndex === 0}
          accessibilityRole="button"
          accessibilityLabel="Go to previous tour step"
          accessibilityState={{ disabled: stepIndex === 0 }}
        >
          <Text style={[styles.actionButtonText, stepIndex === 0 && styles.actionButtonTextDisabled]}>Back</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={onNext}
          accessibilityRole="button"
          accessibilityLabel={isLastStep ? 'Finish tour' : 'Go to next tour step'}
        >
          <Text style={styles.primaryButtonText}>{isLastStep ? 'Finish' : 'Next'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconButton}
          onPress={onExit}
          accessibilityRole="button"
          accessibilityLabel="Exit guided tour"
        >
          <Ionicons name="close" size={18} color={Colors.gray[400]} />
        </TouchableOpacity>
      </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (Colors: AppColors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  dock: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    bottom: Spacing.md,
    alignSelf: 'center',
    maxWidth: 520,
    padding: Spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.accent,
    backgroundColor: Colors.mode === 'dark' ? '#101816' : Colors.gray[50],
    shadowColor: Colors.black,
    shadowOpacity: 0.24,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 18,
    elevation: 10,
    zIndex: 20,
  },
  kickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  eyebrow: {
    flex: 1,
    color: Colors.accent,
    fontSize: FontSizes.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  stepCounter: {
    color: Colors.gray[400],
    fontSize: FontSizes.xs,
    fontWeight: '700',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  title: {
    flex: 1,
    color: Colors.white,
    fontSize: FontSizes.lg,
    fontWeight: '800',
  },
  totalCounter: {
    color: Colors.gray[400],
    fontSize: FontSizes.xs,
    fontWeight: '800',
  },
  progressTrack: {
    height: 5,
    borderRadius: 999,
    backgroundColor: Colors.gray[800],
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: Colors.accent,
  },
  body: {
    color: Colors.gray[300],
    fontSize: FontSizes.sm,
    lineHeight: 18,
  },
  structureId: {
    marginTop: Spacing.xs,
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    fontFamily: 'monospace',
  },
  blockedNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.orange[900],
    backgroundColor: Colors.orange[900] + '33',
  },
  blockedNoticeText: {
    flex: 1,
    color: Colors.gray[300],
    fontSize: FontSizes.xs,
    lineHeight: 16,
  },
  checkList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  checkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 6,
    paddingHorizontal: 9,
    backgroundColor: Colors.surface,
  },
  checkButtonComplete: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent,
  },
  checkText: {
    color: Colors.gray[300],
    fontSize: FontSizes.xs,
    fontWeight: '700',
  },
  checkTextComplete: {
    color: Colors.black,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  actionButton: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: Colors.surface,
  },
  actionButtonDisabled: {
    opacity: 0.55,
  },
  actionButtonText: {
    color: Colors.accent,
    fontSize: FontSizes.xs,
    fontWeight: '800',
  },
  actionButtonTextDisabled: {
    color: Colors.gray[500],
  },
  primaryButton: {
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: Colors.accent,
  },
  primaryButtonText: {
    color: Colors.black,
    fontSize: FontSizes.xs,
    fontWeight: '900',
  },
  iconButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
});
