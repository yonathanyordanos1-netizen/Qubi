import React from 'react';
import { View, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { AppColors } from '../../theme/colors';

/**
 * Liftoff & Duolingo — hyper-rounded squircle card (24-32)
 * Palette: #FAFAFA canvas / #FFFFFF card / #F1F5F9 border / Qubi Orange #F97316 accent
 */
interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  radius?: number;
  glowing?: 'none' | 'bonus' | 'success' | 'gold';
  padding?: number;
}

export function Card({ children, style, radius = 24, glowing = 'none', padding = 16 }: CardProps) {
  const { isDark } = useTheme();
  const baseBg = isDark ? '#161E2E' : '#FFFFFF';
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0';

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
      borderColor: 'rgba(16,185,129,0.35)',
      shadowColor: AppColors.success,
      shadowOpacity: 0.12,
      shadowRadius: 12,
      borderWidth: 1.5,
    };
  } else if (glowing === 'gold') {
    glowStyle = {
      borderColor: 'rgba(245,158,11,0.35)',
      shadowColor: '#F59E0B',
      shadowOpacity: isDark ? 0.22 : 0.16,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      borderWidth: 1.5,
    };
  }

  return (
    <View
      style={[
        {
          backgroundColor: baseBg,
          borderRadius: radius,
          borderWidth: isDark ? 1 : 2,
          borderColor,
          padding,
          overflow: 'hidden',
          // Feather semantics: light mode depth comes from the crisp 2px border,
          // ambient shadow stays whisper-subtle (Duolingo flat-with-border look)
          shadowColor: isDark ? '#000' : '#000',
          shadowOffset: { width: 0, height: isDark ? 10 : 6 },
          shadowOpacity: isDark ? 0.35 : 0.05,
          shadowRadius: isDark ? 24 : 14,
          elevation: isDark ? 0 : 2,
        },
        glowStyle,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export default Card;
