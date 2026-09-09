import React, { useRef, useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppColors } from '../../theme/colors';
import { fontFamilyFor } from '../../theme/typography';
import { QubiMascot } from '../../components/QubiMascot';
import { playStepClick } from '../../services/soundService';
import { useGateStore } from '../../state/gateStore';
import { WidgetGuideScreenshots } from '../../components/onboarding/WidgetGuideScreenshots';

/**
 * DuolingoGuide — 4-step onboarding carousel (reference image 1).
 * Each slide is a full-bleed themed stage:
 *   1. ORANGE — "You're acing your habits!" — big %, mascot on a meadow.
 *   2. GREEN  — pure LikeLingo splash — giant mascot face + wordmark.
 *   3. DARK   — legendary celebration — glowing badge + gold mascot.
 *   4. LIGHT  — widget how-to (mini widget replica + pin-the-widget steps).
 * Routing: "Get Started"/"Skip" persist the hasCompletedOnboarding flag
 * (gateStore → AsyncStorage) then transition to Sign Up; slide-4 link goes
 * to Log In. Skip shows on steps 1–3 only.
 */

const { width: W, height: H } = Dimensions.get('window');

const SLIDES = [
  {
    key: 'orange',
    title: "You're acing your habits today!",
    desc: 'You praticed 50 quests today with an\naverage accuracy of 97%',
    cta: 'SHARE +20 GEMS',
  },
  {
    key: 'green',
    title: 'Level up your life',
    desc: 'Snap proof. Stack XP. Climb leagues.\nQubi keeps you accountable daily.',
    cta: 'CONTINUE',
  },
  {
    key: 'dark',
    title: 'You earned Legendary on this level!',
    desc: "Congratulations! You've proven your\nskills and unlocked a special color",
    cta: 'GOT IT!',
  },
  {
    key: 'widget',
    title: 'Add the Qubi Widget',
    desc: 'Pin Qubi to your Home Screen like\nDuolingo does — always one glance away.',
    cta: 'Get Started',
  },
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
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

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

  const last = index === SLIDES.length - 1;

  return (
    <View style={styles.flex}>
      {/* Top bar: progress segments + Skip (steps 1–3 only) */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12, paddingHorizontal: 24 }]}>
        <View style={styles.progressRow}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.progressSegment,
                {
                  backgroundColor:
                    i === index
                      ? '#FFFFFF'
                      : i < index
                        ? 'rgba(255,255,255,0.55)'
                        : 'rgba(255,255,255,0.25)',
                },
              ]}
            />
          ))}
        </View>
        {!last ? (
          <TouchableOpacity onPress={handleSkip} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.skipButton}>
            <Text style={styles.skipText}>{'Skip'}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.skipPlaceholder} />
        )}
      </View>

      {/* 4-slide carousel — full-bleed themed stages */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentum}
        style={styles.flex}
      >
        {/* Slide 1 — ORANGE stats hero */}
        <View style={[styles.slide, { width: W }]}>
          <View style={[styles.bigStat, { top: H * 0.1 }]}>
            <Text style={styles.bigStatText}>
              {'95'}
              <Text style={styles.bigStatPct}>%</Text>
            </Text>
          </View>
          <View style={styles.stageCenter}>
            <MeadowBackdrop />
            <QubiMascot size={190} bob celebrating />
          </View>
          <BottomCopy
            title={SLIDES[0].title}
            desc={SLIDES[0].desc}
            cta={SLIDES[0].cta}
            onPress={handleCta}
            variant="orange"
          />
        </View>

        {/* Slide 2 — GREEN brand splash */}
        <View style={[styles.slide, { width: W, backgroundColor: '#58CC02' }]}>
          <View style={styles.stageCenter}>
            <GardenDecor />
            <MascotFace />
          </View>
          <View style={[styles.wordmarkWrap, { bottom: H * 0.22 }]}>
            <Text style={styles.wordmark}>{'Qubi'}</Text>
          </View>
          <BottomCopy
            title={SLIDES[1].title}
            desc={SLIDES[1].desc}
            cta={SLIDES[1].cta}
            onPress={handleCta}
            variant="green"
          />
        </View>

        {/* Slide 3 — DARK legendary celebration */}
        <View style={[styles.slide, { width: W, backgroundColor: '#0E1B24' }]}>
          <View style={styles.stageCenter}>
            <LegendaryBadge />
            <QubiMascot size={180} celebrating pulseGlow />
          </View>
          <BottomCopy
            title={SLIDES[2].title}
            desc={SLIDES[2].desc}
            cta={SLIDES[2].cta}
            onPress={handleCta}
            variant="gold"
          />
        </View>

        {/* Slide 4 — LIGHT widget how-to (real screenshot walkthrough) */}
        <View style={[styles.slide, { width: W, backgroundColor: '#FFF9F0' }]}>
          <View style={[styles.stageCenter, { gap: 10, justifyContent: 'flex-start', paddingTop: 8 }]}>
            <WidgetGuideScreenshots />
          </View>
          <BottomCopy
            title={SLIDES[3].title}
            desc={SLIDES[3].desc}
            cta={SLIDES[3].cta}
            onPress={handleCta}
            variant="orange"
            extraLink
            onLogin={handleLogin}
          />
        </View>
      </ScrollView>
    </View>
  );
}

/* ── Shared stage pieces ─────────────────────────────────────────────── */

/** Bottom text block + 3D pill CTA used by every slide. */
function BottomCopy({
  title,
  desc,
  cta,
  onPress,
  variant,
  extraLink,
  onLogin,
}: {
  title: string;
  desc: string;
  cta: string;
  onPress: () => void;
  variant: 'orange' | 'green' | 'gold';
  extraLink?: boolean;
  onLogin?: () => void;
}) {
  const palette =
    variant === 'gold'
      ? { ctaBg: '#FFC531', ctaEdge: '#E8930C', ink: '#FFFFFF', sub: 'rgba(255,255,255,0.75)' }
      : variant === 'green'
        ? { ctaBg: '#FFFFFF', ctaEdge: '#D9E7CE', ink: '#FFFFFF', sub: 'rgba(255,255,255,0.85)' }
        : { ctaBg: '#F97316', ctaEdge: '#C2410C', ink: '#FFFFFF', sub: 'rgba(255,255,255,0.8)' };
  const ctaInk = variant === 'gold' ? '#7A4A12' : variant === 'green' ? '#58CC02' : '#FFFFFF';

  const pressY = useSharedValue(0);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ translateY: pressY.value }] }));

  return (
    <View style={styles.bottomCopy}>
      <Text style={[styles.slideTitle, { color: palette.ink }]}>
        {title}
      </Text>
      <View style={{ height: 8 }} />
      <Text style={[styles.slideDesc, { color: palette.sub }]}>
        {desc}
      </Text>
      <View style={{ height: 22 }} />
      {/* 3D tactile pill CTA */}
      <View style={styles.ctaWrap}>
        <View style={[styles.ctaShadow, { backgroundColor: palette.ctaEdge }]} />
        <Animated.View style={pressStyle}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPressIn={() => { pressY.value = withSpring(4, { damping: 18, stiffness: 420 }); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }}
            onPressOut={() => { pressY.value = withSpring(0, { damping: 16, stiffness: 360 }); }}
            onPress={onPress}
            style={[styles.ctaFront, { backgroundColor: palette.ctaBg }]}
          >
            <Text style={[styles.ctaText, { color: ctaInk }]}>{cta}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
      {extraLink ? (
        <>
          <View style={{ height: 14 }} />
          <TouchableOpacity onPress={onLogin} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
            <Text style={styles.loginLink}>{'Already have an account? Log In'}</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </View>
  );
}

/** Slide-1 meadow island under the mascot. */
function MeadowBackdrop() {
  return (
    <View pointerEvents="none" style={styles.meadowWrap}>
      <LinearGradient
        colors={['rgba(255,255,255,0.0)', 'rgba(255,255,255,0.28)']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.meadowIsland}>
        <View style={styles.meadowTop}>
          <View style={styles.meadowTree} />
          <View style={[styles.meadowTree, { alignSelf: 'flex-end', width: 20, height: 26 }]} />
        </View>
      </View>
    </View>
  );
}

/** Slide-2 giant mascot face (LikeLingo style) — built from circles. */
function MascotFace() {
  return (
    <View style={styles.faceWrap}>
      {/* eyes */}
      <View style={styles.eyeRow}>
        <View style={styles.eye}>
          <View style={styles.pupil} />
        </View>
        <View style={styles.eye}>
          <View style={styles.pupil} />
        </View>
      </View>
      {/* brows */}
      <View style={[styles.brow, { top: -14, left: 26, transform: [{ rotate: '-14deg' }] }]} />
      <View style={[styles.brow, { top: -14, right: 26, transform: [{ rotate: '14deg' }] }]} />
      {/* snout */}
      <View style={styles.snout}>
        <View style={styles.nostril} />
        <View style={styles.mouth}>
          <View style={styles.tongue} />
        </View>
      </View>
      {/* spikes */}
      {[
        { top: 8, right: -26, r: '20deg' },
        { top: 46, right: -34, r: '0deg' },
        { top: 84, right: -26, r: '-20deg' },
      ].map((s, i) => (
        <View key={i} style={[styles.spike, { top: s.top, right: s.right, transform: [{ rotate: s.r }] }]} />
      ))}
    </View>
  );
}

/** Slide-2 garden flowers/grass at the bottom edge. */
function GardenDecor() {
  return (
    <View pointerEvents="none" style={styles.gardenWrap}>
      <View style={[styles.flower, { left: 34, bottom: 6 }]}>
        <View style={styles.flowerPetal} />
        <View style={styles.flowerCenter} />
      </View>
      <View style={[styles.flower, { right: 40, bottom: 12 }]}>
        <View style={[styles.flowerPetal, { backgroundColor: '#FFFFFF' }]} />
        <View style={[styles.flowerCenter, { backgroundColor: '#F97316' }]} />
      </View>
      <View style={[styles.grassBlade, { left: 70, bottom: 0, transform: [{ rotate: '-16deg' }] }]} />
      <View style={[styles.grassBlade, { right: 84, bottom: 0, transform: [{ rotate: '18deg' }] }]} />
    </View>
  );
}

/** Slide-3 glowing legendary badge above the mascot. */
function LegendaryBadge() {
  const glow = useSharedValue(0.6);
  React.useEffect(() => {
    glow.value = withRepeat(withTiming(1, { duration: 1200 }), -1, true);
  }, [glow]);
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value, transform: [{ scale: 1 + (glow.value - 0.6) * 0.5 }] }));
  return (
    <View style={styles.badgeWrap}>
      <Animated.View style={[styles.badgeGlow, glowStyle]} />
      <LinearGradient colors={['#FFC531', '#F59E0B']} style={styles.badge}>
        <View style={styles.badgeInner}>
          <Text style={styles.badgeCheck}>{'✓'}</Text>
        </View>
      </LinearGradient>
      <View style={[styles.badgeSpark, { top: -8, left: -12 }]} />
      <View style={[styles.badgeSpark, { top: 4, right: -14, width: 8, height: 8 }]} />
    </View>
  );
}

/** Slide-4 widget replica — mirrors widgets/QubiWidget.tsx (FIRE theme). */
function WidgetPreview() {
  return (
    <View style={styles.widgetMock}>
      <View style={{ flex: 1 }}>
        <View style={styles.widgetMockHead}>
          <Text style={{ fontSize: 16 }}>{'🔥'}</Text>
          <Text style={styles.widgetMockStreak}>{'12 Days'}</Text>
        </View>
        <Text style={styles.widgetMockSub}>{"It's a bird, it's a plane! IT'S QUBI!"}</Text>
        <View style={styles.widgetMockDots}>
          {['M', 'T', 'W', 'T', 'F'].map((d, idx) => (
            <View key={`${d}-${idx}`} style={styles.widgetMockDotCol}>
              <Text style={styles.widgetMockDay}>{d}</Text>
              <View style={[styles.widgetMockDot, idx < 4 && styles.widgetMockDotDone]}>
                {idx < 4 ? <Text style={styles.widgetMockCheck}>{'✓'}</Text> : null}
              </View>
            </View>
          ))}
        </View>
      </View>
      <QubiMascot size={54} />
    </View>
  );
}

/* ── Styles ──────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingBottom: 10, zIndex: 10 },
  progressRow: { flexDirection: 'row', gap: 8, flex: 1 },
  progressSegment: { height: 10, borderRadius: 5, flex: 1 },
  skipButton: {
    marginLeft: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 12,
  },
  skipText: { fontSize: 14, fontFamily: fontFamilyFor('w700'), color: '#FFFFFF' },
  skipPlaceholder: { width: 12, marginLeft: 12 },
  slide: { flex: 1, backgroundColor: '#F97316', alignItems: 'center' },
  stageCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  /* Slide 1 big % stat */
  bigStat: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 2 },
  bigStatText: {
    fontSize: 120,
    lineHeight: 128,
    fontFamily: fontFamilyFor('w900'),
    color: '#FFFFFF',
    letterSpacing: -4,
    textShadowColor: 'rgba(194,65,12,0.35)',
    textShadowRadius: 22,
    textShadowOffset: { width: 0, height: 6 },
  },
  bigStatPct: { fontSize: 56 },
  meadowWrap: { position: 'absolute', bottom: -6, width: 240, height: 60, alignItems: 'center' },
  meadowIsland: {
    width: 220, height: 46, borderRadius: 23, backgroundColor: '#58CC02',
    borderWidth: 3, borderColor: '#46A302', overflow: 'hidden',
  },
  meadowTop: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 26, paddingTop: 6 },
  meadowTree: { width: 26, height: 34, borderRadius: 6, backgroundColor: '#2E7D0B' },

  /* Slide 2 mascot face + wordmark */
  faceWrap: { width: 210, height: 180, alignItems: 'center', justifyContent: 'center' },
  eyeRow: { flexDirection: 'row', gap: 26, marginBottom: 16 },
  eye: {
    width: 44, height: 52, borderRadius: 22, backgroundColor: '#FFFFFF',
    borderWidth: 4, borderColor: '#2E7D0B', alignItems: 'center', justifyContent: 'center',
  },
  pupil: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#1C1917' },
  brow: {
    position: 'absolute', width: 34, height: 9, borderRadius: 5, backgroundColor: '#2E7D0B',
  },
  snout: { alignItems: 'center' },
  nostril: {
    width: 10, height: 8, borderRadius: 5, backgroundColor: '#2E7D0B', marginBottom: 8, alignSelf: 'center',
  },
  mouth: {
    width: 74, height: 40, backgroundColor: '#7C2D12', borderBottomLeftRadius: 37, borderBottomRightRadius: 37,
    borderWidth: 3, borderTopWidth: 0, borderColor: '#2E7D0B', alignItems: 'center', overflow: 'hidden',
  },
  tongue: { width: 34, height: 18, borderRadius: 9, backgroundColor: '#F472B6', marginTop: 18 },
  spike: {
    position: 'absolute', width: 26, height: 20, backgroundColor: '#2E7D0B',
    borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
  },
  wordmarkWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  wordmark: {
    fontSize: 42, fontFamily: fontFamilyFor('w900'), color: '#FFFFFF', letterSpacing: -1.2,
    textShadowColor: 'rgba(0,0,0,0.15)', textShadowRadius: 10, textShadowOffset: { width: 0, height: 3 },
  },
  gardenWrap: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 70 },
  flower: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  flowerPetal: { position: 'absolute', width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFC531' },
  flowerCenter: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#7C2D12' },
  grassBlade: { position: 'absolute', width: 8, height: 26, borderRadius: 4, backgroundColor: '#2E7D0B' },

  /* Slide 3 legendary badge */
  badgeWrap: { marginBottom: -26, zIndex: 2, alignItems: 'center', justifyContent: 'center' },
  badgeGlow: {
    position: 'absolute', width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,197,49,0.35)',
  },
  badge: {
    width: 76, height: 76, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    transform: [{ rotate: '45deg' }],
    shadowColor: '#FFC531', shadowOpacity: 0.85, shadowRadius: 22, shadowOffset: { width: 0, height: 0 }, elevation: 10,
  },
  badgeInner: {
    width: 54, height: 54, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.55)',
  },
  badgeCheck: { fontSize: 30, color: '#FFFFFF', fontFamily: fontFamilyFor('w900'), transform: [{ rotate: '-45deg' }] },
  badgeSpark: {
    position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFC531',
  },

  /* Bottom copy + CTA */
  bottomCopy: {
    width: '100%', paddingHorizontal: 28, paddingBottom: 34, alignItems: 'center',
  },
  slideTitle: {
    fontSize: 24, fontFamily: fontFamilyFor('w800'), letterSpacing: -0.5, textAlign: 'center', lineHeight: 30,
  },
  slideDesc: { fontSize: 14, lineHeight: 20, fontFamily: fontFamilyFor('w500'), textAlign: 'center' },
  loginLink: { fontSize: 13, fontFamily: fontFamilyFor('w700'), color: '#F97316' },
  ctaWrap: { width: '100%', position: 'relative', height: 56 },
  ctaShadow: { position: 'absolute', top: 4, left: 0, right: 0, height: 52, borderRadius: 999 },
  ctaFront: {
    height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
  },
  ctaText: { fontSize: 15.5, fontFamily: fontFamilyFor('w800'), letterSpacing: 0.6 },

  /* Slide 4 widget mock */
  widgetMock: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F97316', borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 14, alignSelf: 'stretch', marginHorizontal: 40,
    shadowColor: '#C2410C', shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8,
  },
  widgetMockHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  widgetMockStreak: { fontSize: 22, fontFamily: fontFamilyFor('w900'), color: '#FFFFFF', letterSpacing: -0.5 },
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
});

export default DuolingoGuide;
