import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const WALKTHROUGH_KEY = 'Qubi.walkthroughDone';
const ONBOARDING_KEY = 'Qubi.onboardingDone';
const AUTH_SKIPPED_KEY = 'Qubi.authSkipped';

interface GateShape {
  /** 3-screen walkthrough finished → proceed to onboarding. */
  walkthroughDone: boolean;
  /** Profile onboarding (display name + @username) finished → proceed to auth. */
  onboardingDone: boolean;
  /** User chose "explore in demo mode" on the auth gate. */
  authSkipped: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  completeWalkthrough: () => void;
  completeOnboarding: () => void;
  skipAuth: () => void;
  /** Full reset — used by account deletion to return to the landing screen. */
  resetGates: () => void;
}

export const useGateStore = create<GateShape>((set) => ({
  walkthroughDone: false,
  onboardingDone: false,
  authSkipped: false,
  hydrated: false,

  async hydrate() {
    try {
      const [w, o, a] = await Promise.all([
        AsyncStorage.getItem(WALKTHROUGH_KEY),
        AsyncStorage.getItem(ONBOARDING_KEY),
        AsyncStorage.getItem(AUTH_SKIPPED_KEY),
      ]);
      const hasOnboarding = await AsyncStorage.getItem('hasCompletedOnboarding').catch(() => null);
      set({
        walkthroughDone: w === 'true',
        onboardingDone: o === 'true' || hasOnboarding === 'true',
        authSkipped: a === 'true',
        hydrated: true,
      });
    } catch {
      set({ hydrated: true });
    }
  },

  completeWalkthrough() {
    set({ walkthroughDone: true });
    void AsyncStorage.setItem(WALKTHROUGH_KEY, 'true').catch(() => {});
    // Spec requires hasCompletedOnboarding flag
    void AsyncStorage.setItem('hasCompletedOnboarding', 'true').catch(() => {});
    void AsyncStorage.setItem('Qubi.hasCompletedOnboarding', 'true').catch(() => {});
  },

  completeOnboarding() {
    set({ onboardingDone: true });
    void AsyncStorage.setItem(ONBOARDING_KEY, 'true').catch(() => {});
    void AsyncStorage.setItem('hasCompletedOnboarding', 'true').catch(() => {});
    void AsyncStorage.setItem('Qubi.hasCompletedOnboarding', 'true').catch(() => {});
  },

  skipAuth() {
    set({ authSkipped: true });
    void AsyncStorage.setItem(AUTH_SKIPPED_KEY, 'true').catch(() => {});
  },

  resetGates() {
    set({ walkthroughDone: false, onboardingDone: false, authSkipped: false });
    void AsyncStorage.multiRemove([WALKTHROUGH_KEY, ONBOARDING_KEY, AUTH_SKIPPED_KEY, 'hasCompletedOnboarding', 'Qubi.hasCompletedOnboarding']).catch(() => {});
  },
}));
