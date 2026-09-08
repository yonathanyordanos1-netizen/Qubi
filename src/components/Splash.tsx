import React, { useEffect, useMemo, useRef } from 'react';
import { Animated as RNAnimated, StyleSheet, View, Image, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import * as SplashScreen from 'expo-splash-screen';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface SplashProps {
  onFinish: () => void;
  minimumDuration?: number;
  maxWaitMs?: number;
  backgroundColor?: string;
}

// Crash-fix: use Qubi_2.jpg (not png) from ./Qubi — Expo Go asset resolution
const QUBI = require('../../Qubi/Qubi_2.jpg');

export function Splash({ onFinish, minimumDuration = 2500, maxWaitMs = 3000, backgroundColor = '#58CC02' }: SplashProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const overlayOpacity = useRef(new RNAnimated.Value(1)).current;
  const scale = useRef(new RNAnimated.Value(0.92)).current;
  const finishedRef = useRef(false);
  const fadeStartedRef = useRef(false);

  const pulseOpacity = useSharedValue(0.08);
  useEffect(() => {
    pulseOpacity.value = withRepeat(withTiming(0.18, { duration: 1600, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [pulseOpacity]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));

  useEffect(() => {
    RNAnimated.spring(scale, { toValue: 1, damping: 14, stiffness: 90, useNativeDriver: true }).start();
  }, [scale]);

  const complete = useMemo(
    () => () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      onFinish();
      void SplashScreen.hideAsync().catch(() => {});
    },
    [onFinish],
  );
  const startFade = useMemo(
    () => () => {
      if (fadeStartedRef.current) return;
      fadeStartedRef.current = true;
      RNAnimated.timing(overlayOpacity, { toValue: 0, duration: 420, useNativeDriver: true }).start(() => complete());
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

  const mascotSize = Math.min(width * 0.68, 300);
  return (
    <RNAnimated.View pointerEvents="auto" style={[StyleSheet.absoluteFill, { width, height, backgroundColor, opacity: overlayOpacity, alignItems: 'center', justifyContent: 'center' }]}>
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', width: mascotSize * 1.55, height: mascotSize * 1.55, borderRadius: mascotSize * 0.78, backgroundColor: 'rgba(255,255,255,0.16)', top: height * 0.5 - mascotSize * 0.78 - 18, left: width * 0.5 - mascotSize * 0.78 },
          pulseStyle,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', width: mascotSize * 1.25, height: mascotSize * 1.25, borderRadius: mascotSize * 0.625, backgroundColor: 'rgba(255,255,255,0.10)', top: height * 0.5 - mascotSize * 0.625 - 18, left: width * 0.5 - mascotSize * 0.625 },
          pulseStyle,
        ]}
      />
      <RNAnimated.View style={{ alignItems: 'center', justifyContent: 'center', width: '100%', transform: [{ scale }] }}>
        <View style={{ width: mascotSize, height: mascotSize, borderRadius: 48, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.04)', shadowColor: '#7C2D12', shadowOpacity: 0.32, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, elevation: 12, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}>
          <Image source={QUBI} style={{ width: mascotSize, height: mascotSize, borderRadius: 48, alignSelf: 'center', transform: [{ translateX: -4 }] }} resizeMode="cover" accessible accessibilityLabel="Qubi mascot" />
        </View>
      </RNAnimated.View>
      <RNAnimated.View style={{ marginTop: 22, alignItems: 'center', transform: [{ scale }] }}>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999 }}>
          <RNAnimated.Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '800', letterSpacing: -0.8, textAlign: 'center' }}>Qubi</RNAnimated.Text>
        </View>
      </RNAnimated.View>
      <View style={[styles.bottomBranding, { paddingBottom: insets.bottom + 12 }]} />
    </RNAnimated.View>
  );
}

const styles = StyleSheet.create({
  bottomBranding: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', paddingHorizontal: 24 },
});

export default Splash;
