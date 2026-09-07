-- ─────────────────────────────────────────────────────────────────────────────
-- 0005 — verification_codes operations hardening
-- Pairs with supabase/functions/send-verification (Resend-backed custom OTP).
--
-- 1. Covering indexes for the hot paths (cooldown check, latest-pending fetch,
--    expiry sweep).
-- 2. RLS stays enabled with NO public policies (intentional deny-by-default:
--    only service_role via the Edge Function touches this table, which
--    bypasses RLS). This is why the advisor reports `rls_enabled_no_policy`
--    (INFO) — expected, do not "fix" by adding permissive policies.
--
-- NOTE: single-pending-code enforcement already exists remotely as the
-- `cleanup_on_insert` trigger → cleanup_expired_codes() (deletes older pending
-- rows for the email on insert). It is intentionally left untouched here.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.verification_codes enable row level security;

-- No policies = deny anon/authenticated entirely (service_role bypasses RLS).
drop policy if exists "verification_codes_no_client_access" on public.verification_codes;

create index if not exists verification_codes_email_status_created_idx
  on public.verification_codes (email, status, created_at desc);

create index if not exists verification_codes_expires_idx
  on public.verification_codes (expires_at)
  where status = 'pending';
