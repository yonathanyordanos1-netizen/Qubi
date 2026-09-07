import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

import { ThemeMode, setThemeOverride } from '../theme/ThemeProvider';
import { SupabaseServiceInstance } from '../services/supabase';
import {
  applyNotificationSettings,
  requestNotificationPermissions,
} from '../services/notificationService';

/**
 * User preference state: theme, haptics, notifications. Persisted to
 * AsyncStorage for instant offline reads and mirrored to the `user_settings`
 * table (owner-scoped by RLS) when signed in. Ported from settings_provider.dart.
 */

const THEME_KEY = 'settings_theme_mode';
const HAPTICS_KEY = 'settings_haptics';
const REMINDERS_KEY = 'settings_reminders_enabled';
const REMINDER_TIME_KEY = 'settings_reminder_time';
const STREAK_ALERTS_KEY = 'settings_streak_alerts';

const THEME_MODES: readonly ThemeMode[] = ['system', 'light', 'dark'];

function themeModeOf(name: string | null): ThemeMode {
  return THEME_MODES.includes(name as ThemeMode) ? (name as ThemeMode) : 'light';
}

export interface SettingsShape {
  themeMode: ThemeMode;
  haptics: boolean;
  remindersEnabled: boolean;
  reminderTime: string;
  streakAlerts: boolean;

  hydrate: () => Promise<void>;
  hydrateFromSupabase: () => Promise<void>;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  setHaptics: (enabled: boolean) => Promise<void>;
  setRemindersEnabled: (enabled: boolean) => Promise<void>;
  setReminderTime: (hhmm: string) => Promise<void>;
  setStreakAlerts: (enabled: boolean) => Promise<void>;
  tap: () => void;
  celebrate: () => void;
  clearCache: () => Promise<void>;
}

let syncing = false;

async function save(key: string, value: string | boolean, getState: () => SettingsShape): Promise<void> {
  try {
    await AsyncStorage.setItem(key, typeof value === 'string' ? value : value ? '1' : '0');
  } catch {}
  void syncToSupabase(getState);
}

async function syncToSupabase(getState: () => SettingsShape): Promise<void> {
  if (syncing) return;
  syncing = true;
  try {
    const s = getState();
    await SupabaseServiceInstance.upsertSettings({
      theme_mode: s.themeMode,
      haptics: s.haptics,
      reminders_enabled: s.remindersEnabled,
      reminder_time: s.reminderTime,
      streak_alerts: s.streakAlerts,
    });
  } catch {
    // Offline or demo — local prefs remain the source of truth.
  } finally {
    syncing = false;
  }
}

function applyNotifications(getState: () => SettingsShape): void {
  const s = getState();
  void applyNotificationSettings({
    remindersEnabled: s.remindersEnabled,
    reminderTime: s.reminderTime,
    streakAlerts: s.streakAlerts,
  });
}

export const useSettingsStore = create<SettingsShape>((set, get) => ({
  themeMode: 'light',
  haptics: true,
  remindersEnabled: true,
  reminderTime: '08:00',
  streakAlerts: true,

  async hydrate() {
    try {
      const [theme, haptics, reminders, time, alerts] = await Promise.all([
        AsyncStorage.getItem(THEME_KEY),
        AsyncStorage.getItem(HAPTICS_KEY),
        AsyncStorage.getItem(REMINDERS_KEY),
        AsyncStorage.getItem(REMINDER_TIME_KEY),
        AsyncStorage.getItem(STREAK_ALERTS_KEY),
      ]);
      set({
        themeMode: themeModeOf(theme),
        haptics: haptics == null ? true : haptics === '1',
        remindersEnabled: reminders == null ? true : reminders === '1',
        reminderTime: time ?? '08:00',
        streakAlerts: alerts == null ? true : alerts === '1',
      });
    } catch {}
    // Align the OS notification schedule with the restored prefs.
    applyNotifications(get);
  },

  /// Pulls server-side settings once on boot (new devices / re-login).
  async hydrateFromSupabase() {
    let remote;
    try {
      remote = await SupabaseServiceInstance.fetchSettings();
    } catch {
      return;
    }
    if (remote == null) return;
    const patch: Partial<SettingsShape> = {};
    const theme = themeModeOf(remote['theme_mode'] as string | null);
    if (theme !== get().themeMode) patch.themeMode = theme;
    const haptics = remote['haptics'];
    if (typeof haptics === 'boolean' && haptics !== get().haptics) patch.haptics = haptics;
    const reminders = remote['reminders_enabled'];
    if (typeof reminders === 'boolean' && reminders !== get().remindersEnabled) {
      patch.remindersEnabled = reminders;
    }
    const time = remote['reminder_time'];
    if (typeof time === 'string' && time !== get().reminderTime) patch.reminderTime = time;
    const alerts = remote['streak_alerts'];
    if (typeof alerts === 'boolean' && alerts !== get().streakAlerts) patch.streakAlerts = alerts;
    if (Object.keys(patch).length > 0) {
      set(patch);
      if (patch.themeMode != null) setThemeOverride(patch.themeMode);
      applyNotifications(get);
    }
  },

  async setThemeMode(mode) {
    if (mode === get().themeMode) return;
    set({ themeMode: mode });
    // Keep the global theme override in lockstep so the UI reacts instantly.
    setThemeOverride(mode);
    await save(THEME_KEY, mode, get);
    get().tap();
  },

  async setHaptics(enabled) {
    if (enabled === get().haptics) return;
    set({ haptics: enabled });
    await save(HAPTICS_KEY, enabled, get);
  },

  async setRemindersEnabled(enabled) {
    if (enabled === get().remindersEnabled) return;
    set({ remindersEnabled: enabled });
    await save(REMINDERS_KEY, enabled, get);
    if (enabled) {
      // Ask the OS for permission from this user gesture, then schedule.
      await requestNotificationPermissions();
      get().tap();
    }
    applyNotifications(get);
  },

  async setReminderTime(hhmm) {
    if (hhmm === get().reminderTime) return;
    set({ reminderTime: hhmm });
    await save(REMINDER_TIME_KEY, hhmm, get);
    applyNotifications(get);
  },

  async setStreakAlerts(enabled) {
    if (enabled === get().streakAlerts) return;
    set({ streakAlerts: enabled });
    await save(STREAK_ALERTS_KEY, enabled, get);
    applyNotifications(get);
  },

  /// Light, friendly confirm haptic if enabled.
  tap() {
    if (!get().haptics) return;
    void Haptics.selectionAsync().catch(() => {});
  },

  /// Strong celebratory feedback for verified quests.
  celebrate() {
    if (!get().haptics) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  },

  /// Resets the image cache. Proof thumbnails live in the private storage
  /// bucket, so we only clear expo-image's memory + disk caches.
  async clearCache() {
    try {
      const ExpoImage = require('expo-image') as {
        clearMemoryCache?: () => Promise<boolean>;
        clearDiskCache?: () => Promise<boolean>;
      };
      await ExpoImage.clearMemoryCache?.();
      await ExpoImage.clearDiskCache?.();
    } catch {}
    get().tap();
  },
}));
