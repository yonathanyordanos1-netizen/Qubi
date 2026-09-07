import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withDelay, withTiming, interpolate } from 'react-native-reanimated';
import { AppColors, withAlpha } from '../../theme/colors';

/**
 * Duolingo-style Dynamic Progress & XP Bar — spec §2
 * - Chunky rounded track: height 18, borderRadius 99
 * - Spring-animated fill with inner glossy highlight line
 * - Floating star indicator (#F59E0B) riding the fill edge
 */
interface ProgressBarProps {
  /** 0..1 — clamped internally */
  progress: number;
  height?: number;
  fillColor?: string;
  fillColorDeep?: string;
  trackColor?: string;
  showStar?: boolean;
  style?: ViewStyle;
}

export function ProgressBar({
  progress,
  height = 18,
  fillColor = AppColors.primary,
  fillColorDeep = '#C2410C',
  trackColor = '#E2E8F0',
  showStar = true,
  style,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const [trackW, setTrackW] = useState(0);

  const fillW = useSharedValue(0);
  const starPulse = useSharedValue(0);

  useEffect(() => {
    fillW.value = withSpring(trackW * clamped, { damping: 20, stiffness: 160, mass: 0.9 });
    if (showStar) {
      starPulse.value = 0;
      starPulse.value = withDelay(
        120,
        withSpring(1, { damping: 9, stiffness: 220 }, () => {
          starPulse.value = withTiming(0, { duration: 300 });
        }),
      );
    }
  }, [clamped, trackW, fillW, starPulse, showStar]);

  const fillStyle = useAnimatedStyle(() => ({
    width: fillW.value,
  }));

  // Star rides the leading edge of the fill, floats + scales on progress change
  const starStyle = useAnimatedStyle(() => {
    const float = interpolate(starPulse.value, [0, 1], [0, -6]);
    const scale = interpolate(starPulse.value, [0, 1], [1, 1.35]);
    return {
      transform: [{ translateX: fillW.value - 11 }, { translateY: float }, { scale }],
      opacity: trackW > 0 && fillW.value > 10 ? 1 : 0,
    };
  });

  return (
    <View
      style={[styles.track, { height, borderRadius: height / 2, backgroundColor: trackColor }, style]}
      onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
    >
      <Animated.View
        style={[
          styles.fill,
          {
            height,
            borderRadius: height / 2,
            backgroundColor: fillColor,
            borderBottomWidth: 3,
            borderBottomColor: fillColorDeep,
          },
          fillStyle,
        ]}
      >
        {/* Glossy inner highlight line */}
        <View style={[styles.gloss, { top: 3, height: 3, borderRadius: 99 }]} />
      </Animated.View>
      {showStar ? (
        <Animated.View pointerEvents="none" style={[styles.starWrap, starStyle]}>
          <Text style={styles.star}><Text>{'⭐'}</Text></Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'visible',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  fill: {
    overflow: 'hidden',
    shadowColor: AppColors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  gloss: {
    position: 'absolute',
    left: 8,
    right: 8,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  starWrap: {
    position: 'absolute',
    top: -16,
    left: 0,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  star: {
    fontSize: 16,
    textShadowColor: withAlpha('#F59E0B', 0.35),
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
});

export default ProgressBar;