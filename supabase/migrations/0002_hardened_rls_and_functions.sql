-- ─────────────────────────────────────────────────────────────────────────────
-- 0002 — Hardened RLS + security-definer functions
-- Applied to remote project qnbrrxwctokuwxglcdjd. Mirrors the hardened schema.
--
-- SECURITY INVARIANT: Every RLS policy checks `auth.uid()` against the row
-- owner via the cached `(select auth.uid())` form. Inserts to `profiles` are
-- DENIED to clients — rows are created ONLY by the `handle_new_user` trigger on
-- `auth.users`. All RPC functions are `SECURITY DEFINER` with an explicit
-- empty `search_path` to defeat search-path hijacking.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── profiles: columns + CHECK constraints ───────────────────────────────────
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists streak_count integer not null default 0;

alter table public.profiles drop constraint if exists profiles_username_regex;
alter table public.profiles add constraint profiles_username_regex
  check (username is null or username ~ '^[a-zA-Z0-9_]{3,20}$');

alter table public.profiles drop constraint if exists profiles_xp_non_negative;
alter table public.profiles add constraint profiles_xp_non_negative check (xp is null or xp >= 0);

alter table public.profiles drop constraint if exists profiles_level_positive;
alter table public.profiles add constraint profiles_level_positive check (level is null or level >= 1);

alter table public.profiles drop constraint if exists profiles_streak_non_negative;
alter table public.profiles add constraint profiles_streak_non_negative check (streak_count is null or streak_count >= 0);

-- ── profiles: RLS (SELECT all-authenticated; UPDATE own ONLY; NO client INSERT)
alter table public.profiles enable row level security;

drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated on public.profiles
  for select using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- ── friendships: recreated per new spec ─────────────────────────────────────
drop table if exists public.friendships;
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_no_self check (requester_id <> receiver_id)
);
create unique index if not exists friendships_unique_pair on public.friendships (
  least(requester_id, receiver_id), greatest(requester_id, receiver_id)
);
create index if not exists friendships_requester_idx on public.friendships (requester_id);
create index if not exists friendships_receiver_idx on public.friendships (receiver_id);

alter table public.friendships enable row level security;

drop policy if exists friendships_select_own on public.friendships;
create policy friendships_select_own on public.friendships
  for select using ((select auth.uid()) = requester_id or (select auth.uid()) = receiver_id);

drop policy if exists friendships_insert_as_requester on public.friendships;
create policy friendships_insert_as_requester on public.friendships
  for insert with check ((select auth.uid()) = requester_id);

drop policy if exists friendships_update_receiver_only on public.friendships;
create policy friendships_update_receiver_only on public.friendships
  for update using ((select auth.uid()) = receiver_id)
  with check ((select auth.uid()) = receiver_id);

drop policy if exists friendships_delete_own on public.friendships;
create policy friendships_delete_own on public.friendships
  for delete using ((select auth.uid()) = requester_id or (select auth.uid()) = receiver_id);

-- ── Security-definer helper functions (empty search_path) ──────────────────
create or replace function public.send_friend_request(p_receiver_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Unauthorized access'; end if;
  if uid = p_receiver_id then raise exception 'You cannot add yourself'; end if;
  if exists (
    select 1 from public.friendships
    where (requester_id = uid and receiver_id = p_receiver_id)
       or (requester_id = p_receiver_id and receiver_id = uid)
  ) then raise exception 'Friend request already exists between these users'; end if;
  insert into public.friendships (requester_id, receiver_id, status)
  values (uid, p_receiver_id, 'pending');
end;
$$;

create or replace function public.accept_friend_request(p_friendship_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Unauthorized access'; end if;
  update public.friendships
  set status = 'accepted', updated_at = now()
  where id = p_friendship_id and receiver_id = uid and status = 'pending';
  if not found then raise exception 'Request not found or not pending'; end if;
end;
$$;

create or replace function public.decline_friend_request(p_friendship_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Unauthorized access'; end if;
  delete from public.friendships
  where id = p_friendship_id and receiver_id = uid and status = 'pending';
  if not found then raise exception 'Request not found or not pending'; end if;
end;
$$;

create or replace function public.remove_friend(p_friendship_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Unauthorized access'; end if;
  delete from public.friendships
  where id = p_friendship_id and (requester_id = uid or receiver_id = uid);
  if not found then raise exception 'Friendship not found'; end if;
end;
$$;

create or replace function public.get_friends()
returns table (
  friendship_id uuid, friend_id uuid, username text, display_name text,
  avatar_url text, xp integer, level integer, streak_count integer, last_active_at timestamptz
) language sql security definer set search_path = '' as $$
  select f.id, f.receiver_id, p.username, p.display_name, p.avatar_url,
         p.xp, p.level, p.streak_count, p.last_active_at
  from public.friendships f
  join public.profiles p on p.id = f.receiver_id
  where f.requester_id = auth.uid() and f.status = 'accepted'
  union all
  select f.id, f.requester_id, p.username, p.display_name, p.avatar_url,
         p.xp, p.level, p.streak_count, p.last_active_at
  from public.friendships f
  join public.profiles p on p.id = f.requester_id
  where f.receiver_id = auth.uid() and f.status = 'accepted';
$$;

create or replace function public.get_friend_requests()
returns table (
  friendship_id uuid, requester_id uuid, username text, display_name text,
  avatar_url text, xp integer, level integer, streak_count integer, created_at timestamptz
) language sql security definer set search_path = '' as $$
  select f.id, f.requester_id, p.username, p.display_name, p.avatar_url,
         p.xp, p.level, p.streak_count, f.created_at
  from public.friendships f
  join public.profiles p on p.id = f.requester_id
  where f.receiver_id = auth.uid() and f.status = 'pending';
$$;

-- rate-limited XP banking: caps amount per call (server-side guard)
create or replace function public.increment_user_xp(p_amount integer)
returns void language plpgsql security definer set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Unauthorized access'; end if;
  update public.profiles
  set xp = xp + least(greatest(p_amount, 0), 100)
  where id = uid;
end;
$$;

-- verify a completion and bank fixed +50 XP atomically
create or replace function public.verify_completion(p_completion_id uuid, p_proof_url text default '')
returns void language plpgsql security definer set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Unauthorized access'; end if;
  if not exists (
    select 1 from public.habit_completions where id = p_completion_id and user_id = uid
  ) then raise exception 'Completion not found or access denied'; end if;
  update public.habit_completions
  set status = 'verified', proof_url = p_proof_url
  where id = p_completion_id and user_id = uid;
  perform public.increment_user_xp(50);
end;
$$;

-- profile auto-creation on signup (only place insert into profiles happens)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  uname text := lower(trim(both from coalesce(meta->>'username', split_part(new.email, '@', 1), 'adventurer')));
begin
  if uname !~ '^[a-zA-Z0-9_]{3,20}$' then
    uname := 'adventurer_' || substr(new.id::text, 1, 8);
  end if;
  insert into public.profiles (id, username, display_name, email, provider)
  values (
    new.id,
    uname,
    coalesce(meta->>'display_name', meta->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(meta->>'provider', new.app_metadata->>'provider', 'email')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- delete current account
create or replace function public.delete_account()
returns void language plpgsql security definer set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Unauthorized access'; end if;
  delete from public.profiles where id = uid;
  delete from auth.users where id = uid;
end;
$$;

-- ── Realtime ────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.friendships;
alter publication supabase_realtime add table public.profiles;

-- ── Storage buckets + scoped object policies ────────────────────────────────
insert into storage.buckets (id, name, public)
values ('photo_proofs', 'photo_proofs', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('quest-proofs', 'quest-proofs', true)
on conflict (id) do nothing;

drop policy if exists photo_proofs_upload_own on storage.objects;
create policy photo_proofs_upload_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photo_proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists photo_proofs_read_own on storage.objects;
create policy photo_proofs_read_own on storage.objects
  for select to authenticated
  using (bucket_id = 'photo_proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);
