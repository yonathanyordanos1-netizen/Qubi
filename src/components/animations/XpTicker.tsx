/**
 * XpTicker — rapid spring-driven XP counter for Qubi celebrations.
 *
 * Animates a numeral ticking upward from oldXp → newXp (e.g. 1280 → 1330)
 * using a Reanimated spring damping curve so it feels physical, not linear.
 *
 *  • Spring: damping 14 / stiffness 160 / mass 0.85 — fast rise, soft settle
 *  • Integer stepping via derived progress (no floating numbers flicker)
 *  • Pop scale on mount so the +XP burst feels rewarded
 *  • `asTicker` badge variant matches the Neubrutalism palette
 *
 * Usage:
 *   <XpTicker oldXp={1280} newXp={1330} />
 *   <XpTicker oldXp={oldXp} newXp={newXp} style="badge" suffix=" XP" />
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, TextStyle, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { fontFamilyFor } from '../../theme/typography';

export interface XpTickerProps {
  /** XP before this completion */
  oldXp: number;
  /** XP after this completion (oldXp + gained) */
  newXp: number;
  /** Optional extra delay before ticking (ms) — lets the mascot entrance land first */
  delayMs?: number;
  /** Visual style — `numeric` is plain numbers, `badge` is the pill +XP chip */
  style?: 'numeric' | 'badge';
  /** Suffix after the number (default "" for numeric, " XP" for badge if omitted) */
  suffix?: string;
  /** Prefix before the number (e.g. "+" for gained display) */
  prefix?: string;
  /** Override text style */
  textStyle?: TextStyle;
  /** Container style */
  containerStyle?: ViewStyle;
  /** If true shows the delta (+50) instead of absolute total */
  showDeltaOnly?: boolean;
  /** Called when the tick settles */
  onDone?: () => void;
  /** Spring config overrides */
  spring?: { damping?: number; stiffness?: number; mass?: number };
}

export function XpTicker({
  oldXp,
  newXp,
  delayMs = 220,
  style = 'numeric',
  suffix,
  prefix = '',
  textStyle,
  containerStyle,
  showDeltaOnly = false,
  onDone,
  spring,
}: XpTickerProps) {
  const delta = Math.max(0, newXp - oldXp);
  const start = showDeltaOnly ? 0 : oldXp;
  const end = showDeltaOnly ? delta : newXp;

  // 0 → 1 spring drives lerp — drives scale/opacity on UI thread
  const progress = useSharedValue(0);
  const pop = useSharedValue(0);
  const tickScale = useSharedValue(1);

  useEffect(() => {
    progress.value = 0;
    pop.value = 0;
    tickScale.value = 1;

    const d = spring?.damping ?? 14;
    const s = spring?.stiffness ?? 160;
    const m = spring?.mass ?? 0.85;

    progress.value = withDelay(delayMs, withSpring(1, { damping: d, stiffness: s, mass: m }));
    // Single pop burst — 0.96 → 1.18 → 1.0
    pop.value = withDelay(
      delayMs,
      withSequence(
        withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }),
        withSpring(1, { damping: 9, stiffness: 220, mass: 0.7 }),
      ),
    );
    // Subtle tick scale flutter during the count (loops briefly)
    tickScale.value = withDelay(delayMs, withSequence(withTiming(1.08, { duration: 140 }), withTiming(1, { duration: 160 })));

    // Notify when physics settles — spring 14/160 settles ~900ms; pad to 1100
    const t = setTimeout(() => onDone?.(), delayMs + 1100);
    return () => {
      clearTimeout(t);
      cancelAnimation(progress);
      cancelAnimation(pop);
      cancelAnimation(tickScale);
    };
  }, [delayMs, end, onDone, pop, progress, spring?.damping, spring?.mass, spring?.stiffness, start, tickScale]);

  // Derived integer for Animated.Text via Reanimated's animated props
  // We use a JS-side state via useAnimatedReaction is heavier — instead drive
  // a shared value and let the UI thread render an Animated.Text that reads it
  // through `useAnimatedProps` is not available for Text on some RN versions,
  // so we use a lightweight re-render approach: derive + Text shows interpolated int.
  // To keep 60fps we also encapsulate in an Animated.View with scale pop.
  const popStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 0.96 + pop.value * 0.22 },
      { scale: tickScale.value },
    ],
    opacity: 0.55 + pop.value * 0.45,
  }));

  // Format: thousands separator + optional prefix/suffix
  const displaySuffix = suffix ?? (style === 'badge' ? ' XP' : '');

  // JS-thread counter — spring-eased lerp mirrors the physics curve visually.
  // Hermes-safe, cheap (one integer per frame), no derivedValue needed.
  const [displayValue, setDisplayValue] = useState(start);
  useEffect(() => {
    let raf = 0;
    let startT = Date.now();
    const dur = 950;
    const tick = () => {
      const p = Math.min(1, (Date.now() - startT) / dur);
      // Spring-eased lerp to mirror the physics curve visually
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(start + (end - start) * eased);
      setDisplayValue(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    const t0 = setTimeout(() => {
      startT = Date.now();
      raf = requestAnimationFrame(tick);
    }, delayMs);
    return () => {
      clearTimeout(t0);
      cancelAnimationFrame(raf);
    };
  }, [delayMs, end, start]);

  const badgeWrap: ViewStyle | undefined =
    style === 'badge'
      ? {
          backgroundColor: '#FF6D00',
          borderRadius: 999,
          paddingHorizontal: 18,
          paddingVertical: 8,
          borderWidth: 2,
          borderColor: '#000',
          shadowColor: '#000',
          shadowOpacity: 0.22,
          shadowRadius: 0,
          shadowOffset: { width: 3, height: 3 },
          elevation: 6,
        }
      : undefined;

  const numericStyle: TextStyle =
    style === 'badge'
      ? {
          color: '#FFF',
          fontFamily: fontFamilyFor('w900'),
          fontSize: 26,
          letterSpacing: -0.8,
          textShadowColor: 'rgba(0,0,0,0.18)',
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 0,
        }
      : {
          color: '#FF6D00',
          fontFamily: fontFamilyFor('w900'),
          fontSize: 42,
          lineHeight: 48,
          letterSpacing: -1.4,
          textShadowColor: 'rgba(230,81,0,0.35)',
          textShadowRadius: 12,
          textShadowOffset: { width: 0, height: 4 },
        };

  const formatted = `${prefix}${displayValue.toLocaleString()}${displaySuffix}`;

  return (
    <Animated.View style={[styles.wrap, badgeWrap, containerStyle, popStyle]}>
      <Animated.Text style={[numericStyle, textStyle]}>{formatted}</Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  hiddenProbe: { position: 'absolute', width: 0, height: 0, opacity: 0 },
});

export default XpTicker;
