import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeProvider';
import { AppColors, withAlpha } from '../../theme/colors';
import { fontFamilyFor } from '../../theme/typography';
import { useGateStore } from '../../state/gateStore';
import { BrandLogo } from '../../components/common/BrandLogo';
import { QubiAvatar } from '../../components/QubiAvatar';
import { PushableButton } from '../../components/PushableButton';
import { playStepClick, playLevelUp } from '../../services/soundService';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

const WIDTH = Dimensions.get('window').width;
/** Compact hero so the card never overflows smaller iOS displays. */
const HERO = Math.min(184, WIDTH - 176);

interface Slide {
  kicker: string;
  title: string;
  subtitle: string;
  accent: string;
  render: React.ReactNode;
}

/** Floating 3D camera icon with subtle rotation animation */
function FloatingCamera() {
  const rotate = useRef(new Animated.Value(4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(rotate, {
          toValue: 8,
          duration: 2200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(rotate, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [rotate]);
  return (
    <Animated.View style={[{ width: 80, height: 80, borderRadius: 24, backgroundColor: AppColors.primary, alignItems:'center', justifyContent:'center', borderWidth: 2, borderColor: '#000000', shadowColor: '#000000', shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 4, height: 4 }, elevation: 0 }, { transform: [{ rotate: rotate.interpolate({ inputRange: [0, 8], outputRange: ['-4deg', '4deg'] }) }] }]}>
      <Ionicons name="camera" size={36} color="#FFFFFF" />
    </Animated.View>
  );
}

/** XP explosion chip with animated scale-in */
function XpChip({ label, color, delay = 0 }: { label: string; color: string; delay?: number }) {
  const chipScale = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    Animated.spring(chipScale, {
      toValue: 1,
      damping: 10,
      stiffness: 180,
      mass: 0.6,
      useNativeDriver: true,
      delay,
    }).start();
  }, [chipScale, delay]);
  return (
    <Animated.View style={[{ backgroundColor:'#FFFFFF', paddingHorizontal:12, paddingVertical:8, borderRadius:16, borderWidth:2, borderColor:'#000000', alignItems:'center', shadowColor:'#000000', shadowOpacity:1, shadowRadius:0, shadowOffset:{width:2.5,height:2.5}, elevation:0 }, { transform: [{ scale: chipScale }] }]}>
      <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize:16, color }}><Text>{label}</Text></Text>
    </Animated.View>
  );
}

const SLIDES: Slide[] = [
  {
    kicker: 'STEP 1 OF 3 · HABITS',
    title: 'Tiny habits, daily wins',
    subtitle: 'Turn routines into 5-minute quests you actually finish.',
    accent: AppColors.primary,
    render: (
      <View style={{ alignItems:'center' }}>
        <View style={{ width: HERO, height: HERO, borderRadius: 20, backgroundColor: withAlpha(AppColors.primary,0.12), alignItems:'center', justifyContent:'center', borderWidth:2, borderColor: '#000000', overflow:'hidden', shadowColor:'#000000', shadowOpacity:1, shadowRadius:0, shadowOffset:{width:4,height:4}, elevation:0 }}>
          <QubiAvatar size={HERO - 24} glow accessibilityLabel="Qubi mascot" />
        </View>
        <View style={{ position:'absolute', top: -8, alignSelf:'center', backgroundColor:'#FFFFFF', paddingHorizontal:10, paddingVertical:6, borderRadius:999, borderWidth:2, borderColor:'#000000' }}>
          <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize:11, color:AppColors.ink }}><Text>{'✓ Morning Quest'}</Text></Text>
        </View>
      </View>
    ),
  },
  {
    kicker: 'STEP 2 OF 3 · PROOF',
    title: 'Snap it. Prove it.',
    subtitle: 'Photo proof verified instantly — no tracking, no guilt.',
    accent: AppColors.sky,
    render: (
      <View style={{ alignItems:'center' }}>
        <View style={{ width: HERO, height: HERO, borderRadius: 20, backgroundColor: withAlpha(AppColors.sky,0.14), alignItems:'center', justifyContent:'center', borderWidth:2, borderColor: '#000000', overflow:'hidden', shadowColor:'#000000', shadowOpacity:1, shadowRadius:0, shadowOffset:{width:4,height:4}, elevation:0 }}>
          <FloatingCamera />
          <View style={{ position:'absolute', bottom: 14, right: 14, width: 38, height:38, borderRadius:19, backgroundColor: AppColors.success, alignItems:'center', justifyContent:'center', borderWidth:2, borderColor:'#000000' }}>
            <Ionicons name="checkmark" size={20} color="#FFFFFF" />
          </View>
        </View>
      </View>
    ),
  },
  {
    kicker: 'STEP 3 OF 3 · STREAKS',
    title: 'Streaks that stick',
    subtitle: 'Earn XP, guard your streak, and level up every day.',
    accent: '#F59E0B',
    render: (
      <View style={{ alignItems:'center' }}>
        <View style={{ width: HERO, height: HERO, borderRadius: 20, backgroundColor: withAlpha('#F59E0B',0.14), alignItems:'center', justifyContent:'center', borderWidth:2, borderColor: '#000000', overflow:'hidden', shadowColor:'#000000', shadowOpacity:1, shadowRadius:0, shadowOffset:{width:4,height:4}, elevation:0 }}>
          <View style={{ flexDirection:'row', gap:10 }}>
            <XpChip label="+50 XP ✨" color={AppColors.primary} />
            <XpChip label="🔥 12" color="#F59E0B" delay={80} />
          </View>
          <View style={{ height:10 }} />
          <View style={{ flexDirection:'row', alignItems:'center', backgroundColor:'#FFFFFF', paddingHorizontal:12, paddingVertical:8, borderRadius:999, borderWidth:2, borderColor:'#000000' }}>
            <View style={{ width:26, height:26, borderRadius:13, backgroundColor: withAlpha(AppColors.primary,0.15), alignItems:'center', justifyContent:'center' }}><Text style={{ fontSize:13 }}><Text>{'🏆'}</Text></Text></View>
            <View style={{ width:8 }} />
            <Text style={{ fontFamily: fontFamilyFor('w700'), fontSize:12, color:AppColors.ink }}><Text>{'Top 3 Leaderboard'}</Text></Text>
          </View>
        </View>
      </View>
    ),
  },
];

/** Animated expanding pill pagination dot */
function PaginationDot({ active, accent, mutedColor }: { active: boolean; accent: string; mutedColor: string }) {
  const dotWidth = useRef(new Animated.Value(active ? 28 : 8)).current;
  const dotHeight = useRef(new Animated.Value(active ? 10 : 8)).current;
  const dotOpacity = useRef(new Animated.Value(active ? 1 : 0.5)).current;

  useEffect(() => {
    Animated.spring(dotWidth, { toValue: active ? 28 : 8, damping: 16, stiffness: 200, useNativeDriver: false }).start();
    Animated.spring(dotHeight, { toValue: active ? 10 : 8, damping: 16, stiffness: 200, useNativeDriver: false }).start();
    Animated.timing(dotOpacity, { toValue: active ? 1 : 0.5, duration: 200, useNativeDriver: false }).start();
  }, [active, dotWidth, dotHeight, dotOpacity]);

  return (
    <Animated.View
      style={{
        width: dotWidth,
        height: dotHeight,
        opacity: dotOpacity,
        backgroundColor: active ? accent : withAlpha(mutedColor, 0.22),
        borderRadius: 999,
      }}
    />
  );
}

/** A full-width slide page with a simple one-time RN Animated fade + slide on mount. */
function SlidePage({
  delay,
  width,
  children,
}: {
  delay: number;
  width: number;
  children: React.ReactNode;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 420,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [anim, delay]);
  return (
    <Animated.View
      style={[
        styles.page,
        {
          width,
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export default function PreOnboardingCarousel() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const completeWalkthrough = useGateStore((s) => s.completeWalkthrough);
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / WIDTH);
    if (i !== index && i >= 0 && i < SLIDES.length) {
      setIndex(i);
      playStepClick();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(()=>{});
    }
  };
  const go = (i: number) => {
    scrollRef.current?.scrollTo({ x: i * WIDTH, animated: true });
    setIndex(Math.max(0, Math.min(SLIDES.length - 1, i)));
    playStepClick();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(()=>{});
  };
  const finish = () => {
    playLevelUp();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(()=>{});
    completeWalkthrough();
  };

  return (
    <View style={[styles.flex, { backgroundColor: isDark ? colors.canvas : '#FFF7ED' }]}>
      <View style={[styles.topRow, { paddingTop: Math.max(14, insets.top) }]}>
        <BrandLogo size={30} />
        <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize: 18, letterSpacing: -0.6, color: colors.ink }}><Text>Qubi</Text></Text>
        <View style={styles.flex1} />
        {/* Skip lives strictly top-right on steps 1–2; step 3 gets the Get Started CTA instead. */}
        {!last ? (
          <View style={{ borderRadius:999, borderWidth:2, borderColor: '#000000', paddingHorizontal:14, paddingVertical:7, backgroundColor: colors.card }}>
            <Text onPress={()=> { playStepClick(); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(()=>{}); completeWalkthrough(); }} style={{ fontFamily: fontFamilyFor('w700'), fontSize:12, color: colors.muted }}><Text>Skip</Text></Text>
          </View>
        ) : (
          <View style={{ width: 64 }} />
        )}
      </View>

      <ScrollView ref={scrollRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll} style={styles.flex} decelerationRate="fast" snapToInterval={WIDTH} snapToAlignment="center">
        {SLIDES.map((s, idx) => {
          return (
            <SlidePage key={s.title} delay={idx * 40} width={WIDTH}>
              <View style={{ height: 8 }} />
              <BlurView intensity={70} tint="light" style={[styles.heroWrap, { borderColor: '#000000', shadowColor: s.accent }]}>
                {s.render}
              </BlurView>
              <View style={{ height: 18 }} />
              <View style={[styles.kickerPill, { backgroundColor: withAlpha(s.accent,0.12), borderColor: '#000000' }]}>
                <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize:10, letterSpacing:1.2, color: s.accent }}><Text>{s.kicker}</Text></Text>
              </View>
              <View style={{ height: 10 }} />
              <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize: 24, lineHeight: 28, letterSpacing: -0.8, color: colors.ink, textAlign:'center', paddingHorizontal: 32 }}><Text>{s.title}</Text></Text>
              <View style={{ height: 8 }} />
              <Text style={{ fontFamily: fontFamilyFor('w500'), fontSize: 14, lineHeight: 20, color: colors.muted, textAlign:'center', paddingHorizontal: 40 }}><Text>{s.subtitle}</Text></Text>
            </SlidePage>
          );
        })}
      </ScrollView>

      <View style={[styles.controls, { paddingBottom: Math.max(28, insets.bottom + 12) }]}>
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <PaginationDot key={i} active={i === index} accent={AppColors.primary} mutedColor={colors.muted} />
          ))}
        </View>
        <View style={{ height: 18 }} />
        {last ? (
          <PushableButton label="Get Started" onPress={finish} variant="primary" size="lg" haptic="medium" />
        ) : (
          <PushableButton label="Next" onPress={()=> go(index+1)} variant="primary" size="lg" />
        )}
        <View style={{ height: 6 }} />
        <Text style={{ textAlign:'center', fontFamily: fontFamilyFor('w600'), fontSize:11, color: withAlpha(colors.muted,0.8) }}><Text>{`Step ${index + 1} of ${SLIDES.length}`}</Text></Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex:{ flex:1 },
  flex1:{ flex:1 },
  topRow:{ flexDirection:'row', alignItems:'center', paddingHorizontal:20, paddingTop:14, gap:8 },
  page:{ flex:1, justifyContent:'center', alignItems:'center', paddingHorizontal: 8 },
  heroWrap:{ width: HERO + 32, borderRadius: 20, borderWidth: 2, alignItems:'center', justifyContent:'center', paddingVertical: 16, overflow: 'hidden', shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 4, height: 4 }, elevation: 0 },
  kickerPill:{ paddingHorizontal:10, paddingVertical:6, borderRadius:999, borderWidth:2 },
  controls:{ paddingHorizontal:24, paddingBottom:28, alignItems:'center' },
  dotsRow:{ flexDirection:'row', justifyContent:'center', alignItems:'center', gap:8 },
});
