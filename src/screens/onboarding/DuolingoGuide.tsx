import React, { useRef, useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppColors, withAlpha } from '../../theme/colors';
import { fontFamilyFor } from '../../theme/typography';
import { useTheme } from '../../theme/ThemeProvider';
import { useGateStore } from '../../state/gateStore';
import { QubiMascot } from '../../components/QubiMascot';
import { playStepClick } from '../../services/soundService';

/**
 * DuolingoGuide — 4-step onboarding carousel (Neubrutalism edition).
 * Routing: "Get Started"/"Skip" persist the hasCompletedOnboarding flag
 * (gateStore → AsyncStorage) then transition to Sign Up; slide-4 link goes
 * to Log In. Cards: 2.5px black borders, hard 4×4 offset shadows, r20.
 * Skip shows on steps 1–3 only.
 *
 * Slide 4 is the "Add the Widget" how-to: a full Duolingo-style widget mock
 * (orange card, bold "N Days", Mo–Fr ✓ chain, mascot) above three numbered
 * steps that mirror exactly how you pin a widget on iOS/Android.
 */

const { width: W, height: H } = Dimensions.get('window');
// Compact hero on short screens (SE) so the card never overflows.
const VISUAL_H = Math.max(88, Math.min(120, H * 0.15));
const CARD_MAX_W = Math.min(320, W - 48);

const SLIDES = [
  { title: 'Build Daily Habits', desc: 'Lock in streaks and crush your daily goal — Qubi keeps you accountable every single day.' },
  { title: 'Earn XP & Level Up', desc: 'Every verified quest earns 10–120 XP based on effort. Level up and unlock avatar rewards.' },
  { title: 'Compete with Friends', desc: 'Climb the leaderboard, take on friend challenges and win weekly leagues.' },
  { title: 'Add the Streak Widget', desc: 'Pin Qubi to your Home Screen like Duolingo does — your streak, always one glance away.' },
] as const;

/** expo-router navigation when available; no-op in the classic-entry build */
const routerPush = (href: string) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const r = (require('expo-router') as { router?: { push?: (h: string) => void } }).router;
    if (r?.push != null) r.push(href);
  } catch {}
};

/** Persist the hasCompletedOnboarding flag (spec + gateStore), then route onward */
const finishGuide = (onCustom: (() => void) | undefined, href: string) => {
  // Spec requires hasCompletedOnboarding:true in AsyncStorage/MMKV
  void AsyncStorage.setItem('hasCompletedOnboarding', 'true').catch(() => {});
  void AsyncStorage.setItem('Qubi.hasCompletedOnboarding', 'true').catch(() => {});
  useGateStore.getState().completeWalkthrough();
  if (onCustom != null) onCustom();
  else {
    // Prefer replace for Get Started to avoid back to onboarding
    try {
      const r = (require('expo-router') as { router?: { push?: (h: string) => void; replace?: (h: string) => void } }).router;
      if (href === '/auth/signup' && r?.replace) r.replace(href);
      else if (r?.push) r.push(href);
      else routerPush(href);
    } catch {
      routerPush(href);
    }
  }
};

export function DuolingoGuide({ onGetStarted, onSkip, onLogin, onDone }: { onGetStarted?: () => void; onSkip?: () => void; onLogin?: () => void; onDone?: () => void }) {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const ctaPressY = useSharedValue(0);
  const ctaAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ctaPressY.value }] }));

  const goTo = (i: number) => {
    scrollRef.current?.scrollTo({ x: i * W, animated: true });
  };

  const handleMomentum = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.min(SLIDES.length - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.x / W)));
    if (i !== index) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setIndex(i);
    }
  };

  const handleCta = () => {
    playStepClick();
    if (index < SLIDES.length - 1) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      goTo(index + 1);
    } else {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      finishGuide(onGetStarted ?? onDone, '/auth/signup');
    }
  };

  const handleSkip = () => {
    playStepClick();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    finishGuide(onSkip ?? onDone, '/auth/signup');
  };

  const handleLogin = () => {
    playStepClick();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    finishGuide(onLogin, '/auth/login');
  };

  const canvas = isDark ? AppColors.canvasDark : '#FFF7ED';
  const last = index === SLIDES.length - 1;

  return (
    <View style={[styles.flex, { backgroundColor: canvas }]}>
      {/* Top bar: chunky Neubrutalist progress segments + Skip (steps 1–3 only) */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12, paddingHorizontal: 24 }]}>
        <View style={styles.progressRow}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.progressSegment,
                { backgroundColor: i <= index ? '#F97316' : isDark ? 'rgba(255,255,255,0.12)' : '#FFFFFF' },
              ]}
            />
          ))}
        </View>
        {!last ? (
          <TouchableOpacity onPress={handleSkip} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.skipButton}>
            <Text style={styles.skipText}><Text>{'Skip'}</Text></Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.skipPlaceholder} />
        )}
      </View>

      {/* 4-slide carousel — Neubrutalist card per slide */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentum}
        style={styles.flex}
      >
        {SLIDES.map((slide, i) => (
          <View key={slide.title} style={[styles.slide, { width: W }]}>
            <View style={[styles.guideCard, { maxWidth: CARD_MAX_W }]}>
              {/* Hero: rounded-square liquid-glass tile with mascot */}
              <View style={[styles.heroTile, { height: VISUAL_H }]}>
                {i === 0 ? <QubiMascot size={76} bob /> : i === 1 ? <QubiMascot size={76} pulseGlow /> : i === 2 ? <QubiMascot size={76} celebrating /> : <WidgetPreview />}
                {i === 0 ? (
                  <View style={styles.accentPos}><FlamePulse /></View>
                ) : i === 1 ? (
                  <View style={styles.accentPos}><FloatXpChip /></View>
                ) : i === 2 ? (
                  <View style={styles.accentPos}><TrophyChip /></View>
                ) : null}
              </View>

              {/* Slide stat rows */}
              {i === 0 ? <StreakRows /> : i === 1 ? <XpRows /> : i === 2 ? <LeaderRows /> : <WidgetSteps />}

              <View style={styles.cardSpacer} />
              <Text style={styles.slideTitle}><Text>{slide.title}</Text></Text>
              <View style={{ height: 8 }} />
              <Text style={styles.slideDesc}><Text>{slide.desc}</Text></Text>
              <View style={{ height: 16 }} />

              {/* Full-width Neubrutalist CTA with hard offset shadow + tactile press */}
              <View style={{ width: '100%', marginTop: 8 }}>
                <Animated.View style={ctaAnimatedStyle}>
                  <TouchableOpacity
                    activeOpacity={0.95}
                    onPressIn={() => { ctaPressY.value = withSpring(3, { damping: 18, stiffness: 420 }); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }}
                    onPressOut={() => { ctaPressY.value = withSpring(0, { damping: 16, stiffness: 360 }); }}
                    onPress={handleCta}
                    style={styles.ctaFront}
                  >
                    <Text style={styles.ctaFrontText}><Text>{index < SLIDES.length - 1 ? 'Continue' : 'Get Started'}</Text></Text>
                  </TouchableOpacity>
                </Animated.View>
              </View>

              {i === SLIDES.length - 1 ? (
                <>
                  <View style={{ height: 12 }} />
                  <TouchableOpacity onPress={handleLogin} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }} style={styles.loginLink}>
                    <Text style={styles.loginLinkText}><Text>{'Already have an account? Log In'}</Text></Text>
                  </TouchableOpacity>
                </>
              ) : null}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/** Flame badge with scale pulse — Slide 1 floating accent */
function FlamePulse() {
  const s = useSharedValue(1);
  React.useEffect(() => { s.value = withRepeat(withSpring(1.16, { damping: 10, stiffness: 120 }), -1, true); }, [s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (<Animated.View style={style}><View style={styles.flameBadge}><Ionicons name="flame" size={22} color="#FFFFFF" /></View></Animated.View>);
}

/** XP chip with soft float — Slide 2 floating accent */
function FloatXpChip() {
  const y = useSharedValue(0);
  React.useEffect(() => { y.value = withRepeat(withTiming(-6, { duration: 1200 }), -1, true); }, [y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (<Animated.View style={[styles.xpFloatChip, style]}><Text style={styles.xpFloatText}><Text>{'+120 XP 🔥'}</Text></Text></Animated.View>);
}

/** Trophy chip with soft float — Slide 3 floating accent */
function TrophyChip() {
  const y = useSharedValue(0);
  React.useEffect(() => { y.value = withRepeat(withTiming(-5, { duration: 1300 }), -1, true); }, [y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (<Animated.View style={[styles.trophyFloatChip, style]}><Text style={{ fontSize: 16 }}><Text>{'🏆'}</Text></Text><Text style={styles.trophyFloatText}><Text>{'Weekly League'}</Text></Text></Animated.View>);
}

/** Slide 1 stat rows — streak + daily goal */
function StreakRows() {
  return (
    <View style={styles.statCard}>
      <View style={styles.statRow}>
        <View style={styles.flameDot}><Ionicons name="flame" size={20} color="#F97316" /></View>
        <View style={{ marginLeft: 10 }}>
          <Text style={styles.statBig}><Text>{'12'}</Text></Text>
          <Text style={styles.statCaption}><Text>{'day streak'}</Text></Text>
        </View>
        <View style={styles.statSpacer} />
        <View style={styles.goalChip}><Text style={styles.goalChipText}><Text>{'Daily Goal'}</Text></Text></View>
      </View>
      <View style={{ height: 14 }} />
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: '72%' }]} />
      </View>
    </View>
  );
}

/** Slide 2 stat rows — level + XP */
function XpRows() {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statBig}><Text>{'Level 7'}</Text></Text>
      <View style={{ height: 4 }} />
      <Text style={styles.statCaption}><Text>{'1,450 XP total'}</Text></Text>
      <View style={{ height: 12 }} />
      <View style={styles.rewardRow}>
        <Ionicons name="diamond" size={16} color={AppColors.sky} />
        <View style={{ width: 6 }} />
        <Text style={styles.rewardText}><Text>{'Next: Golden Avatar'}</Text></Text>
      </View>
    </View>
  );
}

/** Slide 4 hero — a faithful mini replica of the real Qubi home-screen widget */
function WidgetPreview() {
  return (
    <View style={styles.widgetMock}>
      {/* Left column: flame + big days + status + dot chain (like the real widget) */}
      <View style={{ flex: 1 }}>
        <View style={styles.widgetMockHead}>
          <Text style={{ fontSize: 16 }}><Text>{'🔥'}</Text></Text>
          <Text style={styles.widgetMockStreak}><Text>{'12 Days'}</Text></Text>
        </View>
        <Text style={styles.widgetMockSub}><Text>{"You're on fire!"}</Text></Text>
        <View style={styles.widgetMockDots}>
          {['M', 'T', 'W', 'T', 'F'].map((d, idx) => (
            <View key={`${d}-${idx}`} style={styles.widgetMockDotCol}>
              <Text style={styles.widgetMockDay}><Text>{d}</Text></Text>
              <View style={[styles.widgetMockDot, idx < 3 && styles.widgetMockDotDone]}>
                {idx < 3 ? <Text style={styles.widgetMockCheck}><Text>{'✓'}</Text></Text> : null}
              </View>
            </View>
          ))}
        </View>
      </View>
      {/* Right: mascot */}
      <Text style={styles.widgetMockMascot}><Text>{'🦖'}</Text></Text>
    </View>
  );
}

/** Slide 4 stat rows — exactly how to pin the widget on your phone */
function WidgetSteps() {
  const steps = [
    { n: '1', text: 'Long-press your Home Screen' },
    { n: '2', text: 'Tap +  and search “Qubi”' },
    { n: '3', text: 'Pick a size → Add Widget 🔥' },
  ];
  return (
    <View style={styles.statCard}>
      {steps.map((s, idx) => (
        <View key={s.n} style={[styles.widgetStepRow, idx < steps.length - 1 && styles.widgetStepDivider]}>
          <View style={styles.widgetStepNum}><Text style={styles.widgetStepNumText}><Text>{s.n}</Text></Text></View>
          <Text style={styles.widgetStepText}><Text>{s.text}</Text></Text>
        </View>
      ))}
    </View>
  );
}
/** Slide 3 stat rows — leaderboard */
function LeaderRows() {
  return (
    <View style={styles.statCard}>
      {[
        { medal: '🥇', name: 'Alex', xp: '1,250 XP' },
        { medal: '🥈', name: 'You', xp: '1,180 XP' },
        { medal: '🥉', name: 'Sam', xp: '1,090 XP' },
      ].map((row) => (
        <View key={row.name} style={[styles.leaderRow, row.name === 'Sam' ? null : styles.leaderDivider]}>
          <Text style={{ fontSize: 16 }}><Text>{row.medal}</Text></Text>
          <View style={{ width: 10 }} />
          <Text style={styles.leaderName}><Text>{row.name}</Text></Text>
          <View style={styles.statSpacer} />
          <Text style={styles.leaderXp}><Text>{row.xp}</Text></Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingBottom: 10 },
  progressRow: { flexDirection: 'row', gap: 8, flex: 1 },
  progressSegment: {
    height: 12,
    borderRadius: 6,
    flex: 1,
    borderWidth: 2,
    borderColor: '#000',
  },
  skipButton: {
    marginLeft: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#000',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 2, height: 2 },
    elevation: 2,
  },
  skipText: { fontSize: 14, fontFamily: fontFamilyFor('w800'), color: '#000' },
  skipPlaceholder: { width: 12, marginLeft: 12 },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  guideCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 2.5,
    borderColor: '#000',
    padding: 18,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
    elevation: 4,
  },
  heroTile: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#000',
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  accentPos: { position: 'absolute', top: 8, right: 10 },
  flameBadge: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#F97316',
    borderWidth: 2, borderColor: '#000',
    alignItems: 'center', justifyContent: 'center',
  },
  xpFloatChip: {
    backgroundColor: '#58CC02', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    borderWidth: 2, borderColor: '#000',
  },
  xpFloatText: { fontSize: 12, fontFamily: fontFamilyFor('w800'), color: '#FFFFFF' },
  trophyFloatChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    borderWidth: 2, borderColor: '#000',
  },
  trophyFloatText: { fontSize: 11, fontFamily: fontFamilyFor('w800'), color: AppColors.ink },
  cardSpacer: { flex: 1, minHeight: 10 },
  slideTitle: { fontSize: 22, fontFamily: fontFamilyFor('w900'), letterSpacing: -0.6, textAlign: 'center', color: '#000' },
  slideDesc: { fontSize: 14, lineHeight: 21, fontFamily: fontFamilyFor('w500'), textAlign: 'center', color: '#3F3F46' },
  loginLink: { paddingVertical: 4 },
  loginLinkText: { fontSize: 13, fontFamily: fontFamilyFor('w700'), color: '#F97316' },
  statCard: {
    width: '100%', backgroundColor: '#FFF7ED', borderRadius: 16,
    borderWidth: 2, borderColor: '#000', padding: 12, marginTop: 12,
  },
  ctaFront: {
    height: 52, borderRadius: 16, backgroundColor: '#F97316',
    borderWidth: 2.5, borderColor: '#000',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 1, shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  ctaFrontText: { fontSize: 16, fontFamily: fontFamilyFor('w800'), color: '#FFFFFF', letterSpacing: -0.2 },
  statRow: { flexDirection: 'row', alignItems: 'center' },
  statSpacer: { flex: 1 },
  statBig: { fontSize: 20, fontFamily: fontFamilyFor('w800'), color: '#000', letterSpacing: -0.4 },
  statCaption: { fontSize: 11, fontFamily: fontFamilyFor('w600'), color: AppColors.muted },
  flameDot: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: withAlpha('#F97316', 0.14),
    borderWidth: 2, borderColor: '#000', alignItems: 'center', justifyContent: 'center',
  },
  goalChip: { backgroundColor: withAlpha('#58CC02', 0.16), paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 2, borderColor: '#000' },
  goalChipText: { fontSize: 11, fontFamily: fontFamilyFor('w800'), color: '#3A7D00' },
  barTrack: {
    width: '100%', height: 16, borderRadius: 8, backgroundColor: '#FFFFFF',
    borderWidth: 2, borderColor: '#000', overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: '#F97316', borderRadius: 6 },
  rewardRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: withAlpha(AppColors.sky, 0.12), paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 2, borderColor: '#000' },
  rewardText: { fontSize: 11, fontFamily: fontFamilyFor('w700'), color: AppColors.skyDeep },
  leaderRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  leaderDivider: { borderBottomWidth: 1.5, borderBottomColor: '#00000022' },
  leaderName: { fontSize: 14, fontFamily: fontFamilyFor('w700'), color: '#000' },
  leaderXp: { fontSize: 12, fontFamily: fontFamilyFor('w800'), color: '#3A7D00' },
  /* Slide 4 widget mock — mirrors widgets/QubiWidget.tsx */
  widgetMock: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F97316', borderRadius: 16, borderWidth: 2, borderColor: '#000',
    paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'stretch',
  },
  widgetMockHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  widgetMockStreak: { fontSize: 21, fontFamily: fontFamilyFor('w900'), color: '#FFFFFF', letterSpacing: -0.5 },
  widgetMockSub: { fontSize: 10, fontFamily: fontFamilyFor('w600'), color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  widgetMockDots: { flexDirection: 'row', gap: 6, marginTop: 8 },
  widgetMockDotCol: { alignItems: 'center', gap: 2 },
  widgetMockDay: { fontSize: 8, fontFamily: fontFamilyFor('w700'), color: 'rgba(255,255,255,0.85)' },
  widgetMockDot: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  widgetMockDotDone: { backgroundColor: '#FFFFFF' },
  widgetMockCheck: { fontSize: 10, fontFamily: fontFamilyFor('w800'), color: '#F97316' },
  widgetMockMascot: { fontSize: 44, marginLeft: 8 },
  widgetStepRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  widgetStepDivider: { borderBottomWidth: 1.5, borderBottomColor: '#00000022' },
  widgetStepNum: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: '#F97316',
    borderWidth: 2, borderColor: '#000', alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  widgetStepNumText: { fontSize: 13, fontFamily: fontFamilyFor('w800'), color: '#FFFFFF' },
  widgetStepText: { fontSize: 13, fontFamily: fontFamilyFor('w600'), color: '#000' },
});

export default DuolingoGuide;
