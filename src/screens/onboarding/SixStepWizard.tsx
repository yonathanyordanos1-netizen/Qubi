import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInRight, FadeOutLeft, Layout, useAnimatedStyle, useSharedValue, withTiming, withDelay, withRepeat, Easing, useAnimatedReaction, useAnimatedScrollHandler } from 'react-native-reanimated';

import { useTheme } from '../../theme/ThemeProvider';
import { AppColors, withAlpha } from '../../theme/colors';
import { fontFamilyFor } from '../../theme/typography';
import { supabase } from '../../services/supabase';
import { useOnboardingStore } from '../../state/onboardingStore';
import { useOtpAuthStore } from '../../state/otpAuthStore';
import { useGateStore } from '../../state/gateStore';
import { QubiAvatar } from '../../components/QubiAvatar';

function useAppRouter(): { push: (href: string) => void; replace: (href: string) => void; back: () => void } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const r = require('expo-router').router as { push: (h: string) => void; replace: (h: string) => void; back: () => void } | undefined;
    if (r != null && typeof r.push === 'function') return r;
  } catch {}
  return { push: () => {}, replace: () => {}, back: () => {} };
}

/** Speech bubble card — Duolingo style */
function SpeechBubble({ children, isDark }: { children: React.ReactNode; isDark: boolean }) {
  return (
    <View style={[styles.bubbleCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF', borderColor: isDark ? 'rgba(255,255,255,0.10)' : '#E2E8F0' }]}>
      <Text style={[styles.bubbleText, { color: isDark ? '#FFFFFF' : AppColors.ink }]}><Text>{children as any}</Text></Text>
      <View style={[styles.bubbleTail, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF', borderColor: isDark ? 'rgba(255,255,255,0.10)' : '#E2E8F0' }]} />
    </View>
  );
}

export function SixStepWizard({ onOtpRequired }: { onOtpRequired?: (email: string) => void }) {
  // Wrapper for default export compat
  return <SixStepWizardInner onOtpRequired={onOtpRequired} />;
}

function SixStepWizardInner({ onOtpRequired }: { onOtpRequired?: (email: string) => void }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useAppRouter();
  const onboarding = useOnboardingStore();

  const [step, setStep] = useState(0); // 0..5
  const [displayName, setDisplayName] = useState(onboarding.displayName ?? '');
  const [username, setUsername] = useState(onboarding.username ?? '');
  const [email, setEmail] = useState(onboarding.email ?? '');
  const [dailyGoal, setDailyGoal] = useState<5 | 10 | 15 | 20 | null>(onboarding.dailyGoal ?? null);
  const [motivation, setMotivation] = useState<'consistency' | 'skills' | 'friends' | null>(onboarding.motivation ?? null);
  const [focused, setFocused] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const pressY = useSharedValue(0);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ translateY: pressY.value }] }));
  const bobY = useSharedValue(0);
  const bobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bobY.value }] }));
  const transitionOpacity = useSharedValue(1);

  useEffect(() => {
    bobY.value = withRepeat(withTiming(-6, { duration: 1400 }), -1, true);
  }, [bobY]);

  // Fade transition between steps
  useEffect(() => {
    transitionOpacity.value = withDelay(100, withTiming(1, { duration: 200 }));
  }, [step]);

  const totalSteps = 6;

  const canGoNext = useMemo(() => {
    if (step === 0) return true;
    if (step === 1) return dailyGoal !== null;
    if (step === 2) return motivation !== null;
    if (step === 3) return displayName.trim().length >= 2;
    if (step === 4) return /^[a-z0-9_]{3,16}$/.test(username.replace(/^@/, '').toLowerCase());
    if (step === 5) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    return false;
  }, [step, dailyGoal, motivation, displayName, username, email]);

  const handleNext = () => {
    if (!canGoNext) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // Persist step data to store
    if (step === 1 && dailyGoal) useOnboardingStore.getState().setDailyGoal(dailyGoal);
    if (step === 2 && motivation) useOnboardingStore.getState().setMotivation(motivation);
    if (step === 3) useOnboardingStore.getState().setDisplayName(displayName.trim());
    if (step === 4) useOnboardingStore.getState().setUsername(username.trim().toLowerCase());
    if (step < 5) setStep((s) => s + 1);
  };

  const handleBack = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (step > 0) setStep((s) => s - 1);
  };

  const handleCreateAccount = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert('Validation Error', 'Please enter a valid email address.');
      return;
    }
    if (isLoading) return;
    setIsLoading(true);
    try {
      if (supabase == null) {
        Alert.alert('Error', 'Backend not configured');
        return;
      }
      const cleanEmail = email.trim().toLowerCase();
      const cleanUsername = username.replace(/^@/, '').trim().toLowerCase() || onboarding.username?.trim().toLowerCase() || '';
      const cleanDisplay = displayName.trim() || onboarding.displayName?.trim() || '';
      const goal = dailyGoal ?? onboarding.dailyGoal ?? null;
      const mot = motivation ?? onboarding.motivation ?? null;

      // Persist to stores for verify screen
      useOnboardingStore.getState().setEmail(cleanEmail);
      useOnboardingStore.getState().setOnboardingData({ email: cleanEmail, username: cleanUsername, displayName: cleanDisplay, dailyGoal: goal as any, motivation: mot as any });
      useOtpAuthStore.getState().setPendingAuth({ email: cleanEmail, username: cleanUsername, displayName: cleanDisplay });

      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          data: {
            ...(cleanUsername ? { username: cleanUsername } : {}),
            ...(cleanDisplay ? { display_name: cleanDisplay } : {}),
            ...(goal ? { daily_goal: goal } : {}),
            ...(mot ? { motivation: mot } : {}),
          },
          shouldCreateUser: true,
        },
      });
      if (error) {
        if (error.message.toLowerCase().includes('already registered') || error.message.toLowerCase().includes('already exists')) {
          Alert.alert('Account Exists', 'User with this email address already exists');
        } else {
          Alert.alert('Sign Up Error', error.message);
        }
        return;
      }
      // Mark walkthrough/onboarding done and route to OTP
      useGateStore.getState().completeWalkthrough();
      useGateStore.getState().completeOnboarding();
      if (onOtpRequired) onOtpRequired(cleanEmail);
      else (router.push as any)({ pathname: '/auth/verify-otp', params: { email: cleanEmail } });
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to send code');
    } finally {
      setIsLoading(false);
    }
  };

  const inputBg = isDark ? colors.card : '#FFFFFF';
  const inputBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0';
  const focusedBorder = withAlpha(AppColors.primary, 0.38);

  const usernameClean = username.replace(/^@/, '').toLowerCase();
  const isUsernameValid = /^[a-z0-9_]{3,16}$/.test(usernameClean);
  const usernameBorder = username.length === 0 ? (focused === 'username' ? focusedBorder : inputBorder) : isUsernameValid ? withAlpha('#16A34A', 0.55) : withAlpha('#EF4444', 0.5);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? AppColors.canvasDark : '#FFF7ED' }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        {/* Header: 6-segment progress + back arrow */}
        <View style={[styles.headerBar, { paddingTop: 8, paddingHorizontal: 24 }]}>
          {step > 0 ? (
            <TouchableOpacity onPress={handleBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={20} color={colors.ink} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 32 }} />
          )}
          <View style={styles.progressRow}>
            {Array.from({ length: totalSteps }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.progressSegment,
                  { backgroundColor: i <= step ? AppColors.primary : isDark ? 'rgba(255,255,255,0.12)' : '#E2E8F0' },
                ]}
              >
                {i <= step ? <View style={styles.progressHighlight} /> : null}
              </View>
            ))}
          </View>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Qubi Mascot — circular Glow avatar 96, ONE instance only above Step 0 speech bubble */}
          <View style={styles.mascotWrap}>
            <QubiAvatar size={96} glow accessibilityLabel="Qubi mascot" />
            {/* Speech bubble below mascot on step 0 only */}
            {step === 0 ? (
              <Animated.View style={{ opacity: transitionOpacity }} key={`onboarding-step-0`}><View style={{ width: '100%', alignItems: 'center', marginTop: 14 }}>
                <SpeechBubble isDark={isDark}>{`Hi there! I'm Qubi. Ready to level up your daily habits?`}</SpeechBubble>
              </View></Animated.View>
            ) : null}
          </View>

          {/* Step Content Card — gamified white card r28 border2 shadow */}
          <Animated.View style={{ opacity: transitionOpacity }} key={`onboarding-step-${step}`}>
            {step === 0 ? (
              <>
                <Text style={[styles.cardTitle, { color: colors.ink }]}><Text style={{ fontFamily: fontFamilyFor('w900') }}><Text>{'Welcome to Qubi'}</Text></Text></Text>
                <View style={{ height: 8 }} />
                <Text style={[styles.cardDesc, { color: colors.muted }]}><Text style={{ fontFamily: fontFamilyFor('w500') }}><Text>{'Your playful habit coach — build streaks, earn XP, and win with friends.'}</Text></Text></Text>
                <View style={{ height: 18 }} />
                <View style={{ width: '100%' }}>
                  <View style={styles.ctaShadow} />
                  <Animated.View style={pressStyle}>
                    <TouchableOpacity
                      activeOpacity={0.95}
                      onPressIn={() => { pressY.value = withTiming(4, { duration: 90 }); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }}
                      onPressOut={() => { pressY.value = withTiming(0, { duration: 180 }); }}
                      onPress={handleNext}
                      style={styles.ctaFront}
                    >
                      <Text style={styles.ctaFrontText}><Text>{`Let's Do It!`}</Text></Text>
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              </>
            ) : step === 1 ? (
              <Animated.View style={{ opacity: transitionOpacity }} key={`onboarding-step-1`}><><>
                <Text style={[styles.cardTitle, { color: colors.ink }]}><Text style={{ fontFamily: fontFamilyFor('w800') }}><Text>{'Choose your daily commitment'}</Text></Text></Text>
                <View style={{ height: 6 }} />
                <Text style={[styles.cardDesc, { color: colors.muted }]}><Text style={{ fontFamily: fontFamilyFor('w500') }}><Text>{'How much time will you invest each day?'}</Text></Text></Text>
                <View style={{ height: 16 }} />
                {[
                  { v: 5 as const, icon: '⚡', label: '5 mins/day', sub: 'Casual' },
                  { v: 10 as const, icon: '🔥', label: '10 mins/day', sub: 'Regular' },
                  { v: 15 as const, icon: '🚀', label: '15 mins/day', sub: 'Serious' },
                  { v: 20 as const, icon: '👑', label: '20 mins/day', sub: 'Supercharged' },
                ].map((opt) => {
                  const active = dailyGoal === opt.v;
                  return (
                    <TouchableOpacity
                      key={opt.v}
                      activeOpacity={0.85}
                      onPress={() => { setDailyGoal(opt.v); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }}
                      style={[
                        styles.selectCard,
                        { backgroundColor: active ? withAlpha(AppColors.primary, 0.08) : inputBg, borderColor: active ? AppColors.primary : inputBorder },
                      ]}
                    >
                      <Text style={{ fontSize: 18 }}><Text>{opt.icon}</Text></Text>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[styles.selectLabel, { color: colors.ink }]}><Text>{opt.label}</Text></Text>
                        <Text style={[styles.selectSub, { color: colors.muted }]}><Text>{opt.sub}</Text></Text>
                      </View>
                      {active ? <Ionicons name="checkmark-circle" size={22} color={AppColors.primary} /> : <View style={[styles.radioOuter, { borderColor: inputBorder }]} />}
                    </TouchableOpacity>
                  );
                })}
                <View style={{ height: 16 }} />
                <View style={{ width: '100%' }}>
                  <View style={styles.ctaShadow} />
                  <Animated.View style={pressStyle}>
                    <TouchableOpacity
                      activeOpacity={0.95}
                      disabled={!canGoNext}
                      onPressIn={() => { if (canGoNext) { pressY.value = withTiming(4, { duration: 90 }); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); } }}
                      onPressOut={() => { pressY.value = withTiming(0, { duration: 180 }); }}
                      onPress={handleNext}
                      style={[styles.ctaFront, { backgroundColor: canGoNext ? AppColors.primary : '#9CA3AF', borderColor: canGoNext ? '#D45A07' : '#9CA3AF', opacity: canGoNext ? 1 : 0.9 }]}
                    >
                      <Text style={styles.ctaFrontText}><Text>{'Continue'}</Text></Text>
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              </></>
            </Animated.View>
          ) : step === 2 ? (
              <>
                <Text style={[styles.cardTitle, { color: colors.ink }]}><Text style={{ fontFamily: fontFamilyFor('w800') }}><Text>{`What's your main goal?`}</Text></Text></Text>
                <View style={{ height: 6 }} />
                <Text style={[styles.cardDesc, { color: colors.muted }]}><Text style={{ fontFamily: fontFamilyFor('w500') }}><Text>{'Pick one — Qubi will tailor your quest.'}</Text></Text></Text>
                <View style={{ height: 16 }} />
                {[
                  { k: 'consistency' as const, icon: '🔁', title: 'Build Consistency', desc: 'Show up every day' },
                  { k: 'skills' as const, icon: '📚', title: 'Learn New Skills', desc: 'Master something new' },
                  { k: 'friends' as const, icon: '👥', title: 'Compete with Friends', desc: 'Climb the leaderboard' },
                ].map((opt) => {
                  const active = motivation === opt.k;
                  return (
                    <TouchableOpacity
                      key={opt.k}
                      activeOpacity={0.85}
                      onPress={() => { setMotivation(opt.k); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }}
                      style={[
                        styles.selectCard,
                        { backgroundColor: active ? withAlpha(AppColors.primary, 0.08) : inputBg, borderColor: active ? AppColors.primary : inputBorder },
                      ]}
                    >
                      <Text style={{ fontSize: 18 }}><Text>{opt.icon}</Text></Text>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[styles.selectLabel, { color: colors.ink }]}><Text>{opt.title}</Text></Text>
                        <Text style={[styles.selectSub, { color: colors.muted }]}><Text>{opt.desc}</Text></Text>
                      </View>
                      {active ? <Ionicons name="checkmark-circle" size={22} color={AppColors.primary} /> : <View style={[styles.radioOuter, { borderColor: inputBorder }]} />}
                    </TouchableOpacity>
                  );
                })}
                <View style={{ height: 16 }} />
                <View style={{ width: '100%' }}>
                  <View style={styles.ctaShadow} />
                  <Animated.View style={pressStyle}>
                    <TouchableOpacity
                      activeOpacity={0.95}
                      disabled={!canGoNext}
                      onPressIn={() => { if (canGoNext) { pressY.value = withTiming(4, { duration: 90 }); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); } }}
                      onPressOut={() => { pressY.value = withTiming(0, { duration: 180 }); }}
                      onPress={handleNext}
                      style={[styles.ctaFront, { backgroundColor: canGoNext ? AppColors.primary : '#9CA3AF', borderColor: canGoNext ? '#D45A07' : '#9CA3AF', opacity: canGoNext ? 1 : 0.9 }]}
                    >
                      <Text style={styles.ctaFrontText}><Text>{'Continue'}</Text></Text>
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              </>
            ) : step === 3 ? (
              <Animated.View style={{ opacity: transitionOpacity }} key={`onboarding-step-3`}><><>
                <Text style={[styles.cardTitle, { color: colors.ink }]}><Text style={{ fontFamily: fontFamilyFor('w800') }}><Text>{`What should we call you?`}</Text></Text></Text>
                <View style={[styles.inputCard, { backgroundColor: inputBg, borderColor: focused === 'display' ? withAlpha(AppColors.primary, 0.38) : inputBorder }]}>
                  <View style={styles.inputRow}>
                    <Ionicons name="person-outline" size={18} color={focused === 'display' ? AppColors.primary : withAlpha(colors.muted, 0.9)} />
                    <TextInput
                      value={displayName}
                      onChangeText={setDisplayName}
                      placeholder="Alex Rivera"
                      placeholderTextColor={withAlpha(colors.muted, 0.65)}
                      autoCorrect={false}
                      maxLength={32}
                      returnKeyType="next"
                      onFocus={() => setFocused('display')}
                      onBlur={() => setFocused(null)}
                      onSubmitEditing={handleNext}
                      style={[styles.input, { color: colors.ink }]}
                    />
                  </View>
                </View>
                <View style={{ height: 16 }} />
                <View style={{ width: '100%' }}>
                  <View style={styles.ctaShadow} />
                  <Animated.View style={pressStyle}>
                    <TouchableOpacity
                      activeOpacity={0.95}
                      disabled={!canGoNext}
                      onPressIn={() => { if (canGoNext) { pressY.value = withTiming(4, { duration: 90 }); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); } }}
                      onPressOut={() => { pressY.value = withTiming(0, { duration: 180 }); }}
                      onPress={handleNext}
                      style={[styles.ctaFront, { backgroundColor: canGoNext ? AppColors.primary : '#9CA3AF', borderColor: canGoNext ? '#D45A07' : '#9CA3AF', opacity: canGoNext ? 1 : 0.9 }]}
                    >
                      <Text style={styles.ctaFrontText}><Text>{'Continue'}</Text></Text>
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              </></>
            </Animated.View>
            ) : step === 4 ? (
              <>
                <View style={{ width: '100%', alignItems: 'center' }}>
                  <View style={{ height: 10 }} />
                  <View style={[styles.bubbleCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFF7ED', borderColor: isDark ? 'rgba(255,255,255,0.10)' : '#FFE4CC' }]}>
                    <Text style={[styles.bubbleText, { color: colors.ink }]}><Text>{'Pick a unique handle'}</Text></Text>
                  </View>
                </View>
                <View style={{ height: 16 }} />
                <Text style={[styles.label, { color: colors.muted }]}><Text>{'USERNAME'}</Text></Text>
                <View style={[styles.inputCard, { backgroundColor: inputBg, borderColor: username.length === 0 ? (focused === 'username' ? withAlpha(AppColors.primary, 0.38) : inputBorder) : /^[a-z0-9_]{3,16}$/.test(username.replace(/^@/, '').toLowerCase()) ? withAlpha('#16A34A', 0.55) : withAlpha('#EF4444', 0.5) }]}>
                  <View style={styles.inputRow}>
                    <Text style={{ fontFamily: fontFamilyFor('w700'), fontSize: 15, color: colors.muted }}><Text>{'@'}</Text></Text>
                    <TextInput
                      value={username}
                      onChangeText={(t) => setUsername(t.replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 16))}
                      placeholder="alex_q"
                      placeholderTextColor={withAlpha(colors.muted, 0.65)}
                      autoCapitalize="none"
                      autoCorrect={false}
                      maxLength={16}
                      returnKeyType="next"
                      onFocus={() => setFocused('username')}
                      onBlur={() => setFocused(null)}
                      onSubmitEditing={handleNext}
                      style={[styles.input, { color: colors.ink }]}
                    />
                    {username.length > 0 ? (
                      /^[a-z0-9_]{3,16}$/.test(username.replace(/^@/, '').toLowerCase()) ? (
                        <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                      ) : (
                        <Ionicons name="close-circle" size={18} color="#EF4444" />
                      )
                    ) : null}
                  </View>
                </View>
                <View style={{ height: 6 }} />
                <Text style={[styles.hint, { color: username.length > 0 && !/^[a-z0-9_]{3,16}$/.test(username.replace(/^@/, '').toLowerCase()) ? '#D97706' : colors.muted }]}><Text>{username.length > 0 && !/^[a-z0-9_]{3,16}$/.test(username.replace(/^@/, '').toLowerCase()) ? '3–16 chars: lowercase, numbers, underscores' : 'Friends find you by this handle'}</Text></Text>
                <View style={{ height: 16 }} />
                <View style={{ width: '100%' }}>
                  <View style={styles.ctaShadow} />
                  <Animated.View style={pressStyle}>
                    <TouchableOpacity
                      activeOpacity={0.95}
                      disabled={!canGoNext}
                      onPressIn={() => { if (canGoNext) { pressY.value = withTiming(4, { duration: 90 }); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); } }}
                      onPressOut={() => { pressY.value = withTiming(0, { duration: 180 }); }}
                      onPress={handleNext}
                      style={[styles.ctaFront, { backgroundColor: canGoNext ? AppColors.primary : '#9CA3AF', borderColor: canGoNext ? '#D45A07' : '#9CA3AF', opacity: canGoNext ? 1 : 0.9 }]}
                    >
                      <Text style={styles.ctaFrontText}><Text>{'Continue'}</Text></Text>
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              </>
            ) : (
              <>
                <View style={[styles.summaryCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFF7ED', borderColor: inputBorder }]}>
                  <Text style={[styles.summaryTitle, { color: colors.ink }]}><Text style={{ fontFamily: fontFamilyFor('w800') }}><Text>{'Your journey is ready!'}</Text></Text></Text>
                  <View style={{ height: 10 }} />
                  <View style={styles.badgeRow}>
                    {dailyGoal ? (
                      <View style={[styles.badge, { backgroundColor: withAlpha(AppColors.primary, 0.12), borderColor: withAlpha(AppColors.primary, 0.2) }]}>
                        <Text style={{ fontSize: 14 }}><Text>{dailyGoal === 5 ? '⚡' : dailyGoal === 10 ? '🔥' : dailyGoal === 15 ? '🚀' : '👑'}</Text></Text>
                        <Text style={[styles.badgeText, { color: AppColors.primary }]}><Text>{`${dailyGoal} mins/day`}</Text></Text>
                      </View>
                    ) : null}
                    {motivation ? (
                      <View style={[styles.badge, { backgroundColor: withAlpha('#16A34A', 0.12), borderColor: withAlpha('#16A34A', 0.2) }]}>
                        <Text style={{ fontSize: 14 }}><Text>{motivation === 'consistency' ? '🔁' : motivation === 'skills' ? '📚' : '👥'}</Text></Text>
                        <Text style={[styles.badgeText, { color: '#16A34A' }]}><Text>{motivation === 'consistency' ? 'Consistency' : motivation === 'skills' ? 'Skills' : 'Friends'}</Text></Text>
                      </View>
                    ) : null}
                  </View>
                  {(displayName || username) ? (
                    <>
                      <View style={{ height: 8 }} />
                      {displayName ? <Text style={[styles.summaryLine, { color: colors.ink }]}><Text>{`Hi, ${displayName} `}</Text><Text style={{ color: colors.muted }}><Text>{`@${username.replace(/^@/, '')}`}</Text></Text></Text> : null}
                    </>
                  ) : null}
                </View>
                <View style={{ height: 16 }} />
                <Text style={[styles.label, { color: colors.muted }]}><Text>{'EMAIL'}</Text></Text>
                <View style={[styles.inputCard, { backgroundColor: inputBg, borderColor: focused === 'email' ? withAlpha(AppColors.primary, 0.38) : inputBorder }]}>
                  <View style={styles.inputRow}>
                    <Ionicons name="mail-outline" size={18} color={focused === 'email' ? AppColors.primary : withAlpha(colors.muted, 0.9)} />
                    <TextInput
                      value={email}
                      onChangeText={setEmail}
                      placeholder="you@example.com"
                      placeholderTextColor={withAlpha(colors.muted, 0.65)}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="done"
                      editable={true}
                      selectTextOnFocus={true}
                      onFocus={() => setFocused('email')}
                      onBlur={() => setFocused(null)}
                      onSubmitEditing={handleCreateAccount}
                      style={[styles.input, { color: colors.ink }]}
                    />
                  </View>
                </View>
                <View style={{ height: 16 }} />
                <View style={{ width: '100%' }}>
                  <View style={styles.ctaShadow} />
                  <Animated.View style={pressStyle}>
                    <TouchableOpacity
                      activeOpacity={0.95}
                      disabled={!canGoNext || isLoading}
                      onPressIn={() => { if (canGoNext && !isLoading) { pressY.value = withTiming(4, { duration: 90 }); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); } }}
                      onPressOut={() => { pressY.value = withTiming(0, { duration: 180 }); }}
                      onPress={handleCreateAccount}
                      style={[styles.ctaFront, { backgroundColor: canGoNext && !isLoading ? AppColors.primary : '#9CA3AF', borderColor: canGoNext && !isLoading ? '#D45A07' : '#9CA3AF', opacity: canGoNext && !isLoading ? 1 : 0.9 }]}
                    >
                      {isLoading ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.ctaFrontText}><Text>{'Create Account & Send Code'}</Text></Text>}
                    </TouchableOpacity>
                  </Animated.View>
                </View>
                <View style={{ height: 10 }} />
                <Text style={[styles.footerNote, { color: withAlpha(colors.muted, 0.8) }]}><Text>{'We’ll send a 6-digit code to your email'}</Text></Text>
              </>
            )}
            </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  headerBar: { flexDirection: 'row', alignItems: 'center', paddingBottom: 8 },
  backBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  progressRow: { flexDirection: 'row', gap: 6, flex: 1, marginHorizontal: 12 },
  progressSegment: { height: 12, borderRadius: 8, flex: 1, overflow: 'hidden' },
  progressHighlight: { position: 'absolute', top: 3, left: 8, right: 8, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.5)' },
  scrollContent: { paddingHorizontal: 24, paddingTop: 8, gap: 0, flexGrow: 1 },
  mascotWrap: { width: '100%', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16 },
  bubbleCard: {
    maxWidth: 320,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  bubbleText: { fontSize: 13, lineHeight: 18, fontFamily: fontFamilyFor('w600'), textAlign: 'center' },
  bubbleTail: {
    position: 'absolute',
    bottom: -6,
    left: '50%',
    marginLeft: -6,
    width: 12,
    height: 12,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    transform: [{ rotate: '-45deg' }],
  },
  guideCard: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderBottomWidth: 5,
    borderBottomColor: '#CBD5E1',
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardTitle: { fontSize: 22, lineHeight: 28, letterSpacing: -0.6, textAlign: 'center' },
  cardDesc: { fontSize: 13, lineHeight: 18, textAlign: 'center', paddingHorizontal: 8 },
  label: { fontSize: 11, lineHeight: 14, letterSpacing: 0.8, fontFamily: fontFamilyFor('w700'), marginBottom: 7 },
  inputCard: { height: 52, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, justifyContent: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, fontSize: 15, lineHeight: 20, fontFamily: fontFamilyFor('w500'), paddingVertical: 0 },
  hint: { fontSize: 11, fontFamily: fontFamilyFor('w500') },
  selectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    marginBottom: 10,
  },
  selectLabel: { fontSize: 14, fontFamily: fontFamilyFor('w800'), letterSpacing: -0.2 },
  selectSub: { fontSize: 12, fontFamily: fontFamilyFor('w500') },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2 },
  summaryCard: { borderRadius: 16, padding: 14, borderWidth: 1, alignItems: 'center' },
  summaryTitle: { fontSize: 16, textAlign: 'center' },
  badgeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  badgeText: { fontSize: 12, fontFamily: fontFamilyFor('w700') },
  summaryLine: { fontSize: 13, fontFamily: fontFamilyFor('w600'), textAlign: 'center' },
  ctaShadow: { position: 'absolute', top: 0, left: 0, right: 0, height: 56, borderRadius: 16, backgroundColor: '#C2410C' },
  ctaFront: { height: 52, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  ctaFrontText: { fontSize: 16, fontFamily: fontFamilyFor('w800'), color: '#FFFFFF', letterSpacing: -0.2 },
  footerNote: { fontSize: 11, textAlign: 'center', fontFamily: fontFamilyFor('w500') },
});

export default SixStepWizard;
