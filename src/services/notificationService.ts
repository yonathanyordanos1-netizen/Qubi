import { Habit } from '../types/models';

/**
 * Schedules and manages Qubi's local notifications: a daily habit reminder
 * at the user's chosen time, a streak-saver nudge late in the evening, plus
 * per-quest coach pings from Qubi at each quest's own time.
 * Ported from notification_service.dart onto expo-notifications.
 *
 * Every method is defensive — on unsupported platforms or when the OS denies
 * permission it silently no-ops, so the rest of the app never depends on
 * notifications being available.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { SupabaseServiceInstance } from './supabase';

const DAILY_REMINDER_ID = 'Qubi-daily-reminder';
const STREAK_ALERT_ID = 'Qubi-streak-alert';
const HABIT_ID_KEY = 'Qubi.scheduledHabitIds';

const DAILY_CHANNEL_ID = 'Qubi_daily_reminders';
const DAILY_CHANNEL_NAME = 'Daily quest reminders';
const HABIT_CHANNEL_ID = 'Qubi_habit_pings';
const HABIT_CHANNEL_NAME = 'Qubi quest pings';

/**
 * True inside the Expo Go sandbox. Push tokens minted there route to the
 * Expo Go app, and locally scheduled reminders also surface as Expo Go —
 * production notifications must only ever come from the standalone IPA, so
 * every send path below (remote registration + local scheduling) no-ops here.
 */
export function isExpoGo(): boolean {
  try {
    return Constants.appOwnership === 'expo';
  } catch {
    return false;
  }
}

// Show alerts while the app is foregrounded (mirrors high-importance heads-up).
// Skipped on web where expo-notifications is unavailable.
// Wrapped in try/catch for Expo Go / Web where native module may be stubbed.
try {
  if (Platform.OS !== 'web') {
    void Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  }
} catch {}

let initDone = false;
let initAttempted = false;
let habitRemindersEnabled = false;
let lastHabits: Habit[] = [];

async function ensureInitialized(): Promise<boolean> {
  if (initDone) return true;
  if (initAttempted) return false; // another attempt is already in flight
  initAttempted = true;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(DAILY_CHANNEL_ID, {
        name: DAILY_CHANNEL_NAME,
        description: 'Gentle nudges at your chosen quest time',
        importance: Notifications.AndroidImportance.MAX,
      });
      await Notifications.setNotificationChannelAsync(HABIT_CHANNEL_ID, {
        name: HABIT_CHANNEL_NAME,
        description: 'Coach pings at each quest time',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    initDone = true;
    return true;
  } catch {
    return false;
  } finally {
    initAttempted = false;
  }
}

/** Asks the OS for permission. Call from a user gesture. */
/**
 * Captures the Expo push token and stores it on the user's profile so the
 * backend can deliver friend nudges, friend requests and streak alerts.
 * Standalone/IPA builds only — silently no-ops in Expo Go (its token would
 * route production broadcasts into the Expo Go app), on web, or offline.
 */
export async function registerPushToken(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    // Never register from Expo Go — that token would route broadcasts into
    // the Expo Go app instead of the standalone IPA.
    if (isExpoGo()) return;
    if (!Constants.expoConfig?.extra?.eas?.projectId) return;
    let settings = await Notifications.getPermissionsAsync();
    let granted = settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (!granted && settings.canAskAgain) {
      settings = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
      granted = settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    }
    if (!granted) return;
    const token = await Notifications.getExpoPushTokenAsync();
    const tokenString =
      typeof token === 'object' && token != null && 'data' in token ? String(token.data) : '';
    if (tokenString.length === 0) return;
    const userId = SupabaseServiceInstance.userId;
    if (userId) {
      await SupabaseServiceInstance.client
        .from('user_push_tokens')
        .upsert({ user_id: userId, expo_push_token: tokenString, platform: Platform.OS });
    }
    await SupabaseServiceInstance.upsertProfile({ push_token: tokenString });
  } catch {
    // Push is best-effort — never block boot (Expo Go Android, offline, etc.)
  }
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (!(await ensureInitialized())) return false;
  try {
    const settings = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    return settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  } catch {
    return false;
  }
}

/**
 * Reconciles the OS schedule with the user's settings: schedules (or cancels)
 * the daily reminder and the streak-saver alert.
 */
export async function applyNotificationSettings(opts: {
  remindersEnabled: boolean;
  reminderTime: string;
  streakAlerts: boolean;
}): Promise<void> {
  // Expo Go must stay silent — locally scheduled reminders would otherwise
  // surface as Expo Go notifications instead of coming from the IPA.
  if (isExpoGo()) return;
  if (!(await ensureInitialized())) return;
  habitRemindersEnabled = opts.remindersEnabled;
  if (opts.remindersEnabled) {
    await scheduleDailyReminder(opts.reminderTime);
    await rescheduleHabitReminders();
  } else {
    await cancelId(DAILY_REMINDER_ID);
    await cancelHabitReminders();
  }
  if (opts.streakAlerts) {
    await scheduleStreakAlert();
  } else {
    await cancelId(STREAK_ALERT_ID);
  }
}

/** Cancels every scheduled Qubi notification (e.g. on sign-out). */
export async function cancelAllNotifications(): Promise<void> {
  if (!(await ensureInitialized())) return;
  await cancelId(DAILY_REMINDER_ID);
  await cancelId(STREAK_ALERT_ID);
  await cancelHabitReminders();
}

/**
 * Re-syncs the Qubi coach pings so each quest nudges you at its own time.
 * Stores the latest habit list even when reminders are off so a later enable
 * can schedule immediately (boot ordering safe).
 */
export async function applyHabitReminders(opts: { habits: Habit[] }): Promise<void> {
  lastHabits = opts.habits;
  // Expo Go must stay silent (see applyNotificationSettings).
  if (isExpoGo()) return;
  if (!habitRemindersEnabled) return;
  await rescheduleHabitReminders();
}

async function rescheduleHabitReminders(): Promise<void> {
  if (!(await ensureInitialized())) return;
  await cancelHabitReminders();
  const ids: string[] = [];
  for (const habit of lastHabits) {
    const parsed = parseTime(habit.time);
    if (parsed == null) continue;
    const id = `habit-${habit.id}`;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: id,
        content: {
          title: `Qubi · Time for ${habit.name}! ${habit.emoji}`,
          body: 'Snap a photo proof and I\u2019ll bank +50 XP. You\u2019ve got this!',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: parsed[0],
          minute: parsed[1],
          channelId: Platform.OS === 'android' ? HABIT_CHANNEL_ID : undefined,
        },
      });
      ids.push(id);
    } catch {}
  }
  try {
    await AsyncStorage.setItem(HABIT_ID_KEY, JSON.stringify(ids));
  } catch {}
}

async function cancelHabitReminders(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(HABIT_ID_KEY);
    const ids: string[] = raw != null ? JSON.parse(raw) : [];
    for (const id of ids) await cancelId(id);
  } catch {}
  try {
    await AsyncStorage.removeItem(HABIT_ID_KEY);
  } catch {}
}

/** Parses display times like "7:30 AM" / "21:00" into 24h [hour, minute]. */
export function parseTime(time: string): [number, number] | null {
  const m = /^\s*(\d{1,2}):(\d{2})\s*(am|pm)?/i.exec(time.trim());
  if (m == null) return null;
  let h = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  const ap = m[3]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return [h, minute];
}

async function cancelId(id: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {}
}

async function scheduleDailyReminder(hhmm: string): Promise<void> {
  const parts = hhmm.split(':');
  if (parts.length !== 2) return;
  const hour = Number.parseInt(parts[0], 10);
  const minute = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: DAILY_REMINDER_ID,
      content: {
        title: 'Qubi — your quests are waiting 🎯',
        body: 'Snap your photo proofs today to bank XP and protect your streak!',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: Platform.OS === 'android' ? DAILY_CHANNEL_ID : undefined,
      },
    });
  } catch {}
}

async function scheduleStreakAlert(): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: STREAK_ALERT_ID,
      content: {
        title: 'Streak saver ⏳',
        body: 'Anything left unverified? A quick photo proof keeps your streak alive tonight.',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 21,
        minute: 0,
        channelId: Platform.OS === 'android' ? DAILY_CHANNEL_ID : undefined,
      },
    });
  } catch {}
}
