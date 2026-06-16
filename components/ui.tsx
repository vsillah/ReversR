import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, Radii, Spacing, Typography, makeShadows } from '../constants/theme';
import { useAppTheme } from '../hooks/useAppTheme';

type IconName = keyof typeof Ionicons.glyphMap;

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'accent';

const toneColors = (colors: AppColors, tone: Tone): { fg: string; bg: string; border: string } => {
  switch (tone) {
    case 'primary':
      return { fg: colors.primary, bg: colors.primarySoft, border: colors.primary };
    case 'success':
      return { fg: colors.success, bg: colors.successSoft, border: colors.success };
    case 'warning':
      return { fg: colors.warning, bg: colors.warningSoft, border: colors.warning };
    case 'danger':
      return { fg: colors.danger, bg: colors.dangerSoft, border: colors.danger };
    case 'accent':
      return { fg: colors.accent, bg: colors.accentSoft, border: colors.accent };
    default:
      return { fg: colors.mutedText, bg: colors.elevated, border: colors.border };
  }
};

/** Elevated surface container with subtle border + shadow. */
export function Card({
  children,
  style,
  padded = true,
  tone,
  onPress,
  accessibilityLabel,
  testID,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  tone?: 'highlight';
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const { colors } = useAppTheme();
  const shadows = makeShadows(colors);
  const base: ViewStyle = {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: tone === 'highlight' ? colors.primary : colors.border,
    borderRadius: Radii.lg,
    padding: padded ? Spacing.md : 0,
    ...shadows.card,
  };
  if (tone === 'highlight') {
    base.backgroundColor = colors.primarySoft;
  }
  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        style={[base, style]}
      >
        {children}
      </TouchableOpacity>
    );
  }
  return (
    <View style={[base, style]} accessibilityLabel={accessibilityLabel} testID={testID}>
      {children}
    </View>
  );
}

/** Small pill label used for statuses and counts. */
export function Badge({
  label,
  tone = 'neutral',
  icon,
  dot,
  style,
}: {
  label: string;
  tone?: Tone;
  icon?: IconName;
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useAppTheme();
  const t = toneColors(colors, tone);
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          alignSelf: 'flex-start',
          paddingHorizontal: Spacing.sm,
          paddingVertical: 4,
          borderRadius: Radii.pill,
          backgroundColor: t.bg,
        },
        style,
      ]}
    >
      {dot ? <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: t.fg }} /> : null}
      {icon ? <Ionicons name={icon} size={12} color={t.fg} /> : null}
      <Text style={{ color: t.fg, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 }}>{label}</Text>
    </View>
  );
}

/** Section title with an optional trailing action (e.g. "View all"). */
export function SectionHeader({
  title,
  actionLabel,
  onAction,
  style,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useAppTheme();
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
        style,
      ]}
    >
      <Text style={{ ...Typography.overline, color: colors.dimText, textTransform: 'uppercase' }}>{title}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} accessibilityRole="button" accessibilityLabel={actionLabel} hitSlop={8}>
          <Text style={{ ...Typography.label, color: colors.primary }}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** Compact metric tile: small uppercase label over a large value. */
export function StatTile({
  label,
  value,
  unit,
  tone = 'neutral',
  icon,
  style,
}: {
  label: string;
  value: string | number;
  unit?: string;
  tone?: Tone;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useAppTheme();
  const t = toneColors(colors, tone);
  return (
    <View
      style={[
        {
          flex: 1,
          minWidth: 0,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radii.md,
          paddingVertical: Spacing.sm,
          paddingHorizontal: Spacing.sm,
          gap: 6,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ ...Typography.overline, color: colors.dimText, textTransform: 'uppercase' }} numberOfLines={1}>
          {label}
        </Text>
        {icon ? <Ionicons name={icon} size={14} color={tone === 'neutral' ? colors.dimText : t.fg} /> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: tone === 'neutral' ? colors.text : t.fg }}>
          {value}
        </Text>
        {unit ? <Text style={{ ...Typography.caption, color: colors.dimText }}>{unit}</Text> : null}
      </View>
    </View>
  );
}

/** Filled primary call-to-action button (blue interactive accent). */
export function PrimaryButton({
  label,
  onPress,
  icon = 'arrow-forward',
  iconPosition = 'right',
  loading = false,
  disabled = false,
  fullWidth = true,
  style,
  accessibilityLabel,
  testID,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName | null;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const { colors } = useAppTheme();
  const isOff = disabled || loading;
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      disabled={isOff}
      accessibilityRole="button"
      accessibilityState={{ disabled: isOff, busy: loading }}
      accessibilityLabel={accessibilityLabel || label}
      testID={testID}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: Spacing.sm,
          backgroundColor: isOff ? colors.elevated : colors.primary,
          borderRadius: Radii.md,
          paddingVertical: 15,
          paddingHorizontal: Spacing.lg,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: disabled ? 0.6 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.onPrimary} size="small" />
      ) : (
        <>
          {icon && iconPosition === 'left' ? <Ionicons name={icon} size={18} color={colors.onPrimary} /> : null}
          <Text style={{ color: colors.onPrimary, fontSize: 15, fontWeight: '700', letterSpacing: 0.3 }}>{label}</Text>
          {icon && iconPosition === 'right' ? <Ionicons name={icon} size={18} color={colors.onPrimary} /> : null}
        </>
      )}
    </TouchableOpacity>
  );
}

/** Bordered, transparent secondary button. */
export function SecondaryButton({
  label,
  onPress,
  icon,
  iconPosition = 'left',
  tone = 'neutral',
  fullWidth = true,
  style,
  textStyle,
  accessibilityLabel,
  testID,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  iconPosition?: 'left' | 'right';
  tone?: Tone;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const { colors } = useAppTheme();
  const fg = tone === 'neutral' ? colors.text : toneColors(colors, tone).fg;
  const border = tone === 'neutral' ? colors.border : toneColors(colors, tone).fg;
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      testID={testID}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: Spacing.sm,
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: border,
          borderRadius: Radii.md,
          paddingVertical: 13,
          paddingHorizontal: Spacing.lg,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      {icon && iconPosition === 'left' ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={[{ color: fg, fontSize: 15, fontWeight: '700', letterSpacing: 0.3 }, textStyle]}>{label}</Text>
      {icon && iconPosition === 'right' ? <Ionicons name={icon} size={18} color={fg} /> : null}
    </TouchableOpacity>
  );
}

export type StepState = 'complete' | 'current' | 'upcoming' | 'locked';

/** Guided vertical step row (Concept C): leading status node, title/subtitle, trailing affordance. */
export function StepRow({
  index,
  title,
  subtitle,
  state,
  onPress,
  testID,
  accessibilityLabel,
}: {
  index: number;
  title: string;
  subtitle?: string;
  state: StepState;
  onPress?: () => void;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const { colors } = useAppTheme();
  const isCurrent = state === 'current';
  const isComplete = state === 'complete';
  const isLocked = state === 'locked';
  const interactive = Boolean(onPress) && !isLocked;

  const nodeBg = isComplete ? colors.accent : isCurrent ? colors.primary : colors.elevated;
  const nodeBorder = isComplete ? colors.accent : isCurrent ? colors.primary : colors.border;

  const body = (
    <>
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: Radii.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isComplete || isCurrent ? nodeBg : 'transparent',
          borderWidth: isComplete || isCurrent ? 0 : 1.5,
          borderColor: nodeBorder,
        }}
      >
        {isComplete ? (
          <Ionicons name="checkmark" size={20} color={colors.background} />
        ) : isLocked ? (
          <Ionicons name="lock-closed" size={16} color={colors.dimText} />
        ) : isCurrent ? (
          <Text style={{ color: colors.onPrimary, fontWeight: '800', fontSize: 15 }}>{index}</Text>
        ) : (
          <Text style={{ color: colors.dimText, fontWeight: '700', fontSize: 15 }}>{index}</Text>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text
          style={{
            fontSize: 16,
            fontWeight: '700',
            color: isLocked ? colors.dimText : colors.text,
          }}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ ...Typography.caption, color: colors.dimText }} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={{ width: 30, height: 30, borderRadius: Radii.pill, alignItems: 'center', justifyContent: 'center' }}>
        {isComplete ? (
          <Ionicons name="checkmark-circle" size={22} color={colors.success} />
        ) : isCurrent ? (
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: Radii.pill,
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="arrow-forward" size={16} color={colors.onPrimary} />
          </View>
        ) : isLocked ? (
          <Ionicons name="lock-closed" size={16} color={colors.dimText} />
        ) : (
          <Ionicons name="ellipse-outline" size={18} color={colors.dimText} />
        )}
      </View>
    </>
  );

  const containerStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: isCurrent ? colors.primary : colors.border,
    backgroundColor: isCurrent ? colors.primarySoft : colors.surface,
    opacity: isLocked ? 0.7 : 1,
  };

  if (interactive) {
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || title}
        accessibilityState={{ disabled: false }}
        testID={testID}
        style={containerStyle}
      >
        {body}
      </TouchableOpacity>
    );
  }
  return (
    <View
      style={containerStyle}
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: isLocked }}
      testID={testID}
    >
      {body}
    </View>
  );
}

/** Horizontal compact progress stepper used in the workflow header rail. */
export function HorizontalStepper({
  steps,
  currentStep,
  onStepPress,
  testID,
}: {
  steps: string[];
  currentStep: number; // 1-based
  onStepPress?: (step: number) => void;
  testID?: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}
      testID={testID}
    >
      {steps.map((label, idx) => {
        const step = idx + 1;
        const isComplete = currentStep > step;
        const isActive = currentStep >= step;
        const canPress = Boolean(onStepPress) && currentStep > step;
        const node = (
          <View style={{ alignItems: 'center', gap: 6, width: 64 }}>
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: Radii.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isComplete ? colors.accent : isActive ? colors.primary : colors.elevated,
                borderWidth: isActive ? 0 : 1,
                borderColor: colors.border,
              }}
            >
              {isComplete ? (
                <Ionicons name="checkmark" size={16} color={colors.background} />
              ) : (
                <Text style={{ color: isActive ? colors.onPrimary : colors.dimText, fontWeight: '800', fontSize: 13 }}>
                  {step}
                </Text>
              )}
            </View>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                letterSpacing: 0.4,
                color: isActive ? colors.text : colors.dimText,
              }}
              numberOfLines={1}
            >
              {label}
            </Text>
          </View>
        );
        return (
          <React.Fragment key={label}>
            {canPress ? (
              <TouchableOpacity
                onPress={() => onStepPress?.(step)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Reopen ${label} phase`}
              >
                {node}
              </TouchableOpacity>
            ) : (
              node
            )}
            {idx < steps.length - 1 ? (
              <View
                style={{
                  flex: 1,
                  height: 2,
                  marginTop: 14,
                  borderRadius: 2,
                  backgroundColor: currentStep > step ? colors.accent : colors.border,
                }}
              />
            ) : null}
          </React.Fragment>
        );
      })}
    </View>
  );
}
