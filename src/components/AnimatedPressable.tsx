import { ReactNode } from 'react';
import { Pressable as RnPressable, StyleProp, ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

/** Reusable reanimated pressable for cards/rows — scale 0.96 + Light haptic */
export function AnimatedPressable({
  children,
  onPress,
  style,
  disabled,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const sv = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: sv.value }] }));
  const enabled = !disabled && onPress != null;
  return (
    <Animated.View style={[animated, style as any]}>
      <RnPressable
        disabled={!enabled}
        onPressIn={() => {
          if (!enabled) return;
          sv.value = withSpring(0.96, { damping: 15, stiffness: 300 });
        }}
        onPressOut={() => {
          if (!enabled) return;
          sv.value = withSpring(1, { damping: 15, stiffness: 300 });
        }}
        onPress={() => {
          if (!enabled || !onPress) return;
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onPress();
        }}
      >
        {children}
      </RnPressable>
    </Animated.View>
  );
}
