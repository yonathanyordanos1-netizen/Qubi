import React, { useRef } from 'react';
import { Animated, StyleSheet, Text, View, ViewStyle, TextStyle } from 'react-native';
import { Pressable as RnPressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '../state/settingsStore';
import { AppColors } from '../theme/colors';
import { fontFamilyFor } from '../theme/typography';

interface PushableButtonProps {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'success' | 'sky' | 'ghost' | 'amber';
  size?: 'md' | 'lg';
  disabled?: boolean;
  style?: ViewStyle;
  haptic?: 'light' | 'medium';
}

const VARIANTS = {
  primary: { bg: AppColors.primary, border: '#D45A07', shadow: '#C2410C' },
  success: { bg: AppColors.success, border: '#0A8F62', shadow: '#06724E' },
  sky: { bg: AppColors.sky, border: '#0C7AB0', shadow: '#095A82' },
  ghost: { bg: '#FFFFFF', border: '#E2E8F0', shadow: '#CBD5E1' },
  amber: { bg: '#F59E0B', border: '#D97706', shadow: '#B45309' },
} as const;

export function PushableButton({ label, onPress, variant = 'primary', size = 'lg', disabled, style, haptic = 'light' }: PushableButtonProps) {
  const v = VARIANTS[variant];
  const isGhost = variant === 'ghost';
  const height = size === 'lg' ? 56 : 48;
  const radius = 24;
  const borderBottom = 4;

  const pressY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  const triggerHaptic = () => {
    if (!useSettingsStore.getState().haptics) return;
    const type = haptic === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light;
    void Haptics.impactAsync(type).catch(() => {});
  };

  const animatedBody = {
    transform: [{ translateY: pressY }, { scale }],
  };

  const shadowStyle: ViewStyle = {
    backgroundColor: v.shadow,
    borderRadius: radius,
    height,
  };

  const frontStyle: ViewStyle = {
    backgroundColor: v.bg,
    borderRadius: radius,
    height: height - borderBottom,
    borderWidth: 1,
    borderColor: v.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  };

  const labelStyle: TextStyle = {
    color: isGhost ? AppColors.ink : '#FFFFFF',
    fontFamily: fontFamilyFor('w800'),
    fontSize: size === 'lg' ? 16 : 15,
    letterSpacing: -0.3,
  };

  return (
    <View style={[{ position: 'relative' }, style]}>
      {/* 3D bottom border / shadow layer */}
      <View style={[StyleSheet.absoluteFill, shadowStyle]} />
      <Animated.View style={animatedBody}>
        <RnPressable
          disabled={disabled || !onPress}
          onPressIn={() => {
            Animated.spring(pressY, { toValue: borderBottom, damping: 18, stiffness: 420, useNativeDriver: true }).start();
            Animated.spring(scale, { toValue: 0.98, damping: 15, stiffness: 360, useNativeDriver: true }).start();
            triggerHaptic();
          }}
          onPressOut={() => {
            Animated.spring(pressY, { toValue: 0, damping: 16, stiffness: 360, useNativeDriver: true }).start();
            Animated.spring(scale, { toValue: 1, damping: 16, stiffness: 360, useNativeDriver: true }).start();
          }}
          onPress={() => {
            if (disabled || !onPress) return;
            // quick flatten feedback
            Animated.timing(pressY, { toValue: borderBottom, duration: 40, useNativeDriver: true }).start();
            setTimeout(() => {
              Animated.spring(pressY, { toValue: 0, damping: 18, stiffness: 360, useNativeDriver: true }).start();
            }, 90);
            onPress();
          }}
          style={[frontStyle, disabled && { opacity: 0.5 }]}
        >
          <Text style={labelStyle}><Text>{label}</Text></Text>
        </RnPressable>
      </Animated.View>
    </View>
  );
}
