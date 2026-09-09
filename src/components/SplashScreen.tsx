import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { fontFamilyFor } from '../theme/typography';

const QUBI = require('../../Qubi/Qubi_2.jpg');

// Qubi quest-orange launch splash (was Duolingo green — didn't match theme).
// Keep the export shape + slide-up exit contract (App.tsx unmounts this at
// ~2500ms via `duration`).
const QUBI_ORANGE = '#F97316';
const QUBI_ORANGE_DEEP = '#EA580C';

export interface SplashScreenProps {
  /** Total duration before the slide-up exit completes (ms). Sync with App's unmount timer. */
  duration?: number;
}

/**
 * Qubi launch splash — quest-orange style: warm orange gradient canvas, big
 * mascot springs in with a playful overshoot + gentle bounce, "Qubi" wordmark
 * pops up right after, tagline pill fades in, white loading bar sweeps near
 * the bottom. Exits with the signature slide-up at `duration - 500ms`.
 */
export function SplashScreen({ duration = 2500 }: SplashScreenProps) {
  const { height } = useWindowDimensions();
  const fade = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const bounce = useRef(new Animated.Value(0)).current;
  const wordUp = useRef(new Animated.Value(26)).current;
  const wordIn = useRef(new Animated.Value(0)).current;
  const tagIn = useRef(new Animated.Value(0)).current;
  const bar = useRef(new Animated.Value(0)).current;

  const slideOffset = height;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(pop, { toValue: 1, damping: 9, stiffness: 130, mass: 1, useNativeDriver: true }),
      Animated.loop(
        Animated.sequence([
          Animated.delay(650),
          Animated.timing(bounce, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(bounce, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ),
      Animated.sequence([
        Animated.delay(250),
        Animated.parallel([
          Animated.spring(wordUp, { toValue: 0, damping: 14, stiffness: 160, useNativeDriver: true }),
          Animated.timing(wordIn, { toValue: 1, duration: 320, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        ]),
      ]),
      Animated.sequence([
        Animated.delay(600),
        Animated.spring(tagIn, { toValue: 1, damping: 13, stiffness: 150, useNativeDriver: true }),
      ]),
      Animated.loop(
        Animated.timing(bar, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ),
      // Signature slide-up exit.
      Animated.timing(translateY, {
        toValue: -slideOffset,
        duration: 500,
        delay: Math.max(0, duration - 500),
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(fade, {
        toValue: 0,
        duration: 200,
        delay: Math.max(0, duration - 200),
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [pop, bounce, wordUp, wordIn, tagIn, bar, translateY, fade, slideOffset, duration]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay]}>
      {/* Warm quest-orange gradient wash (light top → deep ember bottom) */}
      <LinearGradient
        colors={[QUBI_ORANGE, QUBI_ORANGE_DEEP]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.centerWrap, { opacity: fade, transform: [{ translateY }] }]}
        pointerEvents="auto"
      >
        <View style={styles.halo} pointerEvents="none" />
        {/* Soft sun rays behind the mascot (Qubi star-glow motif) */}
        <View style={styles.rayWrap} pointerEvents="none">
          {[0, 45, 90, 135].map((deg) => (
            <View key={deg} style={[styles.ray, { transform: [{ rotate: `${deg}deg` }] }]} />
          ))}
        </View>
        <Animated.View
          style={{
            transform: [
              { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.01, 1] }) },
              { translateY: bounce.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) },
            ],
          }}
        >
          <View style={styles.mascotRing}>
            <Image source={QUBI} style={styles.mascot} resizeMode="cover" accessible accessibilityLabel="Qubi" />
          </View>
        </Animated.View>

        <View style={{ height: 18 }} />

        <Animated.View style={{ opacity: wordIn, transform: [{ translateY: wordUp }] }}>
          <Text style={styles.wordmark}>Qubi</Text>
        </Animated.View>

        <View style={{ height: 10 }} />

        <Animated.View
          style={{
            opacity: tagIn,
            transform: [{ scale: tagIn.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
          }}
        >
          <View style={styles.tagPill}>
            <Text style={styles.tagText}>Tiny habits, daily wins</Text>
          </View>
        </Animated.View>

        <View style={styles.barTrack} pointerEvents="none">
          <Animated.View
            style={[
              styles.barFill,
              {
                transform: [
                  {
                    translateX: bar.interpolate({ inputRange: [0, 1], outputRange: [-70, 180] }),
                  },
                ],
              },
            ]}
          />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    width: '100%',
    height: '100%',
    backgroundColor: QUBI_ORANGE,
  },
  centerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  rayWrap: {
    position: 'absolute',
    width: 420,
    height: 420,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ray: {
    position: 'absolute',
    width: 420,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  mascotRing: {
    width: 184,
    height: 184,
    borderRadius: 92,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 6,
    borderColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7C2D12',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
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
    textShadowColor: 'rgba(124,45,18,0.35)',
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 3 },
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

export default SplashScreen;
