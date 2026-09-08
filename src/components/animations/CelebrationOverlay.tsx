/**
 * CelebrationOverlay — Qubi 4-variant proof completion celebration + Neubrutalism Level-Up.
 *
 * Drop-in for any proof submission success:
 *
 *   const [show, setShow] = useState(false);
 *   <CelebrationOverlay
 *     visible={show}
 *     oldXp={xpBefore} newXp={xpAfter}
 *     oldLevel={lvlBefore} newLevel={lvlAfter}
 *     habitName="Morning Run"
 *     xpGained={50}
 *     onDone={() => setShow(false)}
 *   />
 *
 * 4 variants (randomized):
 *  A — Rocket Launch:    Qubi pops in center (spring), then thrusts off-screen with exhaust confetti
 *  B — 360 Backflip & Gem Drop: Qubi backflips 360°, giant XP gem slams centre card (haptic shake)
 *  C — Confetti Shower & Flame Ignite: full-screen confetti cannon + streak flame ignite under streak pill
 *  D — Crown Flyby:      Qubi jets horizontally across top, drops a crown onto the rank badge
 *
 * Level-Up: Neubrutalism modal (thick black border, #FFC800 yellow, hard 6px drop shadow)
 *           with level number bump spring — shown when newLevel > oldLevel.
 *
 * Standalone iOS Release safe:
 *  - All Reanimated worklets on UI thread (no JS bridge jank during .ipa launch)
 *  - `expo-haptics` guarded (Expo Go / no-enrollment simulators no-op)
 *  - `expo-audio` SFX via soundService (static require() bundling — see soundService.ts)
 *  - `expo-asset` preloaded — first frame never races audio session
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Dimensions, StyleSheet, Text, View, Pressable } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { fontFamilyFor } from '../../theme/typography';
import { QubiMascot } from '../QubiMascot';
import { XpTicker } from './XpTicker';
import { playCheer, playLevelUp, playXp, preloadSoundsAsync } from '../../services/soundService';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type CelebrationVariant = 'rocket' | 'backflip' | 'confetti' | 'crown';

export interface CelebrationOverlayProps {
  visible: boolean;
  oldXp: number;
  newXp: number;
  /** Numeric level before/after — if omitted, inferred from xp (lvl = floor(xp/100)+1) */
  oldLevel?: number;
  newLevel?: number;
  /** Delta XP for badge (derived as newXp-oldXp if omitted) */
  xpGained?: number;
  habitName?: string;
  /** Force a variant — default `random` picks 1/4 on each `visible` mount */
  variant?: CelebrationVariant | 'random';
  /** Called when overlay (or Level-Up modal) is dismissed */
  onDone: () => void;
  /** Auto-dismiss ms (excl. Level-Up which needs user tap) — default 3200 */
  autoDismissMs?: number;
  /**
   * Layered mode (e.g. behind ProofSuccessModal): skips this overlay's own
   * SFX so only the host's sting plays.
   */
  silent?: boolean;
  /** Layered mode: hides the center hero card (avoids a second XP ticker). */
  hideHeroCard?: boolean;
  /** When set, the Level-Up modal's CTA calls this instead of onDone. */
  onLevelUpDone?: () => void;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const NEO_YELLOW = '#FFC800';
const NEO_INK = '#000000';
const CONFETTI_COLORS = ['#FFC800', '#FF6D00', '#1CB0F6', '#58CC02', '#FF4B4B', '#CE82FF', '#38BDF8'] as const;

// Fallback level inference — matches the app's level math (1 + floor(xp/500)).
function levelForXp(xp: number): number {
  return 1 + Math.floor(Math.max(0, xp) / 500);
}

// ─────────────────────────────────────────────────────────────────────────────
// Root overlay — randomizer + orchestrator
// ─────────────────────────────────────────────────────────────────────────────

export function CelebrationOverlay({
  visible,
  oldXp,
  newXp,
  oldLevel,
  newLevel,
  xpGained,
  habitName,
  variant = 'random',
  onDone,
  autoDismissMs = 3200,
  silent = false,
  hideHeroCard = false,
  onLevelUpDone,
}: CelebrationOverlayProps) {
  const pick: CelebrationVariant = useMemo(() => {
    if (variant !== 'random' && variant != null) return variant as CelebrationVariant;
    const pool: CelebrationVariant[] = ['rocket', 'backflip', 'confetti', 'crown'];
    return pool[Math.floor(Math.random() * pool.length)];
  }, [variant, visible]);

  const lvlBefore = oldLevel ?? levelForXp(oldXp);
  const lvlAfter = newLevel ?? levelForXp(newXp);
  const isLevelUp = lvlAfter > lvlBefore;
  const gain = xpGained ?? Math.max(0, newXp - oldXp);

  const [showLevelUp, setShowLevelUp] = useState(false);

  // SFX + haptics on entrance (skipped in layered/silent mode)
  useEffect(() => {
    if (!visible || silent) return;
    preloadSoundsAsync();
    try {
      // Light haptic immediately so the phone "clicks" with the visual pop
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } catch {}
    // Variant-flavored SFX
    if (pick === 'rocket' || pick === 'confetti') playCheer();
    else playXp();
    if (isLevelUp) {
      const t = setTimeout(() => playLevelUp(), 900);
      return () => clearTimeout(t);
    }
  }, [visible, pick, isLevelUp, silent]);

  // Schedule Level-Up modal after the hero variant lands
  useEffect(() => {
    if (!visible || !isLevelUp) {
      setShowLevelUp(false);
      return;
    }
    const t = setTimeout(() => setShowLevelUp(true), 1450);
    return () => clearTimeout(t);
  }, [visible, isLevelUp]);

  // Auto-dismiss when NOT leveling up
  useEffect(() => {
    if (!visible || isLevelUp) return;
    const t = setTimeout(onDone, autoDismissMs);
    return () => clearTimeout(t);
  }, [visible, isLevelUp, onDone, autoDismissMs]);

  // Screen shake for backflip gem drop — parent listens via shake value
  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Dim backdrop — lets the underlying ProofSuccessModal / screen stay mounted */}
      <View style={styles.backdrop} pointerEvents="none" />

      {/* Shake container — only backflip fires it, but cheap to wrap everything */}
      <Animated.View style={[StyleSheet.absoluteFill, shakeStyle]} pointerEvents="box-none">
        {/* Variant stage */}
        {pick === 'rocket' && <RocketVariant gain={gain} shakeX={shakeX} />}
        {pick === 'backflip' && <BackflipVariant gain={gain} shakeX={shakeX} />}
        {pick === 'confetti' && <ConfettiVariant gain={gain} />}
        {pick === 'crown' && <CrownFlybyVariant gain={gain} lvlAfter={lvlAfter} />}

        {/* Center hero card — shared across variants so XP ticker is always legible.
            Hidden in layered mode (the host modal owns the XP display). */}
        {!hideHeroCard ? (
          <View style={styles.cardWrap} pointerEvents="none">
            <View style={styles.heroCard}>
              {habitName ? (
                <Text style={styles.habitName} numberOfLines={1}>
                  {habitName}
                </Text>
              ) : null}
              <XpTicker oldXp={oldXp} newXp={newXp} style="numeric" prefix="+" suffix=" XP" delayMs={420} />
              <Text style={styles.xpSub}>+{gain} XP earned</Text>
            </View>
          </View>
        ) : null}
      </Animated.View>

      {/* Neubrutalism Level-Up — takes over pointerEvents when shown */}
      {showLevelUp ? (
        <LevelUpModalOverlay lvlBefore={lvlBefore} lvlAfter={lvlAfter} gain={gain} onContinue={onLevelUpDone ?? onDone} />
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Variant A — Rocket Launch
// ─────────────────────────────────────────────────────────────────────────────

function RocketVariant({ gain: _gain, shakeX: _shakeX }: { gain: number; shakeX: SharedValue<number> }) {
  const scale = useSharedValue(0.3);
  const y = useSharedValue(0);
  const trailOpacity = useSharedValue(0);
  const flameScale = useSharedValue(0.8);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 9, stiffness: 200, mass: 0.8 });
    trailOpacity.value = withDelay(420, withTiming(1, { duration: 220 }));
    flameScale.value = withDelay(420, withRepeat(withSequence(withTiming(1.25, { duration: 140 }), withTiming(0.9, { duration: 140 })), -1, true));
    // Launch off screen
    y.value = withDelay(820, withTiming(-SCREEN_H - 240, { duration: 680, easing: Easing.in(Easing.cubic) }));
    trailOpacity.value = withDelay(1200, withTiming(0, { duration: 300 }));
    return () => {
      cancelAnimation(scale);
      cancelAnimation(y);
      cancelAnimation(trailOpacity);
      cancelAnimation(flameScale);
    };
  }, [scale, y, trailOpacity, flameScale]);

  const mascotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: y.value }],
  }));
  const flameStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: flameScale.value }, { scaleX: 0.85 + flameScale.value * 0.15 }],
    opacity: trailOpacity.value,
  }));
  const trailStyle = useAnimatedStyle(() => ({ opacity: trailOpacity.value }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Particle trail */}
      <Animated.View style={[styles.rocketTrail, trailStyle]}>
        {Array.from({ length: 12 }, (_, i) => (
          <TrailSpeck key={i} index={i} />
        ))}
      </Animated.View>
      <Animated.View style={[styles.centerStage, mascotStyle]}>
        <QubiMascot size={132} celebrating pulseGlow />
        {/* Exhaust flame */}
        <Animated.View style={[styles.rocketFlame, flameStyle]}>
          <View style={styles.flameCore} />
          <View style={styles.flameOuter} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

function TrailSpeck({ index }: { index: number }) {
  const fall = useSharedValue(0);
  useEffect(() => {
    fall.value = withDelay(index * 38, withTiming(1, { duration: 900 + (index % 3) * 220, easing: Easing.out(Easing.quad) }));
  }, [fall, index]);
  const s = useAnimatedStyle(() => ({
    transform: [{ translateY: fall.value * 110 + index * 8 }, { translateX: ((index % 3) - 1) * 9 * fall.value }],
    opacity: 1 - fall.value,
  }));
  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
  const size = 6 + (index % 3) * 4;
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, marginVertical: 5 }, s]} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Variant B — 360 Backflip & Gem Drop (haptic shake)
// ─────────────────────────────────────────────────────────────────────────────

function BackflipVariant({ gain: _gain, shakeX }: { gain: number; shakeX: SharedValue<number> }) {
  const rotation = useSharedValue(0);
  const mascotY = useSharedValue(0);
  const gemY = useSharedValue(-260);
  const gemScale = useSharedValue(0.2);
  const gemGlow = useSharedValue(0);
  const impactScale = useSharedValue(0);

  useEffect(() => {
    rotation.value = withTiming(360, { duration: 720, easing: Easing.inOut(Easing.cubic) });
    mascotY.value = withSequence(withTiming(-26, { duration: 280, easing: Easing.out(Easing.cubic) }), withSpring(0, { damping: 10, stiffness: 140 }));
    // Gem drops just as the flip completes
    gemY.value = withDelay(560, withSpring(0, { damping: 7, stiffness: 180, mass: 0.9 }));
    gemScale.value = withDelay(560, withSpring(1, { damping: 6, stiffness: 200 }));
    gemGlow.value = withDelay(560, withTiming(1, { duration: 340 }));
    impactScale.value = withDelay(820, withSequence(withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) }), withTiming(0, { duration: 360 })));

    // Haptic + screen shake on gem slam
    const t = setTimeout(() => {
      try {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      } catch {}
      shakeX.value = withSequence(
        withTiming(-7, { duration: 42 }),
        withTiming(7, { duration: 42 }),
        withTiming(-5, { duration: 42 }),
        withTiming(5, { duration: 32 }),
        withTiming(0, { duration: 50, easing: Easing.out(Easing.cubic) }),
      );
    }, 820);
    return () => {
      clearTimeout(t);
      cancelAnimation(rotation);
      cancelAnimation(mascotY);
      cancelAnimation(gemY);
      cancelAnimation(gemScale);
      cancelAnimation(gemGlow);
      cancelAnimation(impactScale);
      cancelAnimation(shakeX);
    };
  }, [rotation, mascotY, gemY, gemScale, gemGlow, impactScale, shakeX]);

  const mascotStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: mascotY.value }, { rotate: `${rotation.value}deg` }],
  }));
  const gemStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: gemY.value }, { scale: gemScale.value }],
    opacity: gemGlow.value,
  }));
  const impactStyle = useAnimatedStyle(() => ({
    transform: [{ scale: impactScale.value }],
    opacity: impactScale.value,
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.centerStage, mascotStyle]}>
        <QubiMascot size={118} celebrating />
      </Animated.View>

      {/* Giant glowing XP gem + impact ring */}
      <Animated.View style={[styles.gemDrop, gemStyle]}>
        <View style={styles.gemGlow} />
        <View style={styles.gemBody}>
          <Text style={styles.gemEmoji}>💎</Text>
        </View>
        <View style={styles.gemFacet} />
      </Animated.View>
      <Animated.View style={[styles.impactRing, impactStyle]} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Variant C — Confetti Shower & Flame Ignite
// ─────────────────────────────────────────────────────────────────────────────

function ConfettiVariant({ gain: _gain }: { gain: number }) {
  const flameScale = useSharedValue(0.2);
  const flameOpacity = useSharedValue(0);
  const streakGlow = useSharedValue(0);

  useEffect(() => {
    flameScale.value = withDelay(260, withSpring(1, { damping: 7, stiffness: 180 }));
    flameOpacity.value = withDelay(260, withTiming(1, { duration: 320 }));
    streakGlow.value = withDelay(380, withRepeat(withSequence(withTiming(1, { duration: 260 }), withTiming(0.6, { duration: 260 })), 4, true));
    return () => {
      cancelAnimation(flameScale);
      cancelAnimation(flameOpacity);
      cancelAnimation(streakGlow);
    };
  }, [flameScale, flameOpacity, streakGlow]);

  const flameStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.7 + flameScale.value * 0.6 }],
    opacity: flameOpacity.value,
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.18 + streakGlow.value * 0.22 }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Confetti cannon — 28 pieces from top */}
      <View style={styles.confettiCannon}>
        {Array.from({ length: 28 }, (_, i) => (
          <CannonPiece key={i} index={i} />
        ))}
      </View>

      {/* Streak flame ignite — under the hero card */}
      <Animated.View style={[styles.flameStage, flameStyle]}>
        <Animated.View style={[styles.flameGlow, glowStyle]} />
        <View style={styles.flameStreak}>
          <Text style={styles.flameText}>🔥</Text>
        </View>
        {/* Extra streak bars */}
        <View style={styles.streakBarOuter} />
        <View style={styles.streakBarInner} />
      </Animated.View>

      <View style={styles.centerStage}>
        <QubiMascot size={110} celebrating bob />
      </View>
    </View>
  );
}

function CannonPiece({ index }: { index: number }) {
  const fall = useSharedValue(0);
  const sway = useSharedValue(0);
  // Spread across screen; cannon origin is top-center
  const leftPct = 4 + (index * 92) / 27 + ((index * 7) % 6);
  const drift = ((index % 7) - 3) * 18;
  const size = 5 + (index % 4) * 4;
  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
  const isRect = index % 3 !== 0;
  useEffect(() => {
    fall.value = withDelay((index % 9) * 55, withTiming(1, { duration: 1400 + (index % 5) * 240, easing: Easing.in(Easing.quad) }));
    sway.value = withDelay((index % 9) * 55, withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }));
  }, [fall, sway, index]);
  const s = useAnimatedStyle(() => ({
    transform: [{ translateY: fall.value * (SCREEN_H * 0.85) }, { translateX: sway.value * drift }, { rotate: `${fall.value * 420 + index * 33}deg` }],
    opacity: fall.value >= 1 ? 0 : 1,
  }));
  return (
    <Animated.View style={[styles.cannonPiece, { left: `${leftPct}%` as const }, s]}>
      <View style={{ width: size, height: isRect ? size * 1.7 : size, borderRadius: isRect ? 2 : size / 2, backgroundColor: color }} />
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Variant D — Crown Flyby
// ─────────────────────────────────────────────────────────────────────────────

function CrownFlybyVariant({ gain: _gain, lvlAfter }: { gain: number; lvlAfter: number }) {
  const flyX = useSharedValue(-SCREEN_W * 0.7);
  const flyY = useSharedValue(-36);
  const crownY = useSharedValue(-24);
  const crownScale = useSharedValue(0);
  const badgePop = useSharedValue(0);

  useEffect(() => {
    flyX.value = withTiming(SCREEN_W + 120, { duration: 980, easing: Easing.inOut(Easing.cubic) });
    flyY.value = withSequence(withTiming(-52, { duration: 240 }), withTiming(-36, { duration: 240 }));
    // Drop crown mid-flight
    crownY.value = withDelay(520, withSpring(0, { damping: 7, stiffness: 170 }));
    crownScale.value = withDelay(520, withSpring(1, { damping: 6, stiffness: 200 }));
    badgePop.value = withDelay(620, withSequence(withTiming(1, { duration: 160 }), withSpring(0, { damping: 10, stiffness: 220 })));
    return () => {
      cancelAnimation(flyX);
      cancelAnimation(flyY);
      cancelAnimation(crownY);
      cancelAnimation(crownScale);
      cancelAnimation(badgePop);
    };
  }, [flyX, flyY, crownY, crownScale, badgePop]);

  const flyStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: flyX.value }, { translateY: flyY.value }],
  }));
  const crownStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: crownY.value }, { scale: crownScale.value }],
    opacity: crownScale.value,
  }));
  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + badgePop.value * 0.18 }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Rank badge target — top-center */}
      <View style={styles.crownTargetWrap}>
        <Animated.View style={[styles.rankBadge, badgeStyle]}>
          <Text style={styles.rankBadgeText}>{lvlAfter}</Text>
        </Animated.View>
        <Animated.View style={[styles.crownDrop, crownStyle]}>
          <Text style={styles.crownEmoji}>👑</Text>
        </Animated.View>
      </View>

      {/* Flying Qubi */}
      <Animated.View style={[styles.flybyLane, flyStyle]}>
        <QubiMascot size={84} celebrating />
        {/* Speed streak */}
        <View style={styles.speedStreak} />
        <View style={[styles.speedStreak, { top: 22, width: 36, opacity: 0.55 }]} />
      </Animated.View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Neubrutalism Level-Up Modal (spec: thick black border, #FFC800 yellow, hard shadow)
// ─────────────────────────────────────────────────────────────────────────────

function LevelUpModalOverlay({ lvlBefore, lvlAfter, gain: _gain, onContinue }: { lvlBefore: number; lvlAfter: number; gain: number; onContinue: () => void }) {
  const enter = useSharedValue(0);
  const bump = useSharedValue(0);
  const shine = useSharedValue(0);

  useEffect(() => {
    enter.value = withSpring(1, { damping: 13, stiffness: 190, mass: 0.9 });
    bump.value = withDelay(360, withSequence(withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }), withSpring(0, { damping: 8, stiffness: 220 })));
    shine.value = withDelay(520, withRepeat(withTiming(1, { duration: 900 }), -1, true));
    try {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {}
    playLevelUp();
  }, [enter, bump, shine]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.82 + enter.value * 0.18 }, { scale: 1 + bump.value * 0.14 }],
    opacity: enter.value,
  }));
  const shineStyle = useAnimatedStyle(() => ({ opacity: 0.12 + shine.value * 0.18 }));

  return (
    <View style={styles.levelUpRoot} pointerEvents="box-none">
      <View style={styles.levelUpBackdrop} pointerEvents="auto" />
      <View style={styles.levelUpCenter} pointerEvents="box-none">
        {/* Hard drop shadow */}
        <View style={styles.neoShadow} />
        <Animated.View style={[styles.neoCard, cardStyle]} pointerEvents="auto">
          <Animated.View style={[styles.neoShine, shineStyle]} pointerEvents="none" />
          <Text style={styles.levelUpKicker}>LEVEL UP!</Text>
          <View style={styles.levelRow}>
            <View style={styles.levelPillOld}>
              <Text style={styles.levelPillText}>{lvlBefore}</Text>
            </View>
            <Text style={styles.levelArrow}>→</Text>
            <Animated.View style={[styles.levelPillNew, useAnimatedStyle(() => ({ transform: [{ scale: 1 + bump.value * 0.22 }] }))]}> 
              <Text style={styles.levelPillNewText}>{lvlAfter}</Text>
            </Animated.View>
          </View>
          <Text style={styles.levelUpSub}>Qubi is proud of you — keep the streak alive!</Text>
          <Pressable
            onPress={() => {
              try {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              } catch {}
              onContinue();
            }}
            style={styles.neoCta}
          >
            <Text style={styles.neoCtaText}>LET&apos;S GO 🚀</Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  cardWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: SCREEN_H * 0.5 - 78,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 2.5,
    borderColor: NEO_INK,
    borderBottomWidth: 5,
    paddingHorizontal: 22,
    paddingVertical: 16,
    alignItems: 'center',
    minWidth: 220,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  habitName: {
    color: '#78716C',
    fontFamily: fontFamilyFor('w600'),
    fontSize: 12.5,
    letterSpacing: 0.2,
    marginBottom: 6,
    textAlign: 'center',
  },
  xpSub: {
    marginTop: 4,
    color: '#A8A29E',
    fontFamily: fontFamilyFor('w700'),
    fontSize: 11.5,
    letterSpacing: 0.6,
  },

  // Variant stages
  centerStage: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: SCREEN_H * 0.28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rocketTrail: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: SCREEN_H * 0.36,
    alignItems: 'center',
  },
  rocketFlame: {
    position: 'absolute',
    bottom: -28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flameCore: {
    width: 22,
    height: 34,
    borderRadius: 11,
    backgroundColor: '#FFC800',
    borderWidth: 2,
    borderColor: NEO_INK,
    marginBottom: -18,
  },
  flameOuter: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,109,0,0.55)',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.12)',
  },

  // Gem
  gemDrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: SCREEN_H * 0.36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gemGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(56,189,248,0.22)',
  },
  gemBody: {
    width: 78,
    height: 78,
    borderRadius: 18,
    backgroundColor: '#38BDF8',
    borderWidth: 3,
    borderColor: NEO_INK,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0EA5E9',
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  gemEmoji: { fontSize: 38, lineHeight: 44 },
  gemFacet: {
    position: 'absolute',
    top: 10,
    right: 14,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  impactRing: {
    position: 'absolute',
    left: SCREEN_W / 2 - 44,
    top: SCREEN_H * 0.36 + 70,
    width: 88,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: 'rgba(0,0,0,0.18)',
    backgroundColor: 'rgba(0,0,0,0.06)',
  },

  // Confetti cannon
  confettiCannon: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_H * 0.55,
  },
  cannonPiece: { position: 'absolute', top: 12 },
  flameStage: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: SCREEN_H * 0.5 + 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flameGlow: {
    position: 'absolute',
    width: 220,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF6D00',
  },
  flameStreak: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFF7ED',
    borderWidth: 3,
    borderColor: NEO_INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flameText: { fontSize: 36 },
  streakBarOuter: {
    position: 'absolute',
    bottom: -10,
    width: 140,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#FF6D00',
    borderWidth: 2,
    borderColor: NEO_INK,
  },
  streakBarInner: {
    position: 'absolute',
    bottom: -6,
    width: 92,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#FFC800',
  },

  // Crown flyby
  crownTargetWrap: {
    position: 'absolute',
    top: 72,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  rankBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: NEO_INK,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  rankBadgeText: {
    fontFamily: fontFamilyFor('w900'),
    fontSize: 22,
    color: NEO_INK,
  },
  crownDrop: {
    position: 'absolute',
    top: -18,
  },
  crownEmoji: { fontSize: 28, lineHeight: 30, textShadowColor: 'rgba(0,0,0,0.2)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 2 } },
  flybyLane: {
    position: 'absolute',
    top: 56,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  speedStreak: {
    position: 'absolute',
    left: -22,
    top: 34,
    width: 52,
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.08)',
  },

  // Neubrutalism Level-Up
  levelUpRoot: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center' },
  levelUpBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.62)' },
  levelUpCenter: { width: '100%', maxWidth: 360, paddingHorizontal: 24, alignItems: 'center' },
  neoShadow: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: -6,
    bottom: -6,
    backgroundColor: NEO_INK,
    borderRadius: 28,
    // hard shadow: no blur
  },
  neoCard: {
    width: '100%',
    backgroundColor: NEO_YELLOW,
    borderRadius: 28,
    borderWidth: 3.5,
    borderColor: NEO_INK,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
    alignItems: 'center',
    overflow: 'hidden',
  },
  neoShine: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  levelUpKicker: {
    fontFamily: fontFamilyFor('w900'),
    fontSize: 28,
    letterSpacing: -1,
    color: NEO_INK,
    textAlign: 'center',
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 14,
  },
  levelPillOld: {
    minWidth: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: NEO_INK,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.9,
  },
  levelPillText: { fontFamily: fontFamilyFor('w900'), fontSize: 22, color: NEO_INK },
  levelArrow: { fontFamily: fontFamilyFor('w900'), fontSize: 22, color: NEO_INK, marginHorizontal: 2 },
  levelPillNew: {
    minWidth: 68,
    height: 68,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 3.5,
    borderColor: NEO_INK,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  levelPillNewText: { fontFamily: fontFamilyFor('w900'), fontSize: 30, color: NEO_INK },
  levelUpSub: {
    marginTop: 14,
    fontFamily: fontFamilyFor('w700'),
    fontSize: 13,
    lineHeight: 18,
    color: NEO_INK,
    textAlign: 'center',
    opacity: 0.85,
  },
  neoCta: {
    marginTop: 18,
    backgroundColor: NEO_INK,
    borderRadius: 999,
    paddingHorizontal: 28,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: NEO_INK,
  },
  neoCtaText: {
    color: '#FFFFFF',
    fontFamily: fontFamilyFor('w900'),
    fontSize: 14,
    letterSpacing: 1,
  },
});

export default CelebrationOverlay;
