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
  EXPO_PUBLIC_OPENROUTER_API_KEY: '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',
  EXPO_PUBLIC_OPENROUTER_MODEL: 'nvidia/nemotron-3.5-lightning:free',
  EXPO_PUBLIC_OPENROUTER_VISION_MODEL: 'google/gemma-3-27b-it:free',
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

/** Resolves an EXPO_PUBLIC_* value with hardcoded fallback for Release IPAs. */
export function envValue(key: string, fallback = ''): string {
  const processValue = process.env[key];
  if (processValue != null && processValue !== '') return processValue;
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
  /** Never empty in Release builds — falls back to the embedded project key. */
  get openRouterKey(): string {
    return envValue('EXPO_PUBLIC_OPENROUTER_API_KEY');
  },
  get openRouterModel(): string {
    return envValue('EXPO_PUBLIC_OPENROUTER_MODEL', 'nvidia/nemotron-3.5-lightning:free');
  },
  get openRouterVisionModel(): string {
    return envValue('EXPO_PUBLIC_OPENROUTER_VISION_MODEL', 'google/gemma-3-27b-it:free');
  },
} as const;
