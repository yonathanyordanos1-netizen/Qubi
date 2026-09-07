/**
 * Task Alarms & Scheduled Reminders — expo-notifications wrapper.
 *
 * Provides high-priority local notifications that act as alarms:
 *  - Custom sound, banner/list visibility, badge, vibration
 *  - Android high-importance channels for heads-up + sound
 *  - iOS interruptionLevel: timeSensitive for alarm-like breakout
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// Dedicated channel for alarms (separate from daily habit nudges)
const ALARM_CHANNEL_ID = 'Qubi_task_alarms';
const ALARM_CHANNEL_NAME = 'Qubi Task Alarms';

let alarmChannelReady = false;

async function ensureAlarmChannel(): Promise<void> {
  if (alarmChannelReady) return;
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync(ALARM_CHANNEL_ID, {
        name: ALARM_CHANNEL_NAME,
        description: 'High-priority alerts when a quest is due — sound, vibration and heads-up banner.',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        enableVibrate: true,
        vibrationPattern: [0, 400, 200, 400],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        enableLights: true,
      });
    } catch {}
  }
  alarmChannelReady = true;
}

/**
 * Ensure notification handler allows banner + sound + badge for alarms
 * while foregrounded (call once at app start).
 */
export async function configureAlarmNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  await ensureAlarmChannel();
  try {
    await Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch {}
}

/**
 * Request notification permissions. Call from a user gesture or on app start.
 * Returns true if granted (or provisional on iOS).
 */
export async function requestAlarmPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  await ensureAlarmChannel();
  try {
    const settings = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
        // timeSensitive for alarm-like notifications (iOS 15+)
        // expo-notifications maps this via interruptionLevel on content
      },
    });
    return settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  } catch {
    return false;
  }
}

/**
 * Schedule a high-priority local notification that fires at triggerTime.
 *
 * @param taskTitle  — quest title shown in the notification
 * @param triggerTime — when the alarm should fire (Date in the future)
 * @param opts       — optional body, sound, badge increment, identifier
 * @returns notification identifier (for cancel) or null on failure
 */
export async function scheduleTaskAlarm(
  taskTitle: string,
  triggerTime: Date,
  opts?: {
    body?: string;
    identifier?: string;
    sound?: string | boolean;
    badge?: number;
    channelId?: string;
    data?: Record<string, unknown>;
  },
): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  await ensureAlarmChannel();

  const when = triggerTime instanceof Date ? triggerTime : new Date(triggerTime);
  if (!Number.isFinite(when.getTime())) return null;
  if (when.getTime() <= Date.now()) return null; // must be future

  const id = opts?.identifier ?? `Qubi-alarm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    // iOS: use calendar trigger for exact time (more reliable than Date trigger after reload)
    // Android: Date trigger
    const useCalendarTrigger = Platform.OS === 'ios';
    const trigger: Notifications.NotificationTriggerInput = useCalendarTrigger
      ? {
          type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
          year: when.getFullYear(),
          month: when.getMonth() + 1, // expo: 1-based
          day: when.getDate(),
          hour: when.getHours(),
          minute: when.getMinutes(),
          second: when.getSeconds(),
          repeats: false,
        }
      : {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: when,
        } as unknown as Notifications.NotificationTriggerInput;

    // Attach channel on Android, extend with any caller-provided trigger override
    const finalTrigger: any = Platform.OS === 'android' ? { ...trigger, channelId: opts?.channelId ?? ALARM_CHANNEL_ID } : trigger;

    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: {
        title: `Qubi ⏰ ${taskTitle}`,
        body: opts?.body ?? `Time to start "${taskTitle}" — Let's go!`,
        sound: opts?.sound === false ? undefined : opts?.sound ?? 'default',
        badge: opts?.badge ?? 1,
        // iOS alarm-like breakout (requires timeSensitive entitlement on device, falls back gracefully)
        interruptionLevel: 'timeSensitive' as any,
        data: { kind: 'quest_alarm', taskTitle, ...opts?.data },
        // Android: ensure heads-up
        ...(Platform.OS === 'android' ? { priority: Notifications.AndroidNotificationPriority.MAX } as any : {}),
      },
      trigger: finalTrigger,
    });
    return id;
  } catch {
    return null;
  }
}

/**
 * Cancel a scheduled alarm by its identifier.
 */
export async function cancelTaskAlarm(identifier: string): Promise<boolean> {
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
    return true;
  } catch {
    return false;
  }
}

/**
 * Cancel all scheduled quest alarms (identifiers starting with Qubi-alarm-).
 */
export async function cancelAllTaskAlarms(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if (String(n.identifier).startsWith('Qubi-alarm-')) {
        try {
          await Notifications.cancelScheduledNotificationAsync(n.identifier);
        } catch {}
      }
    }
  } catch {}
}

/**
 * List all pending quest alarm identifiers.
 */
export async function getScheduledTaskAlarms(): Promise<string[]> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return scheduled.filter((n) => String(n.identifier).startsWith('Qubi-alarm-')).map((n) => String(n.identifier));
  } catch {
    return [];
  }
}
