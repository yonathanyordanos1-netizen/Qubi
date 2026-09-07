import { AppConfig } from './config';
import { supabase } from './supabase';
import * as Crypto from 'expo-crypto';

/**
 * Dedicated auth service for the sign-up → OTP → session pipeline.
 * Ported from SupabaseAuthService in supabase_service.dart.
 *
 * Two transports:
 *  1. Native supabase-js email-OTP (signUpOrResendOtp / verifyOtpAndLogin /
 *     triggerResendCode) — the primary pipeline.
 *  2. Legacy `send-verification` Edge Function methods kept for the existing
 *     OtpVerificationSheet flow.
 *
 * All exceptions are unmasked: raw AuthError/FetchError payloads are mapped
 * to human-readable messages before they reach the UI layer.
 */

const log = (...args: unknown[]) => {
  if (__DEV__) console.log('[auth]', ...args);
};

export type OtpStatus =
  | { status: 'code_sent' }
  | { status: 'already_verified' }
  | { status: 'rate_limited'; message: string }
  | { status: 'error'; message: string };

interface EdgeResponse {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
}

async function postEdgeFunction(payload: Record<string, unknown>): Promise<EdgeResponse> {
  const url = `${AppConfig.supabaseUrl}/functions/v1/send-verification`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: AppConfig.supabaseAnonKey,
      Authorization: `Bearer ${AppConfig.supabaseAnonKey}`,
    },
    body: JSON.stringify(payload),
  });
  let body: Record<string, unknown> = {};
  try {
    if (res.body != null) body = (await res.json()) as Record<string, unknown>;
  } catch {
    // empty or non-JSON body
  }
  return { ok: res.status === 200, status: res.status, body };
}

const networkMessage = 'Unable to reach the server — check your internet connection.';

/** Extracts an HTTP status code from any supabase-js error shape. */
function statusOf(e: unknown): number {
  const anyErr = e as { status?: number; statusCode?: number };
  return typeof anyErr?.status === 'number'
    ? anyErr.status
    : typeof anyErr?.statusCode === 'number'
      ? anyErr.statusCode
      : NaN;
}

/** Unmasks supabase-js / fetch exceptions into human-readable copy. */
export function humanizeAuthError(e: unknown): string {
  if (typeof e === 'string') return e;
  const msg = (e as { message?: string })?.message ?? '';
  const lower = msg.toLowerCase();
  const status = statusOf(e);

  if (e instanceof TypeError || lower.includes('fetch failed') || lower.includes('networkerror')) {
    return networkMessage;
  }
  if (status === 429 || lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Too many attempts — please wait a minute before requesting another code.';
  }
  if (status >= 500) {
    if (lower.includes('smtp') || lower.includes('email')) {
      return 'Our email service is having trouble right now. Please try again in a few minutes.';
    }
    return 'The server hit an unexpected error. Please try again shortly.';
  }
  if (lower.includes('invalid login')) return 'Incorrect email or password.';
  if (lower.includes('already registered') || lower.includes('user already')) {
    return 'An account with this email already exists — try signing in instead.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Your email isn\u2019t verified yet — we\u2019ve sent a fresh 6-digit code.';
  }
  if (lower.includes('password')) return msg; // weak-password copy is already user-friendly
  if (lower.includes('invalid email') || lower.includes('unable to validate email')) {
    return 'That email address doesn\u2019t look right — double-check it.';
  }
  if (lower.includes('expired or is invalid') || lower.includes('invalid or has expired') || lower.includes('expired or invalid')) {
    // Supabase merges both cases into one message ("Token has expired or is
    // invalid"). A freshly requested code that fails to verify was almost
    // certainly mistyped — say so instead of crying "expired".
    return 'This code is invalid — double-check the 6 digits from your latest email, then try again.';
  }
  if (lower.includes('token has expired') || lower.includes('expired')) {
    return 'This code has expired — tap "Resend code" for a new one.';
  }
  if (lower.includes('otp') && lower.includes('invalid')) {
    return 'That code isn\u2019t correct — check the latest email and try again.';
  }
  return msg.length > 0 ? msg : 'Something went wrong. Please try again.';
}

export class SupabaseAuthService {
  // ── Native Apple identity-token sign-in ─────────────────────────────────

  /**
   * Generates a random cryptographically-secure nonce and returns its SHA-256
   * hash. The hashed value is sent to Apple with the auth challenge; the raw
   * nonce is verified by Supabase during signInWithIdToken. This prevents
   * replay attacks against the identity token.
   */
  static async generateNonce(): Promise<{ raw: string; sha256: string }> {
    const raw = Crypto.randomUUID();
    const sha256 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
    return { raw, sha256 };
  }

  /**
   * Exchanges a native Apple identity token for a Supabase session using a
   * verified nonce. Returns null on success, or an error message on failure.
   */
  async signInWithIdToken(
    idToken: string,
    nonce: string,
    fullName?: string,
  ): Promise<string | null> {
    if (supabase == null) return 'Backend is not configured.';
    try {
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: idToken,
        nonce,
      });
      if (error != null) return error.message;
      if (fullName != null && fullName.length > 0) {
        const { data } = await supabase.auth.getUser();
        const userId = data?.user?.id ?? '';
        if (userId.length > 0) {
          await supabase.from('profiles').update({ display_name: fullName }).eq('id', userId);
        }
      }
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  // ── Native supabase-js OTP pipeline ─────────────────────────────────────

  /**
   * Signs up [email]/[password]; on success OR on an "already registered but
   * unverified" collision, automatically triggers a signup-code resend so a
   * verification email is always delivered.
   */
  async signUpOrResendOtp(email: string, password: string): Promise<OtpStatus> {
    if (supabase == null) {
      return { status: 'error', message: 'Backend is not configured — check your connection and try again.' };
    }
    const cleanEmail = email.trim().toLowerCase();
    try {
      const { data, error } = await supabase.auth.signUp({ email: cleanEmail, password });
      if (error != null) {
        const s = statusOf(error);
        log('signUp error:', error.message);
        // Existing account never verified → still deliver a code.
        if (
          s === 422 ||
          error.message.toLowerCase().includes('already registered') ||
          error.message.toLowerCase().includes('already been registered')
        ) {
          return this.triggerResendCode(cleanEmail);
        }
        if (s === 429) return { status: 'rate_limited', message: humanizeAuthError(error) };
        return { status: 'error', message: humanizeAuthError(error) };
      }
      if (data.user != null && data.session != null) {
        // Auto-confirm enabled on this project — verified & logged in already.
        return { status: 'already_verified' };
      }
      // signUp already sent the confirmation email (mailer_autoconfirm=false) — single email only
      log('signUp ok, OTP email sent to', cleanEmail);
      return { status: 'code_sent' };
    } catch (e) {
      log('signUp unexpected:', e);
      return { status: 'error', message: humanizeAuthError(e) };
    }
  }

  /**
   * Verifies a 6-digit signup token and persists the session locally so every
   * downstream call sees the logged-in user immediately.
   */
  async verifyOtpAndLogin(email: string, token: string): Promise<{ ok: boolean; message?: string }> {
    if (supabase == null) {
      return { ok: false, message: 'Backend is not configured — check your connection and try again.' };
    }
    const cleanEmail = email.trim().toLowerCase();
    const cleanToken = token.trim();
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanToken,
        type: 'signup',
      });
      if (error != null) {
        log('verifyOtp error:', error.message);
        return { ok: false, message: humanizeAuthError(error) };
      }
      if (data.session != null) {
        // Explicitly persist so all readers observe the fresh session at once.
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }
      return { ok: true };
    } catch (e) {
      log('verifyOtp unexpected:', e);
      return { ok: false, message: humanizeAuthError(e) };
    }
  }

  /**
   * Dedicated resend for the PASSWORDLESS email-OTP flow (user created via
   * signInWithOtp). Supabase has no `resend(type: 'email')` for this flow —
   * requesting a fresh OTP is the resend, and it invalidates older codes.
   */
  async resendOtpCode(email: string): Promise<OtpStatus> {
    if (supabase == null) {
      return { status: 'error', message: 'Backend is not configured — check your connection and try again.' };
    }
    const cleanEmail = email.trim().toLowerCase();
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: { shouldCreateUser: true },
      });
      if (error != null) {
        log('resendOtp error:', error.message);
        if (statusOf(error) === 429 || error.message.toLowerCase().includes('rate limit')) {
          return { status: 'rate_limited', message: humanizeAuthError(error) };
        }
        return { status: 'error', message: humanizeAuthError(error) };
      }
      return { status: 'code_sent' };
    } catch (e) {
      log('resendOtp unexpected:', e);
      return { status: 'error', message: humanizeAuthError(e) };
    }
  }

  /**
   * Verifies a 6-digit PASSWORDLESS (magic-link OTP) code and persists the
   * session. Pair with signInWithOtp — the verify type MUST be 'email'
   * (type 'signup' is only for password signUp confirmation codes).
   */
  async verifyEmailOtp(email: string, token: string): Promise<{ ok: boolean; message?: string }> {
    if (supabase == null) {
      return { ok: false, message: 'Backend is not configured — check your connection and try again.' };
    }
    const cleanEmail = email.trim().toLowerCase();
    const cleanToken = token.trim();
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanToken,
        type: 'email',
      });
      if (error != null) {
        log('verifyEmailOtp error:', error.message);
        return { ok: false, message: humanizeAuthError(error) };
      }
      if (data.session != null) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }
      return { ok: true };
    } catch (e) {
      log('verifyEmailOtp unexpected:', e);
      return { ok: false, message: humanizeAuthError(e) };
    }
  }

  /** Dedicated resend for the password-SIGNUP flow (user created via signUp). */
  async triggerResendCode(email: string): Promise<OtpStatus> {
    if (supabase == null) {
      return { status: 'error', message: 'Backend is not configured — check your connection and try again.' };
    }
    const cleanEmail = email.trim().toLowerCase();
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: cleanEmail });
      if (error != null) {
        const s = statusOf(error);
        log('resend error:', error.message);
        if (s === 429 || error.message.toLowerCase().includes('rate limit')) {
          return { status: 'rate_limited', message: humanizeAuthError(error) };
        }
        if (error.message.toLowerCase().includes('confirmed')) {
          return { status: 'already_verified' };
        }
        return { status: 'error', message: humanizeAuthError(error) };
      }
      return { status: 'code_sent' };
    } catch (e) {
      log('resend unexpected:', e);
      return { status: 'error', message: humanizeAuthError(e) };
    }
  }

  // ── Legacy Edge Function pipeline ───────────────────────────────────────

  /**
   * Existence probe for signup: asks the Edge Function (service_role) whether
   * an auth user already exists for [email]. Sends nothing, no side effects.
   * Returns null when unknown — callers MUST fail open (proceed as before).
   */
  async checkEmailRegistered(email: string): Promise<boolean | null> {
    const cleanEmail = email.trim().toLowerCase();
    try {
      const res = await postEdgeFunction({ action: 'check-user', email: cleanEmail });
      if (!res.ok) return null;
      return res.body['exists'] === true;
    } catch (e) {
      log('checkEmailRegistered unexpected:', e);
      return null;
    }
  }

  /** Requests a fresh 6-digit verification code for [email]. */
  async sendResendCode(email: string): Promise<Record<string, string>> {
    const cleanEmail = email.trim().toLowerCase();
    try {
      const res = await postEdgeFunction({ action: 'send', email: cleanEmail });
      if (res.ok) {
        log('sendResendCode: code sent to', cleanEmail);
        return { status: 'code_sent' };
      }
      const errorMsg = (res.body['error'] as string) ?? 'Failed to send verification email';
      if (res.status === 429) {
        const retryAfter = res.body['retryAfter'];
        const out: Record<string, string> = {
          status: 'error',
          message: errorMsg.includes('wait')
            ? errorMsg
            : 'Rate limit reached — please wait before requesting another code.',
        };
        if (typeof retryAfter === 'number') out.retryAfter = String(retryAfter);
        return out;
      }
      log('sendResendCode error', res.status + ':', errorMsg);
      return { status: 'error', message: errorMsg };
    } catch (e) {
      log('sendResendCode unexpected:', e);
      return { status: 'error', message: networkMessage };
    }
  }

  /**
   * Verifies the 6-digit code via the Edge Function. Pass [userId] when known
   * so the function can confirm that exact user. Returns true on success,
   * throws a human-readable message on failure.
   */
  async verifyResendCode(opts: { email: string; code: string; userId?: string }): Promise<boolean> {
    const cleanEmail = opts.email.trim().toLowerCase();
    const cleanCode = opts.code.trim();
    try {
      const payload: Record<string, unknown> = {
        action: 'verify',
        email: cleanEmail,
        code: cleanCode,
      };
      if (opts.userId) payload.userId = opts.userId;

      const res = await postEdgeFunction(payload);
      if (res.ok) {
        log('verifyResendCode: verified for', cleanEmail);
        return true;
      }
      const rawError = (res.body['error'] as string) ?? 'Verification failed';
      throw humanizeVerifyError(rawError);
    } catch (e) {
      if (typeof e === 'string') throw e; // already humanized
      if (e instanceof TypeError) throw networkMessage; // fetch network failure
      log('verifyResendCode unexpected:', e);
      throw 'Failed to verify code. Please try again.';
    }
  }

  /** Fallback: asks the Edge Function to confirm a Supabase user's email. */
  async confirmUserEmail(email: string): Promise<boolean> {
    const cleanEmail = email.trim().toLowerCase();
    try {
      const res = await postEdgeFunction({ action: 'confirm-email', email: cleanEmail });
      if (res.ok) {
        log('confirmUserEmail: confirmed for', cleanEmail);
        return true;
      }
      const errorMsg = (res.body['error'] as string) ?? 'Failed to confirm email';
      throw errorMsg;
    } catch (e) {
      if (typeof e === 'string') throw e;
      if (e instanceof TypeError) throw networkMessage;
      log('confirmUserEmail unexpected:', e);
      throw 'Failed to confirm email. Please try again.';
    }
  }
}

/** Maps raw Edge Function errors to friendly, actionable sheet messages. */
function humanizeVerifyError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('too many incorrect') || lower.includes('locked')) {
    return 'Too many incorrect attempts. Tap "Resend code" for a fresh one.';
  }
  if (lower.includes('incorrect code')) return raw; // includes attempts-remaining from server
  if (lower.includes('expired')) return 'This code has expired — tap "Resend code" for a new one.';
  if (lower.includes('no active code')) return 'No active code found — tap "Resend code" to get one.';
  return raw;
}

export const SupabaseAuthServiceInstance = new SupabaseAuthService();
