import React from 'react';
import { Pressable as RnPressable, StyleProp, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../../theme/ThemeProvider';
import { ClayRadius, clayCardStyle } from '../../theme/clay';
import { useSettingsStore } from '../../state/settingsStore';

interface ClayCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  fill?: string;
  padding?: number;
  strength?: 'sm' | 'md' | 'lg';
  onPress?: () => void;
  haptic?: 'light' | 'medium';
}

/** Soft inflated claymorphism card. Pass `onPress` for a spring-squish tile. */
export function ClayCard({ children, style, radius = ClayRadius.card, fill, padding = 18, strength = 'md', onPress, haptic = 'light' }: ClayCardProps) {
  const { isDark } = useTheme();
  const base = clayCardStyle({ isDark, radius, fill, strength });

  if (onPress == null) return <View style={[base, { padding }, style]}>{children}</View>;

  return <Squish base={base} padding={padding} style={style} onPress={onPress} haptic={haptic}>{children}</Squish>;
}

function Squish({ base, padding, style, onPress, haptic, children }: { base: ViewStyle; padding: number; style?: StyleProp<ViewStyle>; onPress: () => void; haptic: 'light' | 'medium'; children: React.ReactNode }) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const tick = () => {
    if (!useSettingsStore.getState().haptics) return;
    void Haptics.impactAsync(haptic === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };
  return (
    <RnPressable
      onPressIn={() => { scale.value = withSpring(0.96, { damping: 15, stiffness: 380 }); tick(); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 14, stiffness: 320 }); }}
      onPress={onPress}
    >
      <Animated.View style={[base, { padding }, animated, style]}>{children}</Animated.View>
    </RnPressable>
  );
}

export default ClayCard;
