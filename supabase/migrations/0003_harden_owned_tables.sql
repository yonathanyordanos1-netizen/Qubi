-- ─────────────────────────────────────────────────────────────────────────────
-- 0003 — Harden remaining user-owned tables with per-owner RLS policies
-- Mirrors the confirmed remote state (all policies use cached `(select auth.uid())`).
-- These tables are owned by a `user_id` column and follow the same zero-trust
-- pattern: users may only SELECT/INSERT/UPDATE/DELETE their own rows.
-- ─────────────────────────────────────────────────────────────────────────────

-- quests
drop policy if exists quests_select_own on public.quests;
create policy quests_select_own on public.quests
  for select using ((select auth.uid()) = user_id);
drop policy if exists quests_insert_own on public.quests;
create policy quests_insert_own on public.quests
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists quests_update_own on public.quests;
create policy quests_update_own on public.quests
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists quests_delete_own on public.quests;
create policy quests_delete_own on public.quests
  for delete using ((select auth.uid()) = user_id);

-- proof_verifications
drop policy if exists proofs_select_own on public.proof_verifications;
create policy proofs_select_own on public.proof_verifications
  for select using ((select auth.uid()) = user_id);
drop policy if exists proofs_insert_own on public.proof_verifications;
create policy proofs_insert_own on public.proof_verifications
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists proofs_update_own on public.proof_verifications;
create policy proofs_update_own on public.proof_verifications
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists proofs_delete_own on public.proof_verifications;
create policy proofs_delete_own on public.proof_verifications
  for delete using ((select auth.uid()) = user_id);

-- habits
drop policy if exists habits_select_own on public.habits;
create policy habits_select_own on public.habits
  for select using ((select auth.uid()) = user_id);
drop policy if exists habits_insert_own on public.habits;
create policy habits_insert_own on public.habits
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists habits_update_own on public.habits;
create policy habits_update_own on public.habits
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists habits_delete_own on public.habits;
create policy habits_delete_own on public.habits
  for delete using ((select auth.uid()) = user_id);

-- habit_completions
drop policy if exists completions_select_own on public.habit_completions;
create policy completions_select_own on public.habit_completions
  for select using ((select auth.uid()) = user_id);
drop policy if exists completions_insert_own on public.habit_completions;
create policy completions_insert_own on public.habit_completions
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists completions_update_own on public.habit_completions;
create policy completions_update_own on public.habit_completions
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists completions_delete_own on public.habit_completions;
create policy completions_delete_own on public.habit_completions
  for delete using ((select auth.uid()) = user_id);

-- qubi_chats
drop policy if exists chats_select_own on public.qubi_chats;
create policy chats_select_own on public.qubi_chats
  for select using ((select auth.uid()) = user_id);
drop policy if exists chats_insert_own on public.qubi_chats;
create policy chats_insert_own on public.qubi_chats
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists chats_delete_own on public.qubi_chats;
create policy chats_delete_own on public.qubi_chats
  for delete using ((select auth.uid()) = user_id);

-- user_settings
drop policy if exists settings_select_own on public.user_settings;
create policy settings_select_own on public.user_settings
  for select using ((select auth.uid()) = user_id);
drop policy if exists settings_upsert_own on public.user_settings;
create policy settings_upsert_own on public.user_settings
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- friend_requests
drop policy if exists fr_select_own on public.friend_requests;
create policy fr_select_own on public.friend_requests
  for select using ((select auth.uid()) = sender_id or (select auth.uid()) = receiver_id);
drop policy if exists fr_insert_own on public.friend_requests;
create policy fr_insert_own on public.friend_requests
  for insert with check ((select auth.uid()) = sender_id);
drop policy if exists fr_update_own on public.friend_requests;
create policy fr_update_own on public.friend_requests
  for update using ((select auth.uid()) = receiver_id) with check ((select auth.uid()) = receiver_id);
drop policy if exists fr_delete_own on public.friend_requests;
create policy fr_delete_own on public.friend_requests
  for delete using ((select auth.uid()) = sender_id or (select auth.uid()) = receiver_id);

-- friends (legacy table, kept for backward compatibility with older clients)
drop policy if exists friends_select_own on public.friends;
create policy friends_select_own on public.friends
  for select using ((select auth.uid()) = user_id or (select auth.uid()) = friend_id);
drop policy if exists friends_insert_own on public.friends;
create policy friends_insert_own on public.friends
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists friends_update_own on public.friends;
create policy friends_update_own on public.friends
  for update using ((select auth.uid()) = user_id or (select auth.uid()) = friend_id)
  with check ((select auth.uid()) = user_id or (select auth.uid()) = friend_id);
drop policy if exists friends_delete_own on public.friends;
create policy friends_delete_own on public.friends
  for delete using ((select auth.uid()) = user_id);
