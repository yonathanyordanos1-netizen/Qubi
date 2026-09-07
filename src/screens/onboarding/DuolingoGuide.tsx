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
import { ProgressBar } from '../../components/ui/ProgressBar';
import { QubiMascot } from '../../components/QubiMascot';

/**
 * DuolingoGuide — 3-step onboarding carousel (Duolingo-grade).
 * Routing: "Get Started"/"Skip" persist the hasCompletedOnboarding flag
 * (gateStore → AsyncStorage) then transition to Sign Up; slide-3 link goes
 * to Log In. Progress: h10/r6/gap8, orange active + top highlight. Slides are
 * gamified white cards (r28, 2px border, soft shadow) with floating accents
 * and a full-width 3D CTA pinned at the card bottom (h56, r16). Hermes-safe.
 */

const W = Dimensions.get('window').width;

const SLIDES = [
  { title: 'Build Daily Habits', desc: 'Lock in streaks and crush your daily goal — Qubi keeps you accountable every single day.' },
  { title: 'Earn XP & Level Up', desc: 'Every completed quest awards +50 XP ✨. Level up and unlock avatar rewards.' },
  { title: 'Compete with Friends', desc: 'Climb the leaderboard, take on friend challenges and win weekly leagues.' },
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
    if (index < SLIDES.length - 1) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      goTo(index + 1);
    } else {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      finishGuide(onGetStarted ?? onDone, '/auth/signup');
    }
  };

  const handleSkip = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    finishGuide(onSkip ?? onDone, '/auth/signup');
  };

  const handleLogin = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    finishGuide(onLogin, '/auth/login');
  };

  return (
    <View style={[styles.flex, { backgroundColor: isDark ? AppColors.canvasDark : '#FFFFFF' }]}>
      {/* Top bar: chunky segmented progress + Skip */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12, paddingHorizontal: 24 }]}>
        <View style={styles.progressRow}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[styles.progressSegment, { backgroundColor: i <= index ? AppColors.primary : isDark ? 'rgba(255,255,255,0.10)' : '#E2E8F0' }]}
            >
              {i <= index ? <View style={styles.progressHighlight} /> : null}
            </View>
          ))}
        </View>
        <TouchableOpacity onPress={handleSkip} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.skipButton}>
          <Text style={styles.skipText}><Text>{'Skip'}</Text></Text>
        </TouchableOpacity>
      </View>

      {/* 3-slide carousel — gamified card per slide */}
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
            <View style={styles.guideCard}>
              {/* Floating gamified visual area */}
              <View style={styles.visualArea}>
                {i === 0 ? <QubiMascot size={88} bob /> : i === 1 ? <QubiMascot size={88} pulseGlow /> : <QubiMascot size={88} celebrating />}
                {i === 0 ? (
                  <View style={styles.flamePos}><FlamePulse /></View>
                ) : i === 1 ? (
                  <View style={styles.xpPos}><FloatXpChip /></View>
                ) : (
                  <View style={styles.trophyPos}><TrophyChip /></View>
                )}
              </View>

              {/* Slide stat rows */}
              {i === 0 ? <StreakRows /> : i === 1 ? <XpRows /> : <LeaderRows />}

              <View style={styles.cardSpacer} />
              <Text style={styles.slideTitle}><Text>{slide.title}</Text></Text>
              <View style={{ height: 8 }} />
              <Text style={styles.slideDesc}><Text>{slide.desc}</Text></Text>
              <View style={{ height: 16 }} />

              {/* Full-width 3D CTA pinned at the card bottom (h56, r16, #F97316, borderBottom 4 #C2410C) — tactile depression */}
              <View style={{ width: '100%', marginTop: 8 }}>
                {/* 3D shadow layer */}
                <View style={styles.ctaShadow} />
                <Animated.View style={ctaAnimatedStyle}>
                  <TouchableOpacity
                    activeOpacity={0.95}
                    onPressIn={() => { ctaPressY.value = withSpring(4, { damping: 18, stiffness: 420 }); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }}
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

/** +50 XP chip with soft float — Slide 2 floating accent */
function FloatXpChip() {
  const y = useSharedValue(0);
  React.useEffect(() => { y.value = withRepeat(withTiming(-6, { duration: 1200 }), -1, true); }, [y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (<Animated.View style={[styles.xpFloatChip, style]}><Text style={styles.xpFloatText}><Text>{'+50 XP ✨'}</Text></Text></Animated.View>);
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
        <View style={styles.flameDot}><Ionicons name="flame" size={20} color={AppColors.primary} /></View>
        <View style={{ marginLeft: 10 }}>
          <Text style={styles.statBig}><Text>{'12'}</Text></Text>
          <Text style={styles.statCaption}><Text>{'day streak'}</Text></Text>
        </View>
        <View style={styles.statSpacer} />
        <View style={styles.goalChip}><Text style={styles.goalChipText}><Text>{'Daily Goal'}</Text></Text></View>
      </View>
      <View style={{ height: 14 }} />
      <ProgressBar progress={0.72} showStar={false} height={14} />
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
  progressSegment: { height: 10, borderRadius: 6, flex: 1, overflow: 'hidden' },
  progressHighlight: { position: 'absolute', top: 2, left: 6, right: 6, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.45)' },
  skipButton: { paddingVertical: 4 },
  skipText: { fontSize: 14, fontFamily: fontFamilyFor('w700') },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  guideCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderBottomWidth: 5,
    borderBottomColor: '#CBD5E1',
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  visualArea: { width: '100%', height: 110, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  flamePos: { position: 'absolute', top: -6, right: 18 },
  xpPos: { position: 'absolute', top: -8, right: 10 },
  trophyPos: { position: 'absolute', top: -8, left: 8 },
  flameBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: AppColors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: AppColors.primary, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  xpFloatChip: { backgroundColor: AppColors.pathGreen, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, shadowColor: AppColors.pathGreenDeep, shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  xpFloatText: { fontSize: 12, fontFamily: fontFamilyFor('w800'), color: '#FFFFFF' },
  trophyFloatChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5, borderColor: '#E2E8F0', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  trophyFloatText: { fontSize: 11, fontFamily: fontFamilyFor('w800'), color: AppColors.ink },
  cardSpacer: { flex: 1, minHeight: 10 },
  slideTitle: { fontSize: 24, fontFamily: fontFamilyFor('w900'), letterSpacing: -0.8, textAlign: 'center' },
  slideDesc: { fontSize: 14, lineHeight: 21, fontFamily: fontFamilyFor('w500'), textAlign: 'center' },
  loginLink: { paddingVertical: 4 },
  loginLinkText: { fontSize: 13, fontFamily: fontFamilyFor('w700'), color: AppColors.primary },
  statCard: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1.5, borderColor: '#E2E8F0', padding: 14 },
  ctaShadow: { position: 'absolute', top: 0, left: 0, right: 0, height: 56, borderRadius: 16, backgroundColor: '#C2410C' },
  ctaFront: { height: 52, borderRadius: 16, backgroundColor: '#F97316', borderWidth: 1, borderColor: '#D45A07', alignItems: 'center', justifyContent: 'center' },
  ctaFrontText: { fontSize: 16, fontFamily: fontFamilyFor('w800'), color: '#FFFFFF', letterSpacing: -0.2 },
  statRow: { flexDirection: 'row', alignItems: 'center' },
  statSpacer: { flex: 1 },
  statBig: { fontSize: 20, fontFamily: fontFamilyFor('w800'), color: AppColors.ink, letterSpacing: -0.4 },
  statCaption: { fontSize: 11, fontFamily: fontFamilyFor('w600'), color: AppColors.muted },
  flameDot: { width: 40, height: 40, borderRadius: 20, backgroundColor: withAlpha(AppColors.primary, 0.14), alignItems: 'center', justifyContent: 'center' },
  goalChip: { backgroundColor: withAlpha(AppColors.pathGreen, 0.14), paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  goalChipText: { fontSize: 11, fontFamily: fontFamilyFor('w800'), color: AppColors.pathGreenDeep },
  rewardRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: withAlpha(AppColors.sky, 0.12), paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  rewardText: { fontSize: 11, fontFamily: fontFamilyFor('w700'), color: AppColors.skyDeep },
  leaderRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  leaderDivider: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  leaderName: { fontSize: 14, fontFamily: fontFamilyFor('w700'), color: AppColors.ink },
  leaderXp: { fontSize: 12, fontFamily: fontFamilyFor('w800'), color: AppColors.pathGreenDeep },
});

export default DuolingoGuide;