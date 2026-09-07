import React, { useEffect, useMemo, useRef } from 'react';
import { Animated as RNAnimated, Easing as RNEasing, StyleSheet, View, Image, Text, useWindowDimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';
import { fontFamilyFor } from '../src/theme/typography';

// ═══ SPEC §1 — SINGLE SOURCE OF TRUTH FOR THE QUBI LAUNCH SPLASH ═══
// Rendered the instant the root layout mounts — BEFORE any auth state
// evaluation, Supabase getSession() fetch, or navigation handoff.
// • Edge-to-edge: StyleSheet.absoluteFillObject extends under status bar / notch / home indicator
// • Canvas: Qubi Orange #F97316 with a full-bleed Qubi_2.jpg "cover" fill
// • Headspace-style warm radial glow + Duolingo breathing pulse (reanimated spring loop, scale 1.0 → 1.04)
// • Holds ≥ 1.8s while supabase.auth.getSession() resolves in the parent, then a
//   300ms cross-fade into the target screen (gated handoff: session → (tabs) · no session → intro/auth)
//   followed by SplashScreen.hideAsync().
const QUBI = require('../Qubi/Qubi_2.jpg');

export interface SplashProps {
  onFinish?: () => void;
  minimumDuration?: number;
  maxWaitMs?: number;
  backgroundColor?: string;
}

export function Splash({ onFinish, minimumDuration = 1800, maxWaitMs = 2500, backgroundColor = '#F97316' }: SplashProps) {
  const { width, height } = useWindowDimensions();
  const overlayOpacity = useRef(new RNAnimated.Value(1)).current;
  const finishedRef = useRef(false);
  const fadeStartedRef = useRef(false);

  // Duolingo breathing — subtle continuous 3D pulse via reanimated SPRING physics (scale 1.0 → 1.04)
  const breathe = useSharedValue(1);
  useEffect(() => {
    breathe.value = withRepeat(
      withSpring(1.04, { damping: 11, stiffness: 90, mass: 1 }),
      -1,
      true,
    );
  }, [breathe]);

  const breatheStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breathe.value }],
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
      // Spec: exactly 300ms smooth cross-fade
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
      {/* Full-bleed Qubi_2.jpg — edge-to-edge cover, extends under status bar / notch / home indicator */}
      <Image
        source={QUBI}
        style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]}
        resizeMode="cover"
        accessible={false}
      />
      {/* Orange scrim so the white squircle + wordmark pop on any Qubi_2.jpg crop */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor, opacity: 0.14 }]} pointerEvents="none" />
      {/* Headspace-style warm radial glow behind the mascot — soft-focus calm */}
      <LinearGradient
        colors={['rgba(253,186,116,0.55)', 'rgba(249,115,22,0)']}
        style={styles.glow}
        pointerEvents="none"
      />

      {/* Center column: breathing 120×120 mascot squircle + Qubi wordmark — strict center alignment */}
      <View style={[styles.center, { width: '100%', alignSelf: 'center' }]}>
        <Animated.View style={breatheStyle}>
          <View style={styles.squircle}>
            <Image
              source={QUBI}
              style={[styles.mascot, { alignSelf: 'center' }]}
              resizeMode="cover"
              accessible
              accessibilityLabel="Qubi mascot"
            />
          </View>
        </Animated.View>

        {/* Typography: Qubi bold white rounded geometric 34/900/-0.5 */}
        <Text
          style={{
            color: '#FFFFFF',
            fontSize: 34,
            fontWeight: '900',
            letterSpacing: -0.5,
            textAlign: 'center',
            fontFamily: fontFamilyFor('w800'),
          }}
        >
          <Text>{'Qubi'}</Text>
        </Text>
      </View>
    </RNAnimated.View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Warm glow halo — centered on the mascot (slightly above screen center due to the wordmark)
  glow: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    top: '50%',
    marginTop: -200,
    left: '50%',
    marginLeft: -160,
  },
  squircle: {
    width: 120,
    height: 120,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    shadowColor: '#7C2D12',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mascot: {
    width: 120,
    height: 120,
    borderRadius: 32,
  },
});

export default Splash;
