import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, StyleProp, ViewStyle, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, FontSizes, Spacing, Radii, Fonts } from '../constants/theme';
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
    completion?: 'manual' | 'auto';
  }>;
};

export type TourGuidePlacement = 'bottom-left' | 'top-right';

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
  placement: TourGuidePlacement;
  mockJourneyActive: boolean;
  onStartMockJourney: () => void;
  onStopMockJourney: () => void;
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
  placement,
  mockJourneyActive,
  onStartMockJourney,
  onStopMockJourney,
  onToggleCheck,
  onToggleStepDone,
  onBack,
  onNext,
  onExit,
}: TourGuideProps) {
  const { colors: Colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const styles = createStyles(Colors);
  const [nextLockMessage, setNextLockMessage] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);

  const isCompact = width < 760;
  const isLastStep = stepIndex === stepCount - 1;
  const manualChecks = step.checks.filter(check => check.completion !== 'auto');
  const manualCheckCount = manualChecks.length;
  const areManualChecksComplete = manualCheckCount > 0
    && manualChecks.every(check => completedChecks.has(tourCheckKey(stepIndex, check.id)));
  const stepCompleteCount = step.checks.filter(check => completedChecks.has(tourCheckKey(stepIndex, check.id))).length;
  const isStepComplete = stepCompleteCount === step.checks.length;
  const remainingActionCount = Math.max(0, step.checks.length - stepCompleteCount);
  const isNextLocked = !isStepComplete || !canFocusStep;
  const progressPercent = Math.round((completedCount / Math.max(1, totalCount)) * 100);
  const progressValue = `${progressPercent}%` as `${number}%`;
  const dockPlacementStyle: StyleProp<ViewStyle> = isCompact
    ? styles.dockBottom
    : placement === 'top-right'
      ? styles.dockTopRight
      : styles.dockBottomLeft;

  useEffect(() => {
    setNextLockMessage(null);
  }, [stepIndex, isStepComplete, canFocusStep]);

  useEffect(() => {
    setIsMinimized(isCompact && Boolean(step.opensSettings || step.opensHistory));
  }, [isCompact, step.opensHistory, step.opensSettings, stepIndex]);

  if (!active) return null;

  const handleNextPress = () => {
    if (!canFocusStep) {
      setNextLockMessage(focusBlockedReason || 'This scene is still locked. Complete the current app phase first.');
      return;
    }

    if (!isStepComplete) {
      setNextLockMessage(
        remainingActionCount === 1
          ? 'Complete the remaining action before moving to the next tour step.'
          : `Complete the ${remainingActionCount} remaining actions before moving to the next tour step.`
      );
      return;
    }

    setNextLockMessage(null);
    onNext();
  };

  const handleToggleManualPress = () => {
    if (!canFocusStep || manualCheckCount === 0) return;
    onToggleStepDone(stepIndex);
  };

  if (isCompact && isMinimized) {
    return (
      <Modal transparent visible animationType="none" statusBarTranslucent>
        <View style={styles.tourModalLayer} pointerEvents="box-none">
          <View
            style={styles.miniDock}
            accessibilityRole="summary"
            accessibilityLabel="Collapsed ReversR guided tour"
            testID="reversr-tour-guide-minimized"
          >
            <View style={styles.miniMain}>
              <View style={styles.miniText}>
                <Text style={styles.miniEyebrow}>Step {stepIndex + 1} of {stepCount}</Text>
                <Text style={styles.miniTitle} numberOfLines={1}>{step.title}</Text>
              </View>
              <Text style={styles.miniCounter}>{stepCompleteCount}/{step.checks.length}</Text>
            </View>
            <View style={styles.miniActions}>
              {manualCheckCount > 0 ? (
                <TouchableOpacity
                  style={[styles.miniButton, !canFocusStep && styles.miniButtonDisabled]}
                  onPress={handleToggleManualPress}
                  disabled={!canFocusStep}
                  accessibilityRole="button"
                  accessibilityLabel={areManualChecksComplete ? 'Undo manual actions for this tour step' : 'Mark manual actions for this tour step complete'}
                  accessibilityState={{ disabled: !canFocusStep }}
                >
                  <Text style={[styles.miniButtonText, !canFocusStep && styles.miniButtonTextDisabled]}>
                    {areManualChecksComplete ? 'Undo' : 'Done'}
                  </Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.miniButton, stepIndex === 0 && styles.miniButtonDisabled]}
                onPress={onBack}
                disabled={stepIndex === 0}
                accessibilityRole="button"
                accessibilityLabel="Go to previous tour step"
                accessibilityState={{ disabled: stepIndex === 0 }}
              >
                <Ionicons name="arrow-back-outline" size={14} color={stepIndex === 0 ? Colors.gray[500] : Colors.accent} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.miniPrimaryButton, isNextLocked && styles.miniButtonDisabled]}
                onPress={handleNextPress}
                accessibilityRole="button"
                accessibilityLabel={
                  isNextLocked
                    ? 'Next tour step locked until actions are complete'
                    : isLastStep
                      ? 'Finish tour'
                      : 'Go to next tour step'
                }
                accessibilityState={{ disabled: isNextLocked }}
              >
                <Text style={[styles.miniPrimaryText, isNextLocked && styles.miniButtonTextDisabled]}>
                  {isLastStep ? 'Finish' : 'Next'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.miniButton}
                onPress={() => setIsMinimized(false)}
                accessibilityRole="button"
                accessibilityLabel="Expand guided tour panel"
              >
                <Ionicons name="expand-outline" size={14} color={Colors.accent} />
              </TouchableOpacity>
            </View>
            {nextLockMessage ? (
              <Text style={styles.miniLockText} numberOfLines={2}>{nextLockMessage}</Text>
            ) : null}
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <View
      style={[styles.dock, dockPlacementStyle]}
      accessibilityRole="summary"
      accessibilityLabel="ReversR guided tour"
      testID="reversr-tour-guide"
    >
      <View style={styles.kickerRow}>
        <Text style={styles.eyebrow}>
          {step.eyebrow} / Step {stepIndex + 1} of {stepCount}
        </Text>
        <Text style={styles.stepCounter}>{stepCompleteCount}/{step.checks.length} actions</Text>
      </View>

      <View style={styles.titleRow}>
        <Text style={styles.title}>{step.title}</Text>
        <View style={styles.titleMeta}>
          <Text style={styles.totalCounter}>{completedCount}/{totalCount} done</Text>
          {isCompact ? (
            <TouchableOpacity
              style={styles.minimizeButton}
              onPress={() => setIsMinimized(true)}
              accessibilityRole="button"
              accessibilityLabel="Minimize guided tour panel"
            >
              <Ionicons name="contract-outline" size={14} color={Colors.accent} />
              <Text style={styles.minimizeButtonText}>Minimize</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.progressTrack} accessibilityLabel={`Tour progress ${progressValue}`}>
        <View style={[styles.progressFill, { width: progressValue }]} />
      </View>

      <Text style={styles.body}>{step.body}</Text>
      <Text style={styles.structureId}>Structure ID: {step.structureId}</Text>

      <View style={[styles.mockPanel, mockJourneyActive && styles.mockPanelActive]}>
        <View style={styles.mockTextBlock}>
          <Text style={styles.mockTitle}>{mockJourneyActive ? 'Mock journey active' : 'Preview without credits'}</Text>
          <Text style={styles.mockText}>
            {mockJourneyActive
              ? 'Use Next and Back to move through local fixture data. AI credits and generation endpoints are not used.'
              : 'Load a sample reconstruction so you can move through Scan, Inventory, Design, and Build without spending AI credits.'}
          </Text>
        </View>
        <TouchableOpacity
          style={mockJourneyActive ? styles.mockSecondaryButton : styles.mockButton}
          onPress={mockJourneyActive ? onStopMockJourney : onStartMockJourney}
          accessibilityRole="button"
          accessibilityLabel={mockJourneyActive ? 'Exit mock journey' : 'Run mock journey without credits'}
        >
          <Ionicons
            name={mockJourneyActive ? 'close-circle-outline' : 'play-circle-outline'}
            size={15}
            color={mockJourneyActive ? Colors.accent : Colors.black}
          />
          <Text style={mockJourneyActive ? styles.mockSecondaryButtonText : styles.mockButtonText}>
            {mockJourneyActive ? 'Exit mock' : 'Run mock'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.manualHeader}>
        <Text style={styles.manualTitle}>Actions for you</Text>
        <Text style={styles.manualHelp}>
          Auto-detected items complete themselves. Tap manual items after you actually do them.
        </Text>
      </View>

      <View style={styles.checkList}>
        {step.checks.map(check => {
          const isComplete = completedChecks.has(tourCheckKey(stepIndex, check.id));
          const isAutoCheck = check.completion === 'auto';
          return (
            <TouchableOpacity
              key={check.id}
              style={[
                styles.checkButton,
                isComplete && styles.checkButtonComplete,
                isAutoCheck && !isComplete && styles.checkButtonAutoPending,
                (!canFocusStep || isAutoCheck) && styles.checkButtonDisabled,
              ]}
              onPress={() => onToggleCheck(stepIndex, check.id)}
              disabled={!canFocusStep || isAutoCheck}
              accessibilityRole="button"
              accessibilityLabel={
                isAutoCheck
                  ? `${isComplete ? 'Detected' : 'Waiting to detect'} tour action ${check.label}`
                  : `${isComplete ? 'Clear' : 'Mark complete'} manual tour action ${check.label}`
              }
              accessibilityState={{ selected: isComplete, disabled: !canFocusStep || isAutoCheck }}
            >
              <Ionicons
                name={isComplete ? 'checkmark-circle' : isAutoCheck ? 'radio-button-off-outline' : 'ellipse-outline'}
                size={16}
                color={isComplete && canFocusStep ? Colors.black : Colors.gray[400]}
              />
              <Text style={[styles.checkText, isComplete && styles.checkTextComplete]}>{check.label}</Text>
              {isAutoCheck ? (
                <View style={[styles.autoBadge, isComplete && styles.autoBadgeComplete]}>
                  <Text style={[styles.autoBadgeText, isComplete && styles.autoBadgeTextComplete]}>
                    {isComplete ? 'Auto' : 'Detects'}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.actions}>
        {manualCheckCount > 0 ? (
          <TouchableOpacity
            style={[styles.actionButton, !canFocusStep && styles.actionButtonDisabled]}
            onPress={handleToggleManualPress}
            disabled={!canFocusStep}
            accessibilityRole="button"
            accessibilityLabel={areManualChecksComplete ? 'Undo all manual actions for this tour step' : 'Mark all manual actions for this tour step complete'}
            accessibilityState={{ disabled: !canFocusStep }}
          >
            <Ionicons
              name={areManualChecksComplete ? 'close-circle-outline' : 'checkmark-done-outline'}
              size={15}
              color={canFocusStep ? Colors.accent : Colors.gray[500]}
            />
            <Text style={[styles.actionButtonText, !canFocusStep && styles.actionButtonTextDisabled]}>
              {areManualChecksComplete ? 'Undo manual' : 'Mark manual'}
            </Text>
          </TouchableOpacity>
        ) : null}

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
          style={[styles.primaryButton, isNextLocked && styles.primaryButtonLocked]}
          onPress={handleNextPress}
          accessibilityRole="button"
          accessibilityLabel={
            isNextLocked
              ? (isStepComplete ? 'Next tour step locked until this scene is available' : 'Next tour step locked until actions are complete')
              : (isLastStep ? 'Finish tour' : 'Go to next tour step')
          }
          accessibilityState={{ disabled: isNextLocked }}
        >
          <Ionicons
            name={isNextLocked ? 'lock-closed-outline' : 'arrow-forward-outline'}
            size={14}
            color={isNextLocked ? Colors.gray[500] : Colors.black}
          />
          <Text style={[styles.primaryButtonText, isNextLocked && styles.primaryButtonTextLocked]}>
            {isLastStep ? 'Finish' : 'Next'}
          </Text>
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

      {nextLockMessage ? (
        <View style={styles.lockNotice}>
          <Ionicons name="lock-closed-outline" size={14} color={Colors.orange[300]} />
          <Text style={styles.lockNoticeText}>{nextLockMessage}</Text>
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (Colors: AppColors) => StyleSheet.create({
  dock: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: 440,
    maxHeight: '78%',
    padding: Spacing.md,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.accent,
    backgroundColor: Colors.mode === 'dark' ? '#101816' : Colors.gray[50],
    shadowColor: Colors.black,
    shadowOpacity: 0.24,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 18,
    zIndex: 1000,
    elevation: 1000,
  },
  dockBottom: {
    left: Spacing.md,
    right: Spacing.md,
    bottom: Spacing.md,
    maxWidth: 520,
    maxHeight: '62%',
  },
  dockBottomLeft: {
    left: Spacing.lg,
    bottom: Spacing.lg,
  },
  dockTopRight: {
    top: 108,
    right: Spacing.lg,
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
    fontFamily: Fonts.bold,
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
    color: Colors.text,
    fontSize: FontSizes.lg,
    fontFamily: Fonts.heading,
  },
  totalCounter: {
    color: Colors.gray[400],
    fontSize: FontSizes.xs,
    fontWeight: '800',
  },
  titleMeta: {
    alignItems: 'flex-end',
    gap: 6,
  },
  minimizeButton: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: Colors.surface,
  },
  minimizeButtonText: {
    color: Colors.accent,
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
    color: Colors.mutedText,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.sm,
    lineHeight: 18,
  },
  structureId: {
    marginTop: Spacing.xs,
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    fontFamily: 'monospace',
  },
  mockPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  mockPanelActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + '14',
  },
  mockTextBlock: {
    flex: 1,
  },
  mockTitle: {
    color: Colors.text,
    fontSize: FontSizes.xs,
    fontWeight: '900',
  },
  mockText: {
    color: Colors.gray[400],
    fontSize: FontSizes.xs,
    lineHeight: 15,
    marginTop: 2,
  },
  mockButton: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: Colors.accent,
  },
  mockButtonText: {
    color: Colors.black,
    fontSize: FontSizes.xs,
    fontFamily: Fonts.extrabold,
  },
  mockSecondaryButton: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: Colors.mode === 'dark' ? '#101816' : Colors.gray[50],
  },
  mockSecondaryButtonText: {
    color: Colors.accent,
    fontSize: FontSizes.xs,
    fontWeight: '900',
  },
  manualHeader: {
    marginTop: Spacing.md,
    gap: 2,
  },
  manualTitle: {
    color: Colors.text,
    fontSize: FontSizes.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  manualHelp: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    lineHeight: 15,
  },
  checkList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
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
  checkButtonAutoPending: {
    borderStyle: 'dashed',
  },
  checkButtonDisabled: {
    opacity: 0.72,
  },
  checkText: {
    color: Colors.gray[300],
    fontSize: FontSizes.xs,
    fontWeight: '700',
  },
  checkTextComplete: {
    color: Colors.black,
  },
  autoBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: Colors.panel,
  },
  autoBadgeComplete: {
    borderColor: Colors.black,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  autoBadgeText: {
    color: Colors.gray[400],
    fontSize: 10,
    fontWeight: '900',
  },
  autoBadgeTextComplete: {
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
    fontFamily: Fonts.bold,
  },
  actionButtonTextDisabled: {
    color: Colors.gray[500],
  },
  primaryButton: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: Colors.accent,
  },
  primaryButtonLocked: {
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  primaryButtonText: {
    color: Colors.black,
    fontSize: FontSizes.xs,
    fontFamily: Fonts.extrabold,
  },
  primaryButtonTextLocked: {
    color: Colors.gray[500],
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
  lockNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.orange[900],
    backgroundColor: Colors.orange[900] + '26',
  },
  lockNoticeText: {
    flex: 1,
    color: Colors.gray[300],
    fontSize: FontSizes.xs,
    lineHeight: 16,
    fontWeight: '700',
  },
  tourModalLayer: {
    flex: 1,
  },
  miniDock: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    right: Spacing.sm,
    alignSelf: 'center',
    maxWidth: 520,
    padding: Spacing.sm,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.accent,
    backgroundColor: Colors.mode === 'dark' ? '#101816' : Colors.gray[50],
    shadowColor: Colors.black,
    shadowOpacity: 0.22,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 14,
    zIndex: 10000,
    elevation: 10000,
  },
  miniMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  miniText: {
    flex: 1,
    minWidth: 0,
  },
  miniEyebrow: {
    color: Colors.accent,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  miniTitle: {
    color: Colors.text,
    fontSize: FontSizes.sm,
    fontFamily: Fonts.heading,
  },
  miniCounter: {
    color: Colors.gray[400],
    fontSize: FontSizes.xs,
    fontWeight: '900',
  },
  miniActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  miniButton: {
    minHeight: 30,
    minWidth: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: Colors.surface,
  },
  miniButtonDisabled: {
    opacity: 0.56,
  },
  miniButtonText: {
    color: Colors.accent,
    fontSize: FontSizes.xs,
    fontWeight: '900',
  },
  miniButtonTextDisabled: {
    color: Colors.gray[500],
  },
  miniPrimaryButton: {
    minHeight: 30,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: Colors.accent,
  },
  miniPrimaryText: {
    color: Colors.black,
    fontSize: FontSizes.xs,
    fontFamily: Fonts.extrabold,
  },
  miniLockText: {
    color: Colors.orange[300],
    fontSize: FontSizes.xs,
    lineHeight: 15,
    marginTop: Spacing.xs,
    fontWeight: '800',
  },
});
