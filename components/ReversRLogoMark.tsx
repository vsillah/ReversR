import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { AppColors, Radii } from '../constants/theme';

const LOGO_MARK = require('../assets/logo-transparent.png');

export default function ReversRLogoMark({
  colors,
  size = 44,
}: {
  colors: AppColors;
  size?: number;
}) {
  const isDark = colors.mode === 'dark';
  const imageScale = 1.06;
  const imageOffsetX = size * 0.035;

  return (
    <View
      style={[
        styles.mark,
        {
          width: size,
          height: size,
          borderRadius: Math.min(Radii.md, size / 3),
          borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)',
          backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : colors.panel,
          shadowColor: colors.shadowColor,
          shadowOpacity: isDark ? 0.12 : 0.08,
          elevation: 2,
        },
      ]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={isDark ? 'ReversR logo dark mode' : 'ReversR logo light mode'}
    >
      <Image
        source={LOGO_MARK}
        style={[
          styles.image,
          {
            width: size * imageScale,
            height: size * imageScale,
            opacity: 1,
            transform: [{ translateX: imageOffsetX }],
          },
        ]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 12,
    elevation: 2,
  },
  image: {
    flexShrink: 0,
  },
});
