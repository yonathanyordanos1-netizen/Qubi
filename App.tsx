import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated as RNAnimated, Easing, LogBox, StyleSheet, Text, View, StatusBar as RNStatusBar } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';

import { CrossModal } from './src/components/CrossModal';
import { RootErrorBoundary } from './src/components/RootErrorBoundary';

import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import { useAppFonts } from './src/theme/useAppFonts';
import { AppColors } from './src/theme/colors';
import { FloatingNavBar } from './src/components/FloatingNavBar';
import { CustomTabBar } from './src/components/navigation/CustomTabBar';
import { SplashScreen as SplashOverlay } from './src/components/SplashScreen';
import { useAppStore, loadAppState, markOnboardingComplete } from './src/state/appStore';
import { useSettingsStore } from './src/state/settingsStore';
import { useGateStore } from './src/state/gateStore';
import { DuolingoGuide } from './src/screens/onboarding/DuolingoGuide';
import { SixStepWizard } from './src/screens/onboarding/SixStepWizard';
import { SupabaseServiceInstance, socialOAuthInFlight } from './src/services/supabase';
import { NavContext, type UiNav } from './src/screens/navContext';
import { HomePage } from './src/screens/HomePage';
import { TasksPage } from './src/screens/TasksPage';
import FriendsScreen from './src/screens/FriendsScreen';
import { RanksPage } from './src/screens/RanksPage';
import { ProfilePage } from './src/screens/ProfilePage';
import SettingsScreen from './src/screens/SettingsPage';
import QubiScreen from './src/screens/QubiScreen';
import PhotoProofSheet, { QuickVerify } from './src/screens/PhotoProofSheet';
import { LoginScreen } from './src/screens/auth/LoginScreen';
import { VerifyOtpScreen } from './src/screens/auth/VerifyOtpScreen';
import ProfileSetupScreen from './src/screens/ProfileSetupScreen';
import type { Habit } from './src/types/models';

// Keep the native (static) splash visible until our animated splash overlay
// signals it has faded out. Prevents the default white flash between launch
// and the mascot video. Guarded for Expo Go where it may already be prevented.
void SplashScreen.preventAutoHideAsync().catch(() => {});

// DEV DIAGNOSTIC: surface ANY unhandled JS error to the Metro terminal with a
// distinct marker so we can tell JS errors apart from native-only crashes.
LogBox.ignoreLogs(['[Reanimated]', 'expo-notifications']);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;
const origHandler = g.ErrorUtils?.getGlobalHandler?.();
if (g.ErrorUtils?.setGlobalHandler != null) {
  g.ErrorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    const msg = error instanceof Error ? (error.stack ?? error.message) : String(error);
    console.log('════ JS_ERROR ════' + (isFatal ? ' (FATAL)' : ''));
    console.log(msg);
    console.log('═════════════════');
    if (origHandler) origHandler(error, isFatal);
  });
}

export default function App() {
  const themeMode = useSettingsStore((s) => s.themeMode);
  const fontsLoaded = useAppFonts();
  if (!fontsLoaded) {
    return (
      <View style={[styles.flex, styles.center, { backgroundColor: '#F8F9FA' }]}>
        <StatusBar style="dark" />
      </View>
    );
  }
  return (
    <ThemeProvider mode={themeMode}>
      <SafeAreaProvider>
        <RootErrorBoundary>
          <Root />
        </RootErrorBoundary>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

function Root() {
  const { isDark, colors } = useTheme();
  const insets = useSafeAreaInsets();

  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const profileSetupPending = useAppStore((s) => s.profileSetupPending);
  // SPEC §1 — flow gates: persisted first-time-user flags from local storage
  const walkthroughDone = useGateStore((s) => s.walkthroughDone);
  const onboardingDone = useGateStore((s) => s.onboardingDone);
  const gateHydrated = useGateStore((s) => s.hydrated);

  const [booted, setBooted] = useState(false);
  // authTick forces Root to re-evaluate `signedIn` whenever Supabase session changes.
  // SupabaseServiceInstance caches _session; onAuthStateChange bumps this tick.
  const [authTick, setAuthTick] = useState(0);
  const [qubiOpen, setQubiOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [proofHabit, setProofHabit] = useState<Habit | null>(null);
  const [quickVerify, setQuickVerify] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastOpacity = useRef(new RNAnimated.Value(0)).current;

  // Persistent tab screens: each tab mounts on first visit and stays mounted so
  // scroll position / local state survive tab switches (no web-style remount).
  const [friendsOpen, setFriendsOpen] = useState(false);
  // Tab screens: 0 Home, 1 Tasks, 2 Camera(FAB placeholder), 3 Ranks, 4 Profile — Friends is standalone outside tab bar
  const tabScreens = [HomePage, TasksPage, View as any, RanksPage, ProfilePage] as const;
  const [visitedTabs, setVisitedTabs] = useState<boolean[]>([true, false, false, false, false]);
  const tabOpacity = [
    useRef(new RNAnimated.Value(1)).current,
    useRef(new RNAnimated.Value(0)).current,
    useRef(new RNAnimated.Value(0)).current,
    useRef(new RNAnimated.Value(0)).current,
    useRef(new RNAnimated.Value(0)).current,
  ];

  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev[activeTab]) return prev;
      const next = [...prev];
      next[activeTab] = true;
      return next;
    });
    tabOpacity.forEach((o, i) => {
      RNAnimated.timing(o, {
        toValue: i === activeTab ? 1 : 0,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Splash / Auth flow states
  const [showSplash, setShowSplash] = useState(true);
  const [pendingOtpEmail, setPendingOtpEmail] = useState<string | null>(null);

  // Configure alarm notifications (high-priority channels, handlers)
  useEffect(() => {
    // Calendar & Health permissions are requested lazily on first use
    // (calendarService / healthService) to avoid iOS permission fatigue at boot.
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await loadAppState();
      } catch (e) {
        console.warn('[boot] loadAppState failed', e);
      }
      try {
        await useSettingsStore.getState().hydrate();
      } catch {}
      try {
        // SPEC §1 — check local storage gates (first-time vs returning user)
        await useGateStore.getState().hydrate();
      } catch {}
      try {
        await useAppStore.getState().hydrateFromSupabase();
      } catch {}
      try {
        await useSettingsStore.getState().hydrateFromSupabase();
      } catch {}
      setBooted(true);
    })();
  }, []);

  // Hide the native Expo splash screen once the app has loaded,
  // so the custom inline splash (orange + Qubi logo) is the only visible splash.
  useEffect(() => {
    const timer = setTimeout(() => {
      void SplashScreen.hideAsync().catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Home Screen widgets: push an initial snapshot at every boot so freshly
  // added widgets never sit empty/stale, and copy the mascot into the App
  // Group as early as possible. No-ops in Expo Go.
  useEffect(() => {
    void import('./src/services/widgetSyncService')
      .then((m) => m.restoreWidgetSnapshot())
      .catch(() => {});
  }, []);

  // iOS Home Screen Quick Actions (long-press the app icon): register the two
  // shortcuts and route their taps into the right UI. No-op in Expo Go / Android.
  useEffect(() => {
    let unsub: (() => void) | null = null;
    void import('./src/services/quickActionsService').then((m) => {
      void m.registerQuickActions();
      unsub = m.subscribeQuickActions((id) => {
        if (id === 'snap_proof') {
          setProofHabit(null);
          setQuickVerify(true);
        } else if (id === 'view_stats') {
          setActiveTab(3); // Ranks tab
        }
      });
    }).catch(() => {});
    return () => { if (unsub != null) unsub(); };
  }, [setActiveTab]);

  // Dismiss the splash overlay after the slide-up exit animation finishes (2.5s).
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  // Magic Link Deep Linking — qubi://auth/callback (single-tap email links)
  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      if (event.url.includes('access_token') || event.url.includes('code')) {
        // Social OAuth (Google/Apple) owns its own code exchange in
        // signInWithSocial — skip here so the code isn't consumed twice.
        if (socialOAuthInFlight) return;
        try {
          const { supabase } = await import('./src/services/supabase');
          await supabase?.auth.exchangeCodeForSession(event.url);
        } catch (e) {
          console.warn('[deepLink] exchangeCodeForSession failed', e);
        }
      }
    };
    const sub = Linking.addEventListener('url', handleDeepLink);
    void Linking.getInitialURL().then((url) => {
      if (url != null && (url.includes('access_token') || url.includes('code'))) void handleDeepLink({ url });
    });
    return () => sub.remove();
  }, []);

  // Dynamic Auth State Listening — keeps Root in sync with SecureStore session.
  // Any signOut (global) or delete_user_account that clears the session will
  // bump authTick and force a re-render → login screen, with no back-button escape.
  useEffect(() => {
    const unsub = SupabaseServiceInstance.onAuthState(() => {
      // Re-hydrate on every session change so new identity fields (name/
      // username/avatar + the setup-pending flag) come from the live row. This
      // is what surfaces the identity gate right after a Google/Apple sign-in.
      void useAppStore.getState().hydrateFromSupabase().then(() => {
        setAuthTick((t) => t + 1);
      });
    });
    return unsub;
  }, []);

  // If session appears (e.g., magic-link deep link or OTP verified), dismiss pending OTP screen
  useEffect(() => {
    if (SupabaseServiceInstance.isSignedIn && pendingOtpEmail) setPendingOtpEmail(null);
  }, [authTick, pendingOtpEmail]);

  const toast = useCallback((msg: string) => {
    if (toastTimer.current != null) clearTimeout(toastTimer.current);
    requestAnimationFrame(() => {
      setToastMsg(msg);
      RNAnimated.timing(toastOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      toastTimer.current = setTimeout(() => {
        RNAnimated.timing(toastOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
          setToastMsg(null);
        });
      }, 2200);
    });
  }, [toastOpacity]);

  const nav = useMemo<UiNav>(
    () => ({
      openQubi: () => setQubiOpen(true),
      openSettings: () => setSettingsOpen(true),
      showProof: (habit: Habit) => {
        setQuickVerify(false);
        setProofHabit(habit);
      },
      toast,
      openFriends: () => setFriendsOpen(true),
    }),
    [toast],
  );

  let content: React.ReactNode;

  if (!booted || !gateHydrated) {
    content = (
      <View style={[styles.flex, styles.center, { backgroundColor: colors.canvas }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Text style={{ color: colors.muted }}><Text>Loading Qubi…</Text></Text>
      </View>
    );
  }

  // SPEC §1 — TARGET FLOW: Splash → 3-Step Guide → Profile Onboarding → Auth (signup/OTP) → Dashboard.
  // First-time users (walkthrough not done) land on the 3-step Duolingo guide,
  // then ProfileOnboarding (display name + @username) before auth. Persisted via
  // gateStore/AsyncStorage so returning users skip both straight to auth.
  if (!content && !walkthroughDone) {
    content = (
      <View style={[styles.flex, { backgroundColor: isDark ? AppColors.canvasDark : '#FFFFFF' }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <DuolingoGuide onDone={() => useGateStore.getState().completeWalkthrough()} />
      </View>
    );
  }

  if (!content && walkthroughDone && !onboardingDone) {
    content = (
      <View style={[styles.flex, { backgroundColor: isDark ? AppColors.canvasDark : '#FFFFFF' }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <SixStepWizard onOtpRequired={(email) => setPendingOtpEmail(email)} />
      </View>
    );
  }

  // Real app: login-first. Signed-out users always land on the Login screen
  // (after the splash). Signed-in users go straight to the dashboard.
  // authTick is bumped by onAuthStateChange so this re-evaluates on sign-out/delete.
  void authTick;
  const signedIn = SupabaseServiceInstance.isSignedIn;

  if (!content && !signedIn) {
    if (pendingOtpEmail) {
      content = (
        <View style={[styles.flex, { backgroundColor: colors.canvas }, topInset(insets.top)]}>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <VerifyOtpScreen
            email={pendingOtpEmail}
            onBack={() => setPendingOtpEmail(null)}
            onVerified={async () => {
              setPendingOtpEmail(null);
              await markOnboardingComplete();
              try {
                await useAppStore.getState().hydrateFromSupabase();
              } catch {}
              setAuthTick((t) => t + 1);
            }}
          />
        </View>
      );
    } else {
      content = (
        <View style={[styles.flex, { backgroundColor: colors.canvas }, topInset(insets.top)]}>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <LoginScreen
            onBack={() => {
              // No pre-login screens in the real app — nothing to go back to.
              setAuthTick((t) => t + 1);
            }}
            onLoginSuccess={async () => {
              await markOnboardingComplete();
              try {
                await useAppStore.getState().hydrateFromSupabase();
              } catch {}
              setAuthTick((t) => t + 1);
            }}
            onOtpRequired={(email) => setPendingOtpEmail(email)}
          />
        </View>
      );
    }
  }

  const closeProof = () => {
    setProofHabit(null);
    setQuickVerify(false);
  };

  // Identity gate: brand-new accounts (esp. Google/Apple) must pick a name +
  // @username once after auth before reaching the dashboard. Returns false once
  // saved (RPC clears profile_setup_done); skips on every re-sign-in.
  if (!content && signedIn && profileSetupPending) {
    content = (
      <View style={[styles.flex, { backgroundColor: colors.canvas }, topInset(insets.top)]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <ProfileSetupScreen
          onComplete={() => {
            useAppStore.getState().completeProfileSetup();
            setAuthTick((t) => t + 1);
          }}
        />
      </View>
    );
  }

  if (!content) {
    content = (
      <NavContext.Provider value={nav}>
        <View style={[styles.flex, { backgroundColor: colors.canvas }, topInset(insets.top)]}>
          <StatusBar style={isDark ? 'light' : 'dark'} />

          <View style={styles.flex}>
            {/* Tab order: Home | Tasks | Camera(FAB) | Ranks | Profile — Friends standalone */}
            {tabScreens.map((Screen, i) => {
              if (i===2) return null; // camera FAB placeholder, no screen
              return (
                <TabScreen key={i} opacity={tabOpacity[i]} active={activeTab === i}>
                  {visitedTabs[i] ? <Screen /> : null}
                </TabScreen>
              );
            })}
          </View>

          {toastMsg != null ? (
            <RNAnimated.View
              style={[styles.toastWrap, { opacity: toastOpacity }]}
              pointerEvents="none"
            >
              <View
                style={[
                  styles.toastPill,
                  {
                    backgroundColor: isDark ? AppColors.glassDark : AppColors.glassLight,
                    borderColor: AppColors.glassEdge,
                  },
                ]}
              >
                <Text style={[styles.toastText, { color: colors.ink }]}>{toastMsg}</Text>
              </View>
            </RNAnimated.View>
          ) : null}

          <CustomTabBar
            currentIndex={activeTab}
            onSelect={(i) => {
              if (i===2) return; // center is camera FAB, handled via onCameraPress
              if (i >= 0 && i < 5) setActiveTab(i);
            }}
            onCameraPress={() => {
              setProofHabit(null);
              setQuickVerify(true);
            }}
          />
          <CrossModal visible={friendsOpen} animationType="slide" onRequestClose={()=> setFriendsOpen(false)}>
            <View style={[styles.flex, { backgroundColor: colors.canvas }, topInset(insets.top)]}>
              <FriendsScreen onBack={()=> setFriendsOpen(false)} />
            </View>
          </CrossModal>

          <CrossModal visible={qubiOpen} animationType="slide" onRequestClose={() => setQubiOpen(false)}>
            <View style={[styles.flex, { backgroundColor: colors.canvas }, topInset(insets.top)]}>
              <QubiScreen onClose={() => setQubiOpen(false)} />
            </View>
          </CrossModal>

          <CrossModal visible={settingsOpen} animationType="slide" onRequestClose={() => setSettingsOpen(false)}>
            <View style={[styles.flex, { backgroundColor: colors.canvas }, topInset(insets.top)]}>
              <SettingsScreen onClose={() => setSettingsOpen(false)} />
            </View>
          </CrossModal>

          {proofHabit != null ? (
            <CrossModal visible transparent animationType="slide" onRequestClose={closeProof}>
              <PhotoProofSheet habit={proofHabit} onClose={closeProof} />
            </CrossModal>
          ) : null}

          {/* QuickVerify owns its own modal — never nest it inside another one. */}
          {quickVerify ? <QuickVerify onClose={closeProof} /> : null}
        </View>
      </NavContext.Provider>
    );
  }

  return (
    <View style={styles.flex}>
      {content}
      {showSplash ? (
        <View style={[styles.splashOverlay, StyleSheet.absoluteFill]}>
          {/* Translucent while the splash is up so it draws behind the status
              bar edge-to-edge, then the normal app status bar takes over. */}
          <RNStatusBar translucent backgroundColor="transparent" barStyle="light-content" />
          <SplashOverlay />
        </View>
      ) : null}
    </View>
  );
}

/** Real notch/Dynamic Island/status-bar inset from react-native-safe-area-context. */
const topInset = (top: number) => ({ paddingTop: top + 4 }) as const;

/**
 * Persistent tab screen wrapper. Stays mounted (preserving scroll + local
 * state) and crossfades between tabs with a native-feel opacity transition.
 */
function TabScreen({
  opacity,
  active,
  children,
}: {
  opacity: RNAnimated.Value;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <RNAnimated.View
      style={[StyleSheet.absoluteFill, { opacity }]}
      pointerEvents={active ? 'auto' : 'none'}
    >
      {children}
    </RNAnimated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  splashOverlay: {
    zIndex: 999,
  },
  toastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 128,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  toastPill: {
    maxWidth: '100%',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  toastText: { fontSize: 13.5, fontWeight: '600', lineHeight: 19 },
});