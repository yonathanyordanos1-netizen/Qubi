/**
 * Home Screen widget sync (production IPA, iOS).
 *
 * `expo-widgets` shares data with the widget extension through the App Group
 * (`group.com.qubi.app`) whenever `updateSnapshot` / `updateTimeline` is
 * called — no third-party shared-preferences bridge needed. The widget source
 * lives in `widgets/QubiWidget.tsx` (name must match the `expo-widgets`
 * config-plugin entry in app.json).
 *
 * Everything here is defensive: the native module only exists in production /
 * dev-client builds, so all access is lazy and every failure no-ops (the app
 * must never crash in Expo Go, where widgets are unavailable).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface WidgetStats {
  xp: number;
  streak: number;
  level: number;
  /** Mon–Fri verification flags for the widget week-dot row. */
  week?: boolean[];
  /** Whether today already has a verified quest (drives the at-risk theme). */
  todayDone?: boolean;
}

export interface WidgetPayload {
  streak: number;
  xp: number;
  level: number;
  status: string;
  week: boolean[];
  todayDone: boolean;
}

const STORAGE_KEY = 'qubi_widget_stats_v1';

const EMPTY_WEEK = [false, false, false, false, false];

function normalizeWeek(week: boolean[] | undefined): boolean[] {
  return Array.from({ length: 5 }, (_, i) => week?.[i] === true);
}

/** Builds Qubi's motivational subtitle from live stats. */
export function statusForStats(stats: WidgetStats): string {
  const streak = Math.max(0, Math.floor(stats.streak));
  if (streak <= 0) return "Let's start day one!";
  if (stats.todayDone === false) return "Don't break the chain!";
  if (streak === 1) return 'Day one done — protect it!';
  if (streak < 7) return 'Building the habit!';
  if (streak < 30) return "You're on fire!";
  return 'Unstoppable!';
}

type WidgetModule = {
  default: {
    updateSnapshot: (props: Record<string, unknown>) => void;
    reload: () => void;
  };
};

let widgetModule: WidgetModule | null | undefined;

function loadWidget(): WidgetModule | null {
  if (widgetModule !== undefined) return widgetModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    widgetModule = require('../../widgets/QubiWidget') as WidgetModule;
  } catch {
    widgetModule = null;
  }
  return widgetModule;
}

/**
 * Pushes live stats to the iOS Home Screen widget (small + medium) and caches
 * them locally so the next cold start can restore the widget instantly.
 */
export async function syncStatsToWidget(stats: WidgetStats): Promise<void> {
  const payload: WidgetPayload = {
    streak: Math.max(0, Math.floor(stats.streak)),
    xp: Math.max(0, Math.floor(stats.xp)),
    level: Math.max(1, Math.floor(stats.level)),
    status: statusForStats(stats),
    week: normalizeWeek(stats.week),
    todayDone: stats.todayDone === true,
  };
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...payload, updatedAt: Date.now() }));
  } catch {}
  try {
    loadWidget()?.default.updateSnapshot({ ...payload });
  } catch {}
}

/** Re-pushes the last cached stats (e.g. on cold start before Supabase loads). */
export async function restoreWidgetSnapshot(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw == null) return;
    const cached = JSON.parse(raw) as Partial<WidgetPayload & WidgetStats>;
    if (typeof cached.xp !== 'number' || typeof cached.streak !== 'number') return;
    const level =
      typeof cached.level === 'number' ? cached.level : 1 + Math.floor(cached.xp / 500);
    loadWidget()?.default.updateSnapshot({
      streak: cached.streak,
      xp: cached.xp,
      level,
      status: statusForStats({ xp: cached.xp, streak: cached.streak, level }),
      week: normalizeWeek(cached.week),
      todayDone: cached.todayDone === true,
    });
  } catch {}
}
