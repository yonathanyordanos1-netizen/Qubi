import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { AlertCircle, ChevronLeft, Mail } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { AppColors, withAlpha } from '../../theme/colors';
import { fontFamilyFor } from '../../theme/typography';
import { QubiAvatar } from '../QubiAvatar';

/** Must stay in sync with the server cooldown (send-verification: 60s). */
export const RESEND_COOLDOWN_SECONDS = 60;
export const OTP_LENGTH = 6;
const MAX_CLIENT_ATTEMPTS = 5;

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function lightHaptic(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Countdown timer for resend cooldowns. `start()` restarts from full. */
export function useResendTimer(initial = 0): { seconds: number; canResend: boolean; start: (s?: number) => void } {
  const [seconds, setSeconds] = useState(initial);
  useEffect(() => {
    if (seconds <= 0) return;
    const t = setInterval(() => setSeconds((p) => Math.max(0, p - 1)), 1000);
    return () => clearInterval(t);
  }, [seconds > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    seconds,
    canResend: seconds <= 0,
    start: (s: number = RESEND_COOLDOWN_SECONDS) => setSeconds(s),
  };
}

// ── Scaffold ────────────────────────────────────────────────────────────────

export function AuthScaffold({
  title,
  subtitle,
  onBack,
  backLabel = 'Go back',
  children,
}: {
  title: string;
  subtitle: string;
  onBack?: () => void;
  backLabel?: string;
  children: React.ReactNode;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const inputBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0';
  return (
    <SafeAreaView style={[styles.scaffold, { backgroundColor: colors.canvas }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scaffoldContent, { paddingBottom: 40 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerRow}>
            {onBack ? (
              <TouchableOpacity
                onPress={onBack}
                style={[
                  styles.backButton,
                  { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF', borderColor: inputBorder },
                ]}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={backLabel}
              >
                <ChevronLeft size={18} strokeWidth={2.2} color={colors.ink} />
              </TouchableOpacity>
            ) : (
              <View style={styles.headerSide} />
            )}
            <View style={styles.headerSide} />
            <QubiAvatar size={44} glow accessibilityLabel="Qubi logo" />
            <View style={styles.headerSide} />
          </View>

          <View style={styles.titleGroup}>
            <Text style={[styles.title, { color: colors.ink }]} accessibilityRole="header">
              <Text style={{ fontFamily: fontFamilyFor('w800') }}>
                <Text>{title}</Text>
              </Text>
            </Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              <Text style={{ fontFamily: fontFamilyFor('w500') }}>
                <Text>{subtitle}</Text>
              </Text>
            </Text>
          </View>

          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Email field ─────────────────────────────────────────────────────────────

export function EmailField({
  value,
  onChange,
  onSubmit,
  editable = true,
  autoFocus = false,
  error = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  editable?: boolean;
  autoFocus?: boolean;
  error?: boolean;
}) {
  const { colors, isDark } = useTheme();
  const [focused, setFocused] = useState(false);
  const inputBg = isDark ? colors.card : '#FFFFFF';
  const inputBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0';
  const borderColor = error ? '#FCA5A5' : focused ? withAlpha(AppColors.primary, 0.45) : inputBorder;
  return (
    <View
      style={[styles.inputCard, { backgroundColor: inputBg, borderColor }]}
      accessible
      accessibilityLabel="Email address field"
    >
      <View style={styles.inputRow}>
        <Mail size={18} strokeWidth={1.7} color={focused ? AppColors.primary : withAlpha(colors.muted, 0.9)} />
        <TextInput
          style={[styles.input, { color: colors.ink }]}
          placeholder="Email address"
          placeholderTextColor={withAlpha(colors.muted, 0.65)}
          value={value}
          onChangeText={onChange}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          autoCorrect={false}
          returnKeyType="done"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={onSubmit}
          editable={editable}
          autoFocus={autoFocus}
          accessibilityLabel="Email address"
          accessibilityHint="Enter the email where we will send your 6-digit code"
        />
      </View>
    </View>
  );
}

// ── Inline error banner (screen-reader announced) ───────────────────────────

export function AuthErrorBanner({ message }: { message: string | null }) {
  if (message == null || message.length === 0) return null;
  return (
    <View
      style={errorStyles.banner}
      accessible
      accessibilityLiveRegion="assertive"
      accessibilityRole="alert"
    >
      <AlertCircle size={16} strokeWidth={2.2} color="#B91C1C" />
      <Text style={errorStyles.text}>
        <Text>{message}</Text>
      </Text>
    </View>
  );
}

const errorStyles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
  },
  text: { flex: 1, fontSize: 13, lineHeight: 18, color: '#991B1B', fontFamily: fontFamilyFor('w500') },
});

// ── OTP boxes ───────────────────────────────────────────────────────────────

function OtpBox({
  value,
  active,
  error,
  verifying,
  autoFocus,
  index,
  inputsRef,
  onChange,
  onKeyPress,
}: {
  value: string;
  active: boolean;
  error: boolean;
  verifying: boolean;
  autoFocus: boolean;
  index: number;
  inputsRef: React.MutableRefObject<(TextInput | null)[]>;
  onChange: (t: string) => void;
  onKeyPress: (e: { nativeEvent: { key: string } }) => void;
}) {
  const { colors, isDark } = useTheme();
  const bounce = useSharedValue(1);
  const prev = useRef(value);
  useEffect(() => {
    if (value !== prev.current) {
      prev.current = value;
      bounce.value =
        value !== ''
          ? withSpring(1.12, { damping: 10, stiffness: 320 }, () => {
              bounce.value = withSpring(1, { damping: 12, stiffness: 260 });
            })
          : withSpring(1, { damping: 14, stiffness: 240 });
    }
  }, [value, bounce]);
  const bounceStyle = useAnimatedStyle(() => ({ transform: [{ scale: bounce.value }] }));
  const bg = active ? withAlpha(AppColors.primary, isDark ? 0.14 : 0.07) : isDark ? colors.card : '#FFFFFF';
  return (
    <Animated.View
      style={[
        styles.pinBox,
        {
          backgroundColor: bg,
          borderColor: error ? '#FCA5A5' : active ? AppColors.primary : isDark ? 'rgba(255,255,255,0.12)' : '#E2E8F0',
        },
        bounceStyle,
      ]}
    >
      <TextInput
        ref={(el) => {
          inputsRef.current[index] = el;
        }}
        value={value}
        onChangeText={onChange}
        onKeyPress={onKeyPress}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={index === 0 ? OTP_LENGTH : 1}
        style={[styles.pinInput, { color: colors.ink }]}
        textAlign="center"
        selectionColor={AppColors.primary}
        autoFocus={autoFocus}
        editable={!verifying}
        accessibilityLabel={`Digit ${index + 1} of ${OTP_LENGTH}`}
      />
    </Animated.View>
  );
}

export function OtpBoxes({
  otp,
  setOtp,
  verifying,
  error,
  onComplete,
}: {
  otp: string[];
  setOtp: (next: string[]) => void;
  verifying: boolean;
  error: boolean;
  onComplete: (code: string) => void;
}) {
  const inputsRef = useRef<(TextInput | null)[]>([]);
  const filled = otp.join('').length;

  const handleChange = (text: string, index: number) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    if (cleaned.length > 1) {
      // Paste / autofill of the full code
      const digits = cleaned.slice(0, OTP_LENGTH).split('');
      const next = Array.from({ length: OTP_LENGTH }, (_, i) => digits[i] ?? '');
      setOtp(next);
      lightHaptic();
      inputsRef.current[Math.min(digits.length, OTP_LENGTH - 1)]?.focus();
      if (digits.length === OTP_LENGTH) setTimeout(() => onComplete(digits.join('')), 120);
      return;
    }
    const next = [...otp];
    next[index] = cleaned.slice(-1);
    setOtp(next);
    if (cleaned !== '') {
      lightHaptic();
      if (index < OTP_LENGTH - 1) inputsRef.current[index + 1]?.focus();
      else if (next.join('').length === OTP_LENGTH) setTimeout(() => onComplete(next.join('')), 120);
    }
  };

  const handleKeyPress = (e: { nativeEvent: { key: string } }, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && otp[index] === '' && index > 0) {
      const next = [...otp];
      next[index - 1] = '';
      setOtp(next);
      inputsRef.current[index - 1]?.focus();
    }
  };

  return (
    <View style={styles.pinRow} accessible accessibilityLabel="6-digit verification code">
      {otp.map((d, i) => (
        <OtpBox
          key={i}
          index={i}
          value={d}
          active={d !== '' || filled === i}
          error={error}
          verifying={verifying}
          autoFocus={i === 0}
          inputsRef={inputsRef}
          onChange={(t) => handleChange(t, i)}
          onKeyPress={(e) => handleKeyPress(e, i)}
        />
      ))}
    </View>
  );
}

// ── Resend control ──────────────────────────────────────────────────────────

export function ResendControl({
  seconds,
  canResend,
  busy,
  onResend,
}: {
  seconds: number;
  canResend: boolean;
  busy: boolean;
  onResend: () => void;
}) {
  const { colors } = useTheme();
  if (!canResend) {
    return (
      <View style={{ alignItems: 'center' }}>
        <Text style={{ fontSize: 13, color: colors.muted, fontFamily: fontFamilyFor('w600') }}>
          <Text>{`Resend code in ${seconds}s`}</Text>
        </Text>
        <View style={styles.cooldownTrack}>
          <View
            style={[
              styles.cooldownFill,
              { width: `${Math.max(0, Math.min(100, ((RESEND_COOLDOWN_SECONDS - seconds) / RESEND_COOLDOWN_SECONDS) * 100))}%` },
            ]}
          />
        </View>
      </View>
    );
  }
  return (
    <View style={{ alignItems: 'center' }}>
      <TouchableOpacity
        onPress={onResend}
        disabled={busy}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel="Resend verification code"
      >
        <Text style={{ fontSize: 13, color: busy ? colors.muted : AppColors.primary, fontFamily: fontFamilyFor('w700') }}>
          <Text>{busy ? 'Sending…' : 'Resend code'}</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/** Client-side attempt guard shared by verify screens (server enforces too). */
export function useAttemptGuard(): { remaining: () => boolean; note: () => void; reset: () => void } {
  const ref = useRef(0);
  return {
    remaining: () => ref.current < MAX_CLIENT_ATTEMPTS,
    note: () => {
      ref.current += 1;
    },
    reset: () => {
      ref.current = 0;
    },
  };
}

/** Small inline spinner row used inside CTAs without layout shift. */
export function CtaSpinner(): React.ReactElement {
  return <ActivityIndicator color="#FFFFFF" size="small" />;
}

const styles = StyleSheet.create({
  scaffold: { flex: 1 },
  flex: { flex: 1 },
  scaffoldContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 8, gap: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerSide: { flex: 1 },
  backButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  titleGroup: { gap: 8, alignItems: 'center', width: '100%' },
  title: { fontSize: 28, lineHeight: 32, letterSpacing: -0.8, textAlign: 'center' },
  subtitle: { fontSize: 13, lineHeight: 18, textAlign: 'center', paddingHorizontal: 12 },
  inputCard: { borderRadius: 16, paddingHorizontal: 16, height: 52, justifyContent: 'center', borderWidth: 1 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, fontSize: 15, lineHeight: 20, fontFamily: fontFamilyFor('w500'), paddingVertical: 0 },
  pinRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center' },
  pinBox: {
    width: 48,
    height: 56,
    borderRadius: 14,
    borderWidth: 2,
    borderBottomWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pinInput: {
    width: '100%',
    height: '100%',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    fontFamily: fontFamilyFor('w800'),
    padding: 0,
  },
  cooldownTrack: {
    marginTop: 8,
    width: 120,
    height: 4,
    borderRadius: 2,
    backgroundColor: withAlpha(AppColors.primary, 0.15),
    overflow: 'hidden',
  },
  cooldownFill: { height: 4, borderRadius: 2, backgroundColor: AppColors.primary },
});
