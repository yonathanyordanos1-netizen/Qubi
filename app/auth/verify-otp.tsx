import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { supabase, SupabaseServiceInstance } from '../../src/services/supabase';
import { SupabaseAuthServiceInstance, humanizeAuthError } from '../../src/services/authService';
import { useOtpAuthStore } from '../../src/state/otpAuthStore';
import { useAppStore } from '../../src/state/appStore';
import { useTheme } from '../../src/theme/ThemeProvider';
import { withAlpha } from '../../src/theme/colors';
import { fontFamilyFor } from '../../src/theme/typography';
import { Button } from '../../src/components/ui/Button';
import { QubiAvatar } from '../../src/components/QubiAvatar';
import {
  AuthErrorBanner,
  AuthScaffold,
  OTP_LENGTH,
  OtpBoxes,
  RESEND_COOLDOWN_SECONDS,
  ResendControl,
  lightHaptic,
  normalizeEmail,
  useAttemptGuard,
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

function useRouteEmail(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const params = (require('expo-router') as { useLocalSearchParams?: () => Record<string, string> }).useLocalSearchParams?.() ?? {};
    return typeof params.email === 'string' ? params.email : '';
  } catch {
    return '';
  }
}

export default function VerifyOtpScreen() {
  const { colors, isDark } = useTheme();
  const router = useAppRouter();
  const routeEmail = useRouteEmail();
  const store = useOtpAuthStore();
  const email = store.email || routeEmail;
  const username = store.username;
  const displayName = store.displayName;
  const clearPendingAuth = store.clearPendingAuth;

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useResendTimer(RESEND_COOLDOWN_SECONDS);
  const guard = useAttemptGuard();
  const busyRef = useRef(false);

  const otpCode = otp.join('');

  const handleVerify = useCallback(
    async (codeOverride?: string) => {
      const code = (codeOverride ?? otp.join('')).trim();
      if (code.length !== OTP_LENGTH) {
        setError('Please enter the 6-digit code.');
        return;
      }
      if (email.trim().length === 0) {
        setError('Missing email — go back and enter your email again.');
        return;
      }
      if (busyRef.current) return;
      if (!guard.remaining()) {
        setError('Too many attempts — tap Resend code for a fresh one.');
        return;
      }
      busyRef.current = true;
      setError(null);
      setIsVerifying(true);
      try {
        if (supabase == null) {
          setError('Backend is not configured.');
          return;
        }
        const { data, error: verifyError } = await supabase.auth.verifyOtp({
          email: normalizeEmail(email),
          token: code,
          type: 'email',
        });
        if (verifyError) {
          guard.note();
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          setError(humanizeAuthError(verifyError));
          return;
        }
        if (data.session == null) {
          setError('Verification succeeded but no session was created — try signing in again.');
          return;
        }
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        if (username.length > 0) {
          try {
            await SupabaseServiceInstance.upsertProfile({
              username: username.trim().toLowerCase(),
              display_name: displayName.trim(),
            });
            useAppStore.setState({ username: username.trim().toLowerCase(), displayName: displayName.trim() });
          } catch {}
        }
        let isNewUser = true;
        try {
          const profile = await SupabaseServiceInstance.fetchProfile();
          if (profile != null && profile['onboarding_done'] === true) isNewUser = false;
        } catch {}
        clearPendingAuth();
        guard.reset();
        try {
          await useAppStore.getState().hydrateFromSupabase();
        } catch {}
        router.replace(isNewUser ? '/onboarding' : '/(tabs)');
      } catch (e) {
        setError(humanizeAuthError(e));
      } finally {
        busyRef.current = false;
        setIsVerifying(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [otp, email, username, displayName, clearPendingAuth, router],
  );

  const handleResend = async () => {
    if (!timer.canResend || isResending || supabase == null) return;
    lightHaptic();
    setIsResending(true);
    setError(null);
    try {
      const res = await SupabaseAuthServiceInstance.resendOtpCode(normalizeEmail(email));
      if (res.status !== 'code_sent') {
        setError(res.status === 'already_verified' ? 'This email is already verified — try signing in.' : res.message);
        timer.start(RESEND_COOLDOWN_SECONDS);
        return;
      }
      guard.reset();
      setOtp(Array(OTP_LENGTH).fill(''));
      timer.start(RESEND_COOLDOWN_SECONDS);
      setError(null);
    } catch (e) {
      setError(humanizeAuthError(e));
    } finally {
      setIsResending(false);
    }
  };

  return (
    <AuthScaffold
      title="Enter Verification Code"
      subtitle={`We sent a 6-digit code to ${email || 'your email'}. It expires in 10 minutes — use the latest email if you requested more than one.`}
      onBack={() => router.back()}
      backLabel="Back to email entry"
    >
      <View style={{ alignItems: 'center' }}>
        <QubiAvatar size={76} glow accessibilityLabel="Qubi mascot" />
      </View>

      <OtpBoxes otp={otp} setOtp={(n) => { setOtp(n); if (error) setError(null); }} verifying={isVerifying} error={error != null} onComplete={(c) => void handleVerify(c)} />

      <AuthErrorBanner message={error} />

      <Button
        label="Verify & Continue"
        onPress={() => void handleVerify()}
        variant="primary"
        size="lg"
        loading={isVerifying}
        disabled={isVerifying || otpCode.length !== OTP_LENGTH}
      />

      <ResendControl seconds={timer.seconds} canResend={timer.canResend} busy={isResending} onResend={() => void handleResend()} />

      <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={{ alignItems: 'center' }} accessibilityRole="button" accessibilityLabel="Change email">
        <Text style={{ fontSize: 13, color: colors.muted, fontFamily: fontFamilyFor('w600') }}>
          <Text>{'Change email'}</Text>
        </Text>
      </TouchableOpacity>

      <Text style={[styles.footer, { color: withAlpha(colors.muted, 0.75) }]}>
        <Text style={{ fontFamily: fontFamilyFor('w500') }}>
          <Text>{'Code not arriving? Check spam for "Qubi verification code". Codes are single-use.'}</Text>
        </Text>
      </Text>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  footer: { fontSize: 11, lineHeight: 16, textAlign: 'center', paddingHorizontal: 12 },
});
