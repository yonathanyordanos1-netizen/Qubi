import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { AppColors, withAlpha } from '../theme/colors';
import { fontFamilyFor } from '../theme/typography';
import { Pressable } from './Pressable';
import { StrokeIcon } from './AppIcons';
import { QubiMascot } from './QubiMascot';
import { XpTicker } from './animations/XpTicker';
import { useSettingsStore } from '../state/settingsStore';
import { playPop, playClick, playTaskCompleted } from '../services/soundService';
import {
  rankLabel,
  tierDataForXp,
  tierProgress,
} from '../services/rankService';

/* ── Duolingo reward palette (spec-fixed, theme-independent) ── */
const XP_ORANGE = '#FF6D00';
const XP_ORANGE_DEEP = '#E65100';
const STREAK_CARD_BG = '#FFF3E0';
const STREAK_TEXT_BLUE = '#185FA5';
const FLAME_ORANGE = '#FF6D00';
const CARD_WHITE = '#FFFFFF';
const TRACK_GRAY = '#E8E9EA';
const BACKDROP = 'rgba(0,0,0,0.78)';
const CONFETTI_COLORS = ['#FFC531', XP_ORANGE, '#22D3EE', '#58CC02', '#FF6B9D'] as const;

export interface ProofSuccessInfo {
  habitName: string;
  xpGained: number;
  xpBefore: number;
  xpAfter: number;
  streak: number;
  /** Lifetime verified-quest counts around this completion (drives rank tags). */
  completionsBefore: number;
  completionsAfter: number;
  /** AI-graded effort band (drives the difficulty pill). */
  difficulty?: string;
  /** AI celebration / coaching line shown under the XP badge. */
  qubiComment?: string;
}

/**
 * Duolingo-style post-capture reward modal.
 * Soft rounded white card (radius 32) over a dark backdrop with a springy
 * pop/bounce entrance; Qubi avatar top-center with glowing star burst and a
 * top confetti particle drop; bold +XP badge, tier progress bar with
 * UNRANKED → BRONZE tags, streak pill, and 3D tactile Duolingo buttons.
 * Plays a success chime on open and pop/click SFX on button taps.
 */
export function ProofSuccessModal({
  info,
  onContinue,
  onSnapAnother,
}: {
  info: ProofSuccessInfo;
  /** Navigates back to the Quest Dashboard / main app. */
  onContinue: () => void;
  onSnapAnother?: () => void;
}) {
  const hapticsOn = useSettingsStore((s) => s.haptics);

  // Task-completed sting the moment the modal opens + celebratory haptic.
  useEffect(() => {
    playTaskCompleted();
    if (hapticsOn) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Tier progress bar fill: animates from before → after XP ──
  const dataAfter = tierDataForXp(Math.max(info.xpAfter, 1), info.completionsAfter);
  const fill = useSharedValue(tierProgress(Math.max(info.xpBefore, 1), info.completionsBefore));
  useEffect(() => {
    fill.value = withDelay(
      350,
      withTiming(tierProgress(Math.max(info.xpAfter, 1), info.completionsAfter), {
        duration: 1100,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [fill, info.xpAfter, info.xpBefore, info.completionsAfter, info.completionsBefore]);
  const fillStyle = useAnimatedStyle(
    () => ({ width: `${Math.round(fill.value * 100)}%` as const }),
    [fill],
  );

  // ── Entry pop/bounce: scale 0.72 → overshoot 1.045 → settle 1.0 ──
  const enterO = useSharedValue(0);
  const enterScale = useSharedValue(0.72);
  useEffect(() => {
    enterO.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) });
    enterScale.value = withSpring(1, { damping: 11, stiffness: 190, mass: 0.9 });
  }, [enterO, enterScale]);
  const enterStyle = useAnimatedStyle(() => ({
    opacity: enterO.value,
    transform: [{ scale: enterScale.value }],
  }));

  // Qubi avatar happy bounce (loops).
  const avatarBob = useSharedValue(0);
  useEffect(() => {
    avatarBob.value = withDelay(
      450,
      withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }),
    );
  }, [avatarBob]);
  const avatarStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.85 + 0.15 * avatarBob.value }],
  }));

  // Star burst: 8 golden stars shoot outward once, then keep glowing.
  const burst = useSharedValue(0);
  useEffect(() => {
    burst.value = withDelay(250, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [burst]);
  const burstGlow = useAnimatedStyle(() => ({ opacity: 0.9 - 0.55 * burst.value }));
  const burstScale = useAnimatedStyle(() => ({
    transform: [{ scale: 0.6 + burst.value * 0.9 }],
  }));

  // Animated flame pulse for the streak card.
  const flameScale = useSharedValue(1);
  useEffect(() => {
    flameScale.value = withRepeat(
      withSequence(withTiming(1.2, { duration: 480, easing: Easing.inOut(Easing.ease) }), withTiming(1, { duration: 480 })),
      -1,
      true,
    );
  }, [flameScale]);
  const flameStyle = useAnimatedStyle(() => ({ transform: [{ scale: flameScale.value }] }), [flameScale]);

  // ── 3D tactile button press depth (CONTINUE) ──
  const ctaY = useSharedValue(0);
  const ctaStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ctaY.value }] }), [ctaY]);
  const pressCta = (down: boolean) => {
    ctaY.value = withSpring(down ? 4 : 0, { damping: 16, stiffness: 400 });
  };

  const onTapContinue = () => {
    playPop();
    if (hapticsOn) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onContinue();
  };
  const onTapSnapAnother = () => {
    playClick();
    if (hapticsOn) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onSnapAnother?.();
  };

  return (
    <View style={[StyleSheet.absoluteFill, styles.root]}>
      {/* Dark backdrop */}
      <Animated.View entering={FadeIn.duration(160)} style={[StyleSheet.absoluteFill, styles.backdrop]} />

      {/* Top confetti particle burst — pointerEvents none */}
      <View pointerEvents="none" style={styles.confettiZone}>
        {Array.from({ length: 14 }, (_, i) => (
          <ConfettiPiece key={i} index={i} />
        ))}
      </View>

      {/* Soft rounded white card */}
      <View style={styles.centerWrap} pointerEvents="box-none">
        <Animated.View style={[enterStyle, styles.cardShadow]}>
          <View style={styles.card}>
            {/* Qubi avatar + glowing star burst */}
            <View style={styles.avatarStack}>
              <Animated.View style={[styles.burstLayer, burstGlow, burstScale]} pointerEvents="none">
                {Array.from({ length: 8 }, (_, i) => (
                  <StarBurst key={i} index={i} />
                ))}
              </Animated.View>
              <Animated.View style={avatarStyle}>
                <QubiMascot size={104} celebrating bob={false} />
              </Animated.View>
            </View>

            <Text style={styles.headline}>QUEST COMPLETE!</Text>
            <Text numberOfLines={2} style={styles.questName}>
              {info.habitName}
            </Text>

            {/* Bold high-contrast XP badge — shared spring-driven ticker */}
            <XpTicker
              oldXp={0}
              newXp={Math.max(0, info.xpGained)}
              showDeltaOnly
              prefix="+"
              suffix=" XP"
              delayMs={300}
              textStyle={styles.xpBadge}
            />

            {info.difficulty != null ? (
              <View style={styles.difficultyWrap}>
                <Text style={styles.difficultyText}>{`${info.difficulty.toUpperCase()} EFFORT`}</Text>
              </View>
            ) : null}

            {info.qubiComment != null && info.qubiComment.length > 0 ? (
              <Text numberOfLines={3} style={styles.qubiComment}>
                {info.qubiComment}
              </Text>
            ) : null}

            {/* Tier progress bar */}
            <View style={styles.progressBlock}>
              <View style={styles.progressTrack}>
                <Animated.View style={[styles.progressFill, fillStyle]} />
              </View>
              <View style={styles.tagRow}>
                <Text style={styles.tagText}>{`${info.xpAfter} / 100 XP`}</Text>
                <Text style={styles.tagText}>
                  {`${rankLabel(tierDataForXp(Math.max(info.xpBefore, 1), info.completionsBefore).tier).toUpperCase()} → ${rankLabel(dataAfter.tier).toUpperCase()}`}
                </Text>
              </View>
            </View>

            {/* Streak pill card */}
            <View style={styles.streakCard}>
              <Animated.View style={flameStyle}>
                <StrokeIcon name="flame" size={19} color={FLAME_ORANGE} strokeWidth={2.4} />
              </Animated.View>
              <Text numberOfLines={1} style={styles.streakText}>
                {`${info.streak}-day streak locked in!`}
              </Text>
            </View>

            {/* 3D tactile CONTINUE — solid orange with 4px dark bottom border */}
            <Animated.View style={[styles.ctaWrap, ctaStyle]}>
              <View style={styles.ctaShadow} />
              <Pressable
                onTap={onTapContinue}
                scale={0.985}
              >
                <View style={styles.ctaFront}>
                  <Text style={styles.ctaText}>CONTINUE</Text>
                </View>
              </Pressable>
            </Animated.View>

            {/* Secondary pill — outline + 3D depth */}
            {onSnapAnother != null ? (
              <Animated.View style={[styles.secondaryWrap]}>
                <View style={styles.secondaryShadow} />
                <Pressable onTap={onTapSnapAnother} scale={0.985}>
                  <View style={styles.secondaryFront}>
                    <StrokeIcon name="camera" size={15} color={AppColors.muted} strokeWidth={2.2} />
                    <View style={{ width: 7 }} />
                    <Text numberOfLines={1} style={styles.secondaryText}>
                      SNAP ANOTHER PROOF
                    </Text>
                  </View>
                </Pressable>
              </Animated.View>
            ) : null}
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

/* ── Celebration particles ──────────────────────────────────────────── */

/** One confetti piece dropping from the top of the modal. */
function ConfettiPiece({ index }: { index: number }) {
  const fall = useSharedValue(0);
  const leftPct = 6 + (index * 88) / 13 + ((index * 7) % 5);
  const drift = ((index % 5) - 2) * 14;
  const size = 5 + (index % 3) * 3;
  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];

  useEffect(() => {
    fall.value = withDelay(
      120 + (index % 7) * 90,
      withTiming(1, { duration: 1500 + (index % 5) * 260, easing: Easing.in(Easing.quad) }),
    );
  }, [fall, index]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: fall.value * 520 },
      { translateX: fall.value * drift },
      { rotate: `${fall.value * 340 + index * 40}deg` },
    ],
    opacity: fall.value >= 1 ? 0 : 1,
  }));

  return (
    <Animated.View style={[styles.confettiPiece, { left: `${leftPct}%` as const }, style]}>
      <View style={{ width: size, height: size * 1.6, borderRadius: 2, backgroundColor: color }} />
    </Animated.View>
  );
}

/** A single golden star in the burst ring around the avatar. */
function StarBurst({ index }: { index: number }) {
  const angle = (index * Math.PI) / 4 - Math.PI / 2;
  const radius = 66 + (index % 2) * 14;
  const pop = useSharedValue(0);
  useEffect(() => {
    pop.value = withDelay(280 + index * 45, withTiming(1, { duration: 520, easing: Easing.out(Easing.back(2)) }));
  }, [pop, index]);
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: Math.cos(angle) * radius * pop.value },
      { translateY: Math.sin(angle) * radius * pop.value },
      { scale: 0.4 + pop.value * 0.6 },
    ],
    opacity: pop.value,
  }));
  return (
    <Animated.View style={[styles.starBurst, style]} pointerEvents="none">
      <StrokeIcon name="star" size={13 + (index % 3) * 4} color="#FFC531" strokeWidth={2.2} />
    </Animated.View>
  );
}

/* ── Styles ─────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { backgroundColor: BACKDROP },
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
    shadowOpacity: 0.4,
    shadowRadius: 34,
    shadowOffset: { width: 0, height: 16 },
    elevation: 22,
    borderRadius: 32,
  },
  card: {
    backgroundColor: CARD_WHITE,
    borderRadius: 32,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 22,
    alignItems: 'stretch',
    overflow: 'hidden',
  },

  /* Avatar + star burst */
  avatarStack: { alignItems: 'center', justifyContent: 'center', height: 132, marginBottom: 6 },
  burstLayer: { position: 'absolute', width: 220, height: 220, alignItems: 'center', justifyContent: 'center' },
  starBurst: {
    position: 'absolute',
    shadowColor: '#FFC531',
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },

  /* Headline */
  headline: {
    textAlign: 'center',
    color: AppColors.ink,
    fontFamily: fontFamilyFor('w900'),
    fontSize: 21,
    lineHeight: 26,
    letterSpacing: 0.4,
  },
  questName: {
    textAlign: 'center',
    color: AppColors.muted,
    fontFamily: fontFamilyFor('w600'),
    fontSize: 13.5,
    lineHeight: 18,
    marginTop: 3,
  },

  /* XP badge — vibrant orange + heavy drop shadow */
  xpBadge: {
    textAlign: 'center',
    color: XP_ORANGE,
    fontFamily: fontFamilyFor('w900'),
    fontSize: 52,
    lineHeight: 60,
    letterSpacing: -1.6,
    marginTop: 8,
    textShadowColor: 'rgba(230, 81, 0, 0.45)',
    textShadowRadius: 14,
    textShadowOffset: { width: 0, height: 4 },
  },

  /* Difficulty pill + AI comment */
  difficultyWrap: {
    alignSelf: 'center',
    backgroundColor: '#1C1917',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 8,
  },
  difficultyText: {
    color: '#FFC531',
    fontFamily: fontFamilyFor('w800'),
    fontSize: 11,
    letterSpacing: 1.1,
  },
  qubiComment: {
    textAlign: 'center',
    color: AppColors.ink,
    fontFamily: fontFamilyFor('w600'),
    fontSize: 13.5,
    lineHeight: 18,
    marginTop: 8,
    paddingHorizontal: 8,
  },

  /* Tier progress */
  progressBlock: { marginTop: 16 },
  progressTrack: {
    height: 14,
    borderRadius: 999,
    backgroundColor: TRACK_GRAY,
    overflow: 'hidden',
  },
  progressFill: {
    height: 14,
    borderRadius: 999,
    backgroundColor: XP_ORANGE,
  },
  tagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 7,
  },
  tagText: {
    color: AppColors.muted,
    fontFamily: fontFamilyFor('w800'),
    fontSize: 11,
    letterSpacing: 0.6,
  },

  /* Streak pill card */
  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: STREAK_CARD_BG,
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginTop: 16,
  },
  streakText: {
    color: STREAK_TEXT_BLUE,
    fontFamily: fontFamilyFor('w800'),
    fontSize: 14,
    lineHeight: 19,
    flexShrink: 1,
  },

  /* 3D tactile CONTINUE */
  ctaWrap: { marginTop: 18 },
  ctaShadow: {
    ...StyleSheet.absoluteFill,
    backgroundColor: XP_ORANGE_DEEP,
    borderRadius: 999,
  },
  ctaFront: {
    height: 56,
    borderRadius: 999,
    backgroundColor: XP_ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: XP_ORANGE_DEEP,
    borderBottomWidth: 0,
  },
  ctaText: {
    color: '#FFFFFF',
    fontFamily: fontFamilyFor('w900'),
    fontSize: 16,
    letterSpacing: 1.1,
  },

  /* Secondary pill — outline + depth */
  secondaryWrap: { marginTop: 12 },
  secondaryShadow: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#CBD5E1',
    borderRadius: 999,
  },
  secondaryFront: {
    height: 48,
    borderRadius: 999,
    backgroundColor: CARD_WHITE,
    borderWidth: 2,
    borderColor: AppColors.mutedLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  secondaryText: {
    color: AppColors.muted,
    fontFamily: fontFamilyFor('w800'),
    fontSize: 12.5,
    letterSpacing: 0.8,
    flexShrink: 1,
  },

  /* Confetti */
  confettiZone: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
    pointerEvents: 'none',
  },
  confettiPiece: { position: 'absolute', top: -18 },
});
