/**
 * Resolves environment config from EXPO_PUBLIC_* env vars and reports whether
 * real backend credentials are present. With placeholder values the app runs
 * in a fully offline DEMO mode so development never hits a network.
 * Ported from AppConfig in supabase_service.dart.
 */
const PLACEHOLDER_URL = 'https://YOUR-PROJECT.supabase.co';

const env = (key: string, fallback = ''): string => {
  const v = process.env[`EXPO_PUBLIC_${key}`];
  return v != null && v !== '' ? v : fallback;
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
