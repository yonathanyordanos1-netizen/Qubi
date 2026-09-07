/**
 * Qubi SFX — expo-audio player pool.
 *
 * `expo-av` was removed from the Expo SDK (split into expo-video + expo-audio),
 * so SDK 57 apps use expo-audio. Sounds are bundled via static require() so
 * Metro registers them as assets; players are created lazily on first use and
 * reused across plays (seekTo(0) + play()) to avoid object churn.
 *
 * Every method is defensive: on web, Expo Go stubs, or missing files it
 * silently no-ops so audio never breaks the reward flow.
 */
import { Platform } from 'react-native';

type AnyPlayer = {
  seekTo: (seconds: number) => unknown;
  play: () => unknown;
};

let questComplete: AnyPlayer | null = null;
let pop: AnyPlayer | null = null;
let click: AnyPlayer | null = null;

let muted = false;
/** Master mute — wire to settings if SFX get their own toggle later. */
export function setSfxMuted(m: boolean): void {
  muted = m;
}

function tryRequire(name: string): number | null {
  try {
    // Static strings so Metro's asset resolver picks them up at bundle time.
    if (name === 'quest_complete') return require('../../assets/sounds/quest_complete.wav');
    if (name === 'pop') return require('../../assets/sounds/pop.wav');
    if (name === 'click') return require('../../assets/sounds/click.wav');
    return null;
  } catch {
    return null;
  }
}

function makePlayer(name: string): AnyPlayer | null {
  if (Platform.OS === 'web') return null;
  try {
    // Lazy require keeps expo-audio out of the critical boot path and lets the
    // app run in environments where the native module is unavailable.
    const ExpoAudio = require('expo-audio') as {
      createAudioPlayer: (source: number) => AnyPlayer;
    };
    const src = tryRequire(name);
    if (src == null) return null;
    return ExpoAudio.createAudioPlayer(src);
  } catch {
    return null;
  }
}

function replay(p: AnyPlayer | null): void {
  if (p == null || muted) return;
  try {
    p.seekTo(0);
    p.play();
  } catch {}
}

/** Crisp Duolingo-like success chime — fires when the reward modal opens. */
export function playQuestComplete(): void {
  if (questComplete == null) questComplete = makePlayer('quest_complete');
  replay(questComplete);
}

/** Soft bubble-pop for the primary CONTINUE button. */
export function playPop(): void {
  if (pop == null) pop = makePlayer('pop');
  replay(pop);
}

/** Dry UI tick for the secondary button. */
export function playClick(): void {
  if (click == null) click = makePlayer('click');
  replay(click);
}
