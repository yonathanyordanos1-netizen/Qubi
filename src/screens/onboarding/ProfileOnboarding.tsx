import React, { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { useTheme } from '../../theme/ThemeProvider';
import { AppColors, withAlpha } from '../../theme/colors';
import { fontFamilyFor } from '../../theme/typography';
import { useAppStore } from '../../state/appStore';
import { useGateStore } from '../../state/gateStore';
import { QubiMascot } from '../../components/QubiMascot';

type HandleState = 'idle' | 'invalid' | 'valid';

/**
 * ProfileOnboarding — polished onboarding after 3-step guide, before auth.
 * Collects display name + @username locally (no Supabase needed pre-auth).
 * Duolingo-grade: white card r28/border2/shadow, floating Qubi, 3D CTA h56/r16.
 * Persists hasCompletedOnboarding via gateStore + routes to Sign Up hub.
 * Hermes: all strings inside <Text>.
 */
export function ProfileOnboarding({ onComplete, onLogin }: { onComplete: () => void; onLogin?: () => void }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [displayName, setDisplayName] = useState(useAppStore.getState().displayName ?? '');
  const [handle, setHandle] = useState('');
  const [focused, setFocused] = useState<string | null>(null);

  const cleanHandle = handle.replace(/^@/, '').toLowerCase();
  const isHandleValid = useMemo(() => /^[a-z0-9_]{3,16}$/.test(cleanHandle), [cleanHandle]);
  const handleState: HandleState = cleanHandle.length === 0 ? 'idle' : isHandleValid ? 'valid' : 'invalid';
  const canSubmit = displayName.trim().length >= 2 && isHandleValid;

  // Floating XP chip
  const y = useSharedValue(0);
  React.useEffect(() => { y.value = withRepeat(withTiming(-6, { duration: 1300 }), -1, true); }, [y]);
  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  // 3D CTA press
  const pressY = useSharedValue(0);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ translateY: pressY.value }] }));

  const haptic = (s: Haptics.ImpactFeedbackStyle) => { void Haptics.impactAsync(s).catch(() => {}); };

  const handleContinue = () => {
    if (!canSubmit) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    haptic(Haptics.ImpactFeedbackStyle.Medium);
    // Persist locally for post-auth profile creation
    useAppStore.setState({ displayName: displayName.trim(), username: cleanHandle });
    // Mark onboarding done (gateStore) + hasCompletedOnboarding flag
    useGateStore.getState().completeOnboarding?.();
    // Also ensure walkthrough is marked done (defensive)
    useGateStore.getState().completeWalkthrough();
    onComplete();
  };

  const handleSkip = () => {
    haptic(Haptics.ImpactFeedbackStyle.Light);
    useGateStore.getState().completeOnboarding?.();
    useGateStore.getState().completeWalkthrough();
    onComplete();
  };

  const handleLogin = () => {
    haptic(Haptics.ImpactFeedbackStyle.Light);
    useGateStore.getState().completeOnboarding?.();
    if (onLogin) onLogin();
    else onComplete();
  };

  const inputBg = isDark ? colors.card : '#FFFFFF';
  const inputBorderDefault = isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0';
  const nameBorder = focused === 'name' ? withAlpha(AppColors.primary, 0.38) : inputBorderDefault;
  const handleBorder = handleState === 'invalid' ? withAlpha('#EF4444', 0.5) : handleState === 'valid' ? withAlpha('#16A34A', 0.55) : focused === 'handle' ? withAlpha(AppColors.primary, 0.38) : inputBorderDefault;

  const hint = (): { text: string; color: string; icon?: string } => {
    if (handleState === 'valid') return { text: 'Username available', color: '#16A34A', icon: 'checkmark-circle' };
    if (handleState === 'invalid') return { text: '3–16 chars: lowercase, numbers, underscores', color: '#D97706' };
    return { text: 'Friends find you by this handle', color: colors.muted };
  };
  const h = hint();

  return (
    <View style={[styles.flex, { backgroundColor: isDark ? AppColors.canvasDark : '#FFFFFF', paddingTop: insets.top + 12 }]}>
      {/* Top bar: progress + Skip */}
      <View style={[styles.topBar, { paddingHorizontal: 24 }]}>
        <View style={styles.progressRow}>
          <View style={[styles.progressSegment, { backgroundColor: AppColors.primary }]}><View style={styles.progressHighlight} /></View>
          <View style={[styles.progressSegment, { backgroundColor: AppColors.primary }]}><View style={styles.progressHighlight} /></View>
          <View style={[styles.progressSegment, { backgroundColor: AppColors.primary }]}><View style={styles.progressHighlight} /></View>
        </View>
        <TouchableOpacity onPress={handleSkip} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.skipButton}>
          <Text style={[styles.skipText, { color: colors.muted }]}><Text>{'Skip'}</Text></Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Centered Qubi logo — strict center fix */}
          <View style={styles.logoWrap}>
            <View style={styles.logoSquircle}>
              <QubiMascot size={88} bob />
            </View>
            <Animated.View style={[styles.xpChip, floatStyle]}>
              <Text style={styles.xpChipText}><Text>{'+50 XP ✨'}</Text></Text>
            </Animated.View>
          </View>

          <View style={styles.guideCard}>
            <Text style={[styles.cardTitle, { color: colors.ink }]}><Text style={{ fontFamily: fontFamilyFor('w900') }}><Text>{'Set up your Qubi'}</Text></Text></Text>
            <View style={{ height: 6 }} />
            <Text style={[styles.cardDesc, { color: colors.muted }]}><Text style={{ fontFamily: fontFamilyFor('w500') }}><Text>{'Pick a display name and a unique @username friends can find you by.'}</Text></Text></Text>

            <View style={{ height: 18 }} />

            {/* Display Name */}
            <Text style={[styles.label, { color: colors.muted }]}><Text>{'DISPLAY NAME'}</Text></Text>
            <View style={[styles.inputCard, { backgroundColor: inputBg, borderColor: nameBorder }]}>
              <View style={styles.inputRow}>
                <Ionicons name="person-outline" size={18} color={focused === 'name' ? AppColors.primary : withAlpha(colors.muted, 0.9)} />
                <TextInput
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Alex Rivera"
                  placeholderTextColor={withAlpha(colors.muted, 0.65)}
                  autoComplete="name"
                  autoCorrect={false}
                  maxLength={32}
                  returnKeyType="next"
                  onFocus={() => setFocused('name')}
                  onBlur={() => setFocused(null)}
                  style={[styles.input, { color: colors.ink }]}
                />
              </View>
            </View>

            <View style={{ height: 14 }} />

            {/* Username */}
            <Text style={[styles.label, { color: colors.muted }]}><Text>{'UNIQUE @USERNAME'}</Text></Text>
            <View style={[styles.inputCard, { backgroundColor: inputBg, borderColor: handleBorder }]}>
              <View style={styles.inputRow}>
                <Text style={{ fontFamily: fontFamilyFor('w700'), fontSize: 15, color: colors.muted }}><Text>{'@'}</Text></Text>
                <TextInput
                  value={handle}
                  onChangeText={(t) => setHandle(t.replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 16))}
                  placeholder="alex_q"
                  placeholderTextColor={withAlpha(colors.muted, 0.65)}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={16}
                  returnKeyType="done"
                  onFocus={() => setFocused('handle')}
                  onBlur={() => setFocused(null)}
                  onSubmitEditing={handleContinue}
                  style={[styles.input, { color: colors.ink }]}
                />
                {handleState === 'valid' ? <Ionicons name="checkmark-circle" size={18} color="#16A34A" /> : handleState === 'invalid' ? <Ionicons name="close-circle" size={18} color="#EF4444" /> : null}
              </View>
            </View>

            <View style={{ height: 8 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {h.icon ? <Ionicons name={h.icon as any} size={14} color={h.color} /> : null}
              <Text numberOfLines={2} style={{ flex: 1, fontSize: 12.5, lineHeight: 17, fontFamily: fontFamilyFor('w600'), color: h.color }}><Text>{h.text}</Text></Text>
            </View>

            <View style={{ height: 20 }} />

            {/* 3D CTA pinned at card bottom */}
            <View style={{ width: '100%', marginTop: 4 }}>
              <View style={styles.ctaShadow} />
              <Animated.View style={pressStyle}>
                <TouchableOpacity
                  activeOpacity={0.95}
                  disabled={!canSubmit}
                  onPressIn={() => { pressY.value = withTiming(4, { duration: 90 }); haptic(Haptics.ImpactFeedbackStyle.Light); }}
                  onPressOut={() => { pressY.value = withTiming(0, { duration: 180 }); }}
                  onPress={handleContinue}
                  style={[styles.ctaFront, { backgroundColor: canSubmit ? AppColors.primary : '#9CA3AF', borderColor: canSubmit ? '#D45A07' : '#9CA3AF', opacity: canSubmit ? 1 : 0.9 }]}
                >
                  <Text style={styles.ctaFrontText}><Text>{'Continue'}</Text></Text>
                </TouchableOpacity>
              </Animated.View>
            </View>

            {!canSubmit && displayName.trim().length >= 2 && handleState !== 'valid' ? (
              <View style={{ marginTop: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: 11, color: withAlpha(colors.muted, 0.85), fontFamily: fontFamilyFor('w500'), textAlign: 'center' }}><Text>{'Pick an available username to continue'}</Text></Text>
              </View>
            ) : null}
          </View>

          <View style={{ height: 14 }} />
          <TouchableOpacity onPress={handleLogin} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }} style={styles.loginLink}>
            <Text style={[styles.loginLinkText, { color: colors.muted }]}><Text style={{ fontFamily: fontFamilyFor('w600') }}><Text>{'Already have an account? '}</Text></Text><Text style={{ fontFamily: fontFamilyFor('w800'), color: AppColors.primary }}><Text>{'Log In'}</Text></Text></Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingBottom: 10 },
  progressRow: { flexDirection: 'row', gap: 8, flex: 1 },
  progressSegment: { height: 10, borderRadius: 6, flex: 1, overflow: 'hidden' },
  progressHighlight: { position: 'absolute', top: 2, left: 6, right: 6, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.45)' },
  skipButton: { paddingVertical: 4, paddingLeft: 12 },
  skipText: { fontSize: 14, fontFamily: fontFamilyFor('w700') },
  scrollContent: { paddingHorizontal: 24, paddingTop: 8 },
  logoWrap: { width: '100%', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 14, position: 'relative' },
  logoSquircle: { width: 88, height: 88, borderRadius: 22, overflow: 'hidden', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', borderWidth: 1, borderColor: 'rgba(249,115,22,0.12)', transform: [{ translateX: -2 }] },
  xpChip: { position: 'absolute', top: -4, right: 28, backgroundColor: AppColors.primary, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, shadowColor: AppColors.primary, shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  xpChipText: { fontSize: 12, fontFamily: fontFamilyFor('w800'), color: '#FFFFFF' },
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
    alignItems: 'stretch',
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
  ctaShadow: { position: 'absolute', top: 0, left: 0, right: 0, height: 56, borderRadius: 16, backgroundColor: '#C2410C' },
  ctaFront: { height: 52, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  ctaFrontText: { fontSize: 16, fontFamily: fontFamilyFor('w800'), color: '#FFFFFF', letterSpacing: -0.2 },
  loginLink: { paddingVertical: 4, alignSelf: 'center' },
  loginLinkText: { fontSize: 13, textAlign: 'center' },
});
