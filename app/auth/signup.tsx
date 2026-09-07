import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Globe, Apple as AppleIcon } from 'lucide-react-native';
import { Button } from '../../src/components/ui/Button';
import { supabase } from '../../src/services/supabase';
import { humanizeAuthError, SupabaseAuthServiceInstance } from '../../src/services/authService';
import { useTheme } from '../../src/theme/ThemeProvider';
import { AppColors, withAlpha } from '../../src/theme/colors';
import { fontFamilyFor } from '../../src/theme/typography';
import { useOnboardingStore } from '../../src/state/onboardingStore';
import { useOtpAuthStore } from '../../src/state/otpAuthStore';
import {
  AuthErrorBanner,
  AuthScaffold,
  EmailField,
  RESEND_COOLDOWN_SECONDS,
  isValidEmail,
  lightHaptic,
  normalizeEmail,
  useResendTimer,
} from '../../src/components/auth/AuthUI';

function useAppRouter(): { push: (href: string) => void; replace: (href: string) => void; back: () => void } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const r = require('expo-router').router as { push: (h: string) => void; replace: (h: string) => void; back: () => void } | undefined;
    if (r != null && typeof r.push === 'function') return r;
  } catch {}
  return { push: () => {}, replace: () => {}, back: () => {} };
}

export default function SignupScreen() {
  const { colors, isDark } = useTheme();
  const router = useAppRouter();
  const onboardingData = useOnboardingStore();
  const timer = useResendTimer(0);

  const [email, setEmail] = useState(onboardingData.email ?? '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (onboardingData.email && onboardingData.email !== email) setEmail(onboardingData.email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboardingData.email]);

  const emailValid = isValidEmail(email);
  const canSubmit = emailValid && !isLoading && timer.canResend;
  const inputBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0';

  const handleSignUp = async () => {
    if (!emailValid) {
      setError('Please enter a valid email address.');
      return;
    }
    if (isLoading || !timer.canResend) return;
    if (supabase == null) {
      setError('Backend is not configured.');
      return;
    }
    lightHaptic();
    setIsLoading(true);
    setError(null);
    try {
      const cleanEmail = normalizeEmail(email);

      // Existing account? Say so HERE — don't dispatch a code and strand the
      // user on the check-email screen. Fail-open: if the probe errors (edge
      // function outdated/offline), signup proceeds exactly as before.
      const alreadyRegistered = await SupabaseAuthServiceInstance.checkEmailRegistered(cleanEmail);
      if (alreadyRegistered === true) {
        setError('An account with this email already exists — log in instead.');
        return;
      }

      const username = onboardingData.username?.trim().toLowerCase() ?? '';
      const displayName = onboardingData.displayName?.trim() ?? '';

      useOnboardingStore.getState().setEmail(cleanEmail);
      useOtpAuthStore.getState().setPendingAuth({ email: cleanEmail, username, displayName });

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          data: {
            ...(username ? { username } : {}),
            ...(displayName ? { display_name: displayName } : {}),
            ...(onboardingData.dailyGoal ? { daily_goal: onboardingData.dailyGoal } : {}),
            ...(onboardingData.motivation ? { motivation: onboardingData.motivation } : {}),
          },
          shouldCreateUser: true,
        },
      });
      if (otpError) {
        setError(humanizeAuthError(otpError));
        if (otpError.status === 429 || otpError.message.toLowerCase().includes('rate limit')) {
          timer.start(RESEND_COOLDOWN_SECONDS);
        }
        return;
      }
      timer.start(RESEND_COOLDOWN_SECONDS);
      (router.push as (h: unknown) => void)({
        pathname: '/auth/verify-otp',
        params: { email: cleanEmail },
      });
    } catch (e) {
      setError(humanizeAuthError(e));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialTap = (provider: string) => {
    lightHaptic();
    setError(`${provider} sign-in is launching soon — use your email code for now.`);
  };

  return (
    <AuthScaffold
      title="Create Your Account"
      subtitle={
        onboardingData.displayName ? `Welcome, ${onboardingData.displayName}! Just add your email.` : 'Start your journey in seconds'
      }
      onBack={() => router.back()}
    >
      <EmailField
        value={email}
        onChange={(v) => {
          setEmail(v);
          if (error) setError(null);
        }}
        onSubmit={handleSignUp}
        editable={!isLoading}
        error={error != null}
      />

      {onboardingData.username || onboardingData.displayName ? (
        <View style={[styles.summaryCard, { borderColor: inputBorder, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFF7ED' }]}>
          <Text style={[styles.summaryLabel, { color: colors.muted }]}>
            <Text>{'ONBOARDING DATA'}</Text>
          </Text>
          <View style={{ height: 6 }} />
          {onboardingData.displayName ? (
            <Text style={[styles.summaryText, { color: colors.ink }]}>
              <Text>{`Display: ${onboardingData.displayName}`}</Text>
            </Text>
          ) : null}
          {onboardingData.username ? (
            <Text style={[styles.summaryText, { color: colors.ink }]}>
              <Text>{`Username: @${onboardingData.username}`}</Text>
            </Text>
          ) : null}
          {onboardingData.dailyGoal ? (
            <Text style={[styles.summaryText, { color: colors.ink }]}>
              <Text>{`Daily: ${onboardingData.dailyGoal} mins/day`}</Text>
            </Text>
          ) : null}
        </View>
      ) : null}

      <AuthErrorBanner message={error} />

      <TouchableOpacity
        disabled={!canSubmit}
        onPress={handleSignUp}
        style={[styles.primaryButton, !canSubmit && styles.disabledButton]}
        accessibilityRole="button"
        accessibilityLabel="Create account"
        accessibilityState={{ disabled: !canSubmit, busy: isLoading }}
        activeOpacity={0.85}
      >
        {isLoading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={styles.primaryButtonText}>
            <Text>{timer.canResend ? 'Create Account' : `Wait ${timer.seconds}s`}</Text>
          </Text>
        )}
      </TouchableOpacity>

      <View style={styles.socialRow}>
        <View style={styles.socialSlot}>
          <Button label="Google" variant="secondary" size="md" onPress={() => handleSocialTap('Google')} icon={<Globe size={18} strokeWidth={2} color={AppColors.ink} />} />
        </View>
        <View style={styles.socialSlot}>
          <Button label="Apple" variant="secondary" size="md" onPress={() => handleSocialTap('Apple')} icon={<AppleIcon size={18} strokeWidth={2} color={AppColors.ink} />} />
        </View>
      </View>

      <TouchableOpacity onPress={() => router.push('/auth/login')} activeOpacity={0.7} style={styles.loginLink} disabled={isLoading}>
        <Text style={{ fontSize: 13, color: colors.muted, fontFamily: fontFamilyFor('w600') }}>
          <Text>{'Already have an account? Log in'}</Text>
        </Text>
      </TouchableOpacity>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  summaryCard: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1 },
  summaryLabel: { fontSize: 10, letterSpacing: 1, fontFamily: fontFamilyFor('w700') },
  summaryText: { fontSize: 13, lineHeight: 18, fontFamily: fontFamilyFor('w600') },
  socialRow: { flexDirection: 'row', gap: 12 },
  socialSlot: { flex: 1 },
  loginLink: { alignItems: 'center', paddingVertical: 4 },
  primaryButton: {
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: AppColors.primary,
  },
  disabledButton: { backgroundColor: withAlpha(AppColors.primary, 0.55) },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontFamily: fontFamilyFor('w800'), letterSpacing: -0.3 },
});
