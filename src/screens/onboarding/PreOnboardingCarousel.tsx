import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { AppColors, withAlpha } from '../../theme/colors';
import { fontFamilyFor } from '../../theme/typography';
import { useGateStore } from '../../state/gateStore';
import { BrandLogo } from '../../components/common/BrandLogo';
import { QubiAvatar } from '../../components/QubiAvatar';
import { PushableButton } from '../../components/PushableButton';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

const WIDTH = Dimensions.get('window').width;

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
    <Animated.View style={[{ width: 96, height: 96, borderRadius: 28, backgroundColor: AppColors.primary, alignItems:'center', justifyContent:'center', shadowColor: AppColors.primary, shadowOpacity:0.28, shadowRadius:18, shadowOffset:{width:0,height:8}, elevation:8 }, { transform: [{ rotate: rotate.interpolate({ inputRange: [0, 8], outputRange: ['-4deg', '4deg'] }) }] }]}>
      <Ionicons name="camera" size={44} color="#FFFFFF" />
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
    <Animated.View style={[{ backgroundColor:'#FFFFFF', paddingHorizontal:12, paddingVertical:8, borderRadius:16, borderWidth:1, borderColor:'#F1F5F9', alignItems:'center' }, { transform: [{ scale: chipScale }] }]}>
      <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize:18, color }}><Text>{label}</Text></Text>
    </Animated.View>
  );
}

const SLIDES: Slide[] = [
  {
    kicker: 'STEP 1 • BUILD HABITS',
    title: 'Build Unstoppable Habits',
    subtitle: 'Qubi helps you turn tiny routines into playful quests you actually finish.',
    accent: AppColors.primary,
    render: (
      <View style={{ alignItems:'center' }}>
        <View style={{ width: 200, height: 200, borderRadius: 100, backgroundColor: withAlpha(AppColors.primary,0.12), alignItems:'center', justifyContent:'center', borderWidth:1, borderColor: withAlpha(AppColors.primary,0.18), overflow:'hidden' }}>
          <QubiAvatar size={180} glow accessibilityLabel="Qubi mascot" />
        </View>
        <View style={{ position:'absolute', top: -6, right: 12, backgroundColor:'#FFFFFF', paddingHorizontal:10, paddingVertical:6, borderRadius:999, borderWidth:1, borderColor:'#F1F5F9', shadowColor:'#000', shadowOpacity:0.06, shadowRadius:10 }}>
          <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize:11, color:AppColors.ink }}><Text>{'✓ Morning Quest'}</Text></Text>
        </View>
      </View>
    ),
  },
  {
    kicker: 'STEP 2 • SNAP & PROVE',
    title: 'Snap & Verify Quests',
    subtitle: 'Floating camera magic — snap a photo and Qubi verifies your win instantly.',
    accent: AppColors.sky,
    render: (
      <View style={{ alignItems:'center' }}>
        <View style={{ width: 200, height: 200, borderRadius: 48, backgroundColor: withAlpha(AppColors.sky,0.14), alignItems:'center', justifyContent:'center', borderWidth:1, borderColor: withAlpha(AppColors.sky,0.22) }}>
          <FloatingCamera />
          <View style={{ position:'absolute', bottom: 18, right: 18, width: 42, height:42, borderRadius:21, backgroundColor: AppColors.success, alignItems:'center', justifyContent:'center', borderWidth:3, borderColor:'#FFFFFF' }}>
            <Ionicons name="checkmark" size={22} color="#FFFFFF" />
          </View>
        </View>
      </View>
    ),
  },
  {
    kicker: 'STEP 3 • LEVEL UP',
    title: 'Level Up & Win',
    subtitle: 'Earn XP, protect your streak 🔥 and climb the Qubi leaderboard with friends.',
    accent: '#F59E0B',
    render: (
      <View style={{ alignItems:'center' }}>
        <View style={{ width: 200, height: 200, borderRadius: 48, backgroundColor: withAlpha('#F59E0B',0.14), alignItems:'center', justifyContent:'center', borderWidth:1, borderColor: withAlpha('#F59E0B',0.22) }}>
          <View style={{ flexDirection:'row', gap:10 }}>
            <XpChip label="+50 XP ✨" color={AppColors.primary} />
            <XpChip label="🔥 12" color="#F59E0B" delay={80} />
          </View>
          <View style={{ height:12 }} />
          <View style={{ flexDirection:'row', alignItems:'center', backgroundColor:'#FFFFFF', paddingHorizontal:12, paddingVertical:8, borderRadius:999, borderWidth:1, borderColor:'#F1F5F9' }}>
            <View style={{ width:28, height:28, borderRadius:14, backgroundColor: withAlpha(AppColors.primary,0.15), alignItems:'center', justifyContent:'center' }}><Text style={{ fontSize:14 }}><Text>{'🏆'}</Text></Text></View>
            <View style={{ width:8 }} />
            <Text style={{ fontFamily: fontFamilyFor('w700'), fontSize:12, color:AppColors.ink }}><Text>{'Qubi Leaderboard • Top 3'}</Text></Text>
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
  const { colors } = useTheme();
  const completeWalkthrough = useGateStore((s) => s.completeWalkthrough);
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / WIDTH);
    if (i !== index && i >= 0 && i < SLIDES.length) {
      setIndex(i);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(()=>{});
    }
  };
  const go = (i: number) => {
    scrollRef.current?.scrollTo({ x: i * WIDTH, animated: true });
    setIndex(Math.max(0, Math.min(SLIDES.length - 1, i)));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(()=>{});
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.canvas }]}>
      <View style={styles.topRow}>
        <BrandLogo size={30} />
        <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize: 18, letterSpacing: -0.6, color: colors.ink }}><Text>Qubi</Text></Text>
        <View style={styles.flex1} />
        <View style={{ borderRadius:999, borderWidth:1, borderColor: withAlpha(colors.ink,0.12), paddingHorizontal:14, paddingVertical:7, backgroundColor: colors.card }}>
          <Text onPress={()=> { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(()=>{}); completeWalkthrough(); }} style={{ fontFamily: fontFamilyFor('w700'), fontSize:12, color: colors.muted }}><Text>Skip</Text></Text>
        </View>
      </View>

      <ScrollView ref={scrollRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll} style={styles.flex} decelerationRate="fast" snapToInterval={WIDTH} snapToAlignment="center">
        {SLIDES.map((s, idx) => {
          return (
            <SlidePage key={s.title} delay={idx * 40} width={WIDTH}>
              <View style={{ height: 12 }} />
              <View style={[styles.heroWrap, { backgroundColor: colors.card, borderColor: withAlpha(s.accent,0.14), shadowColor: s.accent }]}>
                {s.render}
              </View>
              <View style={{ height: 22 }} />
              <View style={[styles.kickerPill, { backgroundColor: withAlpha(s.accent,0.12), borderColor: withAlpha(s.accent,0.18) }]}>
                <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize:10, letterSpacing:1.2, color: s.accent }}><Text>{s.kicker}</Text></Text>
              </View>
              <View style={{ height: 10 }} />
              <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize: 26, lineHeight: 30, letterSpacing: -0.8, color: colors.ink, textAlign:'center', paddingHorizontal: 24 }}><Text>{s.title}</Text></Text>
              <View style={{ height: 10 }} />
              <Text style={{ fontFamily: fontFamilyFor('w500'), fontSize: 14, lineHeight: 20, color: colors.muted, textAlign:'center', paddingHorizontal: 36 }}><Text>{s.subtitle}</Text></Text>
            </SlidePage>
          );
        })}
      </ScrollView>

      <View style={styles.controls}>
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <PaginationDot key={i} active={i === index} accent={AppColors.primary} mutedColor={colors.muted} />
          ))}
        </View>
        <View style={{ height: 18 }} />
        {last ? (
          <PushableButton label="LET'S GO!" onPress={()=> completeWalkthrough()} variant="primary" size="lg" haptic="medium" />
        ) : (
          <PushableButton label="Next" onPress={()=> go(index+1)} variant="primary" size="lg" />
        )}
        <View style={{ height: 6 }} />
        <Text style={{ textAlign:'center', fontFamily: fontFamilyFor('w600'), fontSize:11, color: withAlpha(colors.muted,0.8) }}><Text>{'Swipe to explore • Qubi'}</Text></Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex:{ flex:1 },
  flex1:{ flex:1 },
  topRow:{ flexDirection:'row', alignItems:'center', paddingHorizontal:20, paddingTop:14, gap:8 },
  page:{ flex:1, justifyContent:'center', alignItems:'center', paddingHorizontal: 8 },
  heroWrap:{ width: 220, height: 220, borderRadius: 36, borderWidth:1.5, alignItems:'center', justifyContent:'center', shadowOpacity:0.10, shadowRadius:18, shadowOffset:{width:0,height:8}, elevation:4 },
  kickerPill:{ paddingHorizontal:10, paddingVertical:6, borderRadius:999, borderWidth:1 },
  controls:{ paddingHorizontal:24, paddingBottom:28 },
  dotsRow:{ flexDirection:'row', justifyContent:'center', alignItems:'center', gap:8 },
});
