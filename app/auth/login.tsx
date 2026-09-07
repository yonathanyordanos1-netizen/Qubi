import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Globe, Apple as AppleIcon } from 'lucide-react-native';
import { Button } from '../../src/components/ui/Button';
import { supabase } from '../../src/services/supabase';
import { humanizeAuthError } from '../../src/services/authService';
import { useOtpAuthStore } from '../../src/state/otpAuthStore';
import { useTheme } from '../../src/theme/ThemeProvider';
import { AppColors, withAlpha } from '../../src/theme/colors';
import { fontFamilyFor } from '../../src/theme/typography';
import {
  AuthErrorBanner,
  AuthScaffold,
  EmailField,
  isValidEmail,
  normalizeEmail,
} from '../../src/components/auth/AuthUI';

function useAppRouter(): { push: (href: string) => void; replace: (href: string) => void; back: () => void } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const r = require('expo-router').router as { push: (h: string) => void; replace: (h: string) => void; back: () => void } | undefined;
    if (r != null && typeof r.push === 'function') return r;
  } catch {}
  return { push: () => {}, replace: () => {}, back: () => {} };
}

export default function LoginScreen() {
  const { colors } = useTheme();
  const router = useAppRouter();
  const setPendingAuth = useOtpAuthStore((s) => s.setPendingAuth);
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => isValidEmail(email) && !isLoading, [email, isLoading]);

  const handleSendOtp = async () => {
    if (!isValidEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (isLoading || supabase == null) {
      if (supabase == null) setError('Backend is not configured.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const cleanEmail = normalizeEmail(email);
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: { shouldCreateUser: true },
      });
      if (otpError) {
        setError(humanizeAuthError(otpError));
        return;
      }
      setPendingAuth({ email: cleanEmail, username: '', displayName: '' });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      try {
        router.push(`/auth/verify-otp?email=${encodeURIComponent(cleanEmail)}` as string);
      } catch {
        router.push('/auth/verify-otp');
      }
    } catch (e) {
      setError(humanizeAuthError(e));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialTap = (provider: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setError(`${provider} sign-in is launching soon — use your email 6-digit code for now.`);
  };

  return (
    <AuthScaffold
      title="Welcome back"
      subtitle="Enter your email — we'll send you a 6-digit code."
      onBack={() => router.back()}
    >
      <EmailField
        value={email}
        onChange={(v) => {
          setEmail(v);
          if (error) setError(null);
        }}
        onSubmit={handleSendOtp}
        editable={!isLoading}
        error={error != null}
      />

      <AuthErrorBanner message={error} />

      <Button
        label={timerLabel(isLoading)}
        onPress={handleSendOtp}
        variant="primary"
        size="lg"
        loading={isLoading}
        disabled={!canSubmit}
      />

      <View style={styles.socialRow}>
        <View style={styles.socialSlot}>
          <Button label="Google" variant="secondary" size="md" onPress={() => handleSocialTap('Google')} icon={<Globe size={18} strokeWidth={2} color={AppColors.ink} />} />
        </View>
        <View style={styles.socialSlot}>
          <Button label="Apple" variant="secondary" size="md" onPress={() => handleSocialTap('Apple')} icon={<AppleIcon size={18} strokeWidth={2} color={AppColors.ink} />} />
        </View>
      </View>

      <TouchableOpacity onPress={() => router.push('/auth/signup')} activeOpacity={0.7} style={{ alignItems: 'center' }}>
        <Text style={{ fontSize: 13, color: colors.muted, fontFamily: fontFamilyFor('w600') }}>
          <Text>{'New to Qubi? Create account'}</Text>
        </Text>
      </TouchableOpacity>

      <Text style={[styles.footer, { color: withAlpha(colors.muted, 0.7) }]}>
        <Text style={{ fontFamily: fontFamilyFor('w500') }}>
          <Text>{'By continuing you agree to our Terms & Privacy Policy.'}</Text>
        </Text>
      </Text>
    </AuthScaffold>
  );
}

function timerLabel(loading: boolean): string {
  return loading ? 'Sending…' : 'Send 6-digit code';
}

const styles = StyleSheet.create({
  socialRow: { flexDirection: 'row', gap: 12 },
  socialSlot: { flex: 1 },
  footer: { fontSize: 11, lineHeight: 14, textAlign: 'center' },
});
