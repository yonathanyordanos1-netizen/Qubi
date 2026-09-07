import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

const QUBI_OPEN = require('../../assets/images/qubi_open.jpg');
const QUBI_CLOSED = require('../../assets/images/qubi_closed.jpg');

// Matches the Rive artboard gradient wash. Used as the overlay bleed so the
// top/bottom safe-area bands blend seamlessly with the dipped splash edges.
const BLEED = '#EE6C13';

export interface SplashScreenProps {
  /** Total duration before the slide-up exit completes (ms). Sync with App's unmount timer. */
  duration?: number;
}

/**
 * Qubi launch splash — native recreation of the Rive "SplashAnimation"
 * (no .riv export needed). The Rive blink cross-fades the closed-eye mascot
 * frame over the open-eye frame twice; here the same two art assets
 * (qubi_open / qubi_closed) are stacked and opacity-faded in sync:
 *
 *   0.40–0.57s  blink #1 (closed eyes fade in/out)
 *   0.77–0.93s  blink #2
 *   2.00s       content slides up in a cubic ease-in-out over 0.5s
 *   2.30s       …while fading to nothing; overlay unmounts at `duration`.
 *
 * The parent mounts this as a full-screen overlay and unmounts it right at
 * `duration` (App.tsx: 2500ms).
 */
export function SplashScreen({ duration = 2500 }: SplashScreenProps) {
  const { width, height } = useWindowDimensions();
  const fade = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const closedOpacity = useRef(new Animated.Value(0)).current;

  // Edge-to-edge: the mascot art fills the full screen (Fit.Cover behaviour).
  // Art is 768x1376 portrait, so it scales to cover the shorter dimension and
  // the taller dimension overflows — the gradient bleed swallows the excess.
  const scale = Math.max(width / 768, height / 1376);
  const renderW = 768 * scale;
  const renderH = 1376 * scale;
  const slideOffset = height; // Rive exits -1200px off a 874px artboard; full height is clean.

  useEffect(() => {
    // Blink = cross-fade of the closed-eye art over the open-eye art, matching
    // the Rive keyframes (frames 24→34 and 46→56 at 60fps).
    const blink = (fadeInAt: number) =>
      Animated.sequence([
        Animated.delay(fadeInAt),
        Animated.timing(closedOpacity, { toValue: 1, duration: 50, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.delay(70),
        Animated.timing(closedOpacity, { toValue: 0, duration: 50, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ]);

    const anim = Animated.parallel([
      blink(400),
      blink(770),
      Animated.timing(translateY, {
        toValue: -slideOffset,
        duration: 500,
        delay: 2000,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(fade, {
        toValue: 0,
        duration: 200,
        delay: 2300,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
    ]);

    anim.start();

    // Clean up if the parent unmounts early (e.g. native splash hide).
    const nodes = [fade, translateY, closedOpacity];
    return () => {
      anim.stop();
      nodes.forEach((n) => n.stopAnimation());
    };
  }, [fade, translateY, closedOpacity, slideOffset]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay]}>
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: fade, transform: [{ translateY }] }]}
        pointerEvents="auto"
      >
        {/* Mascot art, edge-to-edge, centered horizontally. */}
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <View style={{ width: renderW, height: renderH }}>
            {/* Open eyes — baseline frame, always visible. */}
            <Image
              source={QUBI_OPEN}
              style={[StyleSheet.absoluteFill, styles.mascot]}
              resizeMode="cover"
              accessible={false}
            />
            {/* Closed eyes — cross-faded in twice by the blink above. */}
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: closedOpacity }]}>
              <Image
                source={QUBI_CLOSED}
                style={[StyleSheet.absoluteFill, styles.mascot]}
                resizeMode="cover"
                accessible
                accessibilityLabel="Qubi"
              />
            </Animated.View>
          </View>
          <Text style={styles.wordmark}>Qubi</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    width: '100%',
    height: '100%',
    // Bleed — top/bottom safe-area bands match the orange wash seamlessly,
    // so the splash draws edge-to-edge behind the status bar.
    backgroundColor: BLEED,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  mascot: {
    width: '100%',
    height: '100%',
  },
  wordmark: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    marginTop: 26,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
});

export default SplashScreen;