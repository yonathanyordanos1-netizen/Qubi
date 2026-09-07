import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as AppleAuthentication from 'expo-apple-authentication';

import { useTheme } from '../theme/ThemeProvider';
import { AppColors, withAlpha } from '../theme/colors';
import { body, fontFamilyFor, label, title } from '../theme/typography';
import { Pressable } from '../components/Pressable';
import { StrokeIcon } from '../components/AppIcons';
import { GoogleLogo, AppleLogo } from '../components/AppIcons';
import { BrandLogo } from '../components/common/BrandLogo';
import {
  SupabaseAuthService,
  SupabaseAuthServiceInstance,
  type OtpStatus,
} from '../services/authService';
import { SupabaseServiceInstance } from '../services/supabase';
import { useGateStore } from '../state/gateStore';
import { useAppStore } from '../state/appStore';
import { AppConfig } from '../services/config';

/**
 * Pre-dashboard auth gate: email + password sign-up that flows straight into
 * a 6-digit verification step. Demo mode remains available for offline play.
 */
export default function AuthScreen({ onAuthed }: { onAuthed: () => void }) {
  const { colors, isDark } = useTheme();
  const skipAuth = useGateStore((s) => s.skipAuth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [stage, setStage] = useState<'credentials' | 'otp'>('credentials');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const otpRef = useRef<TextInput>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleStatus = (s: OtpStatus) => {
    switch (s.status) {
      case 'code_sent':
        setStage('otp');
        setMessage(null);
        setCooldown(45);
        break;
      case 'already_verified':
        void finishSignIn();
        break;
      case 'rate_limited':
        setMessage(s.message);
        setCooldown(45);
        break;
      default:
        setMessage(s.message);
    }
  };

  async function finishSignIn() {
    // Push the chosen identity to the account profile before hydrating so the
    // server-side profile carries the user's real name/handle.
    const handle = username.trim().replace(/^@/, '').toLowerCase();
    const name = displayName.trim();
    if (handle.length >= 3 || name.length > 0) {
      try {
        await SupabaseServiceInstance.upsertProfile({
          ...(handle.length >= 3 ? { username: handle } : {}),
          ...(name.length > 0 ? { display_name: name } : {}),
        });
      } catch {}
      useAppStore.setState({
        ...(handle.length >= 3 ? { username: handle } : {}),
        ...(name.length > 0 ? { displayName: name } : {}),
      });
    }
    await useAppStore.getState().hydrateFromSupabase().catch(() => {});
    onAuthed();
  }

  /** Identity validation for the optional username / display-name inputs. */
  const validateIdentity = (): string | null => {
    const handle = username.trim().replace(/^@/, '');
    if (handle.length > 0 && (handle.length < 3 || !/^[a-z0-9_]+$/.test(handle))) {
      return 'Usernames are 3+ characters: letters, numbers and underscores only.';
    }
    return null;
  };

  const signUp = async () => {
    if (busy) return;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setMessage('Enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setMessage('Choose a password with at least 6 characters.');
      return;
    }
    const identityError = validateIdentity();
    if (identityError != null) {
      setMessage(identityError);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      handleStatus(await SupabaseAuthServiceInstance.signUpOrResendOtp(email, password));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (busy || code.trim().length !== 6) {
      if (code.trim().length !== 6) setMessage('Enter all 6 digits of your code.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await SupabaseAuthServiceInstance.verifyOtpAndLogin(email, code);
      if (res.ok) {
        await finishSignIn();
      } else {
        setMessage(res.message ?? 'Verification failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (busy || cooldown > 0) return;
    setBusy(true);
    setMessage(null);
    try {
      handleStatus(await SupabaseAuthServiceInstance.triggerResendCode(email));
      if (cooldown === 0) setCooldown(45);
    } finally {
      setBusy(false);
    }
  };

  /** Social OAuth (Google / Apple) — native Apple on iOS when available, else system-browser OAuth. */
  const socialSignIn = async (provider: 'google' | 'apple') => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      // Native Apple authentication (iOS 13+): get an identity token locally,
      // then exchange it with Supabase — no browser round-trip.
      if (provider === 'apple' && Platform.OS === 'ios' && (await AppleAuthentication.isAvailableAsync())) {
        const { raw: rawNonce, sha256: nonce } = await SupabaseAuthService.generateNonce();
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
          nonce,
        });
        if (credential.identityToken == null) throw new Error('Apple sign-in did not return a token.');
        const idErr = await SupabaseAuthServiceInstance.signInWithIdToken(
          credential.identityToken,
          rawNonce,
          credential.fullName?.givenName != null
            ? `${credential.fullName.givenName}${credential.fullName.familyName != null ? ` ${credential.fullName.familyName}` : ''}`
            : undefined,
        );
        if (idErr != null && idErr.length > 0) throw new Error(idErr);
        await finishSignIn();
        return;
      }
      const res = await SupabaseServiceInstance.signInWithSocial(provider);
      if (res.user != null) {
        await finishSignIn();
      } else {
        setMessage(`${provider === 'google' ? 'Google' : 'Apple'} sign-in did not complete.`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Social sign-in failed.';
      if (!msg.toUpperCase().includes('CANCELLED')) setMessage(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.canvas }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Brand */}
        <View style={styles.brandRow}>
          <BrandLogo size={44} />
          <Text style={{ fontFamily: fontFamilyFor('w900'), fontSize: 26, letterSpacing: -1.2, color: colors.ink }}>
            Qubi
          </Text>
        </View>

        <View style={{ height: 34 }} />
        <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize: 30, lineHeight: 36, letterSpacing: -1.2, color: colors.ink }}>
          {stage === 'credentials' ? 'Begin your quest.' : 'Check your inbox.'}
        </Text>
        <View style={{ height: 10 }} />
        <Text style={{ ...body({ color: colors.muted }), fontSize: 15 }}>
          {stage === 'credentials'
            ? 'Create an account to sync XP, streaks and quests across devices.'
            : `We sent a 6-digit code to ${email.trim()}. Enter it below to verify.`}
        </Text>

        <View style={{ height: 26 }} />

        {stage === 'credentials' ? (
          <>
            <View style={[styles.inputWrap, { backgroundColor: AppColors.cardWhite, borderColor: AppColors.cardBorderStrong }]}>
              <StrokeIcon name="user" size={17} color={AppColors.placeholder} strokeWidth={2} />
              <View style={{ width: 10 }} />
              <TextInput
                value={email}
                onChangeText={(t) => setEmail(t)}
                placeholder="you@example.com"
                placeholderTextColor={AppColors.placeholder}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                style={[styles.input, { color: AppColors.ink }]}
              />
            </View>
            <View style={{ height: 12 }} />
            <View style={[styles.inputWrap, { backgroundColor: AppColors.cardWhite, borderColor: AppColors.cardBorderStrong }]}>
              <StrokeIcon name="lock" size={17} color={AppColors.placeholder} strokeWidth={2} />
              <View style={{ width: 10 }} />
              <TextInput
                value={password}
                onChangeText={(t) => setPassword(t)}
                placeholder="Password (6+ characters)"
                placeholderTextColor={AppColors.placeholder}
                secureTextEntry
                style={[styles.input, { color: AppColors.ink }]}
              />
            </View>
            <View style={{ height: 12 }} />
            <View style={[styles.inputWrap, { backgroundColor: AppColors.cardWhite, borderColor: AppColors.cardBorderStrong }]}>
              <StrokeIcon name="user" size={17} color={AppColors.placeholder} strokeWidth={2} />
              <View style={{ width: 10 }} />
              <TextInput
                value={username}
                onChangeText={(t) => setUsername(t.replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="@username (unique handle)"
                placeholderTextColor={AppColors.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={16}
                style={[styles.input, { color: AppColors.ink }]}
              />
            </View>
            <View style={{ height: 12 }} />
            <View style={[styles.inputWrap, { backgroundColor: AppColors.cardWhite, borderColor: AppColors.cardBorderStrong }]}>
              <StrokeIcon name="name" size={17} color={AppColors.placeholder} strokeWidth={2} />
              <View style={{ width: 10 }} />
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Display name (e.g. Alex Rivera)"
                placeholderTextColor={AppColors.placeholder}
                autoComplete="name"
                maxLength={32}
                style={[styles.input, { color: AppColors.ink }]}
              />
            </View>
            <View style={{ height: 20 }} />

            <Pressable onTap={() => void signUp()} scale={0.97}>
              <View style={[styles.cta, { backgroundColor: AppColors.primary }]}>
                <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize: 16, letterSpacing: -0.3, color: '#fff' }}>
                  <Text>{busy ? 'Sending code…' : 'Send Verification Code'}</Text>
                </Text>
              </View>
            </Pressable>

            {/* ── Social auth ── */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={{ ...body({ color: colors.muted }), fontSize: 12 }}>or continue with</Text>
              <View style={styles.dividerLine} />
            </View>
            <View style={styles.socialRow}>
              <View style={{ flex:1 }}>
                <Pressable onTap={() => void socialSignIn('google')} scale={0.98}>
                  <View style={[styles.socialButton, { borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0', backgroundColor: isDark ? '#1E293B' : '#FFFFFF', height: 50, borderRadius:16 }]}>
                    <GoogleLogo size={18} />
                    <View style={{ width: 8 }} />
                    <Text numberOfLines={1} style={{ fontFamily: fontFamilyFor('w600'), fontSize: 14, color: colors.ink }}>
                      <Text>Google</Text>
                    </Text>
                  </View>
                </Pressable>
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex:1 }}>
                <Pressable onTap={() => void socialSignIn('apple')} scale={0.98}>
                  <View style={[styles.socialButton, { borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0', backgroundColor: isDark ? '#1E293B' : '#FFFFFF', height: 50, borderRadius:16 }]}>
                    <AppleLogo size={18} color={isDark ? '#FFFFFF' : '#0F172A'} />
                    <View style={{ width: 8 }} />
                    <Text numberOfLines={1} style={{ fontFamily: fontFamilyFor('w600'), fontSize: 14, color: colors.ink }}>
                      <Text>Apple</Text>
                    </Text>
                  </View>
                </Pressable>
              </View>
            </View>
          </>
        ) : (
          <>
            <View style={[styles.inputWrap, { backgroundColor: colors.surfaceContainer, borderColor: withAlpha(colors.ink, 0.1) }]}>
              <StrokeIcon name="shield" size={18} color={AppColors.primary} strokeWidth={2.2} />
              <View style={{ width: 10 }} />
              <TextInput
                ref={otpRef}
                value={code}
                onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
                placeholder="••••••"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                maxLength={6}
                style={[styles.input, styles.codeInput, { color: colors.ink, fontFamily: fontFamilyFor('w900') }]}
              />
            </View>
            <View style={{ height: 20 }} />

            <Pressable onTap={() => void verify()} scale={0.97}>
              <View style={[styles.cta, { backgroundColor: code.length === 6 ? AppColors.primary : '#9CA3AF' }]}>
                <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize: 16, letterSpacing: -0.3, color: '#fff' }}>
                  <Text>{busy ? 'Verifying…' : 'Verify & Start'}</Text>
                </Text>
              </View>
            </Pressable>

            <View style={{ height: 14 }} />
            <Pressable onTap={() => void resend()} scale={0.97}>
              <View style={styles.resendPill}>
                <StrokeIcon name="replay" size={15} color={cooldown > 0 ? colors.muted : AppColors.primary} strokeWidth={2.4} />
                <View style={{ width: 7 }} />
                <Text style={{ ...label({ color: cooldown > 0 ? colors.muted : AppColors.primary }), fontWeight: '700' }}>
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                </Text>
              </View>
            </Pressable>

            <View style={{ height: 10 }} />
            <Pressable onTap={() => { setStage('credentials'); setCode(''); setMessage(null); }}>
              <Text style={{ ...body({ color: colors.muted }), fontSize: 13 }}>Use a different email</Text>
            </Pressable>
          </>
        )}

        {message != null ? (
          <View style={[styles.msgCard, { backgroundColor: withAlpha('#EF4444', 0.08), borderColor: withAlpha('#EF4444', 0.3) }]}>
            <StrokeIcon name="alert" size={16} color="#EF4444" strokeWidth={2.4} />
            <View style={{ width: 8 }} />
            <Text style={{ ...body({ color: '#BA1A1A' }), fontSize: 13, flex: 1 }}>{message}</Text>
          </View>
        ) : null}

        {/* Demo escape hatch */}
        <View style={{ height: 26 }}>
          <View style={{ flex: 1, backgroundColor: withAlpha(colors.ink, 0.07), height: 1, alignSelf: 'stretch' }} />
        </View>
        <Pressable onTap={() => { skipAuth(); onAuthed(); }} scale={0.97}>
          <View style={[styles.demoPill, { borderColor: withAlpha(colors.ink, 0.14) }]}>
            <StrokeIcon name="play" size={15} color={colors.ink} strokeWidth={2.3} />
            <View style={{ width: 8 }} />
            <Text style={{ fontFamily: fontFamilyFor('w600'), fontSize: 14, color: colors.ink }}>
              Explore in demo mode
            </Text>
          </View>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 70, paddingBottom: 40 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: AppColors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 7,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 0 },
  codeInput: { fontSize: 24, letterSpacing: 10, textAlign: 'center' },
  cta: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    paddingVertical: 17,
    shadowColor: AppColors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  resendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingVertical: 11,
  },
  msgCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    padding: 13,
    marginTop: 18,
  },
  demoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: 999,
    paddingVertical: 12,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 22,
    marginBottom: 16,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(107,107,107,0.25)' },
  socialRow: { flexDirection: 'row' },
  socialButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 13,
  },
});
