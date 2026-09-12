import React, { useRef, useState } from 'react';
import { Pressable as RnPressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { QubiMascot } from '../../components/QubiMascot';
import { SceneBackdrop } from '../../components/home/SceneBackdrop';
import { ClayButton } from '../../components/clay/ClayButton';
import { fontFamilyFor } from '../../theme/typography';
import { useGateStore } from '../../state/gateStore';
import { playStepClick } from '../../services/soundService';

/**
 * PlayOnboarding — a clean, confident Duolingo × Liftoff onboarding.
 *
 * Four full-bleed scene slides. Each: a soft illustrated backdrop (SceneBackdrop —
 * swaps to generated art when a Gemini key is added), Qubi centre-stage in a
 * rounded-square liquid-glass frame, a bold Fredoka headline + friendly subtitle.
 * Fixed chrome: progress dots + one clay CTA at the bottom, Skip top-right on all
 * but the last slide. Restraint over clutter — this is the first impression.
 */

type Slide = {
  key: string;
  title: string;
  desc: string;
  cta: string;
  sky: [string, string];
  hill: string;
  hillDeep: string;
  frame: string;
};

const SLIDES: Slide[] = [
  {
    key: 'welcome',
    title: 'Meet Qubi',
    desc: 'Your tiny habits, leveled up.\nProve it daily and watch Qubi grow.',
    cta: 'Continue',
    sky: ['#FFE7BF', '#FFF3E2'], hill: '#8AD86B', hillDeep: '#63C244', frame: 'rgba(255,255,255,0.32)',
  },
  {
    key: 'proof',
    title: 'Snap proof, earn XP',
    desc: 'Verify real habits with a photo.\nNo cheating your future self.',
    cta: 'Continue',
    sky: ['#CDEBFF', '#EAF7FF'], hill: '#7FD0F5', hillDeep: '#4FB6E8', frame: 'rgba(255,255,255,0.38)',
  },
  {
    key: 'streak',
    title: 'Build unstoppable streaks',
    desc: 'Keep the flame alive, climb the\nleagues, and flex on your friends.',
    cta: 'Continue',
    sky: ['#FFD9C2', '#FFF0E6'], hill: '#FFB27A', hillDeep: '#FF8A3D', frame: 'rgba(255,255,255,0.34)',
  },
  {
    key: 'widget',
    title: 'Qubi on your Home Screen',
    desc: 'One glance keeps you on track —\njust like the pros do it.',
    cta: 'Get Started',
    sky: ['#E7DCFF', '#F4EEFF'], hill: '#B79BFF', hillDeep: '#9B6BFF', frame: 'rgba(255,255,255,0.34)',
  },
];

export function PlayOnboarding({ onDone }: { onDone?: () => void }) {
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;

  const bob = useSharedValue(0);
  React.useEffect(() => {
    bob.value = withRepeat(withSequence(withTiming(1, { duration: 1500 }), withTiming(0, { duration: 1500 })), -1, true);
  }, [bob]);
  const bobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -8 * bob.value }] }));

  const goTo = (i: number) => scrollRef.current?.scrollTo({ x: i * W, animated: true });

  const onMomentum = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.min(SLIDES.length - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.x / W)));
    if (i !== index) { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setIndex(i); }
  };

  const finish = () => {
    void AsyncStorage.setItem('hasCompletedOnboarding', 'true').catch(() => {});
    useGateStore.getState().completeWalkthrough();
    onDone?.();
  };

  const onCta = () => {
    playStepClick();
    if (!last) { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); goTo(index + 1); }
    else { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); finish(); }
  };

  const onSkip = () => { playStepClick(); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); finish(); };

  const slide = SLIDES[index];

  return (
    <View style={styles.flex}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentum}
        style={styles.flex}
      >
        {SLIDES.map((s) => (
          <View key={s.key} style={{ width: W, height: H }}>
            <SceneBackdrop sky={s.sky} hill={s.hill} hillDeep={s.hillDeep} radius={0} />
            <View style={[styles.slideContent, { paddingTop: insets.top + 96 }]}>
              <BlurView intensity={30} tint="light" style={[styles.mascotFrame, { borderColor: s.frame }]}>
                <Animated.View style={bobStyle}>
                  <QubiMascot size={168} celebrating bob />
                </Animated.View>
              </BlurView>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Skip — top-right, hidden on last slide */}
      {!last ? (
        <RnPressable onPress={onSkip} hitSlop={12} style={[styles.skip, { top: insets.top + 12 }]} accessibilityRole="button" accessibilityLabel="Skip">
          <Text style={styles.skipText}>Skip</Text>
        </RnPressable>
      ) : null}

      {/* Bottom chrome: copy + dots + CTA (overlaid so it's fixed across slides) */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 20 }]} pointerEvents="box-none">
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.desc}>{slide.desc}</Text>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        <ClayButton label={slide.cta} onPress={onCta} hue={last ? 'green' : 'orange'} haptic="medium" />
        {last ? (
          <RnPressable onPress={() => { playStepClick(); finish(); }} hitSlop={10} style={styles.loginRow}>
            <Text style={styles.loginText}>Already have an account? <Text style={styles.loginLink}>Log in</Text></Text>
          </RnPressable>
        ) : (
          <View style={styles.loginRow} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#FFF3E2' },
  slideContent: { flex: 1, alignItems: 'center' },
  mascotFrame: {
    width: 232, height: 232, borderRadius: 48, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
  },
  skip: {
    position: 'absolute', right: 20, paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: 999,
  },
  skipText: { fontFamily: fontFamilyFor('w700'), fontSize: 14, color: '#5A3410' },
  bottom: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 26, paddingTop: 22,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.0)',
  },
  title: { fontFamily: fontFamilyFor('w800'), fontSize: 28, color: '#3A2A1A', textAlign: 'center', letterSpacing: -0.6 },
  desc: { fontFamily: fontFamilyFor('w600'), fontSize: 15, lineHeight: 22, color: '#8A6A4A', textAlign: 'center', marginTop: 10 },
  dots: { flexDirection: 'row', gap: 8, marginTop: 20, marginBottom: 22 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(90,52,16,0.20)' },
  dotActive: { width: 26, backgroundColor: '#FF8A3D' },
  loginRow: { height: 34, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  loginText: { fontFamily: fontFamilyFor('w600'), fontSize: 13.5, color: '#8A6A4A' },
  loginLink: { fontFamily: fontFamilyFor('w800'), color: '#EA580C' },
});

export default PlayOnboarding;
