/**
 * Home Screen widget sync (production IPA, iOS).
 *
 * `expo-widgets` shares data with the widget extension through the App Group
 * (`group.com.qubi.app`) whenever `updateSnapshot` / `updateTimeline` is
 * called — no third-party shared-preferences bridge needed. The widget source
 * lives in `widgets/QubiWidget.tsx` (name must match the `expo-widgets`
 * config-plugin entry in app.json).
 *
 * The widget also renders the real Qubi mascot: on first sync we copy
 * `Qubi/Qubi.png` into the App Group container directory exposed by
 * `expo-widgets` (`widgetsDirectory`) and pass its absolute `file://` URI as a
 * prop — the widget extension reads it from the very same shared container.
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
  /** Mon–Sun verification flags for the widget week-dot row. */
  week?: boolean[];
  /** Whether today already has a verified quest (drives the at-risk theme). */
  todayDone?: boolean;
  /** Number of quests verified today (shown on the large widget). */
  questsDoneToday?: number;
}

export interface WidgetPayload {
  streak: number;
  xp: number;
  level: number;
  status: string;
  week: boolean[];
  todayDone: boolean;
  questsDoneToday: number;
  mascotUri?: string;
}

const STORAGE_KEY = 'qubi_widget_stats_v2';
const MASCOT_COPIED_KEY = 'qubi_widget_mascot_copied_v1';

const EMPTY_WEEK = [false, false, false, false, false, false, false];

function normalizeWeek(week: boolean[] | undefined): boolean[] {
  return Array.from({ length: 7 }, (_, i) => week?.[i] === true);
}

/** Builds Qubi's motivational subtitle from live stats (Duolingo voice). */
export function statusForStats(stats: WidgetStats): string {
  const streak = Math.max(0, Math.floor(stats.streak));
  if (streak <= 0) return "Let's flex that brain!";
  if (stats.todayDone === false) return 'Houston, we have a problem!';
  if (streak === 1) return 'Day one done — protect it!';
  if (streak < 7) return 'Building the habit!';
  if (streak < 30) return "It's a bird, it's a plane! IT'S QUBI!";
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

/** `expo-widgets` exposes `widgetsDirectory`; null outside a native build. */
function safeWidgetsDirectory(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { widgetsDirectory } = require('expo-widgets') as { widgetsDirectory?: string };
    return typeof widgetsDirectory === 'string' && widgetsDirectory.length > 0 ? widgetsDirectory : null;
  } catch {
    return null;
  }
}

/**
 * Copies the Qubi mascot PNG into the App Group `ExpoWidgets` directory so the
 * widget extension can render the real mascot. Runs at most once per install
 * (flag cached in AsyncStorage); returns the shared file URI or null.
 */
async function ensureMascotInAppGroup(): Promise<string | null> {
  try {
    const widgetsDirectory = safeWidgetsDirectory();
    if (widgetsDirectory == null) return null;

    // expo-file-system SDK 57 removed the legacy `copyAsync`/`makeDirectoryAsync`
    // free functions (they now throw at runtime). Use the object-oriented
    // `File` / `Directory` API instead — otherwise the copy silently fails and
    // the widget falls back to the 🦖 emoji forever.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { File, Directory } = require('expo-file-system') as {
      File: new (...uris: (string | object)[]) => { uri: string; exists: boolean; copy: (dest: object) => Promise<void> };
      Directory: new (...uris: (string | object)[]) => { uri: string; exists: boolean; create: (opts?: { intermediates?: boolean; idempotent?: boolean }) => void };
    };

    const dir = new Directory(widgetsDirectory);
    const target = new File(dir, 'qubi-mascot.png');

    // Fast path: already copied on a previous launch.
    if (target.exists) {
      await AsyncStorage.setItem(MASCOT_COPIED_KEY, '1').catch(() => {});
      return target.uri;
    }

    // Ensure the shared App Group directory exists (idempotent — never throws
    // if WidgetKit already created it).
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });

    const { Asset } = require('expo-asset') as {
      Asset: { fromModule: (id: number) => { downloadAsync: () => Promise<{ localUri: string | null; uri: string }> } };
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const assetModuleId = require('../../Qubi/Qubi.png') as number;
    const asset = Asset.fromModule(assetModuleId);
    const local = await asset.downloadAsync();
    const srcUri = local.localUri ?? local.uri;
    if (srcUri == null || srcUri.length === 0) return null;

    const src = new File(srcUri);
    await src.copy(target);
    await AsyncStorage.setItem(MASCOT_COPIED_KEY, '1').catch(() => {});
    return target.exists ? target.uri : null;
  } catch {
    return null;
  }
}

function pushToNative(payload: WidgetPayload): void {
  try {
    const widget = loadWidget()?.default;
    if (widget == null) return;
    widget.updateSnapshot({ ...payload });
    // Nudge WidgetKit so already-added widgets refresh immediately instead of
    // waiting for the system's next reload budget.
    widget.reload();
  } catch {}
}

/**
 * Pushes live stats to the iOS Home Screen widgets (small + medium + large)
 * and caches them locally so the next cold start can restore instantly.
 */
export async function syncStatsToWidget(stats: WidgetStats): Promise<void> {
  const mascotUri = (await ensureMascotInAppGroup()) ?? undefined;
  const payload: WidgetPayload = {
    streak: Math.max(0, Math.floor(stats.streak)),
    xp: Math.max(0, Math.floor(stats.xp)),
    level: Math.max(1, Math.floor(stats.level)),
    status: statusForStats(stats),
    week: normalizeWeek(stats.week),
    todayDone: stats.todayDone === true,
    questsDoneToday: Math.max(0, Math.floor(stats.questsDoneToday ?? 0)),
    mascotUri,
  };
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...payload, updatedAt: Date.now() }));
  } catch {}
  pushToNative(payload);
}

/** Re-pushes the last cached stats (e.g. on cold start before Supabase loads). */
export async function restoreWidgetSnapshot(): Promise<void> {
  try {
    const mascotUri = (await ensureMascotInAppGroup()) ?? undefined;
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw == null) {
      // Fresh install: push a friendly default so the widget gallery preview
      // and any already-added widget show real content immediately.
      pushToNative({
        streak: 0,
        xp: 0,
        level: 1,
        status: statusForStats({ streak: 0, xp: 0, level: 1 }),
        week: EMPTY_WEEK,
        todayDone: false,
        questsDoneToday: 0,
        mascotUri,
      });
      return;
    }
    const cached = JSON.parse(raw) as Partial<WidgetPayload & WidgetStats>;
    if (typeof cached.xp !== 'number' || typeof cached.streak !== 'number') return;
    const level =
      typeof cached.level === 'number' ? cached.level : 1 + Math.floor(cached.xp / 500);
    pushToNative({
      streak: cached.streak,
      xp: cached.xp,
      level,
      status: statusForStats({
        xp: cached.xp,
        streak: cached.streak,
        level,
        todayDone: cached.todayDone === true,
      }),
      week: normalizeWeek(cached.week),
      todayDone: cached.todayDone === true,
      questsDoneToday: Math.max(0, Math.floor(cached.questsDoneToday ?? 0)),
      mascotUri: cached.mascotUri ?? mascotUri,
    });
  } catch {}
}
