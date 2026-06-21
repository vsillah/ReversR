import React from 'react';
import {
  Image,
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEventListener } from 'expo';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import { AppColors, Fonts, FontSizes, Radii, Spacing, makeShadows } from '../constants/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import ReversRLogoMark from './ReversRLogoMark';

const WELCOME_VIDEO = require('../assets/welcome/reversr-welcome-intro.mp4');
const WELCOME_POSTER = require('../assets/welcome/reversr-welcome-poster.png');
const ACTIONS_FALLBACK_TIMEOUT_MS = 7000;
const EXIT_HANDOFF_DELAY_MS = 260;

interface WelcomeIntroScreenProps {
  onEnter: () => void;
}

export default function WelcomeIntroScreen({ onEnter }: WelcomeIntroScreenProps) {
  const { colors: Colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(Colors), [Colors]);
  const brandOpacity = React.useRef(new Animated.Value(0)).current;
  const footerOpacity = React.useRef(new Animated.Value(0)).current;
  const hasEnteredRef = React.useRef(false);
  const exitTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [actionsEnabled, setActionsEnabled] = React.useState(false);
  const [videoEnded, setVideoEnded] = React.useState(false);
  const [renderVideo, setRenderVideo] = React.useState(true);
  const [isExiting, setIsExiting] = React.useState(false);
  const player = useVideoPlayer(WELCOME_VIDEO, videoPlayer => {
    videoPlayer.loop = false;
    videoPlayer.muted = true;
    if (Platform.OS !== 'web') {
      videoPlayer.play();
    }
  });

  const handleEnter = React.useCallback(() => {
    if (hasEnteredRef.current) return;
    hasEnteredRef.current = true;
    setIsExiting(true);
    setActionsEnabled(false);
    setRenderVideo(false);

    exitTimerRef.current = setTimeout(onEnter, EXIT_HANDOFF_DELAY_MS);
  }, [onEnter]);

  React.useEffect(() => () => {
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
    }
  }, []);

  React.useEffect(() => {
    player.loop = false;
    player.muted = true;
    player.play();
  }, [player]);

  useEventListener(player, 'playToEnd', () => {
    setVideoEnded(true);
    setActionsEnabled(true);
  });

  React.useEffect(() => {
    const fallbackTimer = setTimeout(() => setActionsEnabled(true), ACTIONS_FALLBACK_TIMEOUT_MS);
    return () => clearTimeout(fallbackTimer);
  }, []);

  React.useEffect(() => {
    brandOpacity.setValue(0);
    footerOpacity.setValue(0);
    setActionsEnabled(false);

    const actionsTimer = setTimeout(() => setActionsEnabled(true), 4800);
    const animation = Animated.parallel([
      Animated.timing(brandOpacity, {
        toValue: 1,
        duration: 620,
        delay: 4200,
        useNativeDriver: true,
      }),
      Animated.timing(footerOpacity, {
        toValue: 1,
        duration: 620,
        delay: 4700,
        useNativeDriver: true,
      }),
    ]);

    animation.start();

    return () => {
      clearTimeout(actionsTimer);
      animation.stop();
    };
  }, [brandOpacity, footerOpacity]);

  const brandTranslateY = brandOpacity.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 0],
  });
  const footerTranslateY = footerOpacity.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0],
  });

  return (
    <View style={styles.container} testID="welcome-intro-screen">
      <Image source={WELCOME_POSTER} style={styles.poster} resizeMode="cover" />
      {renderVideo ? (
        <VideoView
          player={player}
          style={[styles.video, isExiting && styles.videoExiting]}
          surfaceType="textureView"
          nativeControls={false}
          contentFit="cover"
          allowsPictureInPicture={false}
          playsInline
          pointerEvents="none"
          testID="welcome-intro-video"
        />
      ) : null}
      <LinearGradient
        colors={[
          'rgba(4,8,13,0.18)',
          'rgba(4,8,13,0.08)',
          'rgba(4,8,13,0.70)',
          'rgba(4,8,13,0.96)',
        ]}
        locations={[0, 0.4, 0.74, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(37,99,235,0.20)', 'rgba(0,140,149,0.10)', 'rgba(4,8,13,0.0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.glow}
        pointerEvents="none"
      />

      <TouchableOpacity
        style={styles.skipButton}
        onPress={handleEnter}
        accessibilityRole="button"
        accessibilityLabel="Skip welcome video"
      >
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      <Animated.View
        style={[
          styles.brandLockup,
          { opacity: brandOpacity, transform: [{ translateY: brandTranslateY }] },
        ]}
      >
        <ReversRLogoMark colors={Colors} size={62} />
        <Text style={styles.wordmark}>
          REVERS<Text style={styles.wordmarkAccent}>R</Text>
        </Text>
        <Text style={styles.subtitle}>Machine Reconstruction</Text>
      </Animated.View>

      <Animated.View
        pointerEvents={actionsEnabled ? 'auto' : 'none'}
        style={[
          styles.footer,
          { opacity: footerOpacity, transform: [{ translateY: footerTranslateY }] },
        ]}
      >
        <Text style={styles.kicker}>Custom Engineered</Text>
        <Text style={styles.headline}>Scan the machine. Rebuild the system.</Text>
        {videoEnded ? (
          <Text style={styles.readyText}>Intro complete</Text>
        ) : null}
        <TouchableOpacity
          style={styles.enterButton}
          onPress={handleEnter}
          accessibilityRole="button"
          accessibilityLabel="Enter ReversR home"
          testID="welcome-intro-enter"
        >
          <Text style={styles.enterButtonText}>Enter ReversR</Text>
          <Ionicons name="arrow-forward" size={18} color={Colors.onPrimary} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const createStyles = (Colors: AppColors) => {
  const isDark = Colors.mode === 'dark';
  const shadows = makeShadows(Colors);

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#04080d',
      overflow: 'hidden',
    },
    poster: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      width: '100%',
      height: '100%',
      opacity: 0.92,
      zIndex: 0,
    },
    video: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      width: '100%',
      height: '100%',
      zIndex: 1,
    },
    videoExiting: {
      opacity: 0,
    },
    glow: {
      position: 'absolute',
      top: -80,
      left: '14%',
      right: '14%',
      height: 360,
      borderRadius: 999,
      opacity: isDark ? 0.82 : 0.62,
      zIndex: 2,
    },
    skipButton: {
      position: 'absolute',
      top: Spacing.lg,
      right: Spacing.lg,
      zIndex: 4,
      minHeight: 40,
      minWidth: 72,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: Radii.pill,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
      backgroundColor: 'rgba(8,13,20,0.56)',
    },
    skipText: {
      fontFamily: Fonts.semibold,
      fontSize: FontSizes.sm,
      color: 'rgba(238,241,246,0.88)',
    },
    brandLockup: {
      position: 'absolute',
      top: '12%',
      left: 0,
      right: 0,
      zIndex: 3,
      alignItems: 'center',
      paddingHorizontal: Spacing.xl,
    },
    wordmark: {
      marginTop: Spacing.md,
      fontFamily: Fonts.brand,
      fontSize: 28,
      lineHeight: 34,
      letterSpacing: 2.2,
      color: '#d8dde2',
    },
    wordmarkAccent: {
      color: '#28c6cf',
    },
    subtitle: {
      marginTop: 2,
      fontFamily: Fonts.medium,
      fontSize: FontSizes.md,
      letterSpacing: 1.4,
      color: 'rgba(216,221,226,0.78)',
      textTransform: 'uppercase',
    },
    footer: {
      position: 'absolute',
      left: Spacing.lg,
      right: Spacing.lg,
      bottom: Spacing.xl,
      zIndex: 3,
      alignItems: 'center',
      gap: Spacing.md,
    },
    kicker: {
      fontFamily: Fonts.bold,
      fontSize: FontSizes.xs,
      letterSpacing: 2,
      textTransform: 'uppercase',
      color: '#28c6cf',
    },
    headline: {
      maxWidth: 360,
      textAlign: 'center',
      fontFamily: Fonts.display,
      fontSize: 28,
      lineHeight: 33,
      letterSpacing: 0,
      color: '#f4f7fb',
    },
    readyText: {
      fontFamily: Fonts.medium,
      fontSize: FontSizes.sm,
      color: 'rgba(238,241,246,0.72)',
      textAlign: 'center',
    },
    enterButton: {
      width: '100%',
      maxWidth: 360,
      minHeight: 54,
      borderRadius: Radii.pill,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.sm,
      backgroundColor: Colors.primary,
      ...shadows.elevated,
    },
    enterButtonText: {
      fontFamily: Fonts.bold,
      fontSize: FontSizes.md,
      color: Colors.onPrimary,
    },
  });
};
