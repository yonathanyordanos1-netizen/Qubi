import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Pressable as RnPressable } from 'react-native';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../../theme/ThemeProvider';
import { duoCard, DUO_LIP, DuoRadius } from '../../theme/duo';
import { useSettingsStore } from '../../state/settingsStore';

interface DuoCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  /** Accent border tint (defaults to neutral). */
  border?: string;
  /** Fill override. */
  fill?: string;
  /** Flush sub-card (no bottom lip). */
  flat?: boolean;
  padding?: number;
  /** When set, the card becomes a tactile 3D pressable (lip flattens on press). */
  onPress?: () => void;
  haptic?: 'light' | 'medium';
}

/**
 * The canonical Qubi × Duolingo card. Static by default; pass `onPress` to make
 * it a tactile tile whose bottom lip flattens with a spring + haptic on press.
 */
export function DuoCard({
  children,
  style,
  radius = DuoRadius.lg,
  border,
  fill,
  flat,
  padding = 16,
  onPress,
  haptic = 'light',
}: DuoCardProps) {
  const { isDark } = useTheme();
  const base = duoCard({ isDark, radius, border, fill, flat });

  if (onPress == null) {
    return <View style={[base, { padding }, style]}>{children}</View>;
  }

  return <PressableCard base={base} padding={padding} radius={radius} style={style} onPress={onPress} haptic={haptic}>{children}</PressableCard>;
}

function PressableCard({
  base,
  padding,
  radius,
  style,
  onPress,
  haptic,
  children,
}: {
  base: ViewStyle;
  padding: number;
  radius: number;
  style?: StyleProp<ViewStyle>;
  onPress: () => void;
  haptic: 'light' | 'medium';
  children: React.ReactNode;
}) {
  const y = useSharedValue(0);
  const lip = useSharedValue(DUO_LIP);
  const animated = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
    borderBottomWidth: lip.value,
  }));

  const tap = () => {
    if (useSettingsStore.getState().haptics) {
      const t = haptic === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light;
      void Haptics.impactAsync(t).catch(() => {});
    }
  };

  return (
    <RnPressable
      onPressIn={() => {
        y.value = withSpring(DUO_LIP - 1, { damping: 18, stiffness: 420 });
        lip.value = withSpring(1, { damping: 18, stiffness: 420 });
        tap();
      }}
      onPressOut={() => {
        y.value = withSpring(0, { damping: 16, stiffness: 360 });
        lip.value = withSpring(DUO_LIP, { damping: 16, stiffness: 360 });
      }}
      onPress={() => {
        y.value = withTiming(DUO_LIP - 1, { duration: 40 });
        setTimeout(() => { y.value = withSpring(0, { damping: 18, stiffness: 360 }); lip.value = withSpring(DUO_LIP, { damping: 18, stiffness: 360 }); }, 90);
        onPress();
      }}
    >
      <Animated.View style={[base, { padding, borderRadius: radius }, animated, style]}>{children}</Animated.View>
    </RnPressable>
  );
}

export default DuoCard;
