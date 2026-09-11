/**
 * iOS Home Screen Quick Actions — long-press the Qubi app icon.
 *
 * Registers two shortcuts per spec:
 *   • snap_proof  — jump straight into the camera proof flow
 *   • view_stats  — open the Ranks / stats tab
 *
 * Uses `expo-quick-actions` (SDK 57 compatible). All access is lazy + guarded
 * so the app never crashes in Expo Go, where quick actions are unavailable.
 */
import { Platform } from 'react-native';

export type QuickActionId = 'snap_proof' | 'view_stats';

const ACTIONS = [
  {
    id: 'snap_proof' as const,
    title: 'Snap Proof',
    subtitle: 'Verify a quest in one tap',
    icon: 'symbol:camera.fill',
  },
  {
    id: 'view_stats' as const,
    title: 'View Stats',
    subtitle: 'See your rank & streak',
    icon: 'symbol:chart.bar.fill',
  },
];

/**
 * Registers the two quick actions with iOS. Safe to call at every launch —
 * `setItems` overwrites the previous list and no-ops when the native module
 * is missing (Expo Go, Android before adaptive icon).
 */
export async function registerQuickActions(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const QA = require('expo-quick-actions') as {
      setItems: (items: unknown[]) => Promise<void>;
      isSupported?: () => Promise<boolean>;
    };
    if (QA.isSupported != null) {
      const ok = await QA.isSupported();
      if (!ok) return;
    }
    await QA.setItems(ACTIONS);
  } catch {
    // Native module unavailable (Expo Go) — silently no-op.
  }
}

/**
 * Subscribes to quick-action taps and forwards the id to the supplied handler.
 * Returns an unsubscribe function.
 */
export function subscribeQuickActions(handler: (id: QuickActionId) => void): () => void {
  if (Platform.OS !== 'ios') return () => {};
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const QA = require('expo-quick-actions') as {
      addListener: (cb: (action: { id: string }) => void) => { remove: () => void };
      initial?: { id?: string } | undefined;
    };
    const sub = QA.addListener((a) => {
      if (a?.id === 'snap_proof' || a?.id === 'view_stats') handler(a.id);
    });
    // Cold-launch case: the app was launched via a quick action, so the
    // listener registered above misses that initial fire — replay it once.
    try {
      const initialId = QA.initial?.id;
      if (initialId === 'snap_proof' || initialId === 'view_stats') {
        // Defer to next tick so React can finish mounting first.
        setTimeout(() => handler(initialId as QuickActionId), 0);
      }
    } catch {}
    return () => {
      try { sub.remove(); } catch {}
    };
  } catch {
    return () => {};
  }
}
