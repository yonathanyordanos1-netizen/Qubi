import React, { useEffect, useRef } from 'react';
import { Image, Pressable as RnPressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeProvider';
import { AppColors, withAlpha } from '../../theme/colors';
import { fontFamilyFor } from '../../theme/typography';

/**
 * QubiHeaderLogo — Duolingo-style compact top bar (spec §3)
 * - Squircle avatar container holding Qubi_2.jpg
 * - Streak counter badge with animated 🔥
 * - Total XP badge with ⭐ indicator
 * - Strict safe-area insets via useSafeAreaInsets()
 */
const QUBI = require('../../../Qubi/Qubi_2.jpg');

interface QubiHeaderLogoProps {
  streak: number;
  xp: number;
  /** Extra right-side element (e.g. friends launcher) rendered after the badges */
  right?: React.ReactNode;
  onAvatarPress?: () => void;
}

export function QubiHeaderLogo({ streak, xp, right, onAvatarPress }: QubiHeaderLogoProps) {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();

  // 🔥 continuous gentle flame flicker (rotate + scale wobble)
  const flameWobble = useSharedValue(0);
  useEffect(() => {
    flameWobble.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 420 }),
        withTiming(0, { duration: 420 }),
      ),
      -1,
      true,
    );
  }, [flameWobble]);

  const flameStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 + flameWobble.value * 0.18 },
      { rotate: `${-6 + flameWobble.value * 12}deg` },
    ],
  }));

  // Streak & XP counters pop on change
  const streakScale = useSharedValue(1);
  const xpScale = useSharedValue(1);
  const prevStreak = useRef(streak);
  const prevXp = useRef(xp);

  useEffect(() => {
    if (streak !== prevStreak.current) {
      streakScale.value = withSpring(1.35, { damping: 9, stiffness: 220 }, () => {
        streakScale.value = withSpring(1, { damping: 12, stiffness: 200 });
      });
      prevStreak.current = streak;
    }
  }, [streak, streakScale]);

  useEffect(() => {
    if (xp !== prevXp.current) {
      xpScale.value = withSpring(1.25, { damping: 9, stiffness: 220 }, () => {
        xpScale.value = withSpring(1, { damping: 12, stiffness: 200 });
      });
      prevXp.current = xp;
    }
  }, [xp, xpScale]);

  const streakStyle = useAnimatedStyle(() => ({ transform: [{ scale: streakScale.value }] }));
  const xpStyle = useAnimatedStyle(() => ({ transform: [{ scale: xpScale.value }] }));

  const avatar = (
    <View style={styles.avatarSquircle}>
      <Image source={QUBI} style={styles.avatarImage} resizeMode="cover" accessible accessibilityLabel="Qubi mascot" />
      <View style={[styles.avatarDot, { bottom: -1, right: -1 }]} />
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + 8,
          // Duolingo sticky-header rule: opaque surface + crisp 2px bottom border
          backgroundColor: isDark ? AppColors.canvasDark : '#FFF7ED',
        },
      ]}
    >
      <View style={styles.row}>
        {onAvatarPress != null ? (
          <RnPressable onPress={onAvatarPress} hitSlop={6}>
            <Animated.View style={[styles.avatarPressable, xpStyle]}>
              {avatar}
            </Animated.View>
          </RnPressable>
        ) : (
          avatar
        )}

        <View style={styles.spacer} />

        {/* Streak badge — 🔥 with flicker animation */}
        <View style={styles.badge}>
          <Animated.View style={flameStyle}>
            <Text style={styles.flame}><Text>{'🔥'}</Text></Text>
          </Animated.View>
          <Animated.View style={streakStyle}>
            <Text style={[styles.badgeText, { color: AppColors.streakAmberDeep }]}>
              <Text>{`${streak}`}</Text>
            </Text>
          </Animated.View>
        </View>

        <View style={{ width: 8 }} />

        {/* Total XP badge — ⭐ indicator */}
        <View style={[styles.badge, styles.badgeGold]}>
          <Text style={styles.xpStar}><Text>{'⭐'}</Text></Text>
          <Animated.View style={xpStyle}>
            <Text style={[styles.badgeText, { color: AppColors.streakAmberDeep }]}>
              <Text>{`${xp}`}</Text>
            </Text>
          </Animated.View>
        </View>

        {right != null ? (
          <>
            <View style={{ width: 10 }} />
            {right}
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingBottom: 6,
    backgroundColor: 'transparent',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarPressable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSquircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 2, height: 2 },
    elevation: 3,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    // SPEC §3 — explicit proportional sizing: never squish/stretch the JPG
    aspectRatio: 1,
    alignSelf: 'center',
    transform: [{ translateX: -2 }],
  },
  avatarDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: AppColors.success,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  spacer: { flex: 1 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#000000',
    backgroundColor: '#FFFFFF',
    gap: 3,
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 2, height: 2 },
    elevation: 2,
  },
  badgeGold: {
    backgroundColor: withAlpha(AppColors.gold, 0.16),
  },
  flame: { fontSize: 14 },
  xpStar: { fontSize: 12 },
  badgeText: {
    fontSize: 13,
    fontFamily: fontFamilyFor('w800'),
    letterSpacing: -0.2,
  },
});

export default QubiHeaderLogo;