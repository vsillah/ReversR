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

  return (
    <View
      style={[
        styles.mark,
        {
          width: size,
          height: size,
          borderRadius: Math.min(Radii.md, size / 3),
          borderColor: isDark ? 'rgba(0,255,157,0.18)' : 'rgba(37,99,235,0.18)',
          backgroundColor: isDark ? 'rgba(255,255,255,0.025)' : 'rgba(15,23,42,0.035)',
          shadowColor: isDark ? colors.accent : colors.primary,
          shadowOpacity: isDark ? 0.18 : 0.08,
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
            width: size * 2.1,
            height: size * 2.1,
            opacity: isDark ? 1 : 0.96,
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
