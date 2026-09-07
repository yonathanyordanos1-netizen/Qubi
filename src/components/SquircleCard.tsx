import React from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { AppColors } from '../theme/colors';

interface SquircleCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  radius?: number;
  glowing?: 'none' | 'bonus' | 'success';
  padding?: number;
}

export function SquircleCard({ children, style, radius = 28, glowing = 'none', padding = 16 }: SquircleCardProps) {
  const { isDark } = useTheme();
  const baseBg = isDark ? '#161E2E' : '#FFFFFF';
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9';

  let glowStyle: ViewStyle = {};
  if (glowing === 'bonus') {
    glowStyle = {
      borderColor: AppColors.sky,
      shadowColor: AppColors.sky,
      shadowOpacity: isDark ? 0.18 : 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 4 },
      borderWidth: 1.5,
    };
  } else if (glowing === 'success') {
    glowStyle = {
      borderColor: withAlpha(AppColors.success, 0.35),
      shadowColor: AppColors.success,
      shadowOpacity: 0.12,
      shadowRadius: 12,
    };
  }

  return (
    <View
      style={[
        {
          backgroundColor: baseBg,
          borderRadius: radius,
          borderWidth: 1,
          borderColor,
          padding,
          overflow: 'hidden',
          shadowColor: isDark ? '#000' : AppColors.cardShadow,
          shadowOffset: { width: 0, height: isDark ? 10 : 6 },
          shadowOpacity: isDark ? 0.35 : 0.05,
          shadowRadius: isDark ? 24 : 14,
          elevation: isDark ? 0 : 3,
        },
        glowStyle,
        style,
      ]}
    >
      {children}
    </View>
  );
}

function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
