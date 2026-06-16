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
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
} from 'react-native-svg';
import { AppColors, Fonts, Radii, Spacing, Typography, makeShadows } from '../constants/theme';
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

/** Material surface: gradient fill (lit from top) + 1px top highlight + soft shadow. */
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
  const isHighlight = tone === 'highlight';

  const frame: ViewStyle = {
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: isHighlight ? colors.primary : colors.border,
    overflow: 'hidden',
    padding: padded ? Spacing.md : 0,
    ...shadows.card,
  };

  const gradientColors = (isHighlight
    ? colors.mode === 'dark'
      ? ['rgba(59,130,246,0.20)', 'rgba(59,130,246,0.06)']
      : ['rgba(37,99,235,0.12)', 'rgba(37,99,235,0.03)']
    : [colors.elevated, colors.surface]) as [string, string, ...string[]];

  const highlightColor = colors.mode === 'dark'
    ? 'rgba(255,255,255,0.10)'
    : 'rgba(255,255,255,0.7)';

  const layers = (
    <>
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheetAbsoluteFill}
      />
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: highlightColor }} />
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        style={[frame, style]}
      >
        {layers}
        {children}
      </TouchableOpacity>
    );
  }
  return (
    <View style={[frame, style]} accessibilityLabel={accessibilityLabel} testID={testID}>
      {layers}
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
      <Text style={{ color: t.fg, fontFamily: Fonts.bold, fontSize: 11, letterSpacing: 0.3 }}>{label}</Text>
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
        <Text style={{ fontSize: 22, fontFamily: Fonts.extrabold, color: tone === 'neutral' ? colors.text : t.fg }}>
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
          <Text style={{ color: colors.onPrimary, fontFamily: Fonts.bold, fontSize: 15, letterSpacing: 0.3 }}>{label}</Text>
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
      <Text style={[{ color: fg, fontFamily: Fonts.bold, fontSize: 15, letterSpacing: 0.3 }, textStyle]}>{label}</Text>
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
            fontFamily: Fonts.heading,
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

/** Horizontal progress stepper with optional sublabels. Green marks active/complete progress. */
export function HorizontalStepper({
  steps,
  subLabels,
  currentStep,
  onStepPress,
  testID,
}: {
  steps: string[];
  subLabels?: string[];
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
        const isCurrent = currentStep === step;
        const isActive = isComplete || isCurrent;
        const canPress = Boolean(onStepPress) && currentStep > step;
        const node = (
          <View style={{ alignItems: 'center', gap: 5, width: 74 }}>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: Radii.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isComplete ? colors.accent : 'transparent',
                borderWidth: isComplete ? 0 : 2,
                borderColor: isCurrent ? colors.accent : colors.border,
              }}
            >
              {isComplete ? (
                <Ionicons name="checkmark" size={18} color={colors.background} />
              ) : (
                <Text style={{ color: isCurrent ? colors.accent : colors.dimText, fontFamily: Fonts.bold, fontSize: 14 }}>
                  {step}
                </Text>
              )}
            </View>
            <Text
              style={{
                fontSize: 11,
                fontFamily: Fonts.bold,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                color: isActive ? colors.text : colors.dimText,
                textAlign: 'center',
              }}
              numberOfLines={1}
            >
              {label}
            </Text>
            {subLabels?.[idx] ? (
              <Text
                style={{ fontSize: 10, color: colors.dimText, textAlign: 'center' }}
                numberOfLines={2}
              >
                {subLabels[idx]}
              </Text>
            ) : null}
            {isCurrent ? (
              <View style={{ marginTop: 3, width: 26, height: 3, borderRadius: 2, backgroundColor: colors.accent }} />
            ) : null}
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
                  marginTop: 16,
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

/** Filled gradient call-to-action — the signature primary button. */
export function GradientButton({
  label,
  onPress,
  icon = 'arrow-forward',
  iconPosition = 'right',
  colors,
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
  colors?: [string, string, ...string[]];
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const { colors: theme } = useAppTheme();
  const shadows = makeShadows(theme);
  const gradient = (colors || [theme.primary, theme.primaryStrong]) as [string, string, ...string[]];
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={accessibilityLabel || label}
      testID={testID}
      style={[
        {
          borderRadius: Radii.md,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: disabled ? 0.55 : 1,
          ...shadows.elevated,
          shadowColor: theme.primary,
        },
        style,
      ]}
    >
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: Spacing.sm,
          borderRadius: Radii.md,
          paddingVertical: 16,
          paddingHorizontal: Spacing.lg,
        }}
      >
        {icon && iconPosition === 'left' ? <Ionicons name={icon} size={18} color="#ffffff" /> : null}
        <Text style={{ color: '#ffffff', fontFamily: Fonts.bold, fontSize: 16, letterSpacing: 0.3 }}>{label}</Text>
        {icon && iconPosition === 'right' ? <Ionicons name={icon} size={18} color="#ffffff" /> : null}
      </LinearGradient>
    </TouchableOpacity>
  );
}

/** Circular SVG progress ring with a centered value/label. */
export function ScoreRing({
  progress,
  size = 92,
  strokeWidth = 9,
  value,
  caption,
  trackColor,
  gradientColors,
}: {
  progress: number; // 0..1
  size?: number;
  strokeWidth?: number;
  value: string;
  caption?: string;
  trackColor?: string;
  gradientColors?: [string, string];
}) {
  const { colors } = useAppTheme();
  const clamped = Math.max(0, Math.min(1, progress));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped);
  const grad = gradientColors || [colors.accent, colors.primary];
  const center = size / 2;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Defs>
          <SvgLinearGradient id="scoreRingGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={grad[0]} />
            <Stop offset="1" stopColor={grad[1]} />
          </SvgLinearGradient>
        </Defs>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor || colors.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke="url(#scoreRingGrad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text style={{ fontSize: 22, fontFamily: Fonts.extrabold, color: colors.text }}>{value}</Text>
        {caption ? (
          <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.6, color: colors.dimText, textTransform: 'uppercase' }}>
            {caption}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Cinematic gradient + blueprint backdrop, absolutely filling its parent. */
export function HeroBackdrop({ radius = Radii.xl }: { radius?: number }) {
  const { colors } = useAppTheme();
  const isDark = colors.mode === 'dark';
  const gridColor = isDark ? 'rgba(120,160,255,0.10)' : 'rgba(37,99,235,0.08)';
  const accentLine = isDark ? 'rgba(0,255,157,0.18)' : 'rgba(0,122,85,0.16)';
  const gradient = (isDark
    ? ['#11203a', '#0c1424', '#08090c']
    : ['#dbe6ff', '#eef3fb', '#f4f6fb']) as [string, string, ...string[]];

  // Blueprint grid lines
  const gridLines: React.ReactNode[] = [];
  for (let i = 1; i < 7; i += 1) {
    gridLines.push(<Line key={`v${i}`} x1={i * 50} y1={0} x2={i * 50} y2={300} stroke={gridColor} strokeWidth={1} />);
  }
  for (let j = 1; j < 6; j += 1) {
    gridLines.push(<Line key={`h${j}`} x1={0} y1={j * 50} x2={350} y2={j * 50} stroke={gridColor} strokeWidth={1} />);
  }

  return (
    <View style={{ ...StyleSheetAbsoluteFill, borderRadius: radius, overflow: 'hidden' }} pointerEvents="none">
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheetAbsoluteFill}
      />
      <Svg width="100%" height="100%" viewBox="0 0 350 300" preserveAspectRatio="xMidYMid slice">
        <G opacity={0.9}>{gridLines}</G>
        {/* Stylized gear / machine motif */}
        <Circle cx={272} cy={70} r={52} stroke={accentLine} strokeWidth={1.5} fill="none" />
        <Circle cx={272} cy={70} r={34} stroke={gridColor} strokeWidth={1.5} fill="none" />
        <Circle cx={272} cy={70} r={8} stroke={accentLine} strokeWidth={2} fill="none" />
        <Path
          d="M272 8 L278 28 L266 28 Z M272 132 L278 112 L266 112 Z M210 70 L230 76 L230 64 Z M334 70 L314 76 L314 64 Z"
          fill={accentLine}
        />
      </Svg>
    </View>
  );
}

const StyleSheetAbsoluteFill: ViewStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

export type BottomTab = 'home' | 'projects' | 'more';

/** Persistent bottom navigation bar with a centered raised gradient action. */
export function BottomTabBar({
  active,
  onHome,
  onProjects,
  onNew,
  onMore,
  bottomInset = 0,
}: {
  active: BottomTab | null;
  onHome: () => void;
  onProjects: () => void;
  onNew: () => void;
  onMore: () => void;
  bottomInset?: number;
}) {
  const { colors } = useAppTheme();
  const shadows = makeShadows(colors);

  const tab = (
    key: BottomTab,
    label: string,
    icon: IconName,
    activeIcon: IconName,
    onPress: () => void,
  ) => {
    const isActive = active === key;
    return (
      <TouchableOpacity
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 6 }}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: isActive }}
      >
        <Ionicons name={isActive ? activeIcon : icon} size={22} color={isActive ? colors.primary : colors.dimText} />
        <Text style={{ fontSize: 10, fontWeight: '700', color: isActive ? colors.primary : colors.dimText }}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingBottom: bottomInset,
        backgroundColor: colors.panel,
        borderTopWidth: 1,
        borderTopColor: colors.hairline,
        ...shadows.elevated,
        shadowOffset: { width: 0, height: -6 },
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', height: 64, paddingHorizontal: Spacing.xs }}>
        {tab('home', 'Home', 'home-outline', 'home', onHome)}
        {tab('projects', 'Projects', 'albums-outline', 'albums', onProjects)}

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={onNew}
            accessibilityRole="button"
            accessibilityLabel="New reconstruction"
            testID="reversr-bottom-new"
            style={{
              width: 56,
              height: 56,
              marginTop: -24,
              borderRadius: Radii.pill,
              overflow: 'hidden',
              borderWidth: 3,
              borderColor: colors.background,
              ...shadows.floating,
              shadowColor: colors.primary,
            }}
          >
            <LinearGradient
              colors={[colors.primary, colors.primaryStrong]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="add" size={28} color="#ffffff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {tab('more', 'More', 'ellipsis-horizontal', 'ellipsis-horizontal', onMore)}
      </View>
    </View>
  );
}
