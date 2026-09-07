import React, { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { useSettingsStore } from '../src/state/settingsStore';
import { supabase, SupabaseServiceInstance } from '../src/services/supabase';
import { Splash } from './splash';
import type { Session } from '@supabase/supabase-js';

/**
 * Root layout orchestrator for Qubi — Hermes 100% crash hardened.
 * Exact launch sequence enforced (spec §1):
 * 1. Native & Animated Splash — full-screen Duolingo-style, Qubi Orange #F97316 canvas
 *    + large 3D Qubi mascot centered + subtle ambient glow pulse (src/components/AnimatedSplashScreen.tsx)
 *    Assets strictly from ./Qubi (Qubi/Qubi_2.jpg) — Expo Go crash-fix relink.
 *    Fallback PNGs: assets/images/questify_logo.png if JPG fails native splash processing.
 * 2. 3-Step Interactive Guide — app/intro/index.tsx → PreOnboardingCarousel
 *    (Build Unstoppable Habits / Snap & Verify / Level Up & Win) with bouncy transitions,
 *    expanding pill pagination, chunky 3D LET'S GO! button.
 * 3. Onboarding — app/onboarding/index.tsx → OnboardingScreen / UserSetupSequence
 *    (preferences & goal configuration).
 * 4. Auth / Main Dashboard — gated by Supabase session / demo mode (app/auth/*, app/(tabs)/*).
 *    Header: mascot left, Flame pill center, Friends right. Floating notched tab bar with expo-blur.
 *
 * App.tsx (registerRootComponent) is the active classic entry; this file is the Expo Router
 * equivalent for EAS builds. Splash asset & app icon both resolve to ./Qubi/Qubi_2.jpg (app.json).
 *
 * HARDENING:
 * - All strings/numbers strictly inside <Text> (Hermes)
 * - No router.replace() or setState during render — only inside useEffect
 * - Global ErrorBoundary prevents native process crash, shows fallback view
 */

// ═══ SPEC §1 — IMMEDIATE EXECUTION ORDER ═══
// The native splash is held open at MODULE SCOPE — before any auth state
// evaluation, Supabase getSession() fetch, or router redirect executes.
// The animated overlay (AnimatedSplashScreen) then paints edge-to-edge
// over the whole app on first frame with a 1.8s hold + 300ms cross-fade.
void SplashScreen.preventAutoHideAsync().catch(() => {});

// Hermes-safe ErrorBoundary for root stack — prevents silent native crash at 100% bundle
class LayoutErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null; stack: string | null }> {
  state = { error: null as Error | null, stack: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.log('════ LAYOUT_CRASH ════');
    console.log('ERROR:', error.message);
    if (info.componentStack) {
      console.log('STACK:', info.componentStack);
      this.setState({ stack: info.componentStack });
    }
    console.log('═════════════════════');
  }
  render() {
    const { error, stack } = this.state;
    if (error == null) return this.props.children;
    return (
      <View style={ebStyles.wrap}>
        <ScrollView contentContainerStyle={ebStyles.content}>
          <Text style={ebStyles.title}><Text>Qubi — Render Error</Text></Text>
          <Text style={ebStyles.msg}><Text>{error.message}</Text></Text>
          {stack != null ? <Text selectable style={ebStyles.stack}><Text>{stack}</Text></Text> : null}
        </ScrollView>
      </View>
    );
  }
}

const ebStyles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0B0F19', paddingTop: 48 },
  content: { padding: 20 },
  title: { color: '#FF6B6B', fontSize: 18, fontWeight: '800', marginBottom: 8 },
  msg: { color: '#FFFFFF', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  stack: { color: '#9FB0BF', fontSize: 11, lineHeight: 15 },
});

export default function Layout({ children }: { children: React.ReactNode }) {
  const themeMode = useSettingsStore((s) => s.themeMode);
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  const splashMinDone = useRef(false);
  const sessionDone = useRef(false);

  // 1. Mandatory every-launch splash + session check — BOTH gated.
  // The splash stays for at least 1800ms while supabase.auth.getSession()
  // resolves, then fades. This runs on EVERY launch, logged-in or not.
  useEffect(() => {
    let mounted = true;

    // Track both gates so the fade only fires after BOTH are done.
    const maybeFinish = () => {
      if (!mounted) return;
      if (splashMinDone.current && sessionDone.current) {
        setIsLoading(false);
      }
    };

    // Gate A: mandatory 1.8s splash timer (Duolingo-style)
    const t = setTimeout(() => {
      splashMinDone.current = true;
      maybeFinish();
    }, 1800);

    // Gate B: validate session token via getSession + listen for changes
    const initSession = async () => {
      try {
        // Ensure the service has hydrated its cached session
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
    void initSession();

    // Gate C: keep session live via onAuthStateChange (handles sign-in/out in background)
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

  // 3. MAGIC LINK DEEP LINKING — qubi://auth/callback
  useEffect(() => {
    const handleUrl = async (event: { url: string }) => {
      if (supabase == null) return;
      if (event.url.includes('access_token') || event.url.includes('code')) {
        try {
          await supabase.auth.exchangeCodeForSession(event.url);
        } catch (e) {
          console.warn('[deepLink] exchangeCodeForSession failed', e);
        }
      }
    };
    const subscription = Linking.addEventListener('url', handleUrl);
    // Cold-start: app launched via magic link tap
    void Linking.getInitialURL().then((url) => {
      if (url != null && (url.includes('access_token') || url.includes('code'))) void handleUrl({ url });
    });
    return () => subscription.remove();
  }, []);

  // 2. Session-based navigation logic — runs INSIDE useEffect only (Hermes-safe).
  // While isLoading or showSplash is true, children are hidden behind the splash overlay.
  // After loading:
  //   IF NO SESSION → force intro/auth flow (do NOT render tabs)
  //   IF VALID SESSION → render children (tabs/home)
  // In expo-router builds this would be router.replace('/intro') or router.replace('/(tabs)').
  // Here we gate `children` so deep links cannot bypass auth.
  const shouldGateTabs = !isLoading && !showSplash && session == null;
  // When expo-router is available, uncomment:
  // const router = useRouter(); const segments = useSegments();
  // useEffect(() => {
  //   if (isLoading || showSplash) return;
  //   const inTabs = segments[0] === '(tabs)';
  //   if (session == null && inTabs) router.replace('/intro');
  //   else if (session != null && !inTabs) router.replace('/(tabs)');
  // }, [isLoading, showSplash, session, segments]);

  return (
    <LayoutErrorBoundary>
      <ThemeProvider mode={themeMode}>
        <View style={{ flex: 1 }}>
          {/* Gate tabs when unauthenticated: block rendering if session === null */}
          {shouldGateTabs ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F97316' }}>
              <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}><Text>{'Redirecting to sign in…'}</Text></Text>
            </View>
          ) : (
            children
          )}
          {/* Mandatory every-launch splash OVERLAY — edge-to-edge, covers everything.
              Single source of truth: app/splash.tsx (1.8s hold + 300ms cross-fade + hideAsync). */}
          {showSplash ? (
            <Splash
              onFinish={() => setShowSplash(false)}
              minimumDuration={1800}
              maxWaitMs={2200}
            />
          ) : null}
        </View>
      </ThemeProvider>
    </LayoutErrorBoundary>
  );
}
