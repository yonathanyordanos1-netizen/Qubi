import Constants from 'expo-constants';

/**
 * Resolves environment config from EXPO_PUBLIC_* env vars and reports whether
 * real backend credentials are present. With placeholder values the app runs
 * in a fully offline DEMO mode so development never hits a network.
 * Ported from AppConfig in supabase_service.dart.
 *
 * Resolution order (highest wins):
 *   1. process.env.EXPO_PUBLIC_* — injected by the bundler when the .env file
 *      is present at build time.
 *   2. Constants.expoConfig.extra.EXPO_PUBLIC_* — committed in app.json so the
 *      shipped binary always carries real credentials even though .env itself
 *      is gitignored (and therefore absent on the CI build runner).
 *   3. Built-in defaults below — mirror the values in .env in case the runtime
 *      has neither env vars nor an extra block.
 */
const PLACEHOLDER_URL = 'https://YOUR-PROJECT.supabase.co';

const BUILTIN_DEFAULTS: Record<string, string> = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://qnbrrxwctokuwxglcdjd.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_qTECh9PHTWpUUUVZeSjoCw_k9vzYCaj',
  EXPO_PUBLIC_OPENROUTER_API_KEY: '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',
  EXPO_PUBLIC_OPENROUTER_VISION_MODEL: 'google/gemma-3-27b-it:free',
};

function extraValue(key: string): string {
  try {
    const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
    const v = extra?.[`EXPO_PUBLIC_${key}`];
    return typeof v === 'string' && v.length > 0 ? v : '';
  } catch {
    return '';
  }
}

const env = (key: string, fallback = ''): string => {
  const processValue = process.env[`EXPO_PUBLIC_${key}`];
  if (processValue != null && processValue !== '') return processValue;
  const fromExtra = extraValue(key);
  if (fromExtra.length > 0) return fromExtra;
  const builtin = BUILTIN_DEFAULTS[`EXPO_PUBLIC_${key}`];
  if (builtin != null && builtin.length > 0) return builtin;
  return fallback;
};

export const AppConfig = {
  get supabaseUrl(): string {
    return env('SUPABASE_URL');
  },
  get supabaseAnonKey(): string {
    return env('SUPABASE_ANON_KEY');
  },
  get openRouterKey(): string {
    return env('OPENROUTER_API_KEY');
  },
  get openRouterModel(): string {
    return env('OPENROUTER_MODEL', 'nvidia/nemotron-3.5-lightning:free');
  },
  get openRouterVisionModel(): string {
    return env('OPENROUTER_VISION_MODEL', 'google/gemma-3-27b-it:free');
  },
  get updateServerUrl(): string {
    return env('UPDATE_SERVER_URL', 'https://Qubi-updates.example.com');
  },
  /** Supabase Edge Function that proxies OpenRouter vision (key stays server-side). */
  get verifyFunctionUrl(): string {
    return env('VERIFY_FUNCTION_URL', '');
  },

  /** True when the app should talk to a real Supabase project. */
  get supabaseConfigured(): boolean {
    const url = this.supabaseUrl;
    const key = this.supabaseAnonKey;
    return (
      url.length > 0 &&
      key.length > 0 &&
      url !== PLACEHOLDER_URL &&
      !key.startsWith('your-')
    );
  },

  /** True when a real OpenRouter key is present (sk-or-v1- + hex suffix). */
  get aiConfigured(): boolean {
    return /^sk-or-v1-[a-f0-9]{20,}$/.test(this.openRouterKey);
  },
} as const;

export type SupabaseRow = Record<string, unknown>;
