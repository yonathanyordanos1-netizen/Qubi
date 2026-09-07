import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { fontFamilyFor } from '../../theme/typography';
import { AppColors, withAlpha } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeProvider';
import { BrandLogo } from '../../components/common/BrandLogo';
import { QubiMascot } from '../../components/QubiMascot';
import { PushableButton } from '../../components/PushableButton';

// Mobbin / Dribbble-grade intro: Editorial typography, airy whitespace, soft card, pill CTAs
export function OnboardingScreen({ onGetStarted, onLogin }: { onGetStarted: () => void; onLogin: () => void }) {
  const { colors, isDark } = useTheme();
  const cardOpacity = useSharedValue(0);
  const cardY = useSharedValue(20);
  const textOpacity = useSharedValue(0);
  const textY = useSharedValue(14);

  React.useEffect(() => {
    cardOpacity.value = withDelay(120, withTiming(1, { duration: 520 }));
    cardY.value = withDelay(120, withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) }));
    textOpacity.value = withDelay(380, withTiming(1, { duration: 420 }));
    textY.value = withDelay(380, withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) }));
  }, []);

  const cardStyle = useAnimatedStyle(() => ({ opacity: cardOpacity.value, transform: [{ translateY: cardY.value }] }));
  const textStyle = useAnimatedStyle(() => ({ opacity: textOpacity.value, transform: [{ translateY: textY.value }] }));

  const haptic = (style: Haptics.ImpactFeedbackStyle) => {
    void Haptics.impactAsync(style).catch(() => {});
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.canvas }]}>
      {/* Decorative blurred orbs — Dribbble soft gradient */}
      <View pointerEvents="none" style={[styles.orb, styles.orbTop, { backgroundColor: withAlpha(AppColors.primary, isDark ? 0.12 : 0.08) }]} />
      <View pointerEvents="none" style={[styles.orb, styles.orbBottom, { backgroundColor: withAlpha(AppColors.sky, isDark ? 0.10 : 0.06) }]} />

      <View style={styles.contentWrapper}>
        {/* Hero — Mobbin card: 24r, 1px border, soft shadow, generous breathing */}
        <Animated.View style={[styles.heroCard, cardStyle, { backgroundColor: colors.card, borderColor: colors.glassEdge, shadowColor: isDark ? '#000' : AppColors.cardShadow }]}>
          <View style={styles.heroInner}>
            <View style={[styles.logoRing, { borderColor: withAlpha(AppColors.primary, 0.12), backgroundColor: withAlpha(AppColors.primary, isDark ? 0.10 : 0.06) }]}>
              <QubiMascot size={132} celebrating />
            </View>
            {/* Caption pill */}
            <View style={[styles.captionPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : withAlpha(AppColors.primary, 0.08), borderColor: isDark ? 'rgba(255,255,255,0.08)' : withAlpha(AppColors.primary, 0.14) }]}>
              <View style={[styles.captionDot, { backgroundColor: AppColors.primary }]} />
              <Text style={[styles.captionText, { color: isDark ? withAlpha('#FFF', 0.85) : AppColors.primaryDeep }]}>
                <Text>Qubi • Daily quests</Text>
              </Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View style={[styles.bottomSection, textStyle]}>
          {/* Editorial headline — tight tracking, 30/36 */}
          <View style={styles.textSection}>
            <Text style={[styles.headline, { color: colors.ink }]}>
              <Text style={{ fontFamily: fontFamilyFor('w800') }}>
                <Text>Earn rewards</Text>
              </Text>
              <Text style={{ fontFamily: fontFamilyFor('w400'), fontWeight: '400' }}>
                <Text> for every step you take.</Text>
              </Text>
            </Text>
            <View style={{ height: 12 }} />
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              <Text style={{ fontFamily: fontFamilyFor('w500') }}>
                <Text>More than tracking — turning routine into winning streaks.</Text>
              </Text>
            </Text>
          </View>

          <View style={{ height: 32 }} />

          {/* Primary CTA — 3D pushable Duolingo style */}
          <PushableButton label="Get Started" onPress={onGetStarted} variant="primary" size="lg" haptic="medium" />

          <View style={{ height: 14 }} />

          {/* Secondary — already have account — clean 44h ghost pill */}
          <TouchableOpacity
            onPress={() => {
              haptic(Haptics.ImpactFeedbackStyle.Light);
              onLogin();
            }}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={[styles.secondaryPill, { borderColor: colors.glassEdge, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF' }]}
          >
            <Text style={[styles.secondaryPillText, { color: colors.ink }]}>
              <Text style={{ fontFamily: fontFamilyFor('w600') }}>
                <Text>Already have an account? </Text>
              </Text>
              <Text style={{ fontFamily: fontFamilyFor('w800'), color: AppColors.primary }}>
                <Text>Log in</Text>
              </Text>
            </Text>
          </TouchableOpacity>

          <View style={{ height: 18 }} />
          <Text style={[styles.footerNote, { color: colors.muted }]}>
            <Text style={{ fontFamily: fontFamilyFor('w500') }}>
              <Text>By continuing you agree to our </Text>
            </Text>
            <Text style={{ fontFamily: fontFamilyFor('w700'), color: colors.ink }}>
              <Text>Terms</Text>
            </Text>
            <Text style={{ fontFamily: fontFamilyFor('w500') }}>
              <Text> & </Text>
            </Text>
            <Text style={{ fontFamily: fontFamilyFor('w700'), color: colors.ink }}>
              <Text>Privacy Policy</Text>
            </Text>
          </Text>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  orb: { position: 'absolute', width: 280, height: 280, borderRadius: 140, opacity: 1 },
  orbTop: { top: -80, right: -80 },
  orbBottom: { bottom: 120, left: -90, width: 320, height: 320, borderRadius: 160 },
  contentWrapper: { flex: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 },
  heroCard: {
    borderRadius: 32,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 3,
  },
  heroInner: {
    paddingTop: 36,
    paddingBottom: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    alignSelf: 'center',
    gap: 18,
  },
  logoRing: {
    width: 168,
    height: 168,
    borderRadius: 84,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    transform: [{ translateX: -4 }],
  },
  captionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  captionDot: { width: 7, height: 7, borderRadius: 3.5 },
  captionText: { fontSize: 11, lineHeight: 14, letterSpacing: 0.6, fontFamily: fontFamilyFor('w700') },
  bottomSection: { flex: 1, justifyContent: 'flex-end', paddingBottom: 4 },
  textSection: { alignItems: 'center', paddingHorizontal: 8 },
  headline: { fontSize: 30, lineHeight: 36, letterSpacing: -1.1, textAlign: 'center' },
  subtitle: { fontSize: 15, lineHeight: 22, textAlign: 'center', paddingHorizontal: 8 },
  primaryButton: {
    height: 56,
    borderRadius: 16,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 6,
  },
  primaryButtonText: { fontSize: 16, lineHeight: 20, letterSpacing: 0.15, color: '#FFFFFF' },
  secondaryPill: {
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryPillText: { fontSize: 14, lineHeight: 18, textAlign: 'center' },
  footerNote: { fontSize: 11, lineHeight: 16, textAlign: 'center' },
});
