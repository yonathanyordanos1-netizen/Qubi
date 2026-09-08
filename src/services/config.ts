import { Env, envValue } from '../config/env';

/**
 * App-wide config facade (re-exports the canonical env module).
 *
 * Resolution order (highest wins):
 *   1. process.env.EXPO_PUBLIC_* — bundler-injected.
 *   2. Constants.expoConfig.extra.EXPO_PUBLIC_* — committed in app.json.
 *   3. Hardcoded fallbacks in src/config/env.ts — guarantee Release .ipa
 *      builds never boot with empty credentials when process.env is empty
 *      in compiled production bundles.
 */

const PLACEHOLDER_URL = 'https://YOUR-PROJECT.supabase.co';

export const AppConfig = {
  get supabaseUrl(): string {
    return Env.supabaseUrl;
  },
  get supabaseAnonKey(): string {
    return Env.supabaseAnonKey;
  },
  get openRouterKey(): string {
    return Env.openRouterKey;
  },
  get openRouterModel(): string {
    return Env.openRouterModel;
  },
  get openRouterVisionModel(): string {
    return Env.openRouterVisionModel;
  },
  get updateServerUrl(): string {
    return envValue('EXPO_PUBLIC_UPDATE_SERVER_URL', 'https://Qubi-updates.example.com');
  },
  /** Supabase Edge Function that proxies OpenRouter vision (key stays server-side). */
  get verifyFunctionUrl(): string {
    return envValue('EXPO_PUBLIC_VERIFY_FUNCTION_URL', '');
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
