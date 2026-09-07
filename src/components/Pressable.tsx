import { ReactNode } from 'react';
import { Pressable as RnPressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { useSettingsStore } from '../state/settingsStore';

/**
 * Studio Elevation Pressable — micro-interaction foundation
 * scale 0.96 on press with spring { damping: 15, stiffness: 300 }
 * + subtle Haptics.Light for tactile feedback
 */
export function Pressable({
  children,
  onTap,
  scale = 0.96,
}: {
  children: ReactNode;
  onTap?: (() => void) | null;
  scale?: number;
}) {
  const sv = useSharedValue(1);
  const enabled = onTap != null;

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: sv.value }],
  }));

  const tick = () => {
    if (useSettingsStore.getState().haptics) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  return (
    <Animated.View style={style}>
      <RnPressable
        disabled={!enabled}
        onPressIn={() => {
          if (!enabled) return;
          sv.value = withSpring(scale, { damping: 15, stiffness: 300 });
        }}
        onPressOut={() => {
          if (!enabled) return;
          sv.value = withSpring(1, { damping: 15, stiffness: 300 });
        }}
        onPress={() => {
          if (!enabled) return;
          tick();
          onTap();
        }}
      >
        {children}
      </RnPressable>
    </Animated.View>
  );
}
