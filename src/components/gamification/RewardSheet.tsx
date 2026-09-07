import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../../theme/ThemeProvider';
import { AppColors, withAlpha } from '../../theme/colors';
import { body, fontFamilyFor, label } from '../../theme/typography';
import { Pressable } from '../Pressable';
import { StrokeIcon } from '../AppIcons';
import { QubiMascot } from '../QubiMascot';
import { useSettingsStore } from '../../state/settingsStore';
import {
  rankEmoji,
  rankGradient,
  rankLabel,
  tierChanged,
  tierDataForXp,
  tierProgress,
  type RankTier,
} from '../../services/rankService';

/** Rapidly counts 0 → target with an ease-out curve. */
function useCountUp(target: number, durationMs = 950): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / durationMs);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return v;
}

export interface RewardInfo {
  habitName: string;
  xpGained: number;
  xpBefore: number;
  xpAfter: number;
  streak: number;
}

/**
 * Duolingo-style celebration shown right after a quest is verified.
 * Centered modal (not a bottom sheet): crisp 220ms fade+scale+lift entrance,
 * count-up XP, tier progress bar, streak flame and a single clean action bar
 * ([ Continue ] + optional [ Snap another proof ]). When a rank threshold is
 * crossed, a Fortnite-style RANK UP banner takes over with glowing emblem,
 * shimmer particles and heavy bold type.
 */
export function RewardSheet({
  info,
  onClose,
  onSnapAnother,
}: {
  info: RewardInfo;
  onClose: () => void;
  onSnapAnother?: () => void;
}) {
  const { colors } = useTheme();
  const hapticsOn = useSettingsStore((s) => s.haptics);

  useEffect(() => {
    if (hapticsOn) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, [hapticsOn]);

  const shownXp = useCountUp(info.xpGained);

  // Tier progress fill.
  const dataAfter = tierDataForXp(Math.max(info.xpAfter, 1));
  const fill = useSharedValue(tierProgress(Math.max(info.xpBefore, 1)));
  useEffect(() => {
    fill.value = withDelay(
      320,
      withTiming(tierProgress(Math.max(info.xpAfter, 1)), { duration: 1150, easing: Easing.out(Easing.cubic) }),
    );
  }, [fill, info.xpAfter, info.xpBefore]);
  const fillStyle = useAnimatedStyle(
    () => ({ width: `${Math.round(fill.value * 100)}%` as const }),
    [fill],
  );

  // Rank-up splash after the counter lands.
  const tierUp = tierChanged(info.xpBefore, info.xpAfter, 1);
  const dataBefore = tierDataForXp(Math.max(info.xpBefore, 1));
  const [splash, setSplash] = useState(false);
  useEffect(() => {
    if (tierUp == null) return;
    const t = setTimeout(() => setSplash(true), 1350);
    return () => clearTimeout(t);
  }, [tierUp]);

  // ── Crisp lift-off entrance: opacity 0→1, scale .94→1, translateY 12→0 ──
  const enterO = useSharedValue(0);
  const enterScale = useSharedValue(0.94);
  const enterY = useSharedValue(12);
  useEffect(() => {
    enterO.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
    enterScale.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
    enterY.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, [enterO, enterScale, enterY]);
  const enterStyle = useAnimatedStyle(() => ({
    opacity: enterO.value,
    transform: [{ scale: enterScale.value }, { translateY: enterY.value }],
  }));

  // Flame pulse.
  const flameScale = useSharedValue(1);
  useEffect(() => {
    flameScale.value = withRepeat(
      withSequence(withTiming(1.18, { duration: 520, easing: Easing.inOut(Easing.ease) }), withTiming(1, { duration: 520 })),
      -1,
      true,
    );
  }, [flameScale]);
  const flameStyle = useAnimatedStyle(() => ({ transform: [{ scale: flameScale.value }] }), [flameScale]);

  // Floating sparkle badge.
  const floatA = useSharedValue(0);
  useEffect(() => {
    floatA.value = withRepeat(
      withSequence(withTiming(-8, { duration: 1100, easing: Easing.inOut(Easing.ease) }), withTiming(4, { duration: 1100 })),
      -1,
      true,
    );
  }, [floatA]);
  const floatStyleA = useAnimatedStyle(() => ({ transform: [{ translateY: floatA.value }] }), [floatA]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.root]}>
      {/* Uniform semi-transparent backdrop */}
      <Animated.View entering={FadeIn.duration(160)} style={[StyleSheet.absoluteFill, styles.backdrop]} />

      {/* ── FORTNITE-STYLE RANK-UP SPLASH ── */}
      {splash && tierUp != null ? <RankUpSplash tier={tierUp} prevLabel={rankLabel(dataBefore.tier)} /> : null}

      {/* Centered reward card */}
      <View style={styles.centerWrap} pointerEvents="box-none">
        <Animated.View entering={FadeIn.duration(1)} style={[enterStyle, styles.cardShadow]}>
          <View style={[styles.card, { backgroundColor: colors.surfaceContainer }]}>
            <View style={styles.headRow}>
              <QubiMascot size={54} />
              <View style={styles.flex}>
                <Text style={{ ...label({ color: AppColors.primary }), letterSpacing: 2, fontWeight: '800' }}>
                  QUEST COMPLETE
                </Text>
                <Text numberOfLines={2} style={{ fontFamily: fontFamilyFor('w700'), fontSize: 17, lineHeight: 22, color: colors.ink }}>
                  {info.habitName}
                </Text>
              </View>
              <Animated.View style={floatStyleA}>
                <StrokeIcon name="sparkle" size={22} color="#F59E0B" strokeWidth={2.2} />
              </Animated.View>
            </View>

            {/* XP counter */}
            <View style={styles.xpCenter}>
              <Text style={{ fontFamily: fontFamilyFor('w900'), fontSize: 52, lineHeight: 58, letterSpacing: -2.4, color: AppColors.primary }}>
                +{shownXp} XP
              </Text>
            </View>

            {/* Tier progress */}
            <Text style={{ ...label({ color: colors.muted }) }}>TIER PROGRESS</Text>
            <View style={{ height: 6 }} />
            <View style={[styles.barTrack, { backgroundColor: withAlpha(colors.ink, 0.08) }]}>
              <Animated.View style={[styles.barFill, fillStyle]}>
                <LinearGradient
                  colors={[AppColors.primary, '#0B0B0B']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.barGrad}
                />
              </Animated.View>
            </View>
            <View style={styles.rowBetween}>
              <Text numberOfLines={1} style={{ ...body({ color: colors.muted }), fontSize: 12, lineHeight: 16, marginTop: 5, flexShrink: 1 }}>
                {Math.max(info.xpAfter - dataAfter.minXp, 0)} / {dataAfter.maxXp === 999999 ? '\u221E' : dataAfter.maxXp - dataAfter.minXp} XP
              </Text>
              <Text style={{ ...label({ color: colors.muted }), fontSize: 10, lineHeight: 14, marginTop: 6 }}>
                {rankLabel(dataAfter.tier).toUpperCase()}
              </Text>
            </View>

            {/* Streak */}
            <View style={[styles.streakRow, { backgroundColor: withAlpha('#378ADD', 0.09), borderColor: withAlpha('#378ADD', 0.3) }]}>
              <Animated.View style={flameStyle}>
                <StrokeIcon name="flame" size={19} color="#378ADD" strokeWidth={2.4} />
              </Animated.View>
              <Text numberOfLines={1} style={{ fontFamily: fontFamilyFor('w700'), fontSize: 14, lineHeight: 19, color: '#185FA5', flexShrink: 1 }}>
                {info.streak}-day streak locked in!
              </Text>
            </View>

            {/* Consolidated bottom action bar — no overlapping buttons */}
            <Pressable onTap={onClose} scale={0.97}>
              <LinearGradient
                colors={[AppColors.primary, '#0B0B0B']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.cta}
              >
                <Text style={{ fontFamily: fontFamilyFor('w900'), fontSize: 16, lineHeight: 21, letterSpacing: -0.3, color: '#fff' }}>
                  Continue
                </Text>
              </LinearGradient>
            </Pressable>
            {onSnapAnother != null ? (
              <Pressable onTap={onSnapAnother} scale={0.97}>
                <View style={[styles.secondaryAction, { borderColor: withAlpha(colors.ink, 0.18) }]}>
                  <StrokeIcon name="camera" size={15} color={colors.muted} strokeWidth={2.2} />
                  <View style={{ width: 7 }} />
                  <Text numberOfLines={1} style={{ fontFamily: fontFamilyFor('w700'), fontSize: 13.5, lineHeight: 18, color: colors.muted, flexShrink: 1 }}>
                    Snap another proof
                  </Text>
                </View>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

/* ── Fortnite-style rank-up overlay ─────────────────────────────────────── */

function RankUpSplash({ tier, prevLabel }: { tier: RankTier; prevLabel: string }) {
  void prevLabel;
  const { colors } = useTheme();
  const gradient = rankGradient(tier);

  // Pulsing emblem glow.
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(1.09, { duration: 640, easing: Easing.inOut(Easing.ease) }), withTiming(1, { duration: 640 })),
      -1,
      true,
    );
  }, [pulse]);
  const emblemStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  // Shimmer sweep across the title.
  const shimmer = useSharedValue(0);
  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.linear }), -1);
  }, [shimmer]);
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -140 + shimmer.value * 380 }],
  }));
  const glowOpacity = useAnimatedStyle(() => ({ opacity: 0.35 + shimmer.value * 0.4 }));

  return (
    <Animated.View entering={FadeIn.duration(200)} style={[StyleSheet.absoluteFill, styles.splashWrap]} pointerEvents="box-none">
      {/* Particle sparks */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <RankSpark key={i} index={i} />
      ))}

      <Animated.View
        style={[
          styles.rankCard,
          {
            backgroundColor: colors.surfaceContainer,
            borderColor: gradient[0],
            shadowColor: '#F59E0B',
          },
          emblemStyle,
        ]}
      >
        {/* Cyan/gold aura behind the emblem */}
        <Animated.View style={[styles.rankAura, glowOpacity]} />

        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.medal}>
          <StrokeIcon name="medal" size={38} color="#fff" strokeWidth={2.2} />
        </LinearGradient>

        <View style={styles.rankTitleWrap}>
          <Text style={styles.rankTitle}>RANK UP!</Text>
          <View style={styles.shimmerClip}>
            <Animated.View style={[styles.shimmerBar, shimmerStyle]} />
          </View>
          <Text style={styles.rankSubtitle}>LEVEL UNLOCKED</Text>
        </View>

        <Text numberOfLines={1} style={{ ...body({ color: colors.muted }), fontSize: 14, lineHeight: 19, marginTop: 10 }}>
          {prevLabel.toUpperCase()} → {' '}
          <Text style={{ fontFamily: fontFamilyFor('w900'), color: gradient[0] }}>
            {rankLabel(tier).toUpperCase()} {rankEmoji(tier)}
          </Text>
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

function RankSpark({ index }: { index: number }) {
  const angle = (index * Math.PI) / 4 + 0.4;
  const radius = 130 + (index % 3) * 26;
  const p = useSharedValue(0);
  useEffect(() => {
    const dur = 900 + index * 90;
    p.value = withRepeat(
      withSequence(
        withTiming(1, { duration: dur, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: dur, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
  }, [p, index]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.cos(angle) * radius * p.value }, { translateY: Math.sin(angle) * radius * p.value }],
    opacity: p.value,
  }));
  return (
    <Animated.View style={[styles.sparkCenter, style]} pointerEvents="none">
      <StrokeIcon
        name={index % 2 === 0 ? 'star' : 'sparkle'}
        size={9 + (index % 3) * 4}
        color={index % 3 === 0 ? '#22D3EE' : '#F59E0B'}
        strokeWidth={2}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { backgroundColor: 'rgba(15, 23, 42, 0.75)' },
  centerWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  cardShadow: {
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 14 },
    elevation: 20,
    borderRadius: 28,
  },
  card: {
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 22,
    overflow: 'hidden',
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 18 },
  flex: { flex: 1, minWidth: 0 },
  xpCenter: { alignItems: 'center', paddingVertical: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  barTrack: { height: 13, borderRadius: 999, overflow: 'hidden' },
  barFill: { height: 13, borderRadius: 999, overflow: 'hidden' },
  barGrad: { flex: 1 },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderWidth: 1,
    borderRadius: 15,
    paddingVertical: 11,
    paddingHorizontal: 10,
    marginTop: 14,
    marginBottom: 14,
  },
  cta: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    paddingVertical: 16,
    shadowColor: AppColors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 12,
    marginTop: 10,
  },

  /* Rank-up splash */
  splashWrap: { alignItems: 'center', justifyContent: 'center' },
  sparkCenter: { position: 'absolute' },
  rankCard: {
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 26,
    paddingHorizontal: 34,
    paddingTop: 26,
    paddingBottom: 24,
    shadowRadius: 16,
    shadowOpacity: 0.85,
    shadowOffset: { width: 0, height: 0 },
    elevation: 16,
  },
  rankAura: {
    position: 'absolute',
    top: -30,
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(34, 211, 238, 0.18)',
  },
  medal: { width: 74, height: 74, borderRadius: 37, alignItems: 'center', justifyContent: 'center' },
  rankTitleWrap: { alignItems: 'center', marginTop: 14 },
  rankTitle: {
    fontFamily: fontFamilyFor('w900'),
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: 1.5,
    color: '#F59E0B',
    textShadowColor: 'rgba(245, 158, 11, 0.55)',
    textShadowRadius: 16,
    textShadowOffset: { width: 0, height: 0 },
  },
  shimmerClip: { overflow: 'hidden', width: 180, height: 3, borderRadius: 2, marginTop: 8, backgroundColor: 'rgba(245,158,11,0.25)' },
  shimmerBar: { width: 70, height: 3, borderRadius: 2, backgroundColor: '#FDE68A' },
  rankSubtitle: {
    fontFamily: fontFamilyFor('w800'),
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 4,
    color: '#22D3EE',
    marginTop: 6,
  },
});
