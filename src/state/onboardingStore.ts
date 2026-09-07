import { create } from 'zustand';

type DailyGoal = 5 | 10 | 15 | 20 | null;
type Motivation = 'consistency' | 'skills' | 'friends' | null;

interface OnboardingShape {
  dailyGoal: DailyGoal;
  motivation: Motivation;
  displayName: string;
  username: string;
  email: string;
  setDailyGoal: (v: DailyGoal) => void;
  setMotivation: (v: Motivation) => void;
  setDisplayName: (v: string) => void;
  setUsername: (v: string) => void;
  setEmail: (v: string) => void;
  setOnboardingData: (d: Partial<Pick<OnboardingShape, 'dailyGoal' | 'motivation' | 'displayName' | 'username' | 'email'>>) => void;
  clear: () => void;
}

export const useOnboardingStore = create<OnboardingShape>((set) => ({
  dailyGoal: null,
  motivation: null,
  displayName: '',
  username: '',
  email: '',
  setDailyGoal: (dailyGoal) => set({ dailyGoal }),
  setMotivation: (motivation) => set({ motivation }),
  setDisplayName: (displayName) => set({ displayName }),
  setUsername: (username) => set({ username: username.trim().toLowerCase() }),
  setEmail: (email) => set({ email: email.trim().toLowerCase() }),
  setOnboardingData: (d) => set((s) => ({
    dailyGoal: d.dailyGoal !== undefined ? d.dailyGoal : s.dailyGoal,
    motivation: d.motivation !== undefined ? d.motivation : s.motivation,
    displayName: d.displayName !== undefined ? d.displayName : s.displayName,
    username: d.username !== undefined ? d.username.trim().toLowerCase() : s.username,
    email: d.email !== undefined ? d.email.trim().toLowerCase() : s.email,
  })),
  clear: () => set({ dailyGoal: null, motivation: null, displayName: '', username: '', email: '' }),
}));
