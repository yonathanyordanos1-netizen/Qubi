import Constants from 'expo-constants';

/**
 * Canonical environment module (standalone IPA-safe).
 *
 * Release-compiled binaries ship without a `.env` file, so every key resolves
 * through three tiers (highest wins):
 *   1. process.env.EXPO_PUBLIC_* — injected by the bundler for dev/EAS builds
 *      that have env vars or an `.env` file present at build time.
 *   2. Constants.expoConfig.extra.EXPO_PUBLIC_* — committed in app.json so the
 *      shipped .ipa always carries real credentials.
 *   3. Hardcoded fallbacks below — guarantee the Release binary never boots
 *      with empty Supabase / OpenRouter credentials when both tiers above are
 *      missing (e.g. `process.env` is empty in compiled production bundles).
 */

const BUILTIN_FALLBACKS: Record<string, string> = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://qnbrrxwctokuwxglcdjd.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_qTECh9PHTWpUUUVZeSjoCw_k9vzYCaj',
  EXPO_PUBLIC_OPENROUTER_MODEL: 'nex-agi/nex-n2.5-mini:free',
  EXPO_PUBLIC_OPENROUTER_VISION_MODEL: 'google/gemma-4-26b-a4b-it:free',
};

function extraValue(key: string): string {
  try {
    const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
    const v = extra?.[key];
    return typeof v === 'string' && v.length > 0 ? v : '';
  } catch {
    return '';
  }
}

/**
 * Tier-1 values — STATIC member expressions on purpose.
 *
 * The Expo babel plugin inlines `process.env.EXPO_PUBLIC_*` at bundle time,
 * but ONLY for static access (`process.env.FOO`). Dynamic access
 * (`process.env[key]`) survives into the Release binary where `process.env`
 * is empty — which is exactly why CI secrets previously never reached the
 * shipped .ipa. Every key the app needs is therefore read once here,
 * statically, so the GitHub Actions secrets are baked into the bundle.
 * Values are `string | undefined`; empty means "tier not present".
 */
const INLINE_SUPABASE_URL: string | undefined = process.env.EXPO_PUBLIC_SUPABASE_URL;
const INLINE_SUPABASE_ANON_KEY: string | undefined = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const INLINE_OPENROUTER_API_KEY: string | undefined = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY;
const INLINE_OPENROUTER_MODEL: string | undefined = process.env.EXPO_PUBLIC_OPENROUTER_MODEL;
const INLINE_OPENROUTER_VISION_MODEL: string | undefined =
  process.env.EXPO_PUBLIC_OPENROUTER_VISION_MODEL;
const INLINE_NVIDIA_API_KEY: string | undefined = process.env.EXPO_PUBLIC_NVIDIA_API_KEY;

const INLINE_TIER: Record<string, string | undefined> = {
  EXPO_PUBLIC_SUPABASE_URL: INLINE_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: INLINE_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_OPENROUTER_API_KEY: INLINE_OPENROUTER_API_KEY,
  EXPO_PUBLIC_OPENROUTER_MODEL: INLINE_OPENROUTER_MODEL,
  EXPO_PUBLIC_OPENROUTER_VISION_MODEL: INLINE_OPENROUTER_VISION_MODEL,
  EXPO_PUBLIC_NVIDIA_API_KEY: INLINE_NVIDIA_API_KEY,
};

/** Resolves an EXPO_PUBLIC_* value with hardcoded fallback for Release IPAs. */
export function envValue(key: string, fallback = ''): string {
  const inline = INLINE_TIER[key];
  if (inline != null && inline !== '') return inline;
  const fromExtra = extraValue(key);
  if (fromExtra.length > 0) return fromExtra;
  const builtin = BUILTIN_FALLBACKS[key];
  if (builtin != null && builtin.length > 0) return builtin;
  return fallback;
}

export const Env = {
  get supabaseUrl(): string {
    return envValue('EXPO_PUBLIC_SUPABASE_URL');
  },
  get supabaseAnonKey(): string {
    return envValue('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  },
  /** Injected by the bundler from the EXPO_PUBLIC_OPENROUTER_API_KEY build env
   *  (set in .github/workflows/build-ipa.yml from the repo secret). Empty when
   *  unconfigured — secret scanners block committing sk-or-v1- keys. */
  get openRouterKey(): string {
    return envValue('EXPO_PUBLIC_OPENROUTER_API_KEY');
  },
  get openRouterModel(): string {
    return envValue('EXPO_PUBLIC_OPENROUTER_MODEL', 'nex-agi/nex-n2.5-mini:free');
  },
  get openRouterVisionModel(): string {
    return envValue('EXPO_PUBLIC_OPENROUTER_VISION_MODEL', 'google/gemma-4-26b-a4b-it:free');
  },
  /**
   * NVIDIA NIM key (nvapi-…). Deliberately NO hardcoded fallback: secret
   * scanners block nvapi- keys in git. Supplied via .env locally and the
   * EXPO_PUBLIC_NVIDIA_API_KEY GitHub Actions secret in Release builds.
   * Empty string when unconfigured — the AI engine then races OpenRouter only.
   */
  get nvidiaKey(): string {
    return envValue('EXPO_PUBLIC_NVIDIA_API_KEY');
  },
  /** True when the NVIDIA leg of the AI race can run. */
  get nvidiaConfigured(): boolean {
    return this.nvidiaKey.startsWith('nvapi-') && this.nvidiaKey.length > 20;
  },
} as const;
