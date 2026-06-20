import React from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import { AppColors, Fonts, FontSizes, Radii, Spacing, makeShadows } from '../constants/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import ReversRLogoMark from './ReversRLogoMark';

const WELCOME_VIDEO = require('../assets/welcome/reversr-welcome-intro.mp4');
const WELCOME_POSTER = require('../assets/welcome/reversr-welcome-poster.png');

interface WelcomeIntroScreenProps {
  onEnter: () => void;
}

export default function WelcomeIntroScreen({ onEnter }: WelcomeIntroScreenProps) {
  const { colors: Colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(Colors), [Colors]);
  const player = useVideoPlayer(WELCOME_VIDEO, videoPlayer => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
    videoPlayer.play();
  });

  React.useEffect(() => {
    player.loop = true;
    player.muted = true;
    player.play();

    return () => {
      player.pause();
    };
  }, [player]);

  return (
    <View style={styles.container} testID="welcome-intro-screen">
      <Image source={WELCOME_POSTER} style={styles.poster} resizeMode="cover" />
      <VideoView
        player={player}
        style={styles.video}
        nativeControls={false}
        contentFit="cover"
        allowsPictureInPicture={false}
        playsInline
        pointerEvents="none"
      />
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
        onPress={onEnter}
        accessibilityRole="button"
        accessibilityLabel="Skip welcome video"
      >
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      <View style={styles.brandLockup}>
        <ReversRLogoMark colors={Colors} size={62} />
        <Text style={styles.wordmark}>
          REVERS<Text style={styles.wordmarkAccent}>R</Text>
        </Text>
        <Text style={styles.subtitle}>Machine Reconstruction</Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.kicker}>Custom Engineered</Text>
        <Text style={styles.headline}>Scan the machine. Rebuild the system.</Text>
        <TouchableOpacity
          style={styles.enterButton}
          onPress={onEnter}
          accessibilityRole="button"
          accessibilityLabel="Enter ReversR home"
          testID="welcome-intro-enter"
        >
          <Text style={styles.enterButtonText}>Enter ReversR</Text>
          <Ionicons name="arrow-forward" size={18} color={Colors.onPrimary} />
        </TouchableOpacity>
      </View>
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
    },
    video: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      width: '100%',
      height: '100%',
    },
    glow: {
      position: 'absolute',
      top: -80,
      left: '14%',
      right: '14%',
      height: 360,
      borderRadius: 999,
      opacity: isDark ? 0.82 : 0.62,
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
