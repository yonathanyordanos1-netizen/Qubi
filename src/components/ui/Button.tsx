import React from 'react';
import { StyleSheet, Text, View, ViewStyle, TextStyle, Pressable as RnPressable, ActivityIndicator } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '../../state/settingsStore';
import { AppColors } from '../../theme/colors';
import { fontFamilyFor } from '../../theme/typography';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'success' | 'sky' | 'ghost' | 'amber';
  size?: 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  haptic?: 'light' | 'medium';
  icon?: React.ReactNode;
  /** Corner radius — default 24 (squircle); pass 16 for the Duolingo guide CTA */
  radius?: number;
}

const VARIANTS = {
  primary: { bg: AppColors.primary, border: '#D45A07', borderWidth: 1, shadow: '#C2410C' },
  secondary: { bg: '#FFFFFF', border: '#E2E8F0', borderWidth: 2, shadow: '#CBD5E1' },
  success: { bg: AppColors.success, border: '#0A8F62', borderWidth: 1, shadow: '#047857' },
  sky: { bg: AppColors.sky, border: '#0C7AB0', borderWidth: 1, shadow: '#095A82' },
  ghost: { bg: '#FFFFFF', border: '#E2E8F0', borderWidth: 2, shadow: '#CBD5E1' },
  amber: { bg: '#F59E0B', border: '#D97706', borderWidth: 1, shadow: '#B45309' },
} as const;

/**
 * Duolingo-style 3D Tactile Button — Liftoff/ Duolingo spec
 * - 4px solid bottom shadow border (darker shade)
 * - On press: translateY: 4 to flatten border, spring physics, expo-haptics
 * - Hyper-rounded squircle (24) + bold rounded typography
 */
export function Button({ label, onPress, variant = 'primary', size = 'lg', disabled, loading = false, style, haptic = 'light', icon, radius = 24 }: ButtonProps) {
  const v = VARIANTS[variant];
  const isSecondary = variant === 'secondary' || variant === 'ghost';
  const height = size === 'lg' ? 56 : 48;
  const borderBottom = 4;
  const isLoading = loading === true;

  const pressY = useSharedValue(0);
  const scale = useSharedValue(1);

  const triggerHaptic = () => {
    if (!useSettingsStore.getState().haptics) return;
    const type = haptic === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light;
    void Haptics.impactAsync(type).catch(() => {});
  };

  const animatedBody = useAnimatedStyle(() => ({
    transform: [{ translateY: pressY.value }, { scale: scale.value }],
  }));

  const shadowStyle: ViewStyle = {
    backgroundColor: v.shadow,
    borderRadius: radius,
    height,
  };

  const frontStyle: ViewStyle = {
    backgroundColor: v.bg,
    borderRadius: radius,
    height: height - borderBottom,
    borderWidth: v.borderWidth,
    borderColor: v.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  };

  const labelStyle: TextStyle = {
    color: isSecondary ? AppColors.ink : '#FFFFFF',
    fontFamily: fontFamilyFor('w800'),
    fontSize: size === 'lg' ? 16 : 15,
    letterSpacing: -0.3,
  };

  return (
    <View style={[{ position: 'relative' }, style]}>
      {/* 3D bottom shadow border — 4px darker shade, fills container height */}
      <View style={[StyleSheet.absoluteFill, shadowStyle]} />
      <Animated.View style={animatedBody}>
        <RnPressable
          disabled={disabled || isLoading || !onPress}
          onPressIn={() => {
            if (disabled || isLoading) return;
            pressY.value = withSpring(borderBottom, { damping: 18, stiffness: 420 });
            scale.value = withSpring(0.98, { damping: 15, stiffness: 360 });
            triggerHaptic();
          }}
          onPressOut={() => {
            if (disabled || isLoading) return;
            pressY.value = withSpring(0, { damping: 16, stiffness: 360 });
            scale.value = withSpring(1, { damping: 16, stiffness: 360 });
          }}
          onPress={() => {
            if (disabled || isLoading || !onPress) return;
            pressY.value = withTiming(borderBottom, { duration: 40 });
            setTimeout(() => {
              pressY.value = withSpring(0, { damping: 18, stiffness: 360 });
            }, 90);
            onPress();
          }}
          style={[frontStyle, (disabled || isLoading) && { opacity: isLoading ? 0.92 : 0.5 }]}
        >
          {/* Loading state — spinner rendered INSIDE the same fixed-height container
              (height - borderBottom) so toggling label ⇄ spinner causes ZERO reflow. */}
          {isLoading ? (
            <ActivityIndicator
              size="small"
              color={isSecondary ? AppColors.primary : '#FFFFFF'}
              style={{ position: 'absolute', alignSelf: 'center' }}
            />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {icon != null ? <View style={{ alignItems: 'center', justifyContent: 'center' }}>{icon}</View> : null}
              <Text style={labelStyle}><Text>{label}</Text></Text>
            </View>
          )}
        </RnPressable>
      </Animated.View>
    </View>
  );
}

export default Button;
