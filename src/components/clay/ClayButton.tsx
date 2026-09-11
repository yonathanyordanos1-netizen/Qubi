import React from 'react';
import { Pressable as RnPressable, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { fontFamilyFor } from '../../theme/typography';
import { Clay, ClayHue, ClayRadius, clayRamp } from '../../theme/clay';
import { useSettingsStore } from '../../state/settingsStore';

interface ClayButtonProps {
  label: string;
  onPress?: () => void;
  hue?: ClayHue;
  variant?: 'solid' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  haptic?: 'light' | 'medium';
  full?: boolean;
}

/**
 * Claymorphism candy button — gradient inflated top, solid darker "base" that
 * shows as a 3D underside, spring-squish (scale 0.94 + press-down) on tap, and a
 * haptic tick. This is the primary CTA across the app.
 */
export function ClayButton({
  label,
  onPress,
  hue = 'orange',
  variant = 'solid',
  size = 'lg',
  disabled,
  icon,
  style,
  haptic = 'light',
  full = true,
}: ClayButtonProps) {
  const ramp = clayRamp(hue);
  const isGhost = variant === 'ghost';
  const height = size === 'lg' ? 58 : size === 'md' ? 50 : 42;
  const depth = 6; // 3D underside thickness

  const scale = useSharedValue(1);
  const y = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }, { translateY: y.value }] }));

  const tick = () => {
    if (!useSettingsStore.getState().haptics) return;
    void Haptics.impactAsync(haptic === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const labelStyle: TextStyle = {
    color: isGhost ? Clay.ink : '#FFFFFF',
    fontFamily: fontFamilyFor('w800'),
    fontSize: size === 'lg' ? 17 : size === 'md' ? 15 : 13.5,
    letterSpacing: 0.2,
  };

  return (
    <View style={[full && { alignSelf: 'stretch' }, { position: 'relative' }, style]}>
      {/* 3D base underside — darker shade, peeks out below the face */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { top: depth, borderRadius: ClayRadius.button, backgroundColor: isGhost ? '#E7D9C6' : ramp.base },
        ]}
      />
      <Animated.View style={animated}>
        <RnPressable
          disabled={disabled || onPress == null}
          onPressIn={() => {
            scale.value = withSpring(0.94, { damping: 15, stiffness: 400 });
            y.value = withSpring(depth - 1, { damping: 15, stiffness: 400 });
            tick();
          }}
          onPressOut={() => {
            scale.value = withSpring(1, { damping: 14, stiffness: 320 });
            y.value = withSpring(0, { damping: 14, stiffness: 320 });
          }}
          onPress={() => {
            if (disabled || onPress == null) return;
            y.value = withTiming(depth - 1, { duration: 40 });
            setTimeout(() => { y.value = withSpring(0, { damping: 16, stiffness: 340 }); }, 90);
            onPress();
          }}
        >
          {isGhost ? (
            <View style={[styles.face, { height, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#EADFCF' }, disabled && styles.disabled]}>
              {icon}
              <Text style={labelStyle}>{label}</Text>
            </View>
          ) : (
            <LinearGradient
              colors={[ramp.top, ramp.mid]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={[styles.face, { height }, disabled && styles.disabled]}
            >
              {/* specular top-gloss */}
              <View style={styles.gloss} pointerEvents="none" />
              {icon}
              <Text style={labelStyle}>{label}</Text>
            </LinearGradient>
          )}
        </RnPressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  face: {
    borderRadius: ClayRadius.button,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 22,
  },
  gloss: {
    position: 'absolute',
    top: 5,
    left: 14,
    right: 14,
    height: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  disabled: { opacity: 0.5 },
});

export default ClayButton;
