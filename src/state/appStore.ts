import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ChatMessage, Habit, LeagueEntry, QuestStatus, habitToJson, habitFromJson } from '../types/models';
import { SupabaseServiceInstance } from '../services/supabase';
import { rankLabel, tierForXp } from '../services/rankService';
import { fetchLatestUpdate, UpdateInfo } from '../services/updateService';
import { applyHabitReminders, cancelAllNotifications } from '../services/notificationService';

/**
 * Global app state: auth profile, onboarding responses, quest matrix,
 * XP/streak, Qubi chat, custom habits, league roster and photo-proof ledger.
 * Ported from app_provider.dart onto Zustand.
 *
 * Local state is the fast source of truth for the UI; when Supabase is
 * configured and the user is signed in every mutation is mirrored to the
 * database through SupabaseService, which is itself locked down by RLS.
 */

const STORAGE_KEY = 'Qubi_state_v3';
const ONBOARDING_KEY = 'Qubi_onboarding_complete';

export interface PlannedHabit {
  title: string;
  category: string;
  timeOfDay: string;
  frequencyDays: number[];
}

export function plannedHabitFromArgs(args: Record<string, unknown>): PlannedHabit {
  return {
    title: (args['title'] as string) ?? 'New Quest',
    category: (args['category'] as string) ?? 'Wellness',
    timeOfDay: (args['time_of_day'] as string) ?? '8:00 AM',
    frequencyDays: (((args['frequency_days'] as unknown[]) ?? []) as number[]).map((d) => Math.trunc(d)),
  };
}

export const AVATAR_PALETTES: Record<string, [string, string]> = {
  sun: ['#0B0B0B', '#0B0B0B'],
  ocean: ['#378ADD', '#378ADD'],
  grape: ['#185FA5', '#185FA5'],
  forest: ['#6B6B6B', '#6B6B6B'],
  ember: ['#042C53', '#042C53'],
  sky: ['#7FB3E8', '#7FB3E8'],
};

export function avatarColors(key: string): [string, string] {
  return AVATAR_PALETTES[key] ?? AVATAR_PALETTES.sun;
}

export const CORE_HABITS: readonly Habit[] = [
  { id: 'hydrate', name: 'Hydrate', icon: 'droplet', time: '7:00 AM', category: 'Wellness', emoji: '\u{1F4A7}' },
  { id: 'gym', name: 'Gym Session', icon: 'dumbbell', time: '7:30 AM', category: 'Fitness', emoji: '\u{1F3CB}\uFE0F' },
  { id: 'reading', name: 'Read 20 min', icon: 'book', time: '9:00 PM', category: 'Learning', emoji: '\u{1F4DA}' },
  { id: 'cleanroom', name: 'Clean Room', icon: 'homeOutlined', time: '6:00 PM', category: 'Chores', emoji: '\u{1F9F9}' },
];

export const WEEK_DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * Demo camera-verification quest — always available so the photo-proof flow
 * can be tested immediately on a fresh install. Surfaced as the featured card
 * at the top of HomePage, bound to the first pending quest of the day.
 */
export const DEMO_QUEST = {
  id: 'demo-camera-quest-1',
  title: '📸 Snap Your Healthy Breakfast / Hydration',
  description: 'Take a quick photo proof to verify your morning routine and earn +50 XP!',
  xp: 50,
} as const;

/** habitId → [7 statuses, Mon..Sun] */
type WeekMatrix = Record<string, QuestStatus[]>;
/** habitId → dayIndex → proof storage path */
type ProofMap = Record<string, Record<number, string>>;

export interface BadgeInfo {
  name: string;
  emoji: string;
  earned: boolean;
  hint: string;
}

export interface SetupProfileData {
  /** Age in years, when the user shared it. */
  age?: number | null;
  /** Focus area ids chosen during setup (fitness, mindset, …). */
  focusAreas?: string[];
  /** Daily pace id (casual, adventurer, hero, legend). */
  dailyPace?: string;
  /** Number of quests per day implied by the pace. */
  targetQuestCount?: number;
  /** Baseline self-rank id (novice, builder, master). */
  baselineRank?: string;
  /** Proof method ids enabled during setup. */
  proofMethods?: string[];
  /** Daily briefing time, HH:mm. */
  briefingTime?: string | null;
}

export interface AppShape {
  // ── Profile & Account ────────────────────────────────────────────────────
  displayName: string;
  username: string;
  email: string;
  avatar: string;
  password: string;
  onboardingDone: boolean;
  accountCreated: boolean;
  responses: Record<string, string>;
  memberSince: string | null;
  /** True until the user has picked a name + username after a fresh sign-in. */
  profileSetupPending: boolean;
  /** Last time the display name was changed (ISO or null). */
  nameChangedAt: string | null;
  /** Last time the username was changed (ISO or null). */
  usernameChangedAt: string | null;

  // ── Stats ────────────────────────────────────────────────────────────────
  xp: number;
  streak: number;
  lastStreakDate: string | null;
  /** Static readiness score shown on the home gauge. */
  readonly readiness: number;
  /** Static league position shown on the home card. */
  readonly position: number;

  // ── Navigation ───────────────────────────────────────────────────────────
  activeTab: number;

  // ── Habits / matrix / proofs / chat ──────────────────────────────────────
  customHabits: Habit[];
  customCounter: number;
  weekMatrix: WeekMatrix;
  proofs: ProofMap;
  chat: ChatMessage[];

  // ── Setup profile (collected across onboarding) ─────────────────────────
  age: number | null;
  focusAreas: string[];
  dailyPace: string | null;
  targetQuestCount: number;
  baselineRank: string | null;
  proofMethods: string[];
  briefingTime: string | null;

  // ── Update check ─────────────────────────────────────────────────────────
  updateInfo: UpdateInfo | null;
  updateCheckDone: boolean;

  // ── Actions ──────────────────────────────────────────────────────────────
  hydrateFromSupabase: () => Promise<void>;
  /** Re-reads xp/streak/level from the live Supabase profile row. */
  refreshProfileStats: () => Promise<void>;
  setProfile: (opts: { name: string; username: string }) => Promise<string | null>;
  applyGoogleAuth: (opts: { name: string; email: string }) => void;
  setAvatar: (avatar: string) => void;
  /** Clears the identity-setup gate after the user confirms name/username. */
  completeProfileSetup: () => void;
  createAccount: (opts: {
    name: string;
    username: string;
    email?: string;
    avatar?: string;
    password?: string;
  }) => void;
  logIn: (opts: { handle: string; password: string }) => string | null;
  saveResponse: (key: string, value: string) => void;
  finishOnboarding: () => void;
  resetOnboardingForReplay: () => void;
  signOut: () => Promise<void>;
  checkForUpdate: () => Promise<void>;
  setActiveTab: (index: number) => void;
  addHabit: (opts: {
    name: string;
    category: string;
    time: string;
    emoji?: string;
    icon?: string;
  }) => Promise<void>;
  removeHabit: (habitId: string) => Promise<void>;
  /** Applies a generated routine; resolves with the number of quests added. */
  applyAiPlan: (plan: PlannedHabit[]) => Promise<number>;
  verifyHabit: (
    habitId: string,
    proofPath?: string,
    xpAmount?: number,
    difficulty?: string,
    taskName?: string,
  ) => Promise<void>;
  addUserMessage: (text: string) => void;
  clearChats: () => void;
  addAssistantMessage: (text: string, toolName?: string) => void;
  applyQubiSchedule: () => void;
  /** Persists the onboarding setup profile collected on the pledge screen. */
  applySetupProfile: (profile: SetupProfileData) => void;
}

// ── Helpers shared between actions ─────────────────────────────────────────

const allHabitsOf = (s: Pick<AppShape, 'customHabits'> & { isSignedInHint?: boolean }): Habit[] =>
  isSignedInNow() ? [...s.customHabits] : [...CORE_HABITS, ...s.customHabits];

const isSignedInNow = (): boolean => SupabaseServiceInstance.isSignedIn;

function parseDay(value: unknown): number | null {
  const s = typeof value === 'string' ? value : value != null ? String(value) : null;
  if (s == null || s.length < 10) return null;
  // Dart's DateTime.tryParse treats date-only strings as local midnight;
  // JS `new Date('YYYY-MM-DD')` is UTC, which would shift the weekday.
  const parts = s.substring(0, 10).split('-');
  const year = Number.parseInt(parts[0], 10);
  const month = Number.parseInt(parts[1], 10);
  const day = Number.parseInt(parts[2], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const d = new Date(year, month - 1, day);
  if (Number.isNaN(d.getTime())) return null;
  // JS getDay(): 0=Sun..6=Sat → convert to Mon-based index like Dart's weekday-1.
  return (d.getDay() + 6) % 7;
}

function todayIndexNow(): number {
  const now = new Date();
  return (now.getDay() + 6) % 7;
}

function seedDemoMatrix(habits: Habit[]): WeekMatrix {
  const matrix: WeekMatrix = {};
  for (const h of habits) matrix[h.id] = Array(7).fill(QuestStatus.pending);
  // Demo data so charts are alive before the first verify. Only days before
  // today get verified so today's quests stay actionable.
  const verified: Record<number, string[]> = {
    0: ['gym', 'reading'],
    1: ['hydrate', 'gym'],
    2: ['gym', 'reading', 'cleanroom'],
    3: ['hydrate', 'gym'],
    4: ['gym', 'reading', 'hydrate', 'cleanroom'],
    5: ['reading', 'cleanroom'],
    6: ['gym'],
  };
  const today = todayIndexNow();
  for (const [dayStr, ids] of Object.entries(verified)) {
    const day = Number(dayStr);
    if (day >= today) continue;
    for (const id of ids) {
      if (matrix[id]) matrix[id][day] = QuestStatus.verified;
    }
  }
  return matrix;
}

function demoChat(username: string): ChatMessage[] {
  return [
    {
      fromUser: false,
      text:
        `Hey ${username} — I\u2019ve locked your streak plan. ` +
        'Snap your first photo proof and I will bank +50 XP for you!',
    },
  ];
}

function scheduleHabitReminders(state: AppShape): void {
  applyHabitReminders({ habits: allHabitsOf(state) }).catch(() => {});
}

// ── Persistence (debounced, mirrors the Dart _schedulePersist) ─────────────

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function serialize(s: AppShape): string {
  return JSON.stringify({
    onboarding_done: s.onboardingDone,
    account_created: s.accountCreated,
    display_name: s.displayName,
    username: s.username,
    email: s.email,
    avatar: s.avatar,
    password: s.password,
    xp: s.xp,
    streak: s.streak,
    last_streak_date: s.lastStreakDate,
    member_since: s.memberSince,
    responses: s.responses,
    profile_setup_pending: s.profileSetupPending,
    name_changed_at: s.nameChangedAt,
    username_changed_at: s.usernameChangedAt,
    custom_habits: s.customHabits.map(habitToJson),
    week_matrix: Object.fromEntries(
      Object.entries(s.weekMatrix).map(([k, v]) => [k, v.map((st) => st.valueOf())]),
    ),
    proofs: s.proofs,
    chat: s.chat.map((m) => ({ fromUser: m.fromUser, text: m.text })),
    age: s.age,
    focus_areas: s.focusAreas,
    daily_pace: s.dailyPace,
    target_quests: s.targetQuestCount,
    baseline_rank: s.baselineRank,
    proof_methods: s.proofMethods,
    briefing_time: s.briefingTime,
  });
}

function applyPersisted(json: Record<string, unknown>, base: AppShape): Partial<AppShape> {
  const patch: Partial<AppShape> = {};
  patch.onboardingDone = boolOr(json['onboarding_done'], base.onboardingDone);
  patch.accountCreated = boolOr(json['account_created'], base.accountCreated);
  patch.displayName = strOr(json['display_name'], base.displayName);
  patch.username = strOr(json['username'], base.username);
  patch.email = strOr(json['email'], base.email);
  patch.avatar = strOr(json['avatar'], base.avatar);
  patch.password = strOr(json['password'], base.password);
  patch.xp = numOr(json['xp'], base.xp);
  patch.streak = numOr(json['streak'], base.streak);
  patch.lastStreakDate = strOrNull(json['last_streak_date']);
  patch.memberSince = strOrNull(json['member_since']);
  patch.profileSetupPending = boolOr(json['profile_setup_pending'], base.profileSetupPending);
  patch.nameChangedAt = strOrNull(json['name_changed_at']);
  patch.usernameChangedAt = strOrNull(json['username_changed_at']);
  if (isRecord(json['responses'])) {
    const responses: Record<string, string> = {};
    for (const [k, v] of Object.entries(json['responses'])) {
      if (typeof v === 'string') responses[k] = v;
    }
    patch.responses = responses;
  }
  if (Array.isArray(json['custom_habits'])) {
    const habits = (json['custom_habits'] as Record<string, unknown>[]).map(habitFromJson);
    patch.customHabits = habits;
    let counter = 0;
    for (const h of habits) {
      const n = Number.parseInt(h.id.replace('custom_', ''), 10);
      if (!Number.isNaN(n)) counter = Math.max(counter, n + 1);
    }
    patch.customCounter = counter;
  }
  if (isRecord(json['week_matrix'])) {
    const restored: WeekMatrix = {};
    for (const [id, list] of Object.entries(json['week_matrix'])) {
      if (!Array.isArray(list)) continue;
      restored[id] = list.map((s) => {
        const parsed = (Object.values(QuestStatus) as string[]).includes(String(s))
          ? (String(s) as QuestStatus)
          : QuestStatus.pending;
        return parsed;
      });
    }
    const habits = [
      ...(isSignedInNow() ? [] : CORE_HABITS),
      ...(patch.customHabits ?? base.customHabits),
    ];
    for (const h of habits) {
      if (!restored[h.id]) restored[h.id] = Array(7).fill(QuestStatus.pending);
    }
    patch.weekMatrix = restored;
  }
  if (isRecord(json['proofs'])) {
    const proofs: ProofMap = {};
    for (const [id, days] of Object.entries(json['proofs'])) {
      if (!isRecord(days)) continue;
      const inner: Record<number, string> = {};
      for (const [day, path] of Object.entries(days)) {
        inner[Number.parseInt(day, 10)] = String(path);
      }
      proofs[id] = inner;
    }
    patch.proofs = proofs;
  }
  if (Array.isArray(json['chat'])) {
    patch.chat = (json['chat'] as Record<string, unknown>[]).map((m) => ({
      fromUser: m['fromUser'] === true,
      text: String(m['text'] ?? ''),
    }));
  }
  // ── Setup profile ──
  const age = json['age'];
  if (typeof age === 'number' && Number.isFinite(age)) patch.age = Math.trunc(age);
  if (Array.isArray(json['focus_areas'])) {
    patch.focusAreas = (json['focus_areas'] as unknown[]).filter((v): v is string => typeof v === 'string');
  }
  if (typeof json['daily_pace'] === 'string') patch.dailyPace = json['daily_pace'];
  const targets = json['target_quests'];
  if (typeof targets === 'number' && Number.isFinite(targets)) patch.targetQuestCount = Math.max(1, Math.trunc(targets));
  if (typeof json['baseline_rank'] === 'string') patch.baselineRank = json['baseline_rank'];
  if (Array.isArray(json['proof_methods'])) {
    patch.proofMethods = (json['proof_methods'] as unknown[]).filter((v): v is string => typeof v === 'string');
  }
  if (typeof json['briefing_time'] === 'string') patch.briefingTime = json['briefing_time'];
  return patch;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v != null && !Array.isArray(v);
const boolOr = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const strOr = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
/** Like strOr but treats blank/whitespace-only strings as missing — local wins. */
const nonBlankOr = (v: unknown, d: string) =>
  typeof v === 'string' && v.trim().length > 0 ? v : d;
const numOr = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const strOrNull = (v: unknown) => (typeof v === 'string' ? v : null);

let loaded = false;

function touchPersist(getState: () => AppShape): void {
  if (!loaded) return;
  if (persistTimer != null) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void AsyncStorage.setItem(STORAGE_KEY, serialize(getState())).catch(() => {});
  }, 300);
}

// ── Store ───────────────────────────────────────────────────────────────────

export const useAppStore = create<
  AppShape,
  [['zustand/subscribeWithSelector', never]]
>(
  subscribeWithSelector((set, get) => ({
    displayName: '',
    username: '',
    email: '',
    avatar: 'sun',
    password: '',
    onboardingDone: false,
    accountCreated: false,
    responses: {},
    memberSince: null,
    profileSetupPending: false,
    nameChangedAt: null,
    usernameChangedAt: null,

    xp: 0,
    streak: 0,
    lastStreakDate: null,

    activeTab: 0,

    readiness: 87,
    position: 3,

    customHabits: [],
    customCounter: 0,
    weekMatrix: seedDemoMatrix([...CORE_HABITS]),
    proofs: {},
    chat: demoChat('adventurer'),

    age: null,
    focusAreas: [],
    dailyPace: null,
    targetQuestCount: 3,
    baselineRank: null,
    proofMethods: ['photo'],
    briefingTime: null,

    updateInfo: null,
    updateCheckDone: false,

    async hydrateFromSupabase() {
      await SupabaseServiceInstance.init();
      if (!SupabaseServiceInstance.isSignedIn) return;
      try {
        const svc = SupabaseServiceInstance;
        const profile = await svc.fetchProfile();
        const patch: Partial<AppShape> = {};
        if (profile != null) {
          // Identity fields: never accept a blank row value over local state —
          // otherwise a sign-out wipe + re-hydrate permanently erases the name.
          patch.displayName = nonBlankOr(profile['display_name'], get().displayName);
          patch.username = nonBlankOr(profile['username'], get().username);
          patch.email = strOr(profile['email'], get().email);
          patch.avatar = strOr(profile['avatar'], get().avatar);
          patch.xp = numOr(profile['xp'], get().xp);
          patch.streak = numOr(profile['streak'], get().streak);
          const last = profile['last_streak_date'];
          patch.lastStreakDate = typeof last === 'string' ? last : get().lastStreakDate;
          const member = profile['member_since'];
          patch.memberSince = typeof member === 'string' ? member : get().memberSince;
          // Returning users who completed onboarding elsewhere skip the wizard.
          if (profile['onboarding_done'] === true) {
            patch.onboardingDone = true;
            patch.accountCreated = true;
          }
          if (isRecord(profile['responses'])) {
            const responses: Record<string, string> = { ...get().responses };
            for (const [key, value] of Object.entries(profile['responses'])) {
              if (typeof value === 'string') responses[key] = value;
            }
            patch.responses = responses;
          }
          // New social (Google/Apple) accounts land without a username — the
          // app must show the one-time identity setup until they pick one.
          patch.profileSetupPending = profile['profile_setup_done'] !== true;
          const nameAt = profile['name_changed_at'];
          patch.nameChangedAt = typeof nameAt === 'string' ? nameAt : get().nameChangedAt;
          const usernameAt = profile['username_changed_at'];
          patch.usernameChangedAt = typeof usernameAt === 'string' ? usernameAt : get().usernameChangedAt;
        }
        // Clear demo/seeded data before loading real Supabase data so the
        // matrix and chat only reflect what the user actually owns.
        const matrix: WeekMatrix = {};
        const chat: ChatMessage[] = [];
        const habits = await svc.fetchHabits();
        let customHabits = get().customHabits;
        if (habits.length > 0) {
          customHabits = habits.map((h) => ({
            id: h['id'] as string,
            name: (h['title'] as string) ?? 'Habit',
            icon: (h['icon'] as string) ?? 'check',
            time: (h['time_of_day'] as string) ?? '8:00 AM',
            category: (h['category'] as string) ?? 'Wellness',
            emoji: (h['emoji'] as string) ?? '\u2705',
          }));
          for (const h of customHabits) {
            matrix[h.id] ??= Array(7).fill(QuestStatus.pending);
          }
        }
        patch.customHabits = customHabits;
        const completions = await svc.fetchCompletions();
        const proofs: ProofMap = { ...get().proofs };
        for (const row of completions) {
          const habitId = row['habit_id'];
          if (typeof habitId !== 'string') continue;
          const day = parseDay(row['completed_on']);
          if (day == null) continue;
          const statusRaw = row['status'];
          const status = (Object.values(QuestStatus) as string[]).includes(String(statusRaw))
            ? (String(statusRaw) as QuestStatus)
            : null;
          if (status != null) {
            matrix[habitId] ??= Array(7).fill(QuestStatus.pending);
            matrix[habitId][day] = status;
          }
          const proof = row['proof_url'];
          if (typeof proof === 'string' && proof.length > 0) {
            proofs[habitId] ??= {};
            proofs[habitId][day] = proof;
          }
        }
        patch.weekMatrix = matrix;
        patch.proofs = proofs;
        const chats = await svc.fetchChats();
        if (chats.length > 0) {
          chat.push(
            ...chats.map((c) => ({
              fromUser: c['role'] === 'user',
              text: (c['content'] as string) ?? '',
            })),
          );
        }
        patch.chat = chat;
        set(patch);
        pushStatsToWidget(get());
        scheduleHabitReminders(get());
        // Presence + push token registration for signed-in users.
        void SupabaseServiceInstance.touchPresence();
        void import('../services/notificationService').then((m) => m.registerPushToken()).catch(() => {});
      } catch {
        // Offline or transient — local state stays authoritative.
      }
    },

    async refreshProfileStats() {
      if (!SupabaseServiceInstance.isSignedIn) return;
      try {
        const profile = await SupabaseServiceInstance.fetchProfile();
        if (profile == null) return;
        const patch: Partial<AppShape> = {};
        const xp = profile['xp'];
        const streak = profile['streak'];
        if (typeof xp === 'number' && Number.isFinite(xp)) patch.xp = Math.max(0, Math.floor(xp));
        if (typeof streak === 'number' && Number.isFinite(streak)) patch.streak = Math.max(0, Math.floor(streak));
        const last = profile['last_streak_date'];
        if (typeof last === 'string') patch.lastStreakDate = last;
        if (Object.keys(patch).length > 0) {
          set(patch);
          pushStatsToWidget(get());
        }
      } catch {
        // Offline — optimistic local stats remain authoritative.
      }
    },

    async setProfile({ name, username }) {
      const newName = name.trim();
      const newUsername = username.trim().toLowerCase();
      if (newUsername.length === 0) return 'Username can\u2019t be empty.';
      if (newUsername.length < 3) return 'Username must be at least 3 characters.';
      if (newUsername.length > 16) return 'Username must be 16 characters or fewer.';
      if (!/^[a-z0-9_]+$/.test(newUsername)) return 'Use only letters, numbers and underscores.';

      // Signed-in → enforce uniqueness + cooldowns server-side through the RPC.
      if (SupabaseServiceInstance.isSignedIn && SupabaseServiceInstance.isConfigured) {
        const result = await SupabaseServiceInstance.updateProfileIdentity({
          name: newName,
          username: newUsername,
          avatar: get().avatar,
        });
        if (!result.ok) return result.error ?? 'Could not save your profile.';
        const s = get();
        const nameChanged = newName !== s.displayName;
        const usernameChanged = newUsername !== s.username;
        set({
          displayName: newName,
          username: newUsername,
          profileSetupPending: false,
          nameChangedAt: nameChanged ? new Date().toISOString() : s.nameChangedAt,
          usernameChangedAt: usernameChanged ? new Date().toISOString() : s.usernameChangedAt,
        });
        return null;
      }

      const available = await SupabaseServiceInstance.usernameAvailable(newUsername);
      if (available === false) {
        return `\u201C${newUsername}\u201D is already taken — try another one.`;
      }

      set({
        displayName: newName.length === 0 ? get().displayName : newName,
        username: newUsername,
        profileSetupPending: false,
      });
      void syncProfile(get());
      return null;
    },

    setAvatar(avatar) {
      const safe = AVATAR_PALETTES[avatar] != null ? avatar : get().avatar;
      set({ avatar: safe });
      void syncProfile(get());
    },

    completeProfileSetup() {
      set({
        profileSetupPending: false,
        onboardingDone: true,
        accountCreated: true,
      });
      void syncProfile(get());
    },

    applyGoogleAuth({ name, email }) {
      set({
        displayName: name.trim().length === 0 ? get().displayName : name.trim(),
        email: email.trim(),
        accountCreated: true,
        memberSince: get().memberSince ?? new Date().toISOString(),
      });
      void syncProfile(get());
    },

    createAccount({ name, username, email = '', avatar = 'sun', password = '' }) {
      set({
        displayName: name.trim().length === 0 ? get().displayName : name.trim(),
        username: username.trim().length === 0 ? get().username : username.trim(),
        email: email.trim(),
        avatar: AVATAR_PALETTES[avatar] != null ? avatar : get().avatar,
        password,
        accountCreated: true,
        memberSince: get().memberSince ?? new Date().toISOString(),
      });
    },

    logIn({ handle, password }) {
      const s = get();
      const normalized = handle.trim().toLowerCase();
      if (!s.accountCreated || s.username.length === 0) {
        return 'No Qubi account yet — create one first.';
      }
      const handleMatches =
        normalized === s.username.toLowerCase() ||
        (s.email.length > 0 && normalized === s.email.toLowerCase());
      if (!handleMatches) return `No account found for \u201C${normalized}\u201D.`;
      if (s.password.length === 0 || password !== s.password) {
        return 'Incorrect password. Try again.';
      }
      set({ accountCreated: true });
      return null;
    },

    saveResponse(key, value) {
      set({ responses: { ...get().responses, [key]: value } });
    },

    finishOnboarding() {
      const s = get();
      set({
        onboardingDone: true,
        accountCreated: true,
        responses: {
          ...s.responses,
          daily_quests: s.responses['daily_quests'] ?? '3',
        },
        xp: Math.max(s.xp, 50),
        streak: Math.max(s.streak, 1),
        lastStreakDate: s.lastStreakDate ?? new Date().toISOString(),
        memberSince: s.memberSince ?? new Date().toISOString(),
      });
      // Persist the "wizard complete" flag so a future sign-in on a new
      // device skips straight to the dashboard.
      void syncProfile(get());
    },

    resetOnboardingForReplay() {
      set({ onboardingDone: false, accountCreated: true }); // keep auth state
      void syncProfile(get());
    },

    async signOut() {
      try {
        await SupabaseServiceInstance.signOut();
      } catch {}
      // Drop scheduled reminders — they belong to this session's local state.
      await cancelAllNotifications();
      try {
        await AsyncStorage.removeItem(STORAGE_KEY);
      } catch {}
      set({
        displayName: '',
        username: '',
        email: '',
        avatar: 'sun',
        password: '',
        onboardingDone: false,
        accountCreated: false,
        profileSetupPending: false,
        nameChangedAt: null,
        usernameChangedAt: null,
        xp: 0,
        streak: 0,
        lastStreakDate: null,
        memberSince: null,
        responses: {},
        customHabits: [],
        customCounter: 0,
        activeTab: 0,
        chat: [],
        proofs: {},
      });
      set({ weekMatrix: seedDemoMatrix(allHabitsOf(get())), chat: demoChat('adventurer') });
    },

    async checkForUpdate() {
      const info = await fetchLatestUpdate();
      if (!get().updateCheckDone) {
        set({ updateCheckDone: true, updateInfo: info });
      }
    },

    setActiveTab(index) {
      if (index === get().activeTab) return;
      set({ activeTab: index });
    },

    async addHabit({ name, category, time, emoji = '\u2705', icon = 'check' }) {
      const s = get();
      const id = `custom_${s.customCounter}`;
      const habit: Habit = { id, name: name.trim(), icon, time, category, emoji };
      set({
        customHabits: [...s.customHabits, habit],
        customCounter: s.customCounter + 1,
        weekMatrix: { ...s.weekMatrix, [id]: Array(7).fill(QuestStatus.pending) },
      });
      scheduleHabitReminders(get());
      try {
        await SupabaseServiceInstance.insertHabit({
          title: name.trim(),
          icon,
          emoji,
          category,
          time_of_day: time,
          frequency_days: [0, 1, 2, 3, 4, 5, 6],
          is_custom: true,
          sort_order: get().customHabits.length,
        });
      } catch {}
    },

    async removeHabit(habitId) {
      const s = get();
      const { [habitId]: _h, ...restMatrix } = s.weekMatrix;
      const { [habitId]: _p, ...restProofs } = s.proofs;
      set({
        customHabits: s.customHabits.filter((h) => h.id !== habitId),
        weekMatrix: restMatrix,
        proofs: restProofs,
      });
      scheduleHabitReminders(get());
      try {
        await SupabaseServiceInstance.deleteHabit(habitId);
      } catch {}
    },

    async applyAiPlan(plan) {
      for (const item of plan) {
        await get().addHabit({
          name: item.title,
          category: item.category,
          time: item.timeOfDay,
        });
      }
      return plan.length;
    },

    async verifyHabit(habitId, proofPath, xpAmount = 50, difficulty = 'Medium', taskName?: string) {
      const s = get();
      const matrix = s.weekMatrix[habitId];
      if (matrix == null) return;
      const today = todayIndexNow();
      if (matrix[today] === QuestStatus.verified) return;
      const nextRow = [...matrix];
      nextRow[today] = QuestStatus.verified;
      const proofs = { ...s.proofs };
      if (proofPath != null) {
        proofs[habitId] = { ...(proofs[habitId] ?? {}), [today]: proofPath };
      }
      const gain = Math.max(0, Math.min(120, Math.round(xpAmount)));
      set({
        weekMatrix: { ...s.weekMatrix, [habitId]: nextRow },
        proofs,
        xp: s.xp + gain,
        ...bumpStreakValue(s.streak, s.lastStreakDate),
      });
      await syncVerification(habitId, proofPath, get().xp, get().streak, {
        xpAmount: gain,
        difficulty,
        taskName,
      });
      // Re-read authoritative stats (Supabase RPC is the source of truth),
      // then mirror them to the Home Screen widget.
      try {
        await get().refreshProfileStats();
      } catch {}
      pushStatsToWidget(get());
    },

    addUserMessage(text) {
      const message = text.trim();
      if (message.length === 0) return;
      set({ chat: [...get().chat, { fromUser: true, text: message }] });
      persistLastChat(get());
    },

    clearChats() {
      set({ chat: [] });
      SupabaseServiceInstance.clearChats().catch(() => {});
    },

    addAssistantMessage(text, toolName?) {
      set({ chat: [...get().chat, { fromUser: false, text }] });
      if (toolName != null) {
        SupabaseServiceInstance.insertChat({ role: 'assistant', content: text, tool_name: toolName }).catch(
          () => {},
        );
      } else {
        persistLastChat(get());
      }
    },

    applyQubiSchedule() {
      const budget = get().responses['daily_time_budget'];
      if (budget != null) {
        const minutes = Number.parseInt(budget, 10) || 30;
        set({
          chat: [
            ...get().chat,
            {
              fromUser: false,
              text: `I\u2019ve tuned your daily plan to ${minutes} min. Balanced for your sleep window — nice.`,
            },
          ],
        });
      }
    },

    applySetupProfile(profile) {
      const s = get();
      set({
        age: profile.age !== undefined ? profile.age : s.age,
        focusAreas: profile.focusAreas ?? s.focusAreas,
        dailyPace: profile.dailyPace ?? s.dailyPace,
        targetQuestCount: profile.targetQuestCount ?? s.targetQuestCount,
        baselineRank: profile.baselineRank ?? s.baselineRank,
        proofMethods: profile.proofMethods ?? s.proofMethods,
        briefingTime:
          profile.briefingTime !== undefined ? profile.briefingTime : s.briefingTime,
      });
    },
  })),
);

// ── Side-effect helpers ─────────────────────────────────────────────────────

async function syncProfile(s: AppShape): Promise<void> {
  try {
    // Never push blank identity fields — a wiped local state must not erase
    // the good Supabase row (the sign-out/sign-in name-loss loop).
    const payload: Record<string, unknown> = {
      onboarding_done: s.onboardingDone,
      responses: s.responses,
      avatar: s.avatar,
    };
    if (s.displayName.trim().length > 0) payload.display_name = s.displayName;
    if (s.username.trim().length > 0) payload.username = s.username;
    await SupabaseServiceInstance.upsertProfile(payload);
  } catch {}
}

async function syncVerification(
  habitId: string,
  proofPath: string | undefined,
  xp: number,
  streak: number,
  reward?: { xpAmount: number; difficulty: string; taskName?: string },
): Promise<void> {
  try {
    const svc = SupabaseServiceInstance;
    if (svc.userId == null) return;
    const completionId = await svc.upsertCompletion({
      habitId,
      day: new Date(),
      status: 'pending',
    });
    if (completionId != null) {
      await svc.verifyCompletion(completionId, proofPath, reward?.xpAmount ?? 50);
    }
    // Persist the graded proof to the history ledger (difficulty + XP).
    if (reward != null) {
      const habit = useAppStore.getState().customHabits.find((h) => h.id === habitId);
      await svc.insertActivityProof({
        habitId,
        taskName: reward.taskName ?? habit?.name ?? habitId,
        difficulty: reward.difficulty,
        xpAwarded: reward.xpAmount,
        photoUrl: proofPath,
      });
    }
    // Push aggregate stats so the profile + leaderboard stay in sync.
    await svc.upsertProfile({
      xp,
      streak,
      last_streak_date: new Date().toISOString().substring(0, 10),
    });
  } catch {}
}

/** Mirrors live xp/streak/level + Mon–Sun verification to the Home Screen widget. */
function pushStatsToWidget(s: AppShape): void {
  try {
    const today = todayIndexNow();
    const dayDone = (d: number): boolean =>
      Object.values(s.weekMatrix).some((days) => days[d] === QuestStatus.verified);
    const week = [0, 1, 2, 3, 4, 5, 6].map(dayDone);
    void import('../services/widgetSyncService')
      .then((m) =>
        m
          .syncStatsToWidget({
            xp: s.xp,
            streak: s.streak,
            level: 1 + Math.floor(s.xp / 500),
            week,
            todayDone: dayDone(today),
            questsDoneToday: Object.values(s.weekMatrix).filter(
              (days) => days[today] === QuestStatus.verified,
            ).length,
          })
          .catch(() => {}),
      )
      .catch(() => {});
  } catch {}
}

function bumpStreakValue(streak: number, lastStreakDate: string | null): { streak: number; lastStreakDate: string | null } {
  const now = new Date();
  const last = lastStreakDate != null ? new Date(lastStreakDate) : null;
  const sameDay =
    last != null &&
    last.getFullYear() === now.getFullYear() &&
    last.getMonth() === now.getMonth() &&
    last.getDate() === now.getDate();
  if (!sameDay) return { streak: streak + 1, lastStreakDate: now.toISOString() };
  return { streak, lastStreakDate };
}

function persistLastChat(s: AppShape): void {
  const last = s.chat[s.chat.length - 1];
  if (last == null) return;
  SupabaseServiceInstance.insertChat({
    role: last.fromUser ? 'user' : 'assistant',
    content: last.text,
  }).catch(() => {});
}

// ── Persist wiring ──────────────────────────────────────────────────────────

useAppStore.subscribe(() => touchPersist(() => useAppStore.getState()));

/** Loads persisted state (or keeps the fresh demo state). Call once at boot. */
export async function loadAppState(): Promise<AppShape> {
  const base = useAppStore.getState();
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw != null) {
      try {
        useAppStore.setState(applyPersisted(JSON.parse(raw) as Record<string, unknown>, base));
      } catch {
        // Corrupt or legacy payload — fall back to the seeded demo state.
      }
    }
  } catch {}
  loaded = true;
  scheduleHabitReminders(useAppStore.getState());
  return useAppStore.getState();
}

// ── Derived selectors (the Dart getters) ────────────────────────────────────

/**
 * Zustand selectors passed to hooks MUST return cached references when the
 * underlying state hasn't changed — otherwise useSyncExternalStore sees a
 * fresh object/array every snapshot check and re-renders forever
 * ("The result of getSnapshot should be cached" / max update depth).
 * Every derived selector below that allocates goes through these memos,
 * keyed on the immutable root state object (set() always replaces it).
 */

function memoByState<T>(compute: (s: AppShape) => T): (s: AppShape) => T {
  let lastState: AppShape | null = null;
  let lastSignedIn = false;
  let lastValue!: T;
  return (s) => {
    const signedIn = isSignedInNow();
    if (lastState === s && lastSignedIn === signedIn) return lastValue;
    lastValue = compute(s);
    lastState = s;
    lastSignedIn = signedIn;
    return lastValue;
  };
}

export const selectIsDemo = (): boolean => !SupabaseServiceInstance.backendOnline;
export const selectIsSignedIn = (): boolean => SupabaseServiceInstance.isSignedIn;
export const selectUid = (): string | null => SupabaseServiceInstance.userId;
export const selectIsNewAccount = (s: AppShape): boolean => selectIsSignedIn() && s.customHabits.length === 0;
export const selectTodayIndex = (): number => todayIndexNow();

/** Dart's `updateAvailable` getter: null until the first check completes. */
export function selectUpdateAvailable(s: AppShape): boolean | null {
  if (!s.updateCheckDone) return null;
  const info = s.updateInfo;
  if (info == null) return false;
  return info.isNewerThan('1.0.0', '1');
}

export function selectWeeklyRate(s: AppShape): number {
  let verified = 0;
  let total = 0;
  for (const statuses of Object.values(s.weekMatrix)) {
    for (const status of statuses) {
      total++;
      if (status === QuestStatus.verified) verified++;
    }
  }
  return total === 0 ? 0 : Math.round((verified / total) * 100);
}

export function selectCompletedCount(s: AppShape): number {
  let sum = 0;
  for (const days of Object.values(s.weekMatrix)) {
    for (const st of days) if (st === QuestStatus.verified) sum++;
  }
  return sum;
}

export const selectPendingTodayHabits = memoByState((s: AppShape): Habit[] => {
  const today = todayIndexNow();
  return allHabitsOf(s).filter((h) => s.weekMatrix[h.id]?.[today] !== QuestStatus.verified);
});

export function selectStatusOn(s: AppShape, day: number): QuestStatus {
  let verified = 0;
  for (const statuses of Object.values(s.weekMatrix)) {
    if (statuses[day] === QuestStatus.verified) verified++;
  }
  return verified > 0 ? QuestStatus.verified : QuestStatus.pending;
}

export const selectBadges = memoByState((s: AppShape): BadgeInfo[] => [
  { name: '7-Day Warrior', emoji: '\u2694\uFE0F', earned: s.streak >= 7, hint: '7-day streak' },
  { name: 'Photo Master', emoji: '\u{1F4F7}', earned: Object.keys(s.proofs).length > 0, hint: 'Verified with proof' },
  {
    name: 'Early Bird',
    emoji: '\u{1F305}',
    earned: s.responses['wake_time'] === '05' || s.responses['wake_time'] === '06',
    hint: 'Wakes before 7 AM',
  },
  { name: 'Streak Keeper', emoji: '\u{1F525}', earned: s.streak >= 3, hint: '3+ day streak' },
  {
    name: 'Weekend Slayer',
    emoji: '\u{1F4AA}',
    earned: selectStatusOn(s, 5) === QuestStatus.verified || selectStatusOn(s, 6) === QuestStatus.verified,
    hint: 'Verified on a weekend',
  },
  { name: 'Perfect Day', emoji: '\u2728', earned: selectPerfectDay(s), hint: 'All quests verified in one day' },
]);

function selectPerfectDay(s: AppShape): boolean {
  for (const statuses of Object.values(s.weekMatrix)) {
    if (statuses.includes(QuestStatus.pending) || statuses.includes(QuestStatus.missed)) {
      return false;
    }
  }
  return true;
}

/** Weekly XP per day for the profile bar chart. */
export const selectWeeklyXpBars = memoByState((s: AppShape): number[] => {
  const bars = Array(7).fill(0);
  for (const [, days] of Object.entries(s.weekMatrix)) {
    for (let d = 0; d < 7; d++) {
      if (days[d] === QuestStatus.verified) bars[d] += 50;
    }
  }
  return bars;
});

export const selectHabits = memoByState((s: AppShape): Habit[] => allHabitsOf(s));

export function selectStatusOf(s: AppShape, habitId: string, dayIndex: number): QuestStatus {
  return s.weekMatrix[habitId]?.[dayIndex] ?? QuestStatus.pending;
}

export function selectProofOf(s: AppShape, habitId: string, dayIndex: number): string | undefined {
  return s.proofs[habitId]?.[dayIndex];
}

export function selectInitials(s: AppShape): string {
  const parts = s.displayName.split(' ');
  if (parts.length > 1) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return s.displayName.substring(0, Math.min(2, s.displayName.length)).toUpperCase();
}

export function selectMemberSinceLabel(s: AppShape): string {
  const iso = s.memberSince;
  if (iso == null) return 'Member · this week';
  const date = new Date(iso);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `Member since ${months[date.getMonth()]} ${date.getFullYear()}`;
}

export const selectLeague = memoByState((s: AppShape): LeagueEntry[] => {
  const myCompletions = selectCompletedCount(s);
  return [
    { rank: 1, name: 'Zara Khan', initials: 'ZK', xp: 2780, streak: 31, tier: 'Silver', isMe: false, level: 18 },
    { rank: 2, name: 'Liam Novak', initials: 'LN', xp: 2590, streak: 22, tier: 'Silver', isMe: false, level: 16 },
    {
      rank: 3,
      name: s.displayName,
      initials: selectInitials(s),
      xp: s.xp,
      streak: s.streak,
      tier: rankLabel(tierForXp(s.xp, myCompletions)),
      isMe: true,
      level: 1 + Math.floor(s.xp / 500),
    },
    { rank: 4, name: 'Sofia Reyes', initials: 'SR', xp: 2140, streak: 12, tier: 'Silver', isMe: false, level: 11 },
    { rank: 5, name: 'Marcus Bell', initials: 'MB', xp: 1890, streak: 9, tier: 'Silver', isMe: false, level: 10 },
    { rank: 6, name: 'Priya Shah', initials: 'PS', xp: 1675, streak: 6, tier: 'Silver', isMe: false, level: 9 },
    { rank: 7, name: 'Diego Torres', initials: 'DT', xp: 1490, streak: 4, tier: 'Silver', isMe: false, level: 8 },
  ];
});

/** Full JSON-serializable map of onboarding responses (for Inspector mode). */
export function selectOnboardingDataJson(s: AppShape): Record<string, unknown> {
  return {
    display_name: s.displayName,
    username: s.username,
    avatar: s.avatar,
    xp: s.xp,
    streak: s.streak,
    onboarding_done: s.onboardingDone,
    ...s.responses,
  };
}

/** Checks if onboarding has been completed (persisted separately from app state). */
export async function hasCompletedOnboarding(): Promise<boolean> {
  // In dev mode always replay the Splash + Onboarding flow so every test run
  // starts at the intended entry point regardless of any previously-stored flag.
  if (__DEV__) {
    return false;
  }
  try {
    const value = await AsyncStorage.getItem(ONBOARDING_KEY);
    return value === 'true';
  } catch {
    return false;
  }
}

/** Marks onboarding as completed. */
export async function markOnboardingComplete(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
  } catch {}
}

/** Clears the stored onboarding flag so the Splash/Onboarding flow replays. */
export async function clearOnboarding(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ONBOARDING_KEY);
  } catch {}
}
