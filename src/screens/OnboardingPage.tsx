import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SvgXml } from 'react-native-svg';

import { useAppStore, selectOnboardingDataJson } from '../state/appStore';
import { SupabaseServiceInstance } from '../services/supabase';
import { SupabaseAuthServiceInstance } from '../services/authService';
import type { Session, User } from '@supabase/supabase-js';
import { AppColors, withAlpha } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { AppSpacing } from '../theme/spacing';
import { fontFamilyFor } from '../theme/typography';
import { StrokeIcon } from '../components/AppIcons';
import { GoogleLogo } from '../components/AppIcons';
import { QubiMascot } from '../components/QubiMascot';
import { OtpVerificationSheet } from '../components/OtpVerificationSheet';

/**
 * 17-step onboarding wizard with live Inspector panel and Replay mode.
 * When `replayMode` is true the wizard starts with existing responses
 * pre-filled so the user can tweak and re-submit.
 * Ported from onboarding_page.dart.
 */

const PROGRESS = [0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72, 78, 84, 92, 100];

interface ChoiceOption {
  icon: string;
  label: string;
  value: string;
  emoji?: string;
}

export function OnboardingPage({ replayMode = false }: { replayMode?: boolean }) {
  const { isDark } = useTheme();
  const ink = isDark ? AppColors.inkLight : AppColors.ink;

  const [step, setStep] = useState(0);
  const [showInspector, setShowInspector] = useState(false);

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');

  const [authMode, setAuthMode] = useState<'google' | 'email' | null>(null);
  const googleName = useRef('');
  const googleEmail = useRef('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signInMode, setSignInMode] = useState(false);

  // OTP sheet plumbing (replaces the awaited showModalBottomSheet).
  const [otpVisible, setOtpVisible] = useState(false);
  const [otpUserId, setOtpUserId] = useState<string | null>(null);
  const pendingAfterVerify = useRef<((verified: boolean) => void) | null>(null);

  useEffect(() => {
    if (!replayMode) return;
    const s = useAppStore.getState();
    setName(s.displayName);
    setUsername(s.username);
    // Other fields are choice grids — they read from responses directly.
  }, [replayMode]);

  const next = () => setStep((s) => Math.min(s + 1, PROGRESS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));
  const launch = () => void useAppStore.getState().finishOnboarding();

  // ── Auth wiring ────────────────────────────────────────────────────────

  const afterAuthSuccess = async (res: { session: Session | null; user: User | null }) => {
    const user = res.user;
    if (user != null) {
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      let n = String(meta['full_name'] ?? meta['name'] ?? user.email ?? '');
      googleEmail.current = user.email ?? '';
      if (n.length === 0) n = googleEmail.current.split('@')[0];
      googleName.current = n;
    }
    await useAppStore.getState().hydrateFromSupabase();
    return useAppStore.getState().onboardingDone;
  };

  const friendlyGoogleError = (e: unknown) => {
    const s = String(e);
    if (s.includes('cancelled') || s.includes('CANCELED')) {
      return 'Sign-in was cancelled. Try again or use email instead.';
    }
    if (s.includes('not enabled')) {
      // pass through the actionable Supabase provider message verbatim
      return s;
    }
    if (s.includes('network') || s.includes('timeout') || s.includes('Socket')) {
      return 'No internet connection. Check your network and try again.';
    }
    if (s.includes('ID token') || s.includes('idToken')) {
      return 'Google sign-in failed to complete. Make sure Google Play Services is installed and up to date.';
    }
    if (s.includes('did not launch') || s.includes('DEVELOPER_ERROR')) {
      return 'Google sign-in is not configured. Add your OAuth client ID to the Android manifest and Supabase dashboard.';
    }
    return 'Google sign-in failed. Try again or use email instead.';
  };

  const continueWithGoogle = async () => {
    if (authBusy) return;
    setAuthBusy(true);
    setAuthError(null);
    try {
      const res = await SupabaseServiceInstance.signInWithGoogle();
      const returning = await afterAuthSuccess(res);
      if (returning) return; // Previous device — boot gate routes to dashboard.
      setAuthMode('google');
      // Pre-fill name from Google profile.
      if (googleName.current.length > 0 && name.length === 0) setName(googleName.current);
      setAuthBusy(false);
      next();
    } catch (e) {
      setAuthBusy(false);
      setAuthError(friendlyGoogleError(e));
    }
  };

  const friendlyAuthError = (e: unknown) => {
    const message =
      typeof e === 'object' && e != null && 'message' in e ? String((e as Error).message) : String(e);
    const lower = message.toLowerCase();
    if (lower.includes('invalid login credentials') || lower.includes('invalid_credentials')) {
      return 'Incorrect email or password.';
    }
    if (lower.includes('already registered') || lower.includes('already_registered')) {
      return 'An account already exists for this email — switch to "Sign in".';
    }
    if (
      lower.includes('email not confirmed') ||
      lower.includes('email_confirm') ||
      lower.includes('email confirmation')
    ) {
      return 'Please verify your email before signing in.';
    }
    if (lower.includes('confirm') || lower.includes('confirmation')) {
      return message;
    }
    if (lower.includes('weak password') || lower.includes('password should be at least')) {
      return 'Password is too weak — use at least 6 characters.';
    }
    return 'Could not sign in right now. Check your connection and try again.';
  };

  /** Shared post-OTP verification: sign back in (with confirm fallback). */
  const signInAfterVerification = async (): Promise<void> => {
    setAuthBusy(true);
    try {
      let retryRes = await SupabaseServiceInstance.signInExistingUser(email.trim(), pass);
      if (!retryRes.success && retryRes.errorType === 'emailNotVerified') {
        try {
          await SupabaseAuthServiceInstance.confirmUserEmail(email.trim());
        } catch (confirmErr) {
          console.log('[auth] confirmUserEmail fallback failed:', confirmErr);
        }
        retryRes = await SupabaseServiceInstance.signInExistingUser(email.trim(), pass);
      }
      if (retryRes.success && retryRes.response != null) {
        const returning = await afterAuthSuccess(retryRes.response);
        if (returning) return;
        setAuthMode('email');
        setAuthBusy(false);
        next();
        return;
      }
      setAuthBusy(false);
      setAuthError(retryRes.friendlyMessage);
    } catch {
      setAuthBusy(false);
      setAuthError('Email verified but sign-in failed. Please try signing in.');
    }
  };

  const openOtpSheet = (userId: string | null) =>
    new Promise<boolean>((resolve) => {
      pendingAfterVerify.current = resolve;
      setOtpUserId(userId);
      setOtpVisible(true);
    });

  const handleOtpClosed = (verified: boolean) => {
    setOtpVisible(false);
    pendingAfterVerify.current?.(verified);
    pendingAfterVerify.current = null;
  };

  const continueWithEmail = async () => {
    const cleanEmail = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      setAuthError('Please enter a valid email address.');
      return;
    }
    if (pass.length < 6) {
      setAuthError('Password needs at least 6 characters.');
      return;
    }
    if (authBusy) return;
    setAuthError(null);
    setAuthBusy(true);
    try {
      if (signInMode) {
        // ── SIGN IN ────────────────────────────────────────────────────
        const res = await SupabaseServiceInstance.signInExistingUser(cleanEmail, pass);
        if (!res.success) {
          // Unverified email → send a fresh Resend code and route to OTP sheet.
          if (res.errorType === 'emailNotVerified') {
            setAuthBusy(false);
            const sendResult = await SupabaseAuthServiceInstance.sendResendCode(cleanEmail);
            if (sendResult['status'] === 'error') {
              setAuthBusy(false);
              setAuthError(sendResult['message'] ?? 'Failed to send verification code. Please try again.');
              return;
            }
            const verified = await openOtpSheet(null);
            if (verified) {
              await signInAfterVerification();
            }
            return;
          }
          // Other errors.
          setAuthBusy(false);
          setAuthError(res.friendlyMessage);
          return;
        }
        // Successful sign-in.
        if (res.response == null) {
          setAuthBusy(false);
          setAuthError(friendlyAuthError(new Error('empty response')));
          return;
        }
        const returning = await afterAuthSuccess(res.response);
        if (returning) return;
        setAuthMode('email');
        setAuthBusy(false);
        next();
      } else {
        // ── SIGN UP ────────────────────────────────────────────────────
        // Step 1: Create Supabase account. We only need Supabase to hold the
        // user record — ALL verification goes through our custom Resend Edge
        // Function, so we intentionally ignore Supabase's built-in email.
        let newUserId: string | undefined;
        try {
          await SupabaseServiceInstance.prepareNewAccountSession();
          const response = await SupabaseServiceInstance.client.auth.signUp({
            email: cleanEmail,
            password: pass,
          });
          newUserId = response.data.user?.id ?? undefined;
          console.log(`[auth] signUp: account created for ${cleanEmail}`);
          // Email confirmation OFF — user is already logged in.
          // Sign out immediately; we require OTP verification first.
          if (response.data.session != null) {
            await SupabaseServiceInstance.client.auth.signOut();
            console.log('[auth] signUp: signed out (confirmation OFF, will verify via OTP)');
          }
        } catch (e) {
          const lower = String(e).toLowerCase();
          // Already registered but unverified — fine, send a fresh code.
          if (
            lower.includes('already registered') ||
            lower.includes('already been registered') ||
            lower.includes('user already exists')
          ) {
            console.log('[auth] signUp: account already exists, sending fresh Resend code');
          } else if (lower.includes('already been confirmed') || lower.includes('email already confirmed')) {
            // Already verified — tell the user to sign in.
            setAuthBusy(false);
            setAuthError('An account already exists for this email. Try signing in.');
            return;
          } else if (
            lower.includes('email') &&
            (lower.includes('send') ||
              lower.includes('confirmation') ||
              lower.includes('smtp') ||
              lower.includes('error sending'))
          ) {
            console.log(`[auth] signUp: Supabase email send failed (${String(e)}), proceeding with custom OTP`);
          } else {
            setAuthBusy(false);
            setAuthError(friendlyAuthError(e));
            return;
          }
        }

        // Step 2: Send verification code via Resend Edge Function.
        const sendResult = await SupabaseAuthServiceInstance.sendResendCode(cleanEmail);
        if (sendResult['status'] === 'error') {
          setAuthBusy(false);
          setAuthError(sendResult['message'] ?? 'Failed to send verification code.');
          return;
        }

        // Step 3: Open OTP verification sheet (userId lets the backend confirm
        // exactly this user right at verify time).
        setAuthBusy(false);
        const verified = await openOtpSheet(newUserId ?? null);

        // Step 4: If verified, sign in — the Edge Function confirmed the email
        // during verification. Fall back to explicit confirm only if needed.
        if (verified) {
          await signInAfterVerification();
        }
      }
    } catch (e) {
      setAuthBusy(false);
      setAuthError(friendlyAuthError(e));
    }
  };

  const saveName = async () => {
    const cleanName = name.trim();
    if (cleanName.length === 0) return;
    const derivedUsername = deriveUsername(cleanName);
    const app = useAppStore.getState();
    if (authMode === 'google') {
      app.applyGoogleAuth({ name: cleanName, email: googleEmail.current });
    } else {
      app.createAccount({
        name: cleanName,
        username: derivedUsername,
        email: email.trim(),
        password: pass,
      });
    }
    await app.setProfile({ name: cleanName, username: derivedUsername });
    next();
  };

  const saveUsername = async () => {
    const cleanUsername = username.trim().toLowerCase();
    if (cleanUsername.length === 0) return;
    const app = useAppStore.getState();
    await app.setProfile({ name: app.displayName, username: cleanUsername });
    next();
  };

  // ── Shared helpers ─────────────────────────────────────────────────────

  const mascot = (size: number) => <QubiMascot size={size} bob />;

  const inputStyle = {
    fontSize: 16,
    fontFamily: fontFamilyFor('w500'),
    color: ink,
    backgroundColor: isDark ? AppColors.cardDark : '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: isDark ? AppColors.borderDark : AppColors.border,
    paddingHorizontal: 18,
    paddingVertical: 16,
  };

  const primaryButton = (label: string, onTap: () => void) => (
    <LinearGradient
      colors={[AppColors.primary, AppColors.primaryDeep]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={{
        height: 56,
        borderRadius: AppSpacing.radiusPill,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        shadowColor: withAlpha(AppColors.primary, 0.35),
        shadowOpacity: 1,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: 6,
      }}
    >
      <Text
        onPress={onTap}
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{
          fontSize: 16,
          fontFamily: fontFamilyFor('w800'),
          color: '#FFFFFF',
        }}
      >
        {label}
        {'  →'}
      </Text>
    </LinearGradient>
  );

  const choiceGrid = (
    options: ChoiceOption[],
    responseKey: string,
    opts: { columns?: number; multiSelect?: boolean; maxSelect?: number } = {},
  ) => (
    <MultiChoiceGrid
      options={options}
      responseKey={responseKey}
      columns={opts.columns ?? 1}
      multiSelect={opts.multiSelect ?? false}
      maxSelect={opts.maxSelect ?? 3}
      existingValues={(useAppStore.getState().responses[responseKey] ?? '').split(',')}
      onPickNext={next}
    />
  );

  const scaffold = (
    m: React.ReactNode,
    title: string,
    subtitle: string | null,
    body: React.ReactNode,
  ) => (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16 }}>
        <View style={{ alignItems: 'center' }}>{m}</View>
        <View style={{ height: 20 }} />
        <Text

          style={{
            textAlign: 'center',
            fontSize: 26,
            fontFamily: fontFamilyFor('w800'),
            letterSpacing: -0.5,
            color: ink,
          }}
        >
          {title}
        </Text>
        {subtitle != null && (
          <>
            <View style={{ height: 8 }} />
            <Text

              style={{
                textAlign: 'center',
                fontSize: 14,
                lineHeight: 14 * 1.4,
                color: AppColors.muted,
              }}
            >
              {subtitle}
            </Text>
          </>
        )}
        <View style={{ height: 26 }} />
        <View style={{ flex: 1 }}>{body}</View>
      </View>
    </KeyboardAvoidingView>
  );

  const summaryCard = (icon: string, title: string, subtitle: string, accent: string) => (
    <View
      style={{
        paddingHorizontal: 16,
        paddingVertical: 14,
        backgroundColor: isDark ? AppColors.cardDark : '#FFFFFF',
        borderRadius: AppSpacing.radiusCard,
        borderWidth: 1,
        borderColor: isDark ? AppColors.borderDark : AppColors.border,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <LinearGradient
        colors={[withAlpha(accent, 0.2), withAlpha(accent, 0.08)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
      >
        <StrokeIcon name={icon} size={20} color={accent} />
      </LinearGradient>
      <View style={{ width: 14 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14.5, fontFamily: fontFamilyFor('w700'), color: ink }}>{title}</Text>
        <View style={{ height: 2 }} />
        <Text style={{ fontSize: 12, color: AppColors.muted }}>{subtitle}</Text>
      </View>
    </View>
  );

  // ── Steps ─────────────────────────────────────────────────────────────

  const steps: Array<() => React.ReactNode> = [
    // 1. Welcome
    () => (
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 24 }}>
        <View style={{ flex: 2 }} />
        {mascot(160)}
        <View style={{ height: 32 }} />
        <Text

          style={{ textAlign: 'center', fontSize: 30, fontFamily: fontFamilyFor('w800'), letterSpacing: -1, color: ink }}
        >
          {'Let\u2019s build your streak!'}
        </Text>
        <View style={{ height: 12 }} />
        <Text

          style={{ textAlign: 'center', fontSize: 15, lineHeight: 15 * 1.5, color: AppColors.muted }}
        >
          {'Snap proof. Stack XP. Climb the leagues.\nQubi will keep you on track.'}
        </Text>
        <View style={{ flex: 3 }} />
        {primaryButton('Start Your Streak', next)}
        <View style={{ height: 8 }} />
      </View>
    ),
    // 2. Auth (Google + email)
    () => (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 24 }}>
          <View style={{ alignItems: 'center' }}>{mascot(96)}</View>
          <View style={{ height: 20 }} />
          <Text

            style={{ textAlign: 'center', fontSize: 27, fontFamily: fontFamilyFor('w800'), letterSpacing: -0.5, color: ink }}
          >
            {signInMode ? 'Welcome back' : 'Create your account'}
          </Text>
          <View style={{ height: 8 }} />
          <Text style={{ textAlign: 'center', fontSize: 14, color: AppColors.muted }}>
            {signInMode
              ? 'Sign in and pick up right where you left off.'
              : 'Your quests, streaks & leagues sync everywhere.'}
          </Text>
          <View style={{ height: 26 }} />
          {/* Google button */}
          <View
            style={{
              height: 54,
              borderRadius: AppSpacing.radiusPill,
              backgroundColor: isDark ? AppColors.cardDark : '#FFFFFF',
              borderWidth: 1,
              borderColor: isDark ? AppColors.borderDark : AppColors.border,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {authBusy ? (
              <ActivityIndicator size="small" />
            ) : (
              <>
                <SvgXml xml={GOOGLE_LOGO_SVG} width={20} height={20} />
                <Text
                  onPress={() => void continueWithGoogle()}
                  style={{
                    marginLeft: 10,
                    fontSize: 15,
                    fontFamily: fontFamilyFor('w600'),
                    color: ink,
                  }}
                >
                  Continue with Google
                </Text>
              </>
            )}
          </View>
          <View style={{ height: 20 }} />
          {/* Divider */}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1, height: 1, backgroundColor: isDark ? AppColors.borderDark : AppColors.border }} />
            <Text
              style={{
                marginHorizontal: 12,
                fontSize: 12.5,
                fontFamily: fontFamilyFor('w600'),
                color: AppColors.muted,
              }}
            >
              or with email
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: isDark ? AppColors.borderDark : AppColors.border }} />
          </View>
          <View style={{ height: 20 }} />
          <TextInput
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="you@example.com"
            placeholderTextColor={withAlpha(AppColors.muted, 0.5)}
            style={inputStyle}
          />
          <View style={{ height: 12 }} />
          <TextInput
            value={pass}
            onChangeText={setPass}
            secureTextEntry
            placeholder="6+ characters"
            placeholderTextColor={withAlpha(AppColors.muted, 0.5)}
            style={inputStyle}
          />
          {authError != null && (
            <>
              <View style={{ height: 10 }} />
              <Text

                style={{ fontSize: 12.5, color: AppColors.error }}
              >
                {authError}
              </Text>
            </>
          )}
          <View style={{ height: 18 }} />
          {authBusy ? (
            <ActivityIndicator color={AppColors.primary} />
          ) : (
            primaryButton(signInMode ? 'Sign in' : 'Create account', () => void continueWithEmail())
          )}
          <View style={{ height: 4 }} />
          <Text
            onPress={() => {
              setSignInMode(!signInMode);
              setAuthError(null);
            }}
            style={{
              alignSelf: 'center',
              padding: 8,
              color: AppColors.primary,
              fontSize: 13.5,
              fontFamily: fontFamilyFor('w700'),
            }}
          >
            {signInMode ? 'New to Qubi? Create an account' : 'Already have an account? Sign in'}
          </Text>
          <View style={{ height: 8 }} />
          <Text

            style={{ textAlign: 'center', fontSize: 11, color: withAlpha(AppColors.muted, 0.8) }}
          >
            By continuing you agree to the Terms & Privacy Policy
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    ),
    // 3. Name
    () =>
      scaffold(
        mascot(64),
        'What\u2019s your name?',
        'Qubi will cheer you on by it.',
        <View>
          <TextInput
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            placeholder="e.g. Alex"
            placeholderTextColor={withAlpha(AppColors.muted, 0.5)}
            style={inputStyle}
          />
          <View style={{ height: 24 }} />
          {primaryButton('Continue', () => void saveName())}
        </View>,
      ),
    // 4. Username
    () =>
      scaffold(
        mascot(52),
        'Pick a username',
        'This is your unique handle on the leaderboard.',
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TextInput
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              placeholder="@yourname"
              placeholderTextColor={withAlpha(AppColors.muted, 0.5)}
              style={[inputStyle, { flex: 1 }]}
            />
            <Text style={{ paddingLeft: 14, fontSize: 16, color: AppColors.muted }}>@</Text>
          </View>
          <View style={{ height: 24 }} />
          {primaryButton('Continue', () => void saveUsername())}
        </View>,
      ),
    // 5. Age
    () =>
      scaffold(
        mascot(52),
        'How old are you?',
        'So Qubi can set goals that actually fit your life.',
        choiceGrid(
          [
            { icon: 'star', label: 'Under 18', emoji: '\u{1F423}', value: 'under_18' },
            { icon: 'flame', label: '18 \u2013 24', emoji: '\u{1F525}', value: '18_24' },
            { icon: 'briefcase', label: '25 \u2013 34', emoji: '\u{1F4BC}', value: '25_34' },
            { icon: 'rocket', label: '35+', emoji: '\u{1F680}', value: '35_plus' },
          ],
          'age_group',
          { columns: 2 },
        ),
      ),
    // 6. Gender
    () =>
      scaffold(
        mascot(52),
        'How do you identify?',
        'Optional \u2014 helps us personalise your experience.',
        choiceGrid(
          [
            { icon: 'user', label: 'Male', value: 'male' },
            { icon: 'user', label: 'Female', value: 'female' },
            { icon: 'user', label: 'Non-binary', value: 'non_binary' },
            { icon: 'user', label: 'Prefer not to say', value: 'prefer_not' },
          ],
          'gender',
          { columns: 2 },
        ),
      ),
    // 7. Wake Time
    () =>
      scaffold(
        mascot(52),
        'What time do you wake up?',
        'Qubi will schedule your morning quests.',
        choiceGrid(
          [
            { icon: 'sun', label: '5:00 AM', emoji: '\u{1F305}', value: '05' },
            { icon: 'sun', label: '6:00 AM', emoji: '\u2600\uFE0F', value: '06' },
            { icon: 'sun', label: '7:00 AM', emoji: '\u{1F31F}', value: '07' },
            { icon: 'sun', label: '8:00 AM', emoji: '\u{1F324}\uFE0F', value: '08' },
            { icon: 'sun', label: '9:00 AM', emoji: '\u{1F323}\uFE0F', value: '09' },
          ],
          'wake_time',
          { columns: 2 },
        ),
      ),
    // 8. Bedtime
    () =>
      scaffold(
        mascot(52),
        'When do you go to bed?',
        'We\u2019ll wind down your evening quests.',
        choiceGrid(
          [
            { icon: 'moon', label: '9:00 PM', emoji: '\u{1F319}', value: '21' },
            { icon: 'moon', label: '10:00 PM', emoji: '\u{1F31B}', value: '22' },
            { icon: 'moon', label: '11:00 PM', emoji: '\u{1F303}', value: '23' },
            { icon: 'moon', label: '12:00 AM', emoji: '\u2B50', value: '00' },
          ],
          'bedtime',
          { columns: 2 },
        ),
      ),
    // 9. Top Goals
    () =>
      scaffold(
        mascot(52),
        'What are your top goals?',
        'Pick up to 3 \u2014 we\u2019ll prioritise these.',
        choiceGrid(
          [
            { icon: 'dumbbell', label: 'Get fit', emoji: '\u{1F3CB}\uFE0F', value: 'fitness' },
            { icon: 'zap', label: 'Be productive', emoji: '\u26A1', value: 'productivity' },
            { icon: 'book', label: 'Learn more', emoji: '\u{1F4DA}', value: 'learning' },
            { icon: 'leaf', label: 'Be mindful', emoji: '\u{1F33F}', value: 'mindfulness' },
            { icon: 'heart', label: 'Mental health', emoji: '\u{1F49C}', value: 'mental_health' },
            { icon: 'homeOutlined', label: 'Organise home', emoji: '\u{1F9F9}', value: 'organise' },
          ],
          'top_goals',
          { columns: 2, multiSelect: true, maxSelect: 3 },
        ),
      ),
    // 10. Daily Quest Count
    () =>
      scaffold(
        mascot(52),
        'How many quests per day?',
        'Start small and build up \u2014 consistency beats volume.',
        choiceGrid(
          [
            { icon: 'star', label: '3 quests (Easy start)', value: '3' },
            { icon: 'flame', label: '5 quests (Balanced)', value: '5' },
            { icon: 'rocket', label: '7 quests (All in)', value: '7' },
          ],
          'daily_quests',
        ),
      ),
    // 11. Habit Categories
    () =>
      scaffold(
        mascot(52),
        'Which categories interest you?',
        'We\u2019ll suggest habits from these.',
        choiceGrid(
          [
            { icon: 'dumbbell', label: 'Fitness', emoji: '\u{1F3CB}\uFE0F', value: 'fitness' },
            { icon: 'book', label: 'Learning', emoji: '\u{1F4DA}', value: 'learning' },
            { icon: 'leaf', label: 'Wellness', emoji: '\u{1F33F}', value: 'wellness' },
            { icon: 'briefcase', label: 'Career', emoji: '\u{1F4BC}', value: 'career' },
            { icon: 'homeOutlined', label: 'Home', emoji: '\u{1F3E0}', value: 'home' },
            { icon: 'heart', label: 'Social', emoji: '\u{1F491}', value: 'social' },
          ],
          'habit_categories',
          { columns: 2, multiSelect: true, maxSelect: 4 },
        ),
      ),
    // 12. Priority Habits
    () =>
      scaffold(
        mascot(52),
        'Pick your starter habits',
        'Choose 2\u20134 habits to begin with.',
        choiceGrid(
          [
            { icon: 'droplet', label: 'Drink 2L water', emoji: '\u{1F4A7}', value: 'hydrate' },
            { icon: 'dumbbell', label: 'Gym session', emoji: '\u{1F3CB}\uFE0F', value: 'gym' },
            { icon: 'book', label: 'Read 20 min', emoji: '\u{1F4DA}', value: 'reading' },
            { icon: 'moon', label: 'Meditate', emoji: '\u{1F9D8}', value: 'meditation' },
            { icon: 'homeOutlined', label: 'Clean room', emoji: '\u{1F9F9}', value: 'cleanroom' },
            { icon: 'zap', label: 'Morning jog', emoji: '\u{1F3C3}', value: 'jog' },
          ],
          'priority_habits',
          { columns: 1, multiSelect: true, maxSelect: 4 },
        ),
      ),
    // 13. Readiness Goals
    () =>
      scaffold(
        mascot(52),
        'What\u2019s your readiness target?',
        'The gauge on your dashboard tracks this daily.',
        choiceGrid(
          [
            { icon: 'target', label: '70% \u2014 Stay consistent', value: '70' },
            { icon: 'target', label: '80% \u2014 Push harder', value: '80' },
            { icon: 'target', label: '90% \u2014 Near perfect', value: '90' },
            { icon: 'star', label: '100% \u2014 All or nothing', value: '100' },
          ],
          'readiness_target',
        ),
      ),
    // 14. Mascot Voice
    () =>
      scaffold(
        mascot(52),
        'How should Qubi talk to you?',
        'Pick the tone that keeps you motivated.',
        choiceGrid(
          [
            { icon: 'zap', label: 'Coach \u2014 Direct and punchy', value: 'coach' },
            { icon: 'heart', label: 'Friend \u2014 Warm and encouraging', value: 'friend' },
            { icon: 'star', label: 'Mentor \u2014 Calm and wise', value: 'mentor' },
          ],
          'mascot_voice',
        ),
      ),
    // 15. Daily Time Budget
    () =>
      scaffold(
        mascot(52),
        'How much time per day?',
        'We\u2019ll fit your quests into this window.',
        choiceGrid(
          [
            { icon: 'clock', label: '15 minutes', value: '15' },
            { icon: 'clock', label: '30 minutes', value: '30' },
            { icon: 'clock', label: '45 minutes', value: '45' },
            { icon: 'clock', label: '60+ minutes', value: '60' },
          ],
          'daily_time_budget',
        ),
      ),
    // 16. Theme Preference
    () =>
      scaffold(
        mascot(52),
        'Pick your vibe',
        'Light, dark, or match your system.',
        choiceGrid(
          [
            { icon: 'sun', label: 'Light mode', emoji: '\u2600\uFE0F', value: 'light' },
            { icon: 'moon', label: 'Dark mode', emoji: '\u{1F319}', value: 'dark' },
            { icon: 'settings', label: 'Follow system', emoji: '\u{1F4BB}', value: 'system' },
          ],
          'theme_preference',
        ),
      ),
    // 17. Confirm & Launch
    () => {
      const app = useAppStore.getState();
      const responses = app.responses;
      const firstName = app.displayName.split(' ')[0];
      const focus = focusLabel(responses['focus'] ?? responses['top_goals']);
      const wake = responses['wake_time'] ?? '?';
      const bed = responses['bedtime'] ?? '?';
      const quests = responses['daily_quests'] ?? '3';
      return (
        <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 16 }}>
          <View style={{ alignItems: 'center' }}>
            <View>
              <QubiMascot size={92} celebrating />
              <Text style={{ position: 'absolute', top: -6, right: -6, fontSize: 26 }}>{'\u{1F389}'}</Text>
            </View>
          </View>
          <View style={{ height: 10 }} />
          <Text

            style={{ textAlign: 'center', fontSize: 25, fontFamily: fontFamilyFor('w800'), letterSpacing: -0.5, color: ink }}
          >
            {`You\u2019re all set, ${firstName}!`}
          </Text>
          <View style={{ height: 6 }} />
          <Text

            style={{ textAlign: 'center', fontSize: 13.5, lineHeight: 13.5 * 1.4, color: AppColors.muted }}
          >
            {`Here\u2019s your plan — ${quests} quests/day, wake ${wake}:00, bed ${bed}:00.`}
          </Text>
          <View style={{ height: 20 }} />
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 4 }}>
            {summaryCard('target', `Focus \u00b7 ${focus}`, 'Your quests are tuned around it', AppColors.primary)}
            <View style={{ height: 10 }} />
            {summaryCard('clock', `Wake ${wake}:00 \u00b7 Bed ${bed}:00`, 'We\u2019ll schedule around your rhythm', AppColors.accent)}
            <View style={{ height: 10 }} />
            {summaryCard('flame', '+50 XP Starter Boost', 'Banked \u00b7 your streak begins today', AppColors.gold)}
          </ScrollView>
          <View style={{ height: 12 }} />
          {primaryButton('Lock Plan & Launch Dashboard \u{1F680}', launch)}
        </View>
      );
    },
  ];

  const StepBody = steps[step];

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? AppColors.canvasDark : AppColors.canvas }}>
      <View style={{ flex: 1, paddingTop: 44 }}>
        {/* Header bar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 8 }}>
          <View style={{ width: 38 }}>
            {step > 0 && <IconButtonRound icon="chevronLeft" onTap={back} />}
          </View>
          <View style={{ flex: 1 }} />
          {step > 2 ? (
            <Text style={{ fontSize: 12, fontFamily: fontFamilyFor('w600'), color: AppColors.muted }}>
              {`Step ${step + 1} of ${PROGRESS.length}`}
            </Text>
          ) : (
            <Text
              style={{
                fontSize: 13,
                fontFamily: fontFamilyFor('w800'),
                letterSpacing: 0.5,
                color: ink,
              }}
            >
              Qubi
            </Text>
          )}
          <View style={{ flex: 1 }} />
          {/* Inspector toggle */}
          <Text
            onPress={() => setShowInspector(!showInspector)}
            style={{
              width: 38,
              height: 38,
              lineHeight: 34,
              textAlign: 'center',
              fontSize: 16,
              borderRadius: 19,
              overflow: 'hidden',
              backgroundColor: showInspector
                ? withAlpha(AppColors.primary, 0.15)
                : isDark
                  ? AppColors.cardDark
                  : '#FFFFFF',
              borderWidth: 1,
              borderColor: showInspector ? AppColors.primary : isDark ? AppColors.borderDark : AppColors.border,
              color: showInspector ? AppColors.primary : AppColors.muted,
            }}
          >
            {'\u{1F50D}'}
          </Text>
        </View>
        {/* Progress bar */}
        <View style={{ paddingHorizontal: 20 }}>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: isDark ? AppColors.gaugeTrackDark : AppColors.gaugeTrack, overflow: 'hidden' }}>
            <View
              style={{
                height: 6,
                borderRadius: 3,
                backgroundColor: AppColors.primary,
                width: `${PROGRESS[step]}%`,
              }}
            />
          </View>
        </View>
        {/* Current step (page view without swipe) */}
        <View key={step} style={{ flex: 1 }}>
          <StepBody />
        </View>
      </View>

      {/* Inspector overlay */}
      {showInspector && <InspectorPanel onClose={() => setShowInspector(false)} step={step} total={PROGRESS.length} />}

      {/* OTP verification sheet */}
      <OtpVerificationSheet
        visible={otpVisible}
        email={email.trim()}
        userId={otpUserId}
        onClose={() => handleOtpClosed(false)}
        onVerified={() => handleOtpClosed(true)}
      />
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════
// SHARED SUB-WIDGETS
// ════════════════════════════════════════════════════════════════════════

const GOOGLE_LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">' +
  '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>' +
  '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>' +
  '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>' +
  '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>' +
  '</svg>';

function focusLabel(v?: string): string {
  if (v == null) return 'Your goals';
  if (v.includes('fitness')) return 'Fitness';
  if (v.includes('productivity')) return 'Productivity';
  if (v.includes('learning')) return 'Learning';
  if (v.includes('mindfulness')) return 'Mindfulness';
  if (v.includes('mental')) return 'Mental Health';
  if (v.includes('organise')) return 'Home Organising';
  return 'Your goals';
}

export function deriveUsername(name: string): string {
  let u = name.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  if (u.length === 0) u = 'player';
  if (u.length < 3) u = u.padEnd(3, '0');
  if (u.length > 16) u = u.slice(0, 16);
  return u;
}

/** Multi/single-select choice grid that persists into AppState.responses. */
function MultiChoiceGrid({
  options,
  responseKey,
  columns,
  multiSelect,
  maxSelect,
  existingValues,
  onPickNext,
}: {
  options: ChoiceOption[];
  responseKey: string;
  columns: number;
  multiSelect: boolean;
  maxSelect: number;
  existingValues: string[];
  onPickNext: () => void;
}) {
  const { isDark } = useTheme();
  const ink = isDark ? AppColors.inkLight : AppColors.ink;
  const initial = new Set(existingValues.filter(Boolean));
  const [selected, setSelected] = useState<Set<string>>(initial);

  const pickSingle = (value: string) => {
    setSelected(new Set([value]));
    void useAppStore.getState().saveResponse(responseKey, value);
    setTimeout(onPickNext, 250);
  };

  const pickMulti = () => {
    void useAppStore.getState().saveResponse(responseKey, Array.from(selected).join(','));
    setTimeout(onPickNext, 250);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {options.map((opt) => {
            const isSelected = selected.has(opt.value);
            const compact = columns > 1;
            return (
              <View key={opt.value} style={{ width: compact ? '47.5%' : '100%' }}>
                <ChoiceCard option={opt} compact={compact} selected={isSelected} onTap={() => {
                  if (multiSelect) {
                    setSelected((prev) => {
                      const copy = new Set(prev);
                      if (copy.has(opt.value)) {
                        copy.delete(opt.value);
                      } else if (copy.size < maxSelect) {
                        copy.add(opt.value);
                      }
                      return copy;
                    });
                  } else {
                    pickSingle(opt.value);
                  }
                }} />
              </View>
            );
          })}
        </View>
      </ScrollView>
      {multiSelect && selected.size > 0 && (
        <>
          <View style={{ height: 16 }} />
          <LinearGradient
            colors={[AppColors.primary, AppColors.primaryDeep]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{
              height: 52,
              borderRadius: AppSpacing.radiusPill,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              onPress={pickMulti}
              style={{
                fontSize: 15,
                fontFamily: fontFamilyFor('w800'),
                color: '#FFFFFF',
              }}
            >
              {`Continue (${selected.size} selected)`}
            </Text>
          </LinearGradient>
        </>
      )}
    </View>
  );
}

function ChoiceCard({
  option,
  onTap,
  compact = false,
  selected = false,
}: {
  option: ChoiceOption;
  onTap: () => void;
  compact?: boolean;
  selected?: boolean;
}) {
  const { isDark } = useTheme();
  const ink = isDark ? AppColors.inkLight : AppColors.ink;
  return (
    <Text onPress={onTap}>
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 12,
          minHeight: 68,
          backgroundColor: selected
            ? withAlpha(AppColors.primary, 0.1)
            : isDark
              ? AppColors.cardDark
              : '#FFFFFF',
          borderRadius: AppSpacing.radiusCard,
          borderWidth: selected ? 1.6 : 1,
          borderColor: selected ? AppColors.primary : isDark ? AppColors.borderDark : AppColors.border,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            backgroundColor: selected ? AppColors.primary : isDark ? AppColors.chip : AppColors.chipMuted,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {option.emoji != null ? (
            <Text style={{ fontSize: 20 }}>{option.emoji}</Text>
          ) : (
            <StrokeIcon name={option.icon} size={20} color={selected ? '#FFFFFF' : AppColors.primary} />
          )}
        </View>
        <View style={{ width: 14 }} />
        <Text
          numberOfLines={compact ? 2 : undefined}
          style={{ flex: 1, fontSize: 15.5, fontFamily: fontFamilyFor('w700'), color: ink }}
        >
          {option.label}
        </Text>
        {selected && (
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: AppColors.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <StrokeIcon name="check" size={15} color="#FFFFFF" strokeWidth={2.4} />
          </View>
        )}
      </View>
    </Text>
  );
}

function IconButtonRound({ icon, onTap }: { icon: string; onTap: () => void }) {
  const { isDark } = useTheme();
  return (
    <Text
      onPress={onTap}
      style={{
        width: 38,
        height: 38,
        lineHeight: 38,
        textAlign: 'center',
        borderRadius: 19,
        overflow: 'hidden',
        backgroundColor: isDark ? AppColors.cardDark : '#FFFFFF',
        borderWidth: 1,
        borderColor: isDark ? AppColors.borderDark : AppColors.border,
      }}
    >
      <StrokeIcon name={icon} size={18} color={isDark ? AppColors.inkLight : AppColors.ink} />
    </Text>
  );
}

function InspectorPanel({ onClose, step, total }: { onClose: () => void; step: number; total: number }) {
  const { isDark } = useTheme();
  const pretty = JSON.stringify(selectOnboardingDataJson(useAppStore.getState()), null, 2);
  return (
    <View
      style={{
        position: 'absolute',
        top: 80,
        right: 12,
        left: 12,
        bottom: 100,
        backgroundColor: isDark ? 'rgba(15,23,42,0.90)' : 'rgba(255,255,255,0.94)',
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: withAlpha(AppColors.primary, 0.4),
        padding: 16,
        shadowColor: 'rgba(0,0,0,0.3)',
        shadowOpacity: 1,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 0 },
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ fontSize: 13, fontFamily: fontFamilyFor('w800'), color: AppColors.primary }}>
          {'\u{1F50D} Inspector \u2014 Live JSON'}
        </Text>
        <View style={{ flex: 1 }} />
        <Text onPress={onClose} style={{ fontSize: 18, color: AppColors.muted, paddingHorizontal: 8 }}>
          ✕
        </Text>
      </View>
      <View style={{ height: 8 }} />
      <Text
        style={{
          fontSize: 11,
          fontFamily: fontFamilyFor('w600'),
          color: withAlpha(AppColors.muted, 0.8),
        }}
      >
        {`Step ${step + 1}/${total} \u00b7 profiles.onboarding_data`}
      </Text>
      <View style={{ height: 12 }} />
      <View
        style={{
          flex: 1,
          padding: 12,
          borderRadius: 10,
          backgroundColor: 'rgba(0,0,0,0.3)',
        }}
      >
        <ScrollView>
          <Text style={{ fontSize: 11, lineHeight: 11 * 1.5, color: '#93C5FD', fontFamily: 'monospace' }}>
            {pretty}
          </Text>
        </ScrollView>
      </View>
    </View>
  );
}
