import React, { useRef, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Mail } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { fontFamilyFor } from '../../theme/typography';
import { AppColors, withAlpha } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeProvider';
import { SupabaseAuthServiceInstance, humanizeAuthError } from '../../services/authService';
import { QubiAvatar } from '../../components/QubiAvatar';

interface VerifyOtpScreenProps {
  email: string;
  onVerified: () => void;
  onBack: () => void;
}

export function VerifyOtpScreen({ email, onVerified, onBack }: VerifyOtpScreenProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [focused, setFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timer, setTimer] = useState(25);
  const attemptsRef = useRef(0);

  const inputBg = isDark ? colors.card : '#FFFFFF';
  const inputBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0';
  const focusedBorder = withAlpha(AppColors.primary, 0.38);

  React.useEffect(() => {
    if (timer <= 0) return;
    const t = setInterval(() => setTimer((p) => p - 1), 1000);
    return () => clearInterval(t);
  }, [timer]);

  const hapticLight = () => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };
  const hapticMedium = () => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); };

  const handleVerify = async () => {
    const clean = code.trim();
    if (clean.length !== 6 || isLoading) return;
    if (attemptsRef.current >= 5) {
      setError('Too many attempts — please wait a minute before trying again.');
      return;
    }
    hapticMedium();
    setIsLoading(true);
    setError(null);
    try {
      const res = await SupabaseAuthServiceInstance.verifyOtpAndLogin(email, clean);
      if (!res.ok) {
        const msg = (res.message ?? '').toLowerCase();
        if (msg.includes('expired')) {
          setError('This code has expired — tap Resend code for a fresh one. (Codes expire in 1 hour; if you requested a new code the previous one was invalidated.)');
        } else {
          setError(res.message ?? 'Failed to verify code.');
        }
        // expired codes shouldn't count toward brute-force limit as harshly, but keep attempt guard
        if (!msg.includes('expired')) attemptsRef.current += 1;
        if (msg.includes('rate limit') || msg.includes('too many')) setTimer(25);
        return;
      }
      // Strictly persist before navigation — verifyOtpAndLogin already setSession
      attemptsRef.current = 0;
      hapticLight();
      onVerified();
    } catch (e) {
      setError(humanizeAuthError(e));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (timer > 0 || isLoading) return;
    if (attemptsRef.current >= 5) {
      setError('Too many resend attempts — please wait a minute before trying again.');
      return;
    }
    hapticLight();
    // Optimistic cooldown - prevents Hermes double-tap even if network fails
    attemptsRef.current += 1;
    setTimer(25);
    setError(null);
    try {
      const res = await SupabaseAuthServiceInstance.triggerResendCode(email);
      if (res.status === 'rate_limited') {
        setTimer(25);
        setError(res.message);
        return;
      }
      if (res.status === 'error') {
        setError(res.message);
        // keep timer so user sees cooldown; allow retry after
        return;
      }
      // code_sent or already_verified (auto-confirmed)
      if (res.status === 'already_verified') {
        onVerified();
        return;
      }
      setError(null);
      setCode('');
      // Clear previous error and keep fresh 25s cooldown — old code invalidated, use latest email
    } catch (e) {
      setError(humanizeAuthError(e));
    }
  };

  const canSubmit = code.trim().length === 6 && !isLoading;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.canvas }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex} keyboardVerticalOffset={0}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => { hapticLight(); onBack(); }} style={[styles.backButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF', borderColor: inputBorder }]} activeOpacity={0.7}>
              <ChevronLeft size={18} strokeWidth={2.2} color={colors.ink} />
            </TouchableOpacity>
            <QubiAvatar size={44} glow accessibilityLabel="Qubi logo" />
            <View style={{ flex: 1 }} />
          </View>

          <View style={{ height: 18 }} />

          <Text style={[styles.title, { color: colors.ink }]}>
            <Text style={{ fontFamily: fontFamilyFor('w800') }}><Text>{'Check your email'}</Text></Text>
          </Text>
          <View style={{ height: 8 }} />
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            <Text style={{ fontFamily: fontFamilyFor('w500') }}><Text>{`We sent a 6-digit code to ${email}`}</Text></Text>
          </Text>
          <View style={{ height: 6 }} />
          <Text style={[styles.hint, { color: withAlpha(colors.muted, 0.85) }]}>
            <Text style={{ fontFamily: fontFamilyFor('w500') }}><Text>{'Enter it below. It expires in 1 hour. Requesting a new code invalidates the previous one — use the latest email.'}</Text></Text>
          </Text>

          <View style={{ height: 28 }} />

          {/* OTP Input — 52h, centered, letter-spacing 8 (matches LoginScreen) */}
          <View style={[styles.inputCard, { backgroundColor: inputBg, borderColor: focused ? focusedBorder : inputBorder }]}>
            <View style={styles.inputRow}>
              <Mail size={18} strokeWidth={1.7} color={focused ? AppColors.primary : withAlpha(colors.muted, 0.9)} />
              <TextInput
                style={[styles.input, { color: colors.ink, textAlign: 'center', letterSpacing: 8 }]}
                placeholder="000000"
                placeholderTextColor={withAlpha(colors.muted, 0.65)}
                value={code}
                onChangeText={(v) => {
                  const digits = v.replace(/[^0-9]/g, '').slice(0, 6);
                  setCode(digits);
                  if (error) setError(null);
                }}
                keyboardType="number-pad"
                maxLength={6}
                autoCorrect={false}
                autoCapitalize="none"
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                editable={!isLoading}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleVerify}
              />
            </View>
          </View>

          <View style={{ height: 14 }} />

          {error != null ? (
            <View style={[styles.errorBanner, { backgroundColor: '#FEE2E2', borderColor: '#FECACA' }]}>
              <Text style={{ fontSize: 13, color: '#991B1B', fontFamily: fontFamilyFor('w500') }}>
                <Text>{error}</Text>
              </Text>
            </View>
          ) : null}
          {error != null ? <View style={{ height: 14 }} /> : null}

          {/* Verify CTA — same Duolingo 3D */}
          {isLoading ? (
            <View style={[styles.duoButtonShadow, { backgroundColor: '#C2410C' }]}>
              <View style={[styles.duoButtonFront, { backgroundColor: AppColors.primary, borderColor: '#D45A07', opacity: 0.7 }]}>
                <ActivityIndicator size="small" color="#FFFFFF" />
              </View>
            </View>
          ) : (
            <View style={styles.duoButtonContainer}>
              <View style={[styles.duoButtonShadow, { backgroundColor: '#C2410C' }]} />
              <TouchableOpacity
                onPress={handleVerify}
                activeOpacity={0.85}
                disabled={!canSubmit}
                style={[styles.duoButtonFront, { backgroundColor: canSubmit ? AppColors.primary : '#9CA3AF', borderColor: canSubmit ? '#D45A07' : '#9CA3AF', opacity: canSubmit ? 1 : 0.9 }]}
              >
                <Text style={styles.duoButtonText}>
                  <Text style={{ fontFamily: fontFamilyFor('w800'), color: '#FFFFFF' }}><Text>{'Verify and continue'}</Text></Text>
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ alignItems: 'center', marginTop: 16, gap: 12 }}>
            {timer > 0 ? (
              <Text style={{ fontSize: 13, color: colors.muted, fontFamily: fontFamilyFor('w600') }}>
                <Text>{`Resend code in ${timer}s`}</Text>
              </Text>
            ) : (
              <TouchableOpacity onPress={handleResend} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }} disabled={isLoading}>
                <Text style={{ fontSize: 13, color: AppColors.primary, fontFamily: fontFamilyFor('w700') }}>
                  <Text>{'Resend code'}</Text>
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => { hapticLight(); onBack(); }} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
              <Text style={{ fontSize: 13, color: colors.muted, fontFamily: fontFamilyFor('w600') }}>
                <Text>{'Wrong email? Go back'}</Text>
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 24 }} />
          <Text style={styles.footer}>
            <Text style={{ color: withAlpha(colors.muted, 0.75), fontFamily: fontFamilyFor('w500') }}><Text>{'Code not arriving? Check spam or search for "Qubi verification code". It’s sent from Questify via Resend.'}</Text></Text>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  title: { fontSize: 28, lineHeight: 32, letterSpacing: -0.7 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  hint: { fontSize: 12, lineHeight: 16 },
  inputCard: { borderRadius: 16, paddingHorizontal: 16, height: 52, justifyContent: 'center', borderWidth: 1 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, fontSize: 18, lineHeight: 22, fontFamily: fontFamilyFor('w700'), paddingVertical: 0 },
  errorBanner: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1 },
  duoButtonContainer: { position: 'relative', height: 54 },
  duoButtonShadow: { position: 'absolute', top: 0, left: 0, right: 0, height: 54, borderRadius: 16 },
  duoButtonFront: { height: 50, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 0 },
  duoButtonText: { fontSize: 16, lineHeight: 20, textAlign: 'center' },
  footer: { fontSize: 11, lineHeight: 16, textAlign: 'center', paddingHorizontal: 12 },
});
