-- Dynamic task difficulty & scaled XP rewards (Qubi proof pipeline).
--
-- 1. profiles.total_xp      lifetime XP ledger (never decreases on its own).
-- 2. increment_user_xp      accepts 0..120 per call, bumps xp + total_xp, syncs level.
-- 3. verify_completion      accepts p_xp_amount (default 50), stamps
--                           habit_completions.xp_awarded, banks dynamically.
-- 4. activity_proofs        per-proof history: difficulty + xp + AI reasoning.

-- ── 1. lifetime XP column ────────────────────────────────────────────────
alter table public.profiles
  add column if not exists total_xp integer not null default 0
    check (total_xp >= 0);

-- Backfill lifetime totals from current xp so existing users keep history.
update public.profiles set total_xp = greatest(total_xp, xp);

-- ── 2. dynamic XP banking (replaces the fixed +50 path) ──────────────────
create or replace function public.increment_user_xp(p_amount integer)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_amount integer := least(greatest(p_amount, 0), 120);
begin
  if uid is null then raise exception 'Unauthorized access'; end if;
  update public.profiles
  set xp = xp + v_amount,
      total_xp = total_xp + v_amount,
      level = greatest(1, 1 + ((xp + v_amount) / 500))
  where id = uid;
end;
$$;

-- ── 3. verify a completion and bank the AI-graded amount atomically ──────
create or replace function public.verify_completion(
  p_completion_id uuid,
  p_proof_url text default '',
  p_xp_amount integer default 50
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_amount integer := least(greatest(p_xp_amount, 0), 120);
begin
  if uid is null then raise exception 'Unauthorized access'; end if;
  if not exists (
    select 1 from public.habit_completions where id = p_completion_id and user_id = uid
  ) then raise exception 'Completion not found or access denied'; end if;
  update public.habit_completions
  set status = 'verified', proof_url = p_proof_url, xp_awarded = v_amount
  where id = p_completion_id and user_id = uid;
  perform public.increment_user_xp(v_amount);
end;
$$;

-- ── 4. proof history ledger ──────────────────────────────────────────────
create table if not exists public.activity_proofs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  habit_id uuid references public.habits (id) on delete set null,
  task_name text not null,
  difficulty_level text not null
    check (difficulty_level in ('Low', 'Medium', 'High', 'Intense')),
  xp_awarded integer not null default 0 check (xp_awarded >= 0),
  photo_url text,
  reasoning text,
  created_at timestamptz not null default now()
);

alter table public.activity_proofs enable row level security;

drop policy if exists "Users view own activity proofs" on public.activity_proofs;
create policy "Users view own activity proofs"
  on public.activity_proofs for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users insert own activity proofs" on public.activity_proofs;
create policy "Users insert own activity proofs"
  on public.activity_proofs for insert to authenticated
  with check (auth.uid() = user_id);

grant select, insert on public.activity_proofs to authenticated;

-- ── 5. replace the legacy fixed-+50 overload ─────────────────────────────
-- Drop the 2-arg variant so PostgREST never ambiguously resolves the call;
-- existing clients passing 2 args still work via the new defaults.
drop function if exists public.verify_completion(uuid, text);

-- Close the new overload to anon; signed-in clients may invoke it.
revoke execute on function public.verify_completion(uuid, text, integer) from public;
grant execute on function public.verify_completion(uuid, text, integer) to authenticated;
