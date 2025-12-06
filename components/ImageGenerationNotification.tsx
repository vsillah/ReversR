import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSizes } from '../constants/theme';

export type ImageGenStatus = 'idle' | 'generating' | 'complete' | 'error';

interface Props {
  status: ImageGenStatus;
  onPress?: () => void;
  onDismiss?: () => void;
}

export default function ImageGenerationNotification({ status, onPress, onDismiss }: Props) {
  const slideAnim = useRef(new Animated.Value(100)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (status === 'generating' || status === 'complete' || status === 'error') {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 100,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [status]);

  useEffect(() => {
    if (status === 'generating') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.6,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();

      const progress = Animated.loop(
        Animated.timing(progressAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: false,
        })
      );
      progress.start();

      return () => {
        pulse.stop();
        progress.stop();
      };
    } else {
      pulseAnim.setValue(1);
      progressAnim.setValue(0);
    }
  }, [status]);

  useEffect(() => {
    if (status === 'complete') {
      const timer = setTimeout(() => {
        onDismiss?.();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [status, onDismiss]);

  if (status === 'idle') return null;

  const getStatusConfig = () => {
    switch (status) {
      case 'generating':
        return {
          icon: 'image-outline' as const,
          iconColor: Colors.accent,
          text: 'Generating 2D sketch...',
          bgColor: 'rgba(0, 255, 136, 0.1)',
          borderColor: Colors.accent,
        };
      case 'complete':
        return {
          icon: 'checkmark-circle' as const,
          iconColor: Colors.green[400],
          text: '2D sketch ready!',
          bgColor: 'rgba(34, 197, 94, 0.15)',
          borderColor: Colors.green[500],
        };
      case 'error':
        return {
          icon: 'alert-circle' as const,
          iconColor: Colors.red[500],
          text: 'Image generation failed',
          bgColor: 'rgba(239, 68, 68, 0.15)',
          borderColor: Colors.red[500],
        };
      default:
        return null;
    }
  };

  const config = getStatusConfig();
  if (!config) return null;

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
          backgroundColor: config.bgColor,
          borderColor: config.borderColor,
        },
      ]}
    >
      <TouchableOpacity
        style={styles.content}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <Animated.View style={{ opacity: status === 'generating' ? pulseAnim : 1 }}>
          <Ionicons name={config.icon} size={20} color={config.iconColor} />
        </Animated.View>
        <Text style={[styles.text, { color: config.iconColor }]}>{config.text}</Text>
        {status === 'complete' && (
          <View style={styles.viewButton}>
            <Text style={styles.viewButtonText}>View</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.accent} />
          </View>
        )}
        {status === 'generating' && (
          <View style={styles.dotsContainer}>
            <AnimatedDots />
          </View>
        )}
      </TouchableOpacity>
      {status === 'generating' && (
        <View style={styles.progressBar}>
          <Animated.View
            style={[
              styles.progressFill,
              { width: progressWidth },
            ]}
          />
        </View>
      )}
      {(status === 'complete' || status === 'error') && (
        <TouchableOpacity style={styles.dismissButton} onPress={onDismiss}>
          <Ionicons name="close" size={16} color={Colors.gray[400]} />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

function AnimatedDots() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
        ])
      );
    };

    const a1 = animate(dot1, 0);
    const a2 = animate(dot2, 200);
    const a3 = animate(dot3, 400);

    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, []);

  return (
    <View style={styles.dots}>
      {[dot1, dot2, dot3].map((dot, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            { opacity: dot },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  text: {
    flex: 1,
    fontSize: FontSizes.sm,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewButtonText: {
    fontSize: FontSizes.sm,
    color: Colors.accent,
    fontWeight: '600',
  },
  dotsContainer: {
    marginLeft: Spacing.xs,
  },
  dots: {
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent,
  },
  progressBar: {
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.accent,
  },
  dismissButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: 4,
  },
});
