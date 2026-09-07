import React, { useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Mail, Lock, User, Sparkles } from 'lucide-react-native';
import { Svg, Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';

import { fontFamilyFor } from '../../theme/typography';
import { AppColors, withAlpha } from '../../theme/colors';
import { Pressable } from '../../components/Pressable';
import { useTheme } from '../../theme/ThemeProvider';
import { SupabaseServiceInstance } from '../../services/supabase';
import { SupabaseAuthServiceInstance, humanizeAuthError } from '../../services/authService';
import { useAppStore } from '../../state/appStore';
import { QubiAvatar } from '../../components/QubiAvatar';

interface LoginScreenProps {
  onBack: () => void;
  onLoginSuccess: () => void;
  onOtpRequired?: (email: string) => void;
  onDemoMode?: () => void;
}

export function LoginScreen({ onBack, onLoginSuccess, onOtpRequired, onDemoMode }: LoginScreenProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);
  const usernameRef = useRef<TextInput>(null);

  const containerOpacity = useRef(new Animated.Value(0)).current;
  const containerTranslateY = useRef(new Animated.Value(24)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(containerOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(containerTranslateY, { toValue: 0, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [containerOpacity, containerTranslateY]);

  const containerStyle = useMemo(() => ({ opacity: containerOpacity, transform: [{ translateY: containerTranslateY }] }), [containerOpacity, containerTranslateY]);

  const hapticLight = () => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };
  const hapticMedium = () => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); };

  const handleSwitch = (m: 'login' | 'signup') => {
    if (m === mode) return;
    hapticLight();
    setMode(m);
  };

  const canSubmit = mode === 'login'
    ? email.trim().length > 0 && password.trim().length > 0
    : email.trim().length > 0 && password.trim().length >= 6 && username.trim().length >= 2;

  const [authError, setAuthError] = useState<string | null>(null);

  /** Client-side input validation before submission. */
  const validateInput = (): string | null => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) return 'Please enter a valid email address.';
    if (password.length < 6) return 'Password must be at least 6 characters.';
    if (mode === 'signup') {
      const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
      if (!usernameRegex.test(username.trim())) return 'Username must be 3-20 characters (letters, numbers, underscores).';
    }
    return null;
  };

  const handlePrimary = async () => {
    if (!canSubmit || isLoading) return;
    hapticMedium();
    setAuthError(null);

    const validationError = validateInput();
    if (validationError != null) {
      setAuthError(validationError);
      return;
    }

    setIsLoading(true);
    try {
      // Clear any lingering session from a previous account
      await SupabaseServiceInstance.prepareNewAccountSession();

      if (mode === 'login') {
        const result = await SupabaseServiceInstance.signInExistingUser(email.trim(), password);
        if (!result.success) {
          setAuthError(result.friendlyMessage);
          return;
        }
      } else {
        // Sign up: use the OTP pipeline
        const otpResult = await SupabaseAuthServiceInstance.signUpOrResendOtp(email.trim(), password);
        if (otpResult.status === 'error' || otpResult.status === 'rate_limited') {
          setAuthError(otpResult.message);
          return;
        }
        // Persist the identity the user entered so a fresh account isn't left
        // without a username/handle after signup.
        if (username.trim().length >= 2) {
          useAppStore.getState().setProfile({ name: displayName, username }).catch(() => {});
        }
        if (otpResult.status === 'already_verified') {
          setAuthError('User with this email address already exists');
          return;
        }
        // Code sent — navigate to dedicated Check your email page (App.tsx owns routing)
        const cleanEmail = email.trim().toLowerCase();
        if (onOtpRequired) {
          onOtpRequired(cleanEmail);
        } else {
          // Fallback: treat as verified if no OTP screen wired
          setAuthError('Verification code sent — please check your email.');
        }
        return;
      }
      onLoginSuccess();
    } catch (e) {
      setAuthError(humanizeAuthError(e));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocial = async (provider: 'google' | 'apple') => {
    if (isLoading) return;
    hapticLight();
    setAuthError(null);
    setIsLoading(true);
    try {
      await SupabaseServiceInstance.prepareNewAccountSession();
      await SupabaseServiceInstance.signInWithSocial(provider);
      onLoginSuccess();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('cancelled')) {
        // User cancelled — no error to show
      } else {
        setAuthError(humanizeAuthError(e));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const inputBg = isDark ? colors.card : '#FFFFFF';
  const inputBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0';
  const focusedBorder = withAlpha(AppColors.primary, 0.38);
  const segmentedBg = isDark ? '#161E2E' : '#F1F5F9';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.canvas }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardAvoiding} keyboardVerticalOffset={0}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={[containerStyle]}>
            {/* Header Branding — Qubi 40x40 squircle perfectly centered */}
            <View style={styles.headerRow}>
              <View style={styles.headerSide}>
                <TouchableOpacity onPress={() => { hapticLight(); onBack(); }} style={[styles.backButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF', borderColor: inputBorder }]} activeOpacity={0.7}>
                  <ChevronLeft size={18} strokeWidth={2.2} color={colors.ink} />
                </TouchableOpacity>
              </View>
              <QubiAvatar size={44} glow accessibilityLabel="Qubi logo" />
              <View style={styles.headerSide} />
            </View>

            {/* Segmented — iOS 44h, animated pill */}
            <View style={[styles.segmented, { backgroundColor: segmentedBg, borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#E2E8F0' }]}>
              <TouchableOpacity onPress={() => handleSwitch('login')} activeOpacity={0.85} style={[styles.segment, mode === 'login' && { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', shadowColor: '#0F172A', shadowOpacity: isDark ? 0.18 : 0.08, shadowRadius: 12, shadowOffset: { width:0,height:3 }, elevation:3 }]}>
                <Text style={[styles.segmentText, { color: mode==='login' ? colors.ink : colors.muted }]}><Text>{'Log In'}</Text></Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleSwitch('signup')} activeOpacity={0.85} style={[styles.segment, mode === 'signup' && { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', shadowColor: '#0F172A', shadowOpacity: isDark ? 0.18 : 0.08, shadowRadius: 12, shadowOffset: { width:0,height:3 }, elevation:3 }]}>
                <Text style={[styles.segmentText, { color: mode==='signup' ? colors.ink : colors.muted }]}><Text>{'Sign Up'}</Text></Text>
              </TouchableOpacity>
            </View>

            <View style={styles.titleSection}>
              <Text style={[styles.title, { color: colors.ink }]}>
                <Text style={{ fontFamily: fontFamilyFor('w800') }}><Text>{mode === 'login' ? 'Welcome back' : 'Create account'}</Text></Text>
              </Text>
              <View style={{ height: 8 }} />
              <Text style={[styles.agreementText, { color: colors.muted }]}>
                <Text style={{ fontFamily: fontFamilyFor('w500') }}><Text>{mode === 'login' ? 'Log in to continue your quest.' : 'Start your journey in seconds.'}</Text></Text>
              </Text>
            </View>

            <View style={{ height: 28 }} />

            {/* Email — 52h, 16r, crisp 1.5 border */}
            <View style={[styles.inputCard, { backgroundColor: inputBg, borderColor: focused==='email' ? focusedBorder : inputBorder }]}>
              <View style={styles.inputRow}>
                <Mail size={18} strokeWidth={1.7} color={focused==='email' ? AppColors.primary : withAlpha(colors.muted, 0.9)} />
                <TextInput
                  style={[styles.input, { color: colors.ink }]}
                  placeholder="Email address"
                  placeholderTextColor={withAlpha(colors.muted, 0.65)}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  returnKeyType="next"
                  onFocus={() => setFocused('email')}
                  onBlur={() => setFocused(null)}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  editable={!isLoading}
                />
              </View>
            </View>

            <View style={{ height: 12 }} />

            {/* Password — 52h */}
            <View style={[styles.inputCard, { backgroundColor: inputBg, borderColor: focused==='pwd' ? focusedBorder : inputBorder }]}>
              <View style={styles.inputRow}>
                <Lock size={18} strokeWidth={1.7} color={focused==='pwd' ? AppColors.primary : withAlpha(colors.muted, 0.9)} />
                <TextInput
                  ref={passwordRef}
                  style={[styles.input, { color: colors.ink }]}
                  placeholder="Password"
                  placeholderTextColor={withAlpha(colors.muted, 0.65)}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="password"
                  autoCorrect={false}
                  returnKeyType={mode==='signup' ? 'next' : 'done'}
                  onFocus={() => setFocused('pwd')}
                  onBlur={() => setFocused(null)}
                  onSubmitEditing={() => mode==='signup' ? usernameRef.current?.focus() : handlePrimary()}
                  editable={!isLoading}
                />
                <TouchableOpacity onPress={() => { hapticLight(); setShowPassword(!showPassword); }} activeOpacity={0.6} hitSlop={{ top:6,bottom:6,left:6,right:6 }}>
                  <Text style={styles.passwordToggle}>
                    <Text style={{ color: colors.muted, fontFamily: fontFamilyFor('w600') }}><Text>{showPassword ? 'Hide' : 'Show'}</Text></Text>
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            {mode === 'login' ? (
              <View style={{ alignSelf:'flex-end', marginTop:10 }}>
                <TouchableOpacity onPress={() => hapticLight()} activeOpacity={0.7}>
                  <Text style={{ fontSize:13, color: colors.muted, fontFamily: fontFamilyFor('w600') }}><Text>{'Forgot password?'}</Text></Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Sign Up only fields — staggered */}
            {mode === 'signup' ? (
              <>
                <View style={{ height: 12 }} />
                <View style={[styles.inputCard, { backgroundColor: inputBg, borderColor: focused==='user' ? focusedBorder : inputBorder }]}>
                  <View style={styles.inputRow}>
                    <User size={18} strokeWidth={1.7} color={focused==='user' ? AppColors.primary : withAlpha(colors.muted, 0.9)} />
                    <TextInput
                      ref={usernameRef}
                      style={[styles.input, { color: colors.ink }]}
                      placeholder="Username"
                      placeholderTextColor={withAlpha(colors.muted, 0.65)}
                      value={username}
                      onChangeText={setUsername}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="next"
                      onFocus={() => setFocused('user')}
                      onBlur={() => setFocused(null)}
                      editable={!isLoading}
                    />
                  </View>
                </View>
                <View style={{ height: 12 }} />
                <View style={[styles.inputCard, { backgroundColor: inputBg, borderColor: focused==='display' ? focusedBorder : inputBorder }]}>
                  <View style={styles.inputRow}>
                    <Sparkles size={18} strokeWidth={1.7} color={focused==='display' ? AppColors.primary : withAlpha(colors.muted, 0.9)} />
                    <TextInput
                      style={[styles.input, { color: colors.ink }]}
                      placeholder="Display name"
                      placeholderTextColor={withAlpha(colors.muted, 0.65)}
                      value={displayName}
                      onChangeText={setDisplayName}
                      returnKeyType="done"
                      onFocus={() => setFocused('display')}
                      onBlur={() => setFocused(null)}
                      onSubmitEditing={handlePrimary}
                      editable={!isLoading}
                    />
                  </View>
                </View>
              </>
            ) : null}

            <View style={{ height: 24 }} />

            {/* Auth Error Banner */}
            {authError != null ? (
              <View style={[styles.errorBanner, { backgroundColor: '#FEE2E2', borderColor: '#FECACA' }]}>
                <Text style={{ fontSize: 13, color: '#991B1B', fontFamily: fontFamilyFor('w500') }}>
                  <Text>{authError}</Text>
                </Text>
              </View>
            ) : null}

            {authError != null ? <View style={{ height: 12 }} /> : null}

            {/* Primary CTA — Duolingo 3D spec: height 54, radius 16, #F97316, borderBottom 4 #C2410C, centered text */}
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
                  onPress={handlePrimary}
                  activeOpacity={0.85}
                  disabled={!canSubmit}
                  style={[styles.duoButtonFront, { backgroundColor: canSubmit ? AppColors.primary : '#9CA3AF', borderColor: canSubmit ? '#D45A07' : '#9CA3AF', opacity: canSubmit ? 1 : 0.9 }]}
                >
                  <Text style={styles.duoButtonText}>
                    <Text style={{ fontFamily: fontFamilyFor('w800'), color: '#FFFFFF' }}><Text>{mode==='login' ? 'Log in' : 'Create Account'}</Text></Text>
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={{ height: 20 }} />

            <View style={styles.dividerContainer}>
              <View style={[styles.dividerLine, { backgroundColor: inputBorder }]} />
              <Text style={styles.dividerText}>
                <Text style={{ color: withAlpha(colors.muted, 0.85), fontFamily: fontFamilyFor('w500'), fontSize: 12 }}><Text>{'Or continue with'}</Text></Text>
              </Text>
              <View style={[styles.dividerLine, { backgroundColor: inputBorder }]} />
            </View>

            {/* Social — Clean 50/50 per spec: row gap12 width100% marginTop16 marginBottom20, button flex1 height52 radius16 width1.5 #E2E8F0 */}
            <View style={styles.socialRow}>
              <TouchableOpacity onPress={() => handleSocial('google')} activeOpacity={0.8} style={[styles.socialButton, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: '#E2E8F0' }]}>
                <View style={styles.socialButtonInner}>
                  <GoogleIcon size={20} />
                  <Text style={styles.socialButtonText}>
                    <Text style={{ fontWeight: '600', color: isDark ? '#FFFFFF' : '#0F172A', fontFamily: fontFamilyFor('w600') }}><Text>{'Google'}</Text></Text>
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleSocial('apple')} activeOpacity={0.8} style={[styles.socialButton, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: '#E2E8F0' }]}>
                <View style={styles.socialButtonInner}>
                  <AppleIcon size={20} color={isDark ? '#FFFFFF' : '#0F172A'} />
                  <Text style={styles.socialButtonText}>
                    <Text style={{ fontWeight: '600', color: isDark ? '#FFFFFF' : '#0F172A', fontFamily: fontFamilyFor('w600') }}><Text>{'Apple'}</Text></Text>
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Demo — discreet 12px underline */}
            {onDemoMode ? (
              <View style={{ marginTop: 8, alignItems:'center' }}>
                <TouchableOpacity onPress={() => { hapticLight(); onDemoMode(); }} activeOpacity={0.7} hitSlop={{top:8,bottom:8,left:12,right:12}}>
                  <Text style={[styles.demoModeText, { color: withAlpha(colors.muted, 0.95) }]}>
                    <Text style={{ fontFamily: fontFamilyFor('w600'), textDecorationLine: 'underline' }}><Text>{'Explore in demo mode'}</Text></Text>
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={{ height: 22 }} />
            <Text style={styles.footerText}>
              <Text style={{ color: withAlpha(colors.muted, 0.75), fontFamily: fontFamilyFor('w500') }}><Text>{'By continuing you agree to our Terms & Privacy Policy.'}</Text></Text>
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function AppleIcon({ size = 18, color = '#0F172A' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 384 512">
      <Path fill={color} d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.7-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </Svg>
  );
}
function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <Path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
      <Path fill="#FBBC04" d="M11.69 28.18c-.5-1.48-.78-3.06-.78-4.68s.28-3.2.78-4.68v-5.7H4.34C2.86 14.55 2 19.07 2 23.5s.86 8.95 2.34 13.38l7.35-5.7z" />
      <Path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardAvoiding: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  headerSide: { flex: 1, alignItems: 'flex-start' },
  backButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  segmented: { flexDirection:'row', padding:4, borderRadius:999, borderWidth:1, marginBottom:20, gap:4, height:44 },
  segment: { flex:1, borderRadius:999, alignItems:'center', justifyContent:'center' },
  segmentText: { fontSize:13, fontFamily: fontFamilyFor('w700'), lineHeight:16, letterSpacing:0.1 },
  titleSection: { marginTop: 2 },
  title: { fontSize: 30, lineHeight: 34, letterSpacing: -0.9 },
  agreementText: { fontSize: 13, lineHeight: 18 },
  inputCard: { borderRadius: 16, paddingHorizontal: 16, height:52, justifyContent:'center', borderWidth: 1 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, fontSize: 15, lineHeight: 20, fontFamily: fontFamilyFor('w500'), paddingVertical: 0 },
  passwordToggle: { fontSize: 13, lineHeight: 18, paddingLeft: 8 },
  // Duolingo 3D — spec: height 54, radius 16, #F97316, borderBottom 4 #C2410C, centered text
  duoButtonContainer: { position: 'relative', height: 54 },
  duoButtonShadow: { position: 'absolute', top: 0, left: 0, right: 0, height: 54, borderRadius: 16, backgroundColor: '#C2410C' },
  duoButtonFront: { height: 50, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 0 },
  duoButtonText: { fontSize: 16, lineHeight: 20, textAlign: 'center' },
  dividerContainer: { flexDirection: 'row', alignItems: 'center', gap:12 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { paddingHorizontal: 4, fontSize: 12, lineHeight: 16 },
  // Social — spec clean container gap12 width100% marginTop16 marginBottom20, button flex1 height52 radius16 borderWidth1.5 #E2E8F0, inner row center gap10
  socialRow: { flexDirection: 'row', gap: 12, width: '100%', marginTop: 16, marginBottom: 20 },
  socialButton: { flex: 1, height: 52, borderRadius: 16, borderWidth: 1.5, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  socialButtonInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 8 },
  socialButtonText: { fontSize: 14, lineHeight: 18 },
  demoModeText: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
  footerText: { fontSize: 11, lineHeight: 16, textAlign: 'center', paddingHorizontal: 12 },
  errorBanner: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1 },
});
