import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { CrossModal } from './CrossModal';

import { SupabaseAuthServiceInstance } from '../services/authService';
import { AppColors, withAlpha } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { AppSpacing } from '../theme/spacing';
import { fontFamilyFor } from '../theme/typography';
import { QubiMascot } from './QubiMascot';

/**
 * In-app 6-digit OTP verification sheet shown after sign-up / unverified
 * sign-in. Keeps the user inside the app — no browser redirect needed.
 * On success `onVerified(true)` fires and the caller handles account
 * creation and navigation.
 *
 * Pass `userId` (the Supabase auth user id) when it is already known — e.g.
 * right after signUp — so the backend can confirm that exact user without
 * scanning the users table. Ported from otp_verification_sheet.dart.
 */
export function OtpVerificationSheet({
  visible,
  email,
  userId,
  onClose,
  onVerified,
}: {
  visible: boolean;
  email: string;
  userId?: string | null;
  onClose: () => void;
  onVerified: (verified: boolean) => void;
}) {
  const { isDark } = useTheme();
  const ink = isDark ? AppColors.inkLight : AppColors.ink;
  const muted = isDark ? AppColors.mutedLight : AppColors.muted;
  const bg = isDark ? AppColors.glassDark : AppColors.glassLight;
  const fieldBg = isDark ? AppColors.surfaceContainer : '#FFFFFF';

  const LENGTH = 6;
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(''));
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);

  const inputs = useRef<(TextInput | null)[]>([]);
  const codeRef = useRef('');

  // ── Resend cooldown ──
  useEffect(() => {
    if (!visible) return;
    setResendCooldown(60);
    const id = setInterval(() => {
      setResendCooldown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      setDigits(Array(LENGTH).fill(''));
      setError(null);
      setVerifying(false);
      codeRef.current = '';
    }
  }, [visible]);

  const startResendCooldown = (seconds: number) => {
    setResendCooldown(seconds);
  };

  const clearFields = () => {
    setDigits(Array(LENGTH).fill(''));
    codeRef.current = '';
    inputs.current[0]?.focus();
  };

  const verify = async (code: string) => {
    if (code.length !== LENGTH || verifying) return;
    setVerifying(true);
    setError(null);
    try {
      const success = await SupabaseAuthServiceInstance.verifyResendCode({
        email,
        code,
        userId: userId ?? undefined,
      });
      if (!success) {
        setVerifying(false);
        setError('Verification failed. Please try again or resend a new code.');
        clearFields();
        return;
      }
      // Code verified — close with true so the caller can create the account.
      onVerified(true);
    } catch (msg) {
      let displayMessage = 'Verification failed — please try again.';
      if (typeof msg === 'string') {
        const lower = msg.toLowerCase();
        if (
          lower.includes('invalid') ||
          lower.includes('expired') ||
          lower.includes('token') ||
          lower.includes('code')
        ) {
          displayMessage = 'The code entered is invalid or expired. Tap Resend Code.';
        } else if (lower.includes('rate') || lower.includes('429')) {
          displayMessage = 'Rate limit reached. Please wait 60 seconds before requesting a new code.';
        } else {
          displayMessage = msg;
        }
      }
      setVerifying(false);
      setError(displayMessage);
      clearFields();
    }
  };

  const onDigitChanged = (index: number, value: string) => {
    // Paste (or autofill) of multiple digits — distribute across fields.
    const pasted = value.replace(/\D/g, '');
    if (pasted.length > 1) {
      const next = Array(LENGTH).fill('');
      let i = index;
      for (const d of pasted.split('')) {
        if (i >= LENGTH) break;
        next[i] = d;
        i++;
      }
      setDigits(next);
      codeRef.current = next.join('');
      inputs.current[Math.min(i, LENGTH - 1)]?.focus();
      if (next.join('').length === LENGTH) void verify(next.join(''));
      return;
    }

    const next = [...digits];
    next[index] = value;
    setDigits(next);
    codeRef.current = next.join('');

    if (value === '' && index > 0) {
      inputs.current[index - 1]?.focus();
    } else if (value !== '' && index < LENGTH - 1) {
      inputs.current[index + 1]?.focus();
    }
    if (next.join('').length === LENGTH) void verify(next.join(''));
  };

  const resend = async () => {
    if (resendCooldown > 0 || resending) return;
    setResending(true);
    setError(null);
    try {
      const result = await SupabaseAuthServiceInstance.sendResendCode(email);
      if (result['status'] === 'error') {
        // Server-side cooldown — sync our timer so the user can't hammer it.
        const retryAfter = Number.parseInt(result['retryAfter'] ?? '', 10);
        setError(result['message'] ?? 'Failed to resend code. Try again.');
        if (Number.isFinite(retryAfter) && retryAfter > 0) {
          startResendCooldown(retryAfter);
        }
        return;
      }
      // Clear all fields for the fresh code.
      clearFields();
      startResendCooldown(60);
    } catch {
      setError('Could not resend code. Try again.');
    } finally {
      setResending(false);
    }
  };

  return (
    <CrossModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <View style={{ paddingHorizontal: 24, paddingBottom: 28 }}>
          <View
            style={{
              paddingTop: 20,
              backgroundColor: bg,
              borderTopLeftRadius: AppSpacing.radiusSheet,
              borderTopRightRadius: AppSpacing.radiusSheet,
              borderWidth: 1,
              borderColor: AppColors.glassEdge,
              alignItems: 'center',
            }}
          >
            {/* Drag handle */}
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: withAlpha(AppColors.muted, 0.3),
              }}
            />
            <View style={{ height: 20 }} />
            <QubiMascot size={56} />
            <View style={{ height: 14 }} />
            <Text style={{ fontSize: 22, fontFamily: fontFamilyFor('w800'), color: ink }}>
              Verify your email
            </Text>
            <View style={{ height: 6 }} />
            <Text style={{ fontSize: 13, color: muted }}>We sent a 6-digit code to</Text>
            <Text style={{ fontSize: 13, fontFamily: fontFamilyFor('w700'), color: AppColors.primary }}>
              {email}
            </Text>
            <View style={{ height: 24 }} />

            {/* 6-digit PIN fields */}
            <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
              {Array.from({ length: LENGTH }, (_, i) => (
                <TextInput
                  key={i}
                  ref={(r) => {
                    inputs.current[i] = r;
                  }}
                  value={digits[i]}
                  onChangeText={(v) => onDigitChanged(i, v)}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  accessibilityLabel={`Digit ${i + 1} of ${LENGTH}`}
                  maxLength={i === 0 ? LENGTH : 1}
                  style={{
                    width: 46,
                    height: 54,
                    marginHorizontal: 4,
                    fontSize: 22,
                    fontFamily: fontFamilyFor('w800'),
                    color: ink,
                    backgroundColor: fieldBg,
                    borderRadius: AppSpacing.radiusSoft,
                    borderWidth: error != null ? 1.5 : 1,
                    borderColor:
                      error != null ? AppColors.error : AppColors.glassEdge,
                  }}
                />
              ))}
            </View>

            {/* Error message */}
            {error != null && (
              <>
                <View style={{ height: 10 }} />
                <Text

                  style={{
                    textAlign: 'center',
                    fontSize: 12.5,
                    fontFamily: fontFamilyFor('w600'),
                    color: AppColors.error,
                  }}
                >
                  {error}
                </Text>
              </>
            )}

            <View style={{ height: 24 }} />

            {/* Verify button — real pressable (a11y role + hit area), spinner overlays without reflow */}
            <TouchableOpacity
              onPress={() => !verifying && void verify(codeRef.current)}
              disabled={verifying || codeRef.current.length !== LENGTH}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Verify code and launch Qubi"
              accessibilityState={{ disabled: verifying, busy: verifying }}
              style={{
                width: '100%',
                height: 52,
                borderRadius: AppSpacing.radiusPill,
                backgroundColor: AppColors.primary,
                opacity: verifying ? 0.85 : 1,
                shadowColor: withAlpha(AppColors.primary, 0.3),
                shadowOpacity: 1,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 5 },
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {verifying ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text
                  style={{
                    fontSize: 16,
                    fontFamily: fontFamilyFor('w800'),
                    color: '#FFFFFF',
                  }}
                >
                  Verify & Launch Qubi
                </Text>
              )}
            </TouchableOpacity>

            <View style={{ height: 14 }} />

            {/* Resend code — real pressable with disabled state */}
            <TouchableOpacity
              onPress={() => {
                if (resendCooldown <= 0 && !resending) void resend();
              }}
              disabled={resendCooldown > 0 || resending}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={resendCooldown > 0 ? `Resend code in ${resendCooldown} seconds` : 'Resend code'}
              style={{ paddingBottom: 8 }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: fontFamilyFor('w600'),
                  color: resendCooldown > 0 ? muted : AppColors.primary,
                }}
              >
                {resendCooldown > 0
                  ? `Resend code in ${resendCooldown}s`
                  : resending
                    ? 'Sending...'
                    : 'Resend code'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </CrossModal>
  );
}
