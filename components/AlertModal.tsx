import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors, Spacing, FontSizes, Radii, Fonts, makeShadows } from '../constants/theme';
import { useAppTheme } from '../hooks/useAppTheme';

interface AlertModalProps {
  visible: boolean;
  title: string;
  message: string;
  type?: 'info' | 'error' | 'success';
  buttons?: Array<{
    text: string;
    onPress: () => void;
    style?: 'default' | 'destructive' | 'cancel';
  }>;
  onClose?: () => void;
}

export default function AlertModal({
  visible,
  title,
  message,
  type = 'info',
  buttons = [{ text: 'OK', onPress: () => {}, style: 'default' }],
  onClose,
}: AlertModalProps) {
  const { colors: Colors } = useAppTheme();
  const styles = createStyles(Colors);
  const iconMap = {
    info: 'information-circle-outline',
    error: 'alert-circle-outline',
    success: 'checkmark-circle-outline',
  };

  const colorMap = {
    info: Colors.primary,
    error: Colors.danger,
    success: Colors.success,
  };

  const handleButtonPress = (onPress: () => void) => {
    onPress();
    if (onClose) onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <LinearGradient
            colors={Colors.mode === 'dark'
              ? ['rgba(59,130,246,0.14)', 'rgba(0,255,157,0.06)', 'rgba(16,18,24,0)']
              : ['rgba(37,99,235,0.10)', 'rgba(0,122,85,0.06)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.panelGlow}
          />
          <View style={styles.header}>
            <View style={[styles.iconWrap, { borderColor: colorMap[type], backgroundColor: `${colorMap[type]}1F` }]}>
              <Ionicons
                name={iconMap[type] as any}
                size={22}
                color={colorMap[type]}
              />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>
                {type === 'error' ? 'Attention needed' : type === 'success' ? 'Completed' : 'Action required'}
              </Text>
              <Text style={styles.title}>{title}</Text>
            </View>
          </View>

          <Text style={styles.message}>{message}</Text>

          <View style={styles.buttonContainer}>
            {buttons.map((button, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.button,
                  button.style === 'destructive' && styles.buttonDestructive,
                  button.style === 'cancel' && styles.buttonCancel,
                ]}
                onPress={() => handleButtonPress(button.onPress)}
                accessibilityRole="button"
                accessibilityLabel={button.text}
              >
                {button.style === 'default' || !button.style ? (
                  <LinearGradient
                    colors={[Colors.primary, Colors.primaryStrong]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.primaryButtonFill}
                  >
                    <Text style={[styles.buttonText, styles.buttonTextPrimary]}>{button.text}</Text>
                  </LinearGradient>
                ) : (
                  <Text
                    style={[
                      styles.buttonText,
                      button.style === 'destructive' && styles.buttonTextDestructive,
                      button.style === 'cancel' && styles.buttonTextCancel,
                    ]}
                  >
                    {button.text}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (Colors: AppColors) => {
  const shadows = makeShadows(Colors);
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: Colors.scrim,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Spacing.lg,
    },
    container: {
      backgroundColor: Colors.panel,
      borderWidth: 1,
      borderColor: Colors.mode === 'dark' ? 'rgba(148,163,184,0.22)' : Colors.border,
      borderRadius: Radii.lg,
      padding: Spacing.lg,
      width: '100%',
      maxWidth: 360,
      overflow: 'hidden',
      ...shadows.floating,
    },
    panelGlow: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 140,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.sm,
      marginBottom: Spacing.md,
    },
    iconWrap: {
      width: 38,
      height: 38,
      borderRadius: Radii.md,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerCopy: {
      flex: 1,
      minWidth: 0,
    },
    eyebrow: {
      fontSize: 11,
      fontFamily: Fonts.bold,
      color: Colors.accent,
      letterSpacing: 1.1,
      marginBottom: 4,
      textTransform: 'uppercase',
    },
    title: {
      fontSize: FontSizes.xxl,
      fontFamily: Fonts.display,
      color: Colors.text,
    },
    message: {
      fontSize: FontSizes.md,
      fontFamily: Fonts.regular,
      color: Colors.mutedText,
      lineHeight: 20,
      marginBottom: Spacing.lg,
    },
    buttonContainer: {
      gap: Spacing.sm,
    },
    primaryButtonFill: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 50,
      paddingVertical: 13,
      paddingHorizontal: Spacing.md,
      borderRadius: Radii.md,
      alignSelf: 'stretch',
      width: '100%',
      flex: 1,
    },
    button: {
      backgroundColor: Colors.primary,
      borderWidth: 1,
      borderColor: Colors.primary,
      borderRadius: Radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 50,
      overflow: 'hidden',
    },
    buttonDestructive: {
      backgroundColor: Colors.dangerSoft,
      borderColor: Colors.mode === 'dark' ? 'rgba(239,68,68,0.42)' : 'rgba(220,38,38,0.30)',
      paddingVertical: 13,
      paddingHorizontal: Spacing.md,
    },
    buttonCancel: {
      backgroundColor: Colors.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(15,23,42,0.03)',
      borderColor: Colors.border,
      paddingVertical: 13,
      paddingHorizontal: Spacing.md,
    },
    buttonText: {
      fontSize: FontSizes.sm,
      fontFamily: Fonts.bold,
      letterSpacing: 0.3,
      textAlign: 'center',
    },
    buttonTextPrimary: {
      color: '#ffffff',
    },
    buttonTextDestructive: {
      color: Colors.danger,
    },
    buttonTextCancel: {
      color: Colors.mutedText,
    },
  });
};
