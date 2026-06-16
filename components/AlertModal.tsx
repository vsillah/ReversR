import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
          <View style={styles.header}>
            <Ionicons
              name={iconMap[type] as any}
              size={24}
              color={colorMap[type]}
            />
            <Text style={styles.title}>{title}</Text>
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
                  buttons.length > 1 && index > 0 && styles.buttonMultiple,
                ]}
                onPress={() => handleButtonPress(button.onPress)}
                accessibilityRole="button"
                accessibilityLabel={button.text}
              >
                <Text
                  style={[
                    styles.buttonText,
                    button.style === 'destructive' && styles.buttonTextDestructive,
                    button.style === 'cancel' && styles.buttonTextCancel,
                  ]}
                >
                  {button.text}
                </Text>
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
      borderColor: Colors.border,
      borderRadius: Radii.xl,
      padding: Spacing.lg,
      width: '100%',
      maxWidth: 340,
      ...shadows.floating,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginBottom: Spacing.md,
    },
    title: {
      fontSize: FontSizes.lg,
      fontFamily: Fonts.heading,
      color: Colors.text,
      flex: 1,
    },
    message: {
      fontSize: FontSizes.sm,
      fontFamily: Fonts.regular,
      color: Colors.mutedText,
      lineHeight: 20,
      marginBottom: Spacing.lg,
    },
    buttonContainer: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },
    button: {
      flex: 1,
      backgroundColor: Colors.primary,
      borderWidth: 1,
      borderColor: Colors.primary,
      borderRadius: Radii.md,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.md,
      alignItems: 'center',
    },
    buttonMultiple: {
      marginLeft: Spacing.sm,
    },
    buttonDestructive: {
      backgroundColor: Colors.dangerSoft,
      borderColor: Colors.danger,
    },
    buttonCancel: {
      backgroundColor: 'transparent',
      borderColor: Colors.border,
    },
    buttonText: {
      fontSize: FontSizes.sm,
      fontFamily: Fonts.bold,
      color: '#ffffff',
      letterSpacing: 0.3,
    },
    buttonTextDestructive: {
      color: Colors.danger,
    },
    buttonTextCancel: {
      color: Colors.mutedText,
    },
  });
};
