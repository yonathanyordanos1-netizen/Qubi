-- ─────────────────────────────────────────────────────────────────────────────
-- 0007 — Profile identity setup gate + rate-limited name/username changes.
--
-- Fixes: after a brand-new email signs in (esp. via Google), the app must make
-- the user pick a display name + unique @username once. Returns to the dashboard
-- once saved. Re-signed-in on another device → same row → skips setup again.
--
-- Adds:
--   * profiles.profile_setup_done      — false until a human picks name+username.
--   * profiles.name_changed_at         — last time the display name was changed.
--   * profiles.username_changed_at     — last time the username was changed.
--   * public.update_profile_identity() — SECURITY DEFINER RPC that atomically
--     enforces: validation, case-insensitive uniqueness, and cooldowns
--     (name once/week, username once/month) THEN writes the row.
--
-- Cooldown semantics: the RPC only bumps a column's timestamp when that field
-- actually changed. Clients should call this RPC for all name/username edits so
-- the limits are enforced server-side (bypassing them via the raw UPDATE RLS
-- policy is a deliberate, low-risk escape hatch for legacy syncProfile paths).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── New columns ──────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists profile_setup_done boolean not null default true;
alter table public.profiles add column if not exists name_changed_at timestamptz;
alter table public.profiles add column if not exists username_changed_at timestamptz;

-- ── Create profile rows with the identity gate flag ─────────────────────────
-- OTP-wizard signups carry `username` + `display_name` in user_metadata → setup
-- is complete. Google/Apple sign-ins carry full_name but NO username → setup is
-- pending → the user is asked to pick a name/username once after auth.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  uname text := lower(trim(both from coalesce(meta->>'username', split_part(new.email, '@', 1), 'adventurer')));
  setup_done boolean := coalesce(meta->>'username', '') <> '';
begin
  if uname !~ '^[a-zA-Z0-9_]{3,20}$' then
    uname := 'adventurer_' || substr(new.id::text, 1, 8);
    setup_done := false;
  end if;
  insert into public.profiles (id, username, display_name, email, provider, profile_setup_done)
  values (
    new.id,
    uname,
    coalesce(meta->>'display_name', meta->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(meta->>'provider', new.app_metadata->>'provider', 'email'),
    setup_done
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ── Identity RPC (server-enforced uniqueness + cooldowns) ───────────────────
create or replace function public.update_profile_identity(p_name text, p_username text, p_avatar text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_row public.profiles%rowtype;
  v_clean_name text := btrim(p_name);
  v_clean_username text := lower(btrim(p_username));
  v_clean_avatar text := lower(btrim(coalesce(p_avatar, '')));
  v_allowed_avatars text[] := array['sun','ocean','grape','forest','ember','sky'];
  v_next_name timestamptz;
  v_next_username timestamptz;
begin
  if uid is null then raise exception 'Unauthorized access'; end if;

  if length(v_clean_name) = 0 or length(v_clean_name) > 32 then
    return jsonb_build_object('ok', false, 'error', 'Name must be 1–32 characters.');
  end if;
  if v_clean_username !~ '^[a-z0-9_]{3,16}$' then
    return jsonb_build_object('ok', false, 'error', 'Use 3–16 letters, numbers and underscores.');
  end if;
  if v_clean_avatar <> '' and not (v_clean_avatar = any(v_allowed_avatars)) then
    return jsonb_build_object('ok', false, 'error', 'Unknown avatar.');
  end if;

  select * into v_row from public.profiles where id = uid;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Profile not found.');
  end if;

  -- Case-insensitive unique check (exclude self).
  if exists (
    select 1 from public.profiles
    where lower(username) = v_clean_username and id <> uid
  ) then
    return jsonb_build_object('ok', false, 'error', 'That username is already taken.');
  end if;

  -- Cooldowns only apply when the field actually changes.
  if v_clean_name <> v_row.display_name and v_row.name_changed_at is not null then
    v_next_name := v_row.name_changed_at + interval '7 days';
    if v_next_name > now() then
      return jsonb_build_object(
        'ok', false,
        'error', 'You can change your name again on ' || to_char(v_next_name, 'Mon DD, YYYY') || '.',
        'cooldown', 'name',
        'next_change', v_next_name
      );
    end if;
  end if;

  if v_clean_username <> v_row.username and v_row.username_changed_at is not null then
    v_next_username := v_row.username_changed_at + interval '30 days';
    if v_next_username > now() then
      return jsonb_build_object(
        'ok', false,
        'error', 'You can change your username again on ' || to_char(v_next_username, 'Mon DD, YYYY') || '.',
        'cooldown', 'username',
        'next_change', v_next_username
      );
    end if;
  end if;

  update public.profiles
  set display_name = v_clean_name,
      username = v_clean_username,
      avatar = case when v_clean_avatar <> '' then v_clean_avatar else v_row.avatar end,
      profile_setup_done = true,
      onboarding_done = true,
      name_changed_at = case
        when v_clean_name <> v_row.display_name then now()
        else v_row.name_changed_at
      end,
      username_changed_at = case
        when v_clean_username <> v_row.username then now()
        else v_row.username_changed_at
      end,
      updated_at = now()
  where id = uid;

  return jsonb_build_object('ok', true);
end;
$$;

-- ── Grants: client-facing only ───────────────────────────────────────────────
revoke execute on function public.update_profile_identity(text, text, text) from public;
revoke execute on function public.update_profile_identity(text, text, text) from anon;
grant execute on function public.update_profile_identity(text, text, text) to authenticated;