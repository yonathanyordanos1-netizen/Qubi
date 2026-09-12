import React, { useEffect } from 'react';
import { Pressable as RnPressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { QubiMascot } from '../QubiMascot';
import { SceneBackdrop } from './SceneBackdrop';
import { fontFamilyFor } from '../../theme/typography';

/**
 * HomeSceneHero — the "mascot in a world" hero from the Boons / Triton inspo:
 * a warm sunrise scene with soft clouds + hills, the streak / XP pills floating
 * top, a friendly greeting, and Qubi standing centre-stage (tap → chat).
 * Sits at the very top of the dashboard; content cards flow below on the cream
 * canvas, reading as a bottom-sheet the way the reference apps lay it out.
 */
export function HomeSceneHero({
  firstName,
  streak,
  xp,
  pendingCount,
  onMascotPress,
  onFriends,
}: {
  firstName: string;
  streak: number;
  xp: number;
  pendingCount: number;
  onMascotPress?: () => void;
  onFriends?: () => void;
}) {
  const insets = useSafeAreaInsets();

  const bob = useSharedValue(0);
  useEffect(() => {
    bob.value = withRepeat(withSequence(withTiming(1, { duration: 1400 }), withTiming(0, { duration: 1400 })), -1, true);
  }, [bob]);
  const bobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -6 * bob.value }] }));

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8 }]}>
      <SceneBackdrop />

      {/* Floating stat pills + friends launcher */}
      <View style={styles.topRow}>
        <View style={styles.pill}>
          <Text style={styles.pillIcon}>{'🔥'}</Text>
          <Text style={styles.pillText}>{`${streak}`}</Text>
        </View>
        <View style={[styles.pill, styles.pillGold]}>
          <Text style={styles.pillIcon}>{'⭐'}</Text>
          <Text style={styles.pillText}>{`${xp}`}</Text>
        </View>
        <View style={styles.flex1} />
        <RnPressable onPress={onFriends} hitSlop={8} style={styles.friendsBtn} accessibilityRole="button" accessibilityLabel="Friends">
          <Ionicons name="people" size={20} color="#E0570A" />
          {pendingCount > 0 ? (
            <View style={styles.badge}><Text style={styles.badgeText}>{`${Math.min(pendingCount, 9)}`}</Text></View>
          ) : null}
        </RnPressable>
      </View>

      {/* Greeting */}
      <Text style={styles.greeting}>{`Hi ${firstName || 'there'} 👋`}</Text>
      <Text style={styles.subGreeting}>{'Ready for today’s quests?'}</Text>

      {/* Mascot centre-stage on the hill */}
      <RnPressable onPress={onMascotPress} accessibilityRole="button" accessibilityLabel="Open Qubi chat" style={styles.mascotPress}>
        <Animated.View style={bobStyle}>
          <QubiMascot size={128} celebrating={streak > 0} />
        </Animated.View>
      </RnPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingBottom: 10, alignItems: 'center' },
  flex1: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: 8 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    borderBottomWidth: 3, borderColor: '#FFE0B8',
    shadowColor: '#6B3E12', shadowOpacity: 0.10, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  pillGold: { backgroundColor: '#FFF8E7', borderColor: '#FFE7A8' },
  pillIcon: { fontSize: 13 },
  pillText: { fontFamily: fontFamilyFor('w800'), fontSize: 13.5, color: '#B45309', letterSpacing: -0.2 },
  friendsBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    borderBottomWidth: 3, borderColor: '#FFE0B8',
    shadowColor: '#6B3E12', shadowOpacity: 0.10, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  badge: {
    position: 'absolute', top: -4, right: -3, minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: '#FF5A5A', paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FFFFFF',
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontFamily: fontFamilyFor('w800') },
  greeting: { marginTop: 16, fontFamily: fontFamilyFor('w800'), fontSize: 24, color: '#5A3410', letterSpacing: -0.4 },
  subGreeting: { marginTop: 2, fontFamily: fontFamilyFor('w600'), fontSize: 13.5, color: '#A97B4E' },
  mascotPress: { marginTop: 6, alignItems: 'center', justifyContent: 'center' },
});

export default HomeSceneHero;
