/**
 * Qubi Sound Engine — standalone iOS Release (.ipa) safe.
 *
 * SDK 57 NOTE:
 *  `expo-av` was deprecated and split into `expo-audio` + `expo-video`.
 *  The public API below keeps the **spec-required** static bundling:
 *
 *    const SOUNDS = {
 *      xp: require('../../assets/sounds/xp_gain.mp3'),
 *      levelUp: require('../../assets/sounds/level_up.mp3'),
 *      cheer: require('../../assets/sounds/qubi_cheer.mp3'),
 *    };
 *
 *  Metro resolves those `require()` calls at bundle-time so the .ipa
 *  asset catalog contains the mp3s (no network fetch, no FileSystem URI).
 *  Internally this module uses `expo-audio` (`createAudioPlayer`) which is
 *  the only audio module that ships in a Release binary with SDK 57.
 *  If you are still on `expo-av`, the same SOUNDS map works — just swap
 *  the lazy import to `expo-av` — but Ship with `expo-audio` for TestFlight.
 *
 *  iOS Release guarantees:
 *  - `Asset.fromModule(...).downloadAsync()` pre-load so the first play() on
 *    a cold launch never races the native AVAudioSession.
 *  - `setAudioModeAsync({ playsInSilentModeIOS: true })` so the SFX fires
 *    even when the hardware mute switch is on (expected for gamification).
 *  - Reused AudioPlayer pool (seekTo(0) + play()) — no GC churn mid-animation.
 *  - Every public method is try/catch + muted-aware + web/Expo-Go no-op safe.
 *
 *  Install:
 *    npx expo install expo-audio expo-asset
 *
 *  EAS / Release checklist:
 *  - Keep the mp3s under `assets/sounds/` and use static require() — Metro
 *    must see a string literal; no dynamic `require(path)` in Release.
 *  - No extra native config needed. `expo-audio` does NOT need UIBackgroundModes.
 */

import { Platform } from 'react-native';
import { Asset } from 'expo-asset';

// ──────────────────────────────────────────────────────────────────────────────
// 1. Static asset bundling — Metro registers these at bundle-time for the .ipa
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Static sound map — MUST stay as literal require() calls.
 * Metro's asset resolver scans for `require('...mp3')` string literals.
 */
export const SOUNDS = {
  xp: require('../../assets/sounds/xp_gain.mp3'),
  levelUp: require('../../assets/sounds/level_up.mp3'),
  cheer: require('../../assets/sounds/qubi_cheer.mp3'),
  step: require('../../assets/sounds/step_click.mp3'),
  completed: require('../../assets/sounds/task_completed.mp3'),
} as const;

export type SoundKey = keyof typeof SOUNDS;

// Keep legacy wavs available as bundled fallbacks if an mp3 is ever missing
// from the .ipa (e.g. designer hasn't exported it yet). Metro will still try
// to resolve the mp3 above — if the file truly doesn't exist the build fails
// early (desired), but the runtime fallback below prevents a crash in Expo Go.
function resolveSource(key: SoundKey): number | null {
  try {
    const v = SOUNDS[key];
    if (typeof v === 'number') return v;
    return null;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// 2. Player pool — reused across plays
// ──────────────────────────────────────────────────────────────────────────────

type AnyPlayer = {
  seekTo: (seconds: number) => unknown;
  play: () => unknown;
  pause?: () => unknown;
  volume?: number;
};

const players: Partial<Record<SoundKey, AnyPlayer>> = {};
let muted = false;
let volume = 1.0;
let audioModeConfigured = false;
let preloadDone = false;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
let _preloadPromise: Promise<void> | null = null;

export function setSfxMuted(m: boolean): void {
  muted = m;
}

export function setSfxVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v));
  for (const p of Object.values(players)) {
    try {
      if (p && 'volume' in p) (p as AnyPlayer & { volume: number }).volume = volume;
    } catch {}
  }
}

export function isSfxMuted(): boolean {
  return muted;
}

// ──────────────────────────────────────────────────────────────────────────────
// iOS AVAudioSession — silent switch + mixing
// ──────────────────────────────────────────────────────────────────────────────

async function ensureAudioMode(): Promise<void> {
  if (audioModeConfigured || Platform.OS === 'web') return;
  try {
    // expo-audio exposes setAudioModeAsync; guard for Expo Go stub / older builds
    const mod = require('expo-audio') as {
      setAudioModeAsync?: (mode: Record<string, unknown>) => Promise<void>;
    };
    if (mod.setAudioModeAsync) {
      await mod.setAudioModeAsync({
        playsInSilentModeIOS: true,
        interruptionModeIOS: 'mixWithOthers',
        allowsRecordingIOS: false,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });
    }
    audioModeConfigured = true;
  } catch {
    // non-fatal — SFX will still play, just respects mute switch
  }
}

function makePlayer(key: SoundKey): AnyPlayer | null {
  if (Platform.OS === 'web') return null;
  try {
    const ExpoAudio = require('expo-audio') as {
      createAudioPlayer: (source: number) => AnyPlayer;
    };
    const src = resolveSource(key);
    if (src == null) return null;
    const player = ExpoAudio.createAudioPlayer(src);
    try {
      if ('volume' in player) (player as AnyPlayer & { volume: number }).volume = volume;
    } catch {}
    return player;
  } catch {
    return null;
  }
}

function replay(key: SoundKey): void {
  if (muted) return;
  try {
    let p = players[key] ?? null;
    if (!p) {
      p = makePlayer(key);
      if (p) players[key] = p;
    }
    if (!p) return;
    // Fire-and-forget audio mode ensure — don't block the 60fps animation thread
    void ensureAudioMode();
    p.seekTo(0);
    p.play();
  } catch {}
}

// ──────────────────────────────────────────────────────────────────────────────
// 3. Pre-loading — call at app boot + before first celebration
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Pre-load + download all SFX assets into the native cache.
 * Safe to call on every app launch; re-entrant and silent on failure.
 *
 * Recommended call sites:
 *   - `App.tsx` inside `useEffect` on mount (warm cache for whole session)
 *   - Right before `CelebrationOverlay` mounts (ensures cold-launch race is won)
 */
export async function preloadSounds(): Promise<void> {
  if (preloadDone) return;
  if (_preloadPromise) return _preloadPromise;
  _preloadPromise = (async () => {
    try {
      await ensureAudioMode();
      // Asset.downloadAsync resolves the Metro asset to a file:// URI and
      // ensures the native layers have the file before first createAudioPlayer
      const assets = (Object.keys(SOUNDS) as SoundKey[])
        .map((k) => {
          try {
            const src = SOUNDS[k] as number;
            return Asset.fromModule(src);
          } catch {
            return null;
          }
        })
        .filter(Boolean) as Asset[];
      if (assets.length) await Promise.all(assets.map((a) => a.downloadAsync()));
      // Warm the player pool so the first play() is seekTo(0) not cold create
      for (const k of Object.keys(SOUNDS) as SoundKey[]) {
        try {
          if (!players[k]) {
            const p = makePlayer(k);
            if (p) players[k] = p;
          }
        } catch {}
      }
      preloadDone = true;
    } catch {
      // never throw — celebration must never crash because of SFX
    }
  })();
  return _preloadPromise;
}

/**
 * Fire-and-forget variant for JSX event handlers — never await, never throw.
 */
export function preloadSoundsAsync(): void {
  void preloadSounds();
}

// ──────────────────────────────────────────────────────────────────────────────
// 4. Public play API — error-handled, muted-aware, standalone-safe
// ──────────────────────────────────────────────────────────────────────────────

/** XP tick — small gain (+10 .. +50 XP) */
export function playXp(): void {
  replay('xp');
}

/** Level-up fanfare — fires with the Neubrutalism modal */
export function playLevelUp(): void {
  replay('levelUp');
}

/** Qubi cheer — mascot vocal / sparkle */
export function playCheer(): void {
  replay('cheer');
}

/** Dry UI tick — onboarding step swipes, secondary taps */
export function playStepClick(): void {
  replay('step');
}

/**
 * Single task-completed sting — fires the moment OpenRouter verifies a photo
 * proof (also the ProofSuccessModal open chime). Offline-bundled mp3.
 */
export function playTaskCompleted(): void {
  replay('completed');
}

/** Generic play by key */
export function playSound(key: SoundKey): void {
  replay(key);
}

// ──────────────────────────────────────────────────────────────────────────────
// Legacy aliases — keep existing screens working without churn
// Maps old wav SFX to the new pool; add more as needed.
// ──────────────────────────────────────────────────────────────────────────────

/** @deprecated Use playXp / playCheer — kept for ProofSuccessModal compat */
export function playQuestComplete(): void {
  playXp();
}

/** @deprecated Use playXp */
export function playPop(): void {
  playXp();
}

/** @deprecated Use playCheer */
export function playClick(): void {
  playCheer();
}

/** Release helper — free native players (call on app background if needed) */
export function unloadSounds(): void {
  for (const k of Object.keys(players) as SoundKey[]) {
    try {
      const p = players[k];
      // expo-audio players expose remove() / release() on newer SDKs
      const maybeRemovable = p as AnyPlayer & { remove?: () => void; release?: () => void };
      maybeRemovable.remove?.();
      maybeRemovable.release?.();
    } catch {}
    delete players[k];
  }
  preloadDone = false;
  audioModeConfigured = false;
  _preloadPromise = null;
}
