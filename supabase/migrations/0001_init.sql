-- ═══════════════════════════════════════════════════════════════════════
-- Questify — initial schema
-- Run in Supabase SQL Editor (or `supabase db push`).
-- Idempotent-ish: guarded with IF NOT EXISTS where practical.
-- ═══════════════════════════════════════════════════════════════════════

-- ── profiles ────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  username text unique,
  avatar_url text,
  xp int not null default 0,
  level int not null default 1,
  streak int not null default 0,
  league text default 'Silver',
  push_token text,
  last_active_at timestamptz default now(),
  created_at timestamptz not null default now()
);

-- Ensure all columns exist (idempotent)
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists username text unique;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists xp int not null default 0;
alter table public.profiles add column if not exists level int not null default 1;
alter table public.profiles add column if not exists streak int not null default 0;
alter table public.profiles add column if not exists league text default 'Silver';
alter table public.profiles add column if not exists push_token text;
alter table public.profiles add column if not exists last_active_at timestamptz default now();
alter table public.profiles add column if not exists created_at timestamptz not null default now();

-- Auto-create a profile row for every new auth user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, username)
  values (new.id, new.raw_user_meta_data->>'full_name',
          'user_' || substr(new.id::text, 1, 8))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── quests ──────────────────────────────────────────────────────────────
create table if not exists public.quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  category text not null default 'Wellness',
  time_of_day text not null default '8:00 AM',
  xp int not null default 50,
  verification_type text not null default 'camera',   -- camera | check-in
  completed boolean not null default false,
  due_date date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists quests_user_idx on public.quests(user_id, due_date);

-- ── proof_verifications ─────────────────────────────────────────────────
create table if not exists public.proof_verifications (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid references public.quests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  image_url text,
  ai_analysis text,
  verified boolean default false,
  verified_at timestamptz not null default now()
);
create index if not exists proofs_user_idx on public.proof_verifications(user_id);

-- ── friends ─────────────────────────────────────────────────────────────
create table if not exists public.friends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  unique (user_id, friend_id)
);
create index if not exists friends_user_idx on public.friends(user_id);
create index if not exists friends_friend_idx on public.friends(friend_id);

-- ── Row Level Security ──────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.quests enable row level security;
alter table public.proof_verifications enable row level security;
alter table public.friends enable row level security;

drop policy if exists "profiles readable by authenticated" on public.profiles;
create policy "profiles readable by authenticated"
  on public.profiles for select to authenticated using (true);

drop policy if exists "own profile upsert" on public.profiles;
create policy "own profile upsert"
  on public.profiles for insert to authenticated with check (auth.uid() = id);
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update"
  on public.profiles for update to authenticated using (auth.uid() = id);

drop policy if exists "own quests" on public.quests;
create policy "own quests" on public.quests
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own proofs" on public.proof_verifications;
create policy "own proofs" on public.proof_verifications
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Friends: both sides can read; users manage their own rows.
drop policy if exists "friends readable" on public.friends;
create policy "friends readable" on public.friends
  for select to authenticated using (auth.uid() = user_id or auth.uid() = friend_id);
drop policy if exists "friends insert own" on public.friends;
create policy "friends insert own" on public.friends
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "friends update either" on public.friends;
create policy "friends update either" on public.friends
  for update to authenticated using (auth.uid() = user_id or auth.uid() = friend_id);
drop policy if exists "friends delete own" on public.friends;
create policy "friends delete own" on public.friends
  for delete to authenticated using (auth.uid() = user_id);

-- ── Friend RPCs (used by the app) ───────────────────────────────────────
drop function if exists public.send_friend_request(uuid);
create or replace function public.send_friend_request(p_receiver_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_receiver_id = auth.uid() then raise exception 'Cannot add yourself'; end if;
  insert into public.friends (user_id, friend_id, status)
  values (auth.uid(), p_receiver_id, 'pending')
  on conflict (user_id, friend_id) do nothing;
end;
$$;

drop function if exists public.accept_friend_request(uuid);
create or replace function public.accept_friend_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare rec public.friends%rowtype;
begin
  select * into rec from public.friends
  where id = p_request_id and friend_id = auth.uid() and status = 'pending';
  if not found then raise exception 'Request not found'; end if;
  update public.friends set status = 'accepted' where id = p_request_id;
  insert into public.friends (user_id, friend_id, status)
  values (rec.friend_id, rec.user_id, 'accepted')
  on conflict (user_id, friend_id) do update set status = 'accepted';
end;
$$;

drop function if exists public.decline_friend_request(uuid);
create or replace function public.decline_friend_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.friends set status = 'rejected'
  where id = p_request_id and friend_id = auth.uid();
end;
$$;

drop function if exists public.remove_friend(uuid);
create or replace function public.remove_friend(p_friend_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.friends
  where (user_id = auth.uid() and friend_id = p_friend_id)
     or (user_id = p_friend_id and friend_id = auth.uid() and status = 'accepted');
end;
$$;

drop function if exists public.get_friends();
create or replace function public.get_friends()
returns table (
  friend_id uuid, username text, display_name text,
  xp int, level int, streak int, last_active_at timestamptz
) language sql security definer set search_path = public as $$
  select p.id, p.username, p.full_name, p.xp, p.level, p.streak, p.last_active_at
  from public.friends f
  join public.profiles p on p.id = f.friend_id
  where f.user_id = auth.uid() and f.status = 'accepted';
$$;

drop function if exists public.get_friend_requests();
create or replace function public.get_friend_requests()
returns table (
  request_id uuid, username text, display_name text,
  xp int, level int, streak int, last_active_at timestamptz
) language sql security definer set search_path = public as $$
  select p.id, p.username, p.full_name, p.xp, p.level, p.streak, p.last_active_at
  from public.friends f
  join public.profiles p on p.id = f.user_id
  where f.friend_id = auth.uid() and f.status = 'pending';
$$;

-- ── Account deletion (called by the app's Delete Account flow) ──────────
drop function if exists public.delete_account();
create or replace function public.delete_account()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.profiles where id = auth.uid();
  delete from auth.users where id = auth.uid();
end;
$$;

-- ── Realtime ────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.friends;
alter publication supabase_realtime add table public.profiles;

-- ── Storage: public quest-proofs bucket ─────────────────────────────────
insert into storage.buckets (id, name, public)
values ('quest-proofs', 'quest-proofs', true)
on conflict (id) do nothing;

drop policy if exists "quest proofs upload" on storage.objects;
create policy "quest proofs upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'quest-proofs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "quest proofs read" on storage.objects;
create policy "quest proofs read" on storage.objects
  for select using (bucket_id = 'quest-proofs');