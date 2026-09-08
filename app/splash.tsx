import React, { useEffect, useMemo, useRef } from 'react';
import { Animated as RNAnimated, Easing as RNEasing, StyleSheet, View, Image, Text, useWindowDimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSpring, withTiming, withDelay } from 'react-native-reanimated';
import * as SplashScreen from 'expo-splash-screen';
import { fontFamilyFor } from '../src/theme/typography';

// ═══ QUBI LAUNCH SPLASH — Duolingo style ═══
// Solid Duo Green canvas, big mascot springs in with a playful overshoot,
// "Qubi" wordmark bounces up right after, tagline pill fades in, and a
// white loading bar sweeps while the app boots behind it. No full-bleed
// photo — flat brand green exactly like Duolingo's launch screen.
// Timing contract preserved: holds ≥ minimumDuration, then a 300ms
// cross-fade into the target screen + SplashScreen.hideAsync().
const QUBI = require('../Qubi/Qubi_2.jpg');

export interface SplashProps {
  onFinish?: () => void;
  minimumDuration?: number;
  maxWaitMs?: number;
  backgroundColor?: string;
}

export function Splash({ onFinish, minimumDuration = 1800, maxWaitMs = 2500, backgroundColor = '#58CC02' }: SplashProps) {
  const { width, height } = useWindowDimensions();
  const overlayOpacity = useRef(new RNAnimated.Value(1)).current;
  const finishedRef = useRef(false);
  const fadeStartedRef = useRef(false);

  // Mascot: spring pop-in (0 → overshoot → 1), then a gentle infinite bounce.
  const pop = useSharedValue(0);
  const bounce = useSharedValue(0);
  // Wordmark rises in just after the mascot lands.
  const wordUp = useSharedValue(26);
  const wordIn = useSharedValue(0);
  // Tagline pill fades/scales in last.
  const tagIn = useSharedValue(0);
  // Loading bar sweep.
  const bar = useSharedValue(0);

  useEffect(() => {
    pop.value = withSpring(1, { damping: 9, stiffness: 130, mass: 1 });
    bounce.value = withDelay(
      650,
      withRepeat(withTiming(1, { duration: 1100 }), -1, true),
    );
    wordUp.value = withDelay(250, withSpring(0, { damping: 14, stiffness: 160 }));
    wordIn.value = withDelay(250, withTiming(1, { duration: 320 }));
    tagIn.value = withDelay(600, withSpring(1, { damping: 13, stiffness: 150 }));
    bar.value = withRepeat(withTiming(1, { duration: 1100 }), -1);
  }, [pop, bounce, wordUp, wordIn, tagIn, bar]);

  const mascotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: Math.max(0.01, pop.value) }, { translateY: -8 * bounce.value }],
  }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: wordIn.value,
    transform: [{ translateY: wordUp.value }],
  }));
  const tagStyle = useAnimatedStyle(() => ({
    opacity: tagIn.value,
    transform: [{ scale: Math.max(0.01, tagIn.value) }],
  }));
  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -70 + bar.value * (Math.min(width, 480) - 140 + 140) }],
  }));

  const complete = useMemo(
    () => () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      if (onFinish) onFinish();
      void SplashScreen.hideAsync().catch(() => {});
    },
    [onFinish],
  );

  const startFade = useMemo(
    () => () => {
      if (fadeStartedRef.current) return;
      fadeStartedRef.current = true;
      RNAnimated.timing(overlayOpacity, { toValue: 0, duration: 300, easing: RNEasing.inOut(RNEasing.ease), useNativeDriver: true }).start(() => complete());
    },
    [overlayOpacity, complete],
  );

  useEffect(() => {
    void SplashScreen.preventAutoHideAsync().catch(() => {});
    const t1 = setTimeout(startFade, minimumDuration);
    const t2 = setTimeout(startFade, maxWaitMs);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [minimumDuration, maxWaitMs, startFade]);

  return (
    <RNAnimated.View
      pointerEvents="auto"
      style={[
        StyleSheet.absoluteFill,
        { width, height, backgroundColor, opacity: overlayOpacity, alignItems: 'center', justifyContent: 'center' },
      ]}
    >
      {/* Soft white halo behind the mascot */}
      <View style={styles.halo} pointerEvents="none" />

      <View style={styles.center}>
        <Animated.View style={mascotStyle}>
          <View style={styles.mascotRing}>
            <Image source={QUBI} style={styles.mascot} resizeMode="cover" accessible accessibilityLabel="Qubi mascot" />
          </View>
        </Animated.View>

        <View style={{ height: 18 }} />

        <Animated.View style={wordStyle}>
          <Text style={styles.wordmark}>
            <Text>{'Qubi'}</Text>
          </Text>
        </Animated.View>

        <View style={{ height: 10 }} />

        <Animated.View style={tagStyle}>
          <View style={styles.tagPill}>
            <Text style={styles.tagText}>
              <Text>{'Tiny habits, daily wins'}</Text>
            </Text>
          </View>
        </Animated.View>
      </View>

      {/* Loading bar pinned near the bottom */}
      <View style={styles.barTrack} pointerEvents="none">
        <Animated.View style={[styles.barFill, barStyle]} />
      </View>
    </RNAnimated.View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 170,
    top: '50%',
    marginTop: -230,
    left: '50%',
    marginLeft: -170,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  mascotRing: {
    width: 184,
    height: 184,
    borderRadius: 92,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 6,
    borderColor: 'rgba(255,255,255,0.85)',
    shadowColor: '#1F5C00',
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mascot: {
    width: 172,
    height: 172,
    borderRadius: 86,
  },
  wordmark: {
    color: '#FFFFFF',
    fontSize: 46,
    fontWeight: '900',
    letterSpacing: -1,
    textAlign: 'center',
    fontFamily: fontFamilyFor('w800'),
    textShadowColor: 'rgba(31,92,0,0.35)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 0,
  },
  tagPill: {
    backgroundColor: 'rgba(255,255,255,0.24)',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 999,
  },
  tagText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.4,
    textAlign: 'center',
    fontFamily: fontFamilyFor('w700'),
  },
  barTrack: {
    position: 'absolute',
    bottom: 72,
    width: 180,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
  },
  barFill: {
    width: 70,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
  },
});

export default Splash;
