import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { AppColors, withAlpha } from '../theme/colors';
import { fontFamilyFor } from '../theme/typography';
import { QubiMascot } from './QubiMascot';

/**
 * QuestCompleteOverlay — Duolingo's "Quest complete!" reward moment.
 * Full-screen (pointerEvents: none) celebration: confetti burst, Qubi mascot
 * cheer, "Quest Complete!" card and an XP roll-up counter. Auto-dismisses
 * via onDone so the parent can clear it. All strings Hermes-safe (<Text>).
 */

const CONFETTI_COLORS = [AppColors.pathGold, AppColors.primary, AppColors.sky, AppColors.pathGreen, '#CE82FF'];
const PARTICLES = 24;

export interface QuestCompleteOverlayProps {
  visible: boolean;
  questName: string;
  xp: number;
  onDone: () => void;
}

export function QuestCompleteOverlay({ visible, questName, xp, onDone }: QuestCompleteOverlayProps) {
  const [shownXp, setShownXp] = useState(0);

  // XP roll-up — 0 → xp over ~600ms
  useEffect(() => {
    if (!visible) return;
    setShownXp(0);
    const iv = setInterval(() => {
      setShownXp((s) => {
        const next = Math.min(xp, s + 2);
        if (next >= xp) clearInterval(iv);
        return next;
      });
    }, 24);
    return () => clearInterval(iv);
  }, [visible, xp]);

  // Auto-dismiss
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(onDone, 1700);
    return () => clearTimeout(t);
  }, [visible, onDone]);

  if (!visible) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* Dim backdrop */}
      <Animated.View entering={FadeIn.duration(150)} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(15,23,42,0.35)' }]} />

      {/* Confetti burst */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        {Array.from({ length: PARTICLES }, (_, i) => {
          const angle = ((i / PARTICLES) * Math.PI * 2 + (i % 3) * 0.12);
          return (
            <Particle
              key={i}
              angle={angle}
              dist={96 + (i % 5) * 30}
              color={CONFETTI_COLORS[i % CONFETTI_COLORS.length]}
              size={9 + (i % 3) * 3}
              delay={(i % 6) * 40}
            />
          );
        })}
      </View>

      {/* Reward card */}
      <View style={styles.center}>
        <Animated.View entering={FadeIn.duration(120)} style={[styles.card, { borderColor: withAlpha(AppColors.pathGold, 0.5) }]}>
          <QubiMascot size={76} celebrating />
          <View style={{ height: 10 }} />
          <Text style={styles.headline}><Text>{'Quest Complete!'}</Text></Text>
          <View style={{ height: 4 }} />
          <Text style={styles.questName} numberOfLines={1}><Text>{questName}</Text></Text>
          <View style={{ height: 10 }} />
          <Text style={[styles.xp, { color: AppColors.pathGreenDeep }]}>
            <Text>{`+${shownXp} XP`}</Text>
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

/** One confetti particle — explodes outward from the card then falls + fades */
function Particle({ angle, dist, color, size, delay }: { angle: number; dist: number; color: string; size: number; delay: number }) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const rot = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    const dx = Math.cos(angle) * dist;
    const launch = Math.sin(angle) * dist * 0.5 - 60;
    const fall = 140;
    x.value = withDelay(delay, withTiming(dx, { duration: 950, easing: Easing.out(Easing.quad) }));
    y.value = withDelay(delay, withSpring(launch, { damping: 16, stiffness: 120 }, () => {
      y.value = withTiming(y.value + fall, { duration: 500, easing: Easing.in(Easing.quad) });
    }));
    rot.value = withDelay(delay, withTiming(((angle * 57) % 360) - 180, { duration: 950 }));
    opacity.value = withDelay(delay + 550, withTiming(0, { duration: 380 }));
  }, [angle, dist, delay, x, y, rot, opacity]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { rotate: `${rot.value}deg` }],
    opacity: opacity.value,
  }));

  return <Animated.View style={[{ position: 'absolute', width: size, height: size * 0.42, borderRadius: 2, backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    borderWidth: 2,
    borderBottomWidth: 5,
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 22,
    width: 264,
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  headline: {
    fontSize: 21,
    fontFamily: fontFamilyFor('w900'),
    letterSpacing: -0.5,
    color: AppColors.ink,
  },
  questName: {
    fontSize: 13,
    fontFamily: fontFamilyFor('w600'),
    color: AppColors.muted,
    maxWidth: 210,
  },
  xp: {
    fontSize: 34,
    fontFamily: fontFamilyFor('w900'),
    letterSpacing: -1,
  },
});

export default QuestCompleteOverlay;