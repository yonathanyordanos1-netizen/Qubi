import React, { useState, useEffect, useRef } from 'react';
import { View, Text } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { Splash } from './splash';
import { AppColors } from '../src/theme/colors';
import { useGateStore } from '../src/state/gateStore';
import { DuolingoGuide } from '../src/screens/onboarding/DuolingoGuide';
import { SixStepWizard } from '../src/screens/onboarding/SixStepWizard';
import { LoginScreen } from '../src/screens/auth/LoginScreen';
import { VerifyOtpScreen } from '../src/screens/auth/VerifyOtpScreen';
import { markOnboardingComplete } from '../src/state/appStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../src/theme/ThemeProvider';
import { supabase, SupabaseServiceInstance } from '../src/services/supabase';
import type { Session } from '@supabase/supabase-js';
// Expo-router redirects MUST be inside useEffect (Hermes-safe). When available:
// import { useRouter, useSegments } from 'expo-router';

/**
 * Qubi launch orchestrator — enforces strict 4-step sequence:
 * 1. Native & Animated Splash — Qubi Orange #F97316 + 3D mascot centered + ambient glow pulse
 * 2. 3-Step Interactive Guide — app/intro/index.tsx (Build Habits / Snap & Verify / Level Up)
 * 3. Onboarding — app/onboarding/index.tsx (preferences & goal configuration)
 * 4. Auth / Main Dashboard — gated by Supabase session / demo mode
 *
 * App.tsx (registerRootComponent) is the active entry for classic Expo;
 * this file mirrors the sequence for Expo Router / EAS builds.
 */
export default function Index() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [showSplash, setShowSplash] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const walkthroughDone = useGateStore((s) => s.walkthroughDone);
  const onboardingDone = useGateStore((s) => s.onboardingDone);
  const gateHydrated = useGateStore((s) => s.hydrated);
  const [pendingOtpEmail, setPendingOtpEmail] = useState<string | null>(null);
  const splashMinDone = useRef(false);
  const sessionDone = useRef(false);

  // HARDENING: router.replace() and setState only inside useEffect/handlers (Hermes-safe)
  // Every-launch sequence: mandatory 1.8s splash while getSession() resolves,
  // then session-based handoff (unauth → intro/auth, auth → tabs).
  useEffect(() => {
    void SplashScreen.preventAutoHideAsync().catch(() => {});
    let mounted = true;
    // SPEC §1 — hydrate local-storage gates (first-time vs returning user)
    void useGateStore.getState().hydrate().catch(() => {});
    const maybeFinish = () => {
      if (!mounted) return;
      if (splashMinDone.current && sessionDone.current) setIsLoading(false);
    };
    const t = setTimeout(() => {
      splashMinDone.current = true;
      maybeFinish();
    }, 1800);
    const init = async () => {
      try {
        await SupabaseServiceInstance.init();
        if (supabase != null) {
          const { data } = await supabase.auth.getSession();
          if (mounted) setSession(data.session ?? null);
        } else {
          if (mounted) setSession(SupabaseServiceInstance.session);
        }
      } catch {
        if (mounted) setSession(null);
      } finally {
        sessionDone.current = true;
        maybeFinish();
      }
    };
    void init();
    let unsub: (() => void) | null = null;
    if (supabase != null) {
      const { data } = supabase.auth.onAuthStateChange((_event, sess) => {
        if (mounted) setSession(sess);
      });
      unsub = () => data.subscription.unsubscribe();
    } else {
      unsub = SupabaseServiceInstance.onAuthState((_event, sess) => {
        if (mounted) setSession(sess);
      });
    }
    return () => {
      mounted = false;
      clearTimeout(t);
      if (unsub) unsub();
    };
  }, []);

  // Session-based navigation handoff — expo-router equivalent:
  // IF NO SESSION → router.replace('/intro'); IF VALID SESSION → router.replace('/(tabs)')
  // Here we gate rendering so tabs never flash for logged-out users.
  useEffect(() => {
    if (isLoading || showSplash) return;
    // Placeholder: when expo-router is wired, uncomment:
    // const router = useRouter();
    // if (session == null) router.replace('/intro');
    // else router.replace('/(tabs)');
  }, [isLoading, showSplash, session]);

  // STEP 1 — Mandatory every-launch splash (Duolingo-style, Qubi Orange #F97316 + full-bleed Qubi_2.jpg + 120 squircle + breathing pulse)
  // Spec: 1.8s display while resolving session, then seamless handoff.
  if (showSplash || isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: AppColors.primary }}>
        <Splash
          onFinish={() => setShowSplash(false)}
          minimumDuration={1800}
          maxWaitMs={2200}
          backgroundColor={AppColors.primary}
        />
      </View>
    );
  }

  // STEP 2 — 3-step Duolingo guide for first-time users (persisted via gateStore)
  if (!gateHydrated || !walkthroughDone) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <DuolingoGuide />
      </View>
    );
  }

  // STEP 3 — 6-step gamified onboarding (required before auth)
  if (walkthroughDone && !onboardingDone) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <SixStepWizard />
      </View>
    );
  }

  // STEP 4 — OTP verification for pending sign-ups
  if (session == null && pendingOtpEmail != null) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top }}>
        <VerifyOtpScreen
          email={pendingOtpEmail}
          onBack={() => setPendingOtpEmail(null)}
          onVerified={async () => {
            setPendingOtpEmail(null);
            await markOnboardingComplete();
          }}
        />
      </View>
    );
  }

  // STEP 5 — Sign Up / Login hub for unauthenticated returning users
  if (session == null) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top }}>
        <LoginScreen
          onBack={() => {}}
          onLoginSuccess={async () => {
            await markOnboardingComplete();
          }}
          onOtpRequired={(email) => setPendingOtpEmail(email)}
        />
      </View>
    );
  }

  // STEP 6 — Authenticated users go straight to the dashboard
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center', paddingTop: insets.top }}>
      <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '800' }}><Text>{'Qubi • Ready'}</Text></Text>
      <View style={{ height: 8 }} />
      <Text style={{ color: colors.muted, fontSize: 13 }}><Text>{'Session active → Dashboard'}</Text></Text>
    </View>
  );
}
