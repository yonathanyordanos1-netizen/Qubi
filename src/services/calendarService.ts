/**
 * Calendar & Reminders sync — expo-calendar wrapper.
 *
 * - getAvailableFreeTimeSlots(): scans today's calendar events (Apple/Google synced)
 *   and returns open windows where Qubi quests can be slotted.
 * - createQubiTaskInCalendar(task): exports a quest as a native calendar event
 *   or reminder so it appears in the system Calendar app.
 *
 * All functions are defensive: on web / denied permissions / missing native module
 * they return empty results rather than throwing.
 */

import { Platform } from 'react-native';

export interface FreeTimeSlot {
  start: string; // ISO
  end: string; // ISO
  durationMinutes: number;
  label: string; // e.g. "9:00 AM – 10:30 AM"
}

export interface QuestCalendarTask {
  title: string;
  notes?: string;
  startDate: Date;
  endDate: Date;
  /** Optional: calendar title to target (defaults to default calendar) */
  calendarTitle?: string;
  /** If true, create a Reminder instead of an Event (iOS only) */
  asReminder?: boolean;
  alarmMinutesBefore?: number; // default 10
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function getCalendarModule(): Promise<any | null> {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-calendar');
  } catch {
    return null;
  }
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// ── Permissions ─────────────────────────────────────────────────────────

export async function requestCalendarPermissions(): Promise<boolean> {
  const Calendar = await getCalendarModule();
  if (!Calendar) return false;
  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

export async function requestRemindersPermissions(): Promise<boolean> {
  const Calendar = await getCalendarModule();
  if (!Calendar) return false;
  try {
    // expo-calendar uses same permission for reminders on iOS
    if (Calendar.requestRemindersPermissionsAsync) {
      const { status } = await Calendar.requestRemindersPermissionsAsync();
      return status === 'granted';
    }
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

// ── Free time scanner ───────────────────────────────────────────────────

/**
 * Find open free-time windows for today by querying all visible calendars.
 * Working hours default to 07:00–22:00 local time; configurable via opts.
 */
export async function getAvailableFreeTimeSlots(opts?: {
  workStartHour?: number;
  workEndHour?: number;
  minSlotMinutes?: number;
}): Promise<FreeTimeSlot[]> {
  const workStartHour = opts?.workStartHour ?? 7;
  const workEndHour = opts?.workEndHour ?? 22;
  const minSlotMinutes = opts?.minSlotMinutes ?? 30;

  const Calendar = await getCalendarModule();
  if (!Calendar) return mockFreeSlots(workStartHour, workEndHour);

  try {
    const { status } = await Calendar.getCalendarPermissionsAsync();
    if (status !== 'granted') return [];

    const calendars: any[] = await Calendar.getCalendarsAsync(
      Calendar.EntityTypes?.EVENT,
    );
    const visibleIds = (calendars ?? [])
      .filter((c) => c.allowsModifications !== false || c.accessLevel === 'read' || c.allowsModifications === undefined)
      .map((c) => c.id);

    const startOfDay = new Date();
    startOfDay.setHours(workStartHour, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(workEndHour, 0, 0, 0);

    // Some expo-calendar versions require calendarIds, some don't — try both.
    let events: any[] = [];
    try {
      events = await Calendar.getEventsAsync(
        visibleIds.length > 0 ? visibleIds : undefined,
        startOfDay,
        endOfDay,
      );
    } catch {
      events = await Calendar.getEventsAsync([], startOfDay, endOfDay).catch(() => []);
    }

    const blocks: Array<{ start: Date; end: Date }> = (events ?? [])
      .map((e: any) => ({
        start: new Date(e.startDate),
        end: new Date(e.endDate),
      }))
      .filter((b) => Number.isFinite(b.start.getTime()) && Number.isFinite(b.end.getTime()))
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    // Merge overlapping blocks
    const merged: Array<{ start: Date; end: Date }> = [];
    for (const b of blocks) {
      const last = merged[merged.length - 1];
      if (last && b.start.getTime() <= last.end.getTime()) {
        if (b.end.getTime() > last.end.getTime()) last.end = b.end;
      } else {
        merged.push({ ...b });
      }
    }

    const slots: FreeTimeSlot[] = [];
    let cursor = new Date(startOfDay);
    for (const block of merged) {
      if (block.start.getTime() - cursor.getTime() >= minSlotMinutes * 60000) {
        slots.push(toSlot(cursor, block.start));
      }
      if (block.end.getTime() > cursor.getTime()) cursor = new Date(block.end);
    }
    if (endOfDay.getTime() - cursor.getTime() >= minSlotMinutes * 60000) {
      slots.push(toSlot(cursor, endOfDay));
    }
    return slots;
  } catch {
    return mockFreeSlots(workStartHour, workEndHour);
  }
}

function toSlot(start: Date, end: Date): FreeTimeSlot {
  const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    durationMinutes,
    label: `${formatTime(start)} – ${formatTime(end)}`,
  };
}

function mockFreeSlots(workStartHour: number, workEndHour: number): FreeTimeSlot[] {
  const s = new Date();
  s.setHours(workStartHour, 0, 0, 0);
  const m = new Date();
  m.setHours(12, 0, 0, 0);
  const m2 = new Date();
  m2.setHours(13, 30, 0, 0);
  const e = new Date();
  e.setHours(workEndHour, 0, 0, 0);
  return [toSlot(s, new Date(s.getTime() + 90 * 60000)), toSlot(m, m2), toSlot(new Date(e.getTime() - 90 * 60000), e)];
}

// ── Export quest to calendar ───────────────────────────────────────────

/**
 * Create a native calendar event (or reminder) for a Qubi quest.
 * Returns the created event/reminder ID, or null on failure / web.
 */
export async function createQubiTaskInCalendar(task: QuestCalendarTask): Promise<string | null> {
  const Calendar = await getCalendarModule();
  if (!Calendar) return null;

  try {
    // Ensure permission
    const { status } = await Calendar.getCalendarPermissionsAsync();
    if (status !== 'granted') {
      const req = await Calendar.requestCalendarPermissionsAsync();
      if (req.status !== 'granted') return null;
    }

    if (task.asReminder && Platform.OS === 'ios' && Calendar.EntityTypes?.REMINDER) {
      // Create reminder
      const reminderCalendars: any[] = await Calendar.getCalendarsAsync(Calendar.EntityTypes.REMINDER).catch(() => []);
      const target =
        (task.calendarTitle
          ? reminderCalendars.find((c) => c.title === task.calendarTitle)
          : reminderCalendars.find((c) => c.isPrimary) ?? reminderCalendars[0]) ?? null;
      if (!target) return null;
      const id = await Calendar.createReminderAsync(target.id, {
        title: task.title,
        notes: task.notes,
        startDate: task.startDate,
        dueDate: task.endDate,
        alarms: [{ relativeOffset: -(task.alarmMinutesBefore ?? 10) }],
      });
      return id ?? null;
    }

    // Default: create calendar event
    const calendars: any[] = await Calendar.getCalendarsAsync(Calendar.EntityTypes?.EVENT).catch(
      () => [],
    );
    // Prefer primary / default calendar that allows modifications
    let target: any =
      calendars.find((c) => c.isPrimary && c.allowsModifications !== false) ??
      calendars.find((c) => c.allowsModifications !== false) ??
      calendars[0] ??
      null;

    // On some devices getCalendarsAsync returns empty until permission — create default
    if (!target && Calendar.getDefaultCalendarAsync) {
      try {
        target = await Calendar.getDefaultCalendarAsync();
      } catch {}
    }
    if (!target) return null;

    const title = task.title ?? 'Qubi Quest';
    const creation: any = {
      title,
      notes: task.notes,
      startDate: task.startDate,
      endDate: task.endDate,
      alarms: [{ relativeOffset: -(task.alarmMinutesBefore ?? 10) }],
      // Let system handle timezone; expo-calendar expects Date objects
    };

    // Some sources use createEventAsync(sourceId, details), others (id, details)
    // expo-calendar API is createEventAsync(calendarId, event)
    const id: string = await Calendar.createEventAsync(target.id, creation);
    return id ?? null;
  } catch {
    return null;
  }
}

/**
 * Delete a previously created quest event by its ID.
 */
export async function deleteQubiTaskFromCalendar(eventId: string): Promise<boolean> {
  const Calendar = await getCalendarModule();
  if (!Calendar) return false;
  try {
    await Calendar.deleteEventAsync(eventId);
    return true;
  } catch {
    try {
      await Calendar.deleteReminderAsync(eventId);
      return true;
    } catch {
      return false;
    }
  }
}
