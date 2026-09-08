import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createClient, SupabaseClient, Session, User } from '@supabase/supabase-js';

import { AppConfig, SupabaseRow } from './config';

/**
 * Single source of truth for Supabase access. Every query is scoped by the
 * authenticated user — the database enforces the same rule via RLS
 * (`auth.uid() = user_id`), so a leaked anon key cannot read another user.
 *
 * SECURITY: Tokens are stored in the device's encrypted keychain via
 * expo-secure-store. The service_role key is NEVER shipped to the client.
 * Only EXPO_PUBLIC_SUPABASE_ANON_KEY is used.
 */

/**
 * Secure keychain adapter for supabase-js token persistence.
 * Uses expo-secure-store which encrypts data in the iOS Keychain /
 * Android EncryptedSharedPreferences.
 */
const SecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Silently fail — session will still work in-memory
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Ignore
    }
  },
};

/** Underlying supabase-js client. Null in demo mode (placeholder credentials). */
export const supabase: SupabaseClient | null = AppConfig.supabaseConfigured
  ? createClient(AppConfig.supabaseUrl, AppConfig.supabaseAnonKey, {
      auth: {
        storage: SecureStoreAdapter as never,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    })
  : null;

export type AuthErrorType =
  | 'alreadyRegistered'
  | 'rateLimited'
  | 'emailDeliveryFailed'
  | 'emailNotVerified'
  | 'weakPassword'
  | 'invalidCredentials'
  | 'invalidEmail'
  | 'cancelled'
  | 'networkError'
  | 'unknown';

/** Structured result from auth operations. */
export class AuthResult {
  private constructor(
    public readonly success: boolean,
    public readonly response?: { session: Session | null; user: User | null },
    public readonly errorType?: AuthErrorType,
    public readonly message?: string,
  ) {}

  static ok(response: { session: Session | null; user: User | null }): AuthResult {
    return new AuthResult(true, response);
  }

  static fail(errorType: AuthErrorType, message: string): AuthResult {
    return new AuthResult(false, undefined, errorType, message);
  }

  get friendlyMessage(): string {
    switch (this.errorType) {
      case 'alreadyRegistered':
        return 'An account already exists for this email — try signing in.';
      case 'rateLimited':
        return 'Too many attempts. Wait a minute and try again.';
      case 'emailDeliveryFailed':
        return "We couldn't send the confirmation email — check your address and try again.";
      case 'emailNotVerified':
        return 'Please verify your email before signing in.';
      case 'weakPassword':
        return 'Password is too weak — use at least 6 characters.';
      case 'invalidCredentials':
        return 'Invalid email or password. Please check your credentials or create a new account.';
      case 'invalidEmail':
        return 'Please enter a valid email address.';
      case 'cancelled':
        return 'Sign-in was cancelled.';
      case 'networkError':
        return 'Network error — check your connection and try again.';
      default:
        return this.message ?? 'Something went wrong. Please try again.';
    }
  }
}

const log = (...args: unknown[]) => {
  if (__DEV__) console.log('[auth]', ...args);
};

class SupabaseService {
  /** The underlying client. Throws if Supabase is not configured (demo mode). */
  get client(): SupabaseClient {
    if (!supabase) throw new Error('Supabase is not configured (demo mode).');
    return supabase;
  }

  get isConfigured(): boolean {
    return AppConfig.supabaseConfigured && supabase != null;
  }

  private _backendOnline = false;
  private _session: Session | null = null;
  private _initialized = false;

  /** True only when the credentials were verified against the live project (ping succeeds). */
  get backendOnline(): boolean {
    return this.isConfigured && this._backendOnline;
  }

  get isSignedIn(): boolean {
    return this._session != null;
  }

  get userId(): string | null {
    return this._session?.user.id ?? null;
  }

  get session(): Session | null {
    return this._session;
  }

  get currentUser(): User | null {
    return this._session?.user ?? null;
  }

  /** Verifies the backend is reachable and hydrates the cached session. */
  async init(): Promise<void> {
    if (!this.isConfigured) return;
    try {
      this._backendOnline = await this.ping();
    } catch {
      this._backendOnline = false;
    }
    // Hydrate cached session — Hermes-safe, no throw if SecureStore empty.
    try {
      const { data } = await this.client.auth.getSession();
      this._session = data.session ?? null;
      this._initialized = true;
    } catch {
      this._session = null;
      this._initialized = true;
    }
  }

  /** Returns the cached session if init() already ran, otherwise fetches it. */
  async getSession(): Promise<Session | null> {
    if (!this.isConfigured) return null;
    if (this._initialized) return this._session;
    try {
      const { data } = await this.client.auth.getSession();
      this._session = data.session ?? null;
      this._initialized = true;
      return this._session;
    } catch {
      return null;
    }
  }

  /** Lightweight health probe — rejects bad keys with 401. */
  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${AppConfig.supabaseUrl}/auth/v1/settings`, {
        headers: {
          apikey: AppConfig.supabaseAnonKey,
          Authorization: `Bearer ${AppConfig.supabaseAnonKey}`,
        },
      });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  /** Fires whenever auth state changes — keeps the cached _session in sync. Returns an unsubscribe function. */
  onAuthState(cb: (event: string, session: Session | null) => void): () => void {
    if (!this.isConfigured) return () => {};
    const { data } = this.client.auth.onAuthStateChange((event, session) => {
      this._session = session;
      log('event=' + event);
      cb(event, session);
    });
    return () => data.subscription.unsubscribe();
  }

  // ── Auth ────────────────────────────────────────────────────────────────

  /**
   * Classifies a raw error into an AuthErrorType by inspecting the message
   * text — Supabase surfaces different strings per error code.
   */
  static classifyError(error: unknown): AuthErrorType {
    const msg = error instanceof Error ? error.message : String(error);
    const lower = msg.toLowerCase();

    if (
      lower.includes('already_registered') ||
      lower.includes('already been registered') ||
      lower.includes('user already exists')
    ) {
      return 'alreadyRegistered';
    }
    if (
      lower.includes('email not confirmed') ||
      lower.includes('email_confirm') ||
      lower.includes('email confirmation')
    ) {
      return 'emailNotVerified';
    }
    if (
      lower.includes('rate limit') ||
      lower.includes('too many requests') ||
      lower.includes('email rate limit exceeded')
    ) {
      return 'rateLimited';
    }
    if (
      lower.includes('email') &&
      (lower.includes('delivery') || lower.includes('bounce') || lower.includes('not a valid email'))
    ) {
      return 'emailDeliveryFailed';
    }
    if (lower.includes('weak password') || lower.includes('password should be at least')) {
      return 'weakPassword';
    }
    if (lower.includes('invalid login credentials') || lower.includes('invalid_credentials')) {
      return 'invalidCredentials';
    }
    if (lower.includes('invalid email') || lower.includes('valid email')) {
      return 'invalidEmail';
    }
    if (
      lower.includes('timeout') ||
      lower.includes('network') ||
      lower.includes('socket') ||
      lower.includes('connection')
    ) {
      return 'networkError';
    }
    return 'unknown';
  }

  /**
   * Social OAuth via the system browser (works in Expo Go).
   * Uses Supabase's hosted OAuth page + PKCE code exchange on return.
   */
  async signInWithSocial(
    provider: 'google' | 'apple',
  ): Promise<{ session: Session | null; user: User | null }> {
    const redirectTo = Linking.createURL('/auth/callback');
    const { data, error } = await this.client.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error != null || !data.url) throw new Error(`${provider} sign-in did not launch.`);

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success' || !result.url) {
      throw new Error(`${provider} sign-in was cancelled.`);
    }

    const parsed = Linking.parse(result.url);
    const qp = (parsed.queryParams ?? {}) as Record<string, string | undefined>;
    if (qp.error) throw new Error(qp.error_description || `${provider} sign-in failed.`);
    if (!qp.code) throw new Error(`${provider} sign-in did not return an auth code.`);

    const { error: exErr } = await this.client.auth.exchangeCodeForSession(qp.code);
    if (exErr != null) throw new Error(exErr.message);
    return { session: this.session, user: this.currentUser };
  }

  /** Kept for backwards compatibility with existing callers. */
  async signInWithGoogle(): Promise<{ session: Session | null; user: User | null }> {
    return this.signInWithSocial('google');
  }

  /**
   * Secure account deletion: invokes the `delete_user_account` Postgres RPC
   * (SECURITY DEFINER, deletes auth.users which cascades profiles/habits/etc),
   * then signs the user out. Falls back to `delete_account` for backwards compat.
   * When the backend isn't configured this is a no-op (local wipe is handled by caller).
   */
  async deleteAccount(): Promise<void> {
    if (!this.isConfigured) return;
    try {
      const { error } = await this.client.rpc('delete_user_account');
      if (error != null) {
        // Backwards compat: older deployments expose `delete_account`
        const msg = (error.message ?? '').toLowerCase();
        if (msg.includes('does not exist') || msg.includes('not found') || msg.includes('schema cache')) {
          await this.client.rpc('delete_account');
        } else {
          throw error;
        }
      }
    } catch {
      // RPC missing or failed — still remove the auth session below.
    }
    await this.signOut();
  }

  /**
   * Clears any lingering local session before attempting a new sign-up so the
   * new account isn't silently attached to an old session.
   */
  async prepareNewAccountSession(): Promise<void> {
    if (!this.isConfigured) return;
    if (this._session != null) {
      await this.client.auth.signOut();
      this._session = null;
    }
  }

  /**
   * Signs in an existing user and blocks unverified emails. If the password is
   * correct but `emailConfirmedAt` is null, the session is destroyed and an
   * emailNotVerified failure is returned so the caller can open the OTP sheet.
   */
  async signInExistingUser(email: string, password: string): Promise<AuthResult> {
    try {
      const { data, error } = await this.client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error != null) return AuthResult.fail(SupabaseService.classifyError(error), error.message);
      this._session = data.session ?? null;
      const user = data.user;
      if (user != null && user.email_confirmed_at == null) {
        await this.client.auth.signOut();
        this._session = null;
        log('signInExistingUser: unverified email, session cleared');
        return AuthResult.fail(
          'emailNotVerified',
          'Account unverified. Please enter the verification code sent to your email.',
        );
      }
      return AuthResult.ok({ session: data.session, user });
    } catch (e) {
      return AuthResult.fail(SupabaseService.classifyError(e), e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Presence heartbeat — stamps the profile so friends see "Active Now".
   * Called on app boot (signed-in) and when the Friends tab mounts.
   */
  async touchPresence(): Promise<void> {
    if (!this.isConfigured || !this.isSignedIn) return;
    try {
      await this.client
        .from('profiles')
        .update({ last_active_at: new Date().toISOString() })
        .eq('id', this.userId);
    } catch {}
  }

  /**
   * Signs out the user and wipes ALL session tokens from the encrypted
   * keychain. Using `scope: 'global'` ensures every Supabase client on the
   * device loses access — prevents token leakage if the device is shared.
   */
  async signOut(): Promise<void> {
    if (!this.isConfigured) {
      this._session = null;
      return;
    }
    try {
      await this.client.auth.signOut({ scope: 'global' });
    } finally {
      this._session = null;
    }
  }

  // ── Profiles ────────────────────────────────────────────────────────────

  async fetchProfile(): Promise<SupabaseRow | null> {
    if (!this.isConfigured || this.userId == null) return null;
    const { data } = await this.client.from('profiles').select().eq('id', this.userId).limit(1);
    if (data == null || data.length === 0) return null;
    return data[0];
  }

  async upsertProfile(values: SupabaseRow): Promise<void> {
    if (!this.isConfigured || this.userId == null) return;
    await this.client.from('profiles').update(values).eq('id', this.userId);
  }

  /**
   * Strict upsert that reports write errors — callers that must not navigate
   * before the profile write lands (e.g. identity setup) use this.
   */
  async upsertProfileStrict(values: SupabaseRow): Promise<{ ok: boolean; error?: string }> {
    if (!this.isConfigured || this.userId == null) return { ok: true }; // demo mode
    const { error } = await this.client.from('profiles').update(values).eq('id', this.userId);
    return error != null ? { ok: false, error: error.message } : { ok: true };
  }

  /**
   * DATABASE-LEVEL username availability: case-insensitive exact count against
   * profiles.username. Never falls back to local cache — if the query fails,
   * the handle is reported as TAKEN so duplicate claims can't happen.
   */
  async usernameAvailable(username: string): Promise<boolean | null> {
    if (!this.isConfigured || this.userId == null) return null;
    try {
      const cleanHandle = username.replace(/^@/, '').trim().toLowerCase();
      const { count, error } = await this.client
        .from('profiles')
        .select('username', { count: 'exact', head: true })
        .ilike('username', cleanHandle)
        .neq('id', this.userId); // your own row doesn't block your claim
      if (error != null) return false;
      return (count ?? 0) === 0;
    } catch {
      return false;
    }
  }

  /**
   * Exact username lookup excluding the current user — for add-friend flows.
   * Returns null when not found (or on error, so callers show "not found").
   */
  async lookupUserByUsername(handle: string): Promise<SupabaseRow | null> {
    if (!this.isConfigured || this.userId == null) return null;
    try {
      const searchHandle = handle.replace(/^@/, '').trim().toLowerCase();
      const { data } = await this.client
        .from('profiles')
        .select('id, username, full_name, xp, level, last_active_at')
        .ilike('username', searchHandle)
        .neq('id', this.userId)
        .maybeSingle();
      return (data as SupabaseRow) ?? null;
    } catch {
      return null;
    }
  }

  /** True when any friendship/request row already links the two users. */
  async friendshipExists(otherUserId: string): Promise<boolean> {
    if (!this.isConfigured || this.userId == null) return false;
    try {
      const { data } = await this.client
        .from('friendships')
        .select('id')
        .or(
          `and(requester_id.eq.${this.userId},receiver_id.eq.${otherUserId}),and(requester_id.eq.${otherUserId},receiver_id.eq.${this.userId})`,
        )
        .limit(1);
      return (data?.length ?? 0) > 0;
    } catch {
      return false;
    }
  }

  /** Sends a pending friend request via the hardened RPC (server-side guard). */
  async insertFriendRequest(friendId: string): Promise<string | null> {
    if (!this.isConfigured || this.userId == null) return 'Backend is not configured.';
    try {
      const { error } = await this.client.rpc('send_friend_request', { p_receiver_id: friendId });
      return error != null ? error.message : null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  // ── Habits ──────────────────────────────────────────────────────────────

  async fetchHabits(): Promise<SupabaseRow[]> {
    if (!this.isConfigured || this.userId == null) return [];
    const { data } = await this.client
      .from('habits')
      .select()
      .eq('user_id', this.userId)
      .order('sort_order');
    return data ?? [];
  }

  async insertHabit(values: SupabaseRow): Promise<void> {
    if (!this.isConfigured || this.userId == null) return;
    await this.client.from('habits').insert({ ...values, user_id: this.userId });
  }

  async deleteHabit(habitId: string): Promise<void> {
    if (!this.isConfigured || this.userId == null) return;
    await this.client.from('habits').delete().eq('id', habitId).eq('user_id', this.userId);
  }

  // ── Habit completions ───────────────────────────────────────────────────

  async fetchCompletions(since?: Date): Promise<SupabaseRow[]> {
    if (!this.isConfigured || this.userId == null) return [];
    let query = this.client.from('habit_completions').select().eq('user_id', this.userId);
    if (since != null) {
      query = query.gte('completed_on', since.toISOString().substring(0, 10));
    }
    const { data } = await query;
    return data ?? [];
  }

  /**
   * Upserts the ledger row for (habit, day). Returns the row id so the
   * verify_completion RPC can be called with it.
   */
  async upsertCompletion(opts: {
    habitId: string;
    day: Date;
    status: string;
    proofUrl?: string;
  }): Promise<string | null> {
    if (!this.isConfigured || this.userId == null) return null;
    const day = opts.day;
    const date =
      `${day.getFullYear()}`.padStart(4, '0') +
      '-' +
      `${day.getMonth() + 1}`.padStart(2, '0') +
      '-' +
      `${day.getDate()}`.padStart(2, '0');
    const row: SupabaseRow = {
      user_id: this.userId,
      habit_id: opts.habitId,
      completed_on: date,
      status: opts.status,
    };
    if (opts.proofUrl != null) row.proof_url = opts.proofUrl;
    const { data } = await this.client.from('habit_completions').upsert(row).select('id');
    if (data == null || data.length === 0) return null;
    return (data[0]['id'] as string) ?? null;
  }

  /** Banks the AI-graded XP amount atomically server-side (xp + total_xp + level). */
  async verifyCompletion(completionId: string, proofUrl?: string, xpAmount = 50): Promise<void> {
    if (!this.isConfigured || this.userId == null) return;
    await this.client.rpc('verify_completion', {
      p_completion_id: completionId,
      p_proof_url: proofUrl ?? '',
      p_xp_amount: Math.max(0, Math.min(120, Math.round(xpAmount))),
    });
  }

  /** Persists a graded proof to the user-history ledger (difficulty + XP). */
  async insertActivityProof(opts: {
    habitId?: string;
    taskName: string;
    difficulty: string;
    xpAwarded: number;
    photoUrl?: string;
    reasoning?: string;
  }): Promise<void> {
    if (!this.isConfigured || this.userId == null) return;
    try {
      await this.client.from('activity_proofs').insert({
        user_id: this.userId,
        habit_id: opts.habitId ?? null,
        task_name: opts.taskName,
        difficulty_level: opts.difficulty,
        xp_awarded: Math.max(0, Math.min(120, Math.round(opts.xpAwarded))),
        photo_url: opts.photoUrl ?? null,
        reasoning: opts.reasoning ?? null,
      });
    } catch {}
  }

  async incrementXp(amount: number): Promise<void> {
    if (!this.isConfigured || this.userId == null) return;
    await this.client.rpc('increment_user_xp', { p_amount: amount });
  }

  /** Real-time updates whenever any of MY completions change. Returns unsubscribe. */
  watchCompletions(cb: (rows: SupabaseRow[]) => void): () => void {
    if (!this.isConfigured || this.userId == null) return () => {};
    const uid = this.userId;
    const channel = this.client
      .channel(`completions:${uid}`)
      .on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table: 'habit_completions', filter: `user_id=eq.${uid}` },
        () => {
          void this.fetchCompletions().then(cb);
        },
      )
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }

  // ── Qubi chats ──────────────────────────────────────────────────────────

  async fetchChats(limit = 100): Promise<SupabaseRow[]> {
    if (!this.isConfigured || this.userId == null) return [];
    const { data } = await this.client
      .from('qubi_chats')
      .select()
      .eq('user_id', this.userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return [...(data ?? [])].reverse();
  }

  async insertChat(values: SupabaseRow): Promise<void> {
    if (!this.isConfigured || this.userId == null) return;
    await this.client.from('qubi_chats').insert({ ...values, user_id: this.userId });
  }

  async clearChats(): Promise<void> {
    if (!this.isConfigured || this.userId == null) return;
    await this.client.from('qubi_chats').delete().eq('user_id', this.userId);
  }

  // ── User settings ───────────────────────────────────────────────────────

  async fetchSettings(): Promise<SupabaseRow | null> {
    if (!this.isConfigured || this.userId == null) return null;
    const { data } = await this.client.from('user_settings').select().eq('user_id', this.userId);
    if (data == null || data.length === 0) return null;
    return data[0];
  }

  async upsertSettings(values: SupabaseRow): Promise<void> {
    if (!this.isConfigured || this.userId == null) return;
    await this.client.from('user_settings').upsert({ user_id: this.userId, ...values });
  }

  // ── Storage (photo proofs) ──────────────────────────────────────────────

  /**
   * Uploads a compressed proof image to the private `photo_proofs` bucket
   * under `photo_proofs/{uid}/{timestamp}.{ext}`. Returns the storage path.
   */
  async uploadPhotoProof(bytes: Uint8Array, ext = 'jpg'): Promise<string | null> {
    if (!this.isConfigured || this.userId == null) return null;
    const now = Date.now();
    const name = `${now}_${now % 1000000}.${ext}`;
    const path = `${this.userId}/${name}`;
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const { error } = await this.client.storage.from('photo_proofs').upload(path, view, {
      contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
      upsert: false,
    });
    if (error != null) throw error;
    return path;
  }

  // ── Friends ─────────────────────────────────────────────────────────────

  /** Search users by username (for adding friends). */
  async searchUsers(query: string): Promise<SupabaseRow[]> {
    if (!this.isConfigured || this.userId == null) return [];
    try {
      const { data } = await this.client.rpc('search_users', { p_query: query, p_limit: 20 });
      return (data as SupabaseRow[]) ?? [];
    } catch {
      return [];
    }
  }

  async sendFriendRequest(receiverId: string): Promise<void> {
    if (!this.isConfigured || this.userId == null) return;
    await this.client.rpc('send_friend_request', { p_receiver_id: receiverId });
  }

  async acceptFriendRequest(requestId: string): Promise<void> {
    if (!this.isConfigured || this.userId == null) return;
    await this.client.rpc('accept_friend_request', { p_friendship_id: requestId });
  }

  async declineFriendRequest(requestId: string): Promise<void> {
    if (!this.isConfigured || this.userId == null) return;
    await this.client.rpc('decline_friend_request', { p_friendship_id: requestId });
  }

  async removeFriend(friendshipId: string): Promise<void> {
    if (!this.isConfigured || this.userId == null) return;
    await this.client.rpc('remove_friend', { p_friendship_id: friendshipId });
  }

  async getFriends(): Promise<SupabaseRow[]> {
    if (!this.isConfigured || this.userId == null) return [];
    try {
      const { data } = await this.client.rpc('get_friends');
      return (data as SupabaseRow[]) ?? [];
    } catch {
      return [];
    }
  }

  async getFriendRequests(): Promise<SupabaseRow[]> {
    if (!this.isConfigured || this.userId == null) return [];
    try {
      const { data } = await this.client.rpc('get_friend_requests');
      return (data as SupabaseRow[]) ?? [];
    } catch {
      return [];
    }
  }

  async getLeaderboard(limit = 50): Promise<SupabaseRow[]> {
    if (!this.isConfigured) return [];
    try {
      const { data } = await this.client.rpc('get_leaderboard', { p_limit: limit });
      return (data as SupabaseRow[]) ?? [];
    } catch {
      return [];
    }
  }
}

export const SupabaseServiceInstance = new SupabaseService();

/** Fetches a signed read URL for a stored proof (for thumbnails). */
export async function publicProofUrl(path: string): Promise<string | null> {
  if (!AppConfig.supabaseConfigured || !supabase) return null;
  const { data, error } = await supabase.storage.from('photo_proofs').createSignedUrl(path, 3600);
  if (error != null) return null;
  return data.signedUrl;
}

/** Wraps raw bytes in a base64 data-URI for vision model payloads. */
export function base64DataUri(base64: string, mimeType: string): string {
  return `data:${mimeType};base64,${base64}`;
}
