-- ─────────────────────────────────────────────────────────────────────────────
-- 0004 — SECURITY DEFINER function privilege hardening
-- Closes every security-definer function to PUBLIC/anon and grants EXECUTE only
-- to `authenticated` for client-facing RPCs, `service_role`/owner for the rest.
-- This is what the Supabase security advisor flags as
-- `anon_security_definer_function_executable`. Now unauthenticated callers get
-- 403 from PostgREST, and only signed-in users can invoke the RPCs the app uses.
-- ─────────────────────────────────────────────────────────────────────────────

-- Close to PUBLIC (default grant) — anon cannot call any of these.
revoke execute on function public.accept_friend_request(uuid) from public;
revoke execute on function public.decline_friend_request(uuid) from public;
revoke execute on function public.delete_account() from public;
revoke execute on function public.get_friend_requests() from public;
revoke execute on function public.get_friends() from public;
revoke execute on function public.get_leaderboard(integer) from public;
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.increment_user_xp(integer) from public;
revoke execute on function public.mark_missed(uuid) from public;
revoke execute on function public.remove_friend(uuid) from public;
revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.search_users(text, integer) from public;
revoke execute on function public.send_friend_request(uuid) from public;
revoke execute on function public.touch_updated_at() from public;
revoke execute on function public.username_available(text) from public;
revoke execute on function public.verify_completion(uuid, text) from public;
revoke execute on function public.cleanup_expired_codes() from public;

-- Internal/trigger-only functions: not needed even by signed-in clients.
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;
revoke execute on function public.cleanup_expired_codes() from anon;
revoke execute on function public.cleanup_expired_codes() from authenticated;
revoke execute on function public.touch_updated_at() from anon;
revoke execute on function public.touch_updated_at() from authenticated;

-- Client-facing RPCs: only authenticated users may invoke.
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.decline_friend_request(uuid) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.get_friends() to authenticated;
grant execute on function public.get_friend_requests() to authenticated;
grant execute on function public.search_users(text, integer) to authenticated;
grant execute on function public.username_available(text) to authenticated;
grant execute on function public.get_leaderboard(integer) to authenticated;
grant execute on function public.increment_user_xp(integer) to authenticated;
grant execute on function public.verify_completion(uuid, text) to authenticated;
grant execute on function public.mark_missed(uuid) to authenticated;
grant execute on function public.delete_account() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- NOTE on remaining advisor findings (by design):
--  * `authenticated_security_definer_function_executable` (WARN) — the mobile
--    app calls these RPCs while signed in; the functions guard with
--    `if uid is null then raise exception` plus ownership checks. Intentional.
--  * `rls_enabled_no_policy` on `verification_codes` (INFO) — the OTP-hardening
--    table is only readable by internal security-definer functions, never by
--    clients, so it intentionally has no RLS policies.
-- ─────────────────────────────────────────────────────────────────────────────
