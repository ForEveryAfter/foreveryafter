-- Add RLS policies to the 12 tables that have RLS enabled but zero policies.
-- These tables are currently only accessible via the service role key.
-- Adding policies ensures they are also safe if accessed via anon/authenticated keys.

-- ═══════════════════════════════════════════════════════
-- profiles: owner-only access via user_id
-- ═══════════════════════════════════════════════════════
create policy "profiles_select_own" on profiles
  for select using (auth.uid() = user_id);
create policy "profiles_insert_own" on profiles
  for insert with check (auth.uid() = user_id);
create policy "profiles_update_own" on profiles
  for update using (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════
-- relationships: both participants can read/write
-- ═══════════════════════════════════════════════════════
create policy "relationships_select" on relationships
  for select using (auth.uid() in (child_user_id, parent_user_id));
create policy "relationships_insert" on relationships
  for insert with check (auth.uid() in (child_user_id, parent_user_id));
create policy "relationships_update" on relationships
  for update using (auth.uid() in (child_user_id, parent_user_id));

-- ═══════════════════════════════════════════════════════
-- guides: owner-only via parent_user_id
-- ═══════════════════════════════════════════════════════
create policy "guides_select_own" on guides
  for select using (auth.uid() = parent_user_id);
create policy "guides_insert_own" on guides
  for insert with check (auth.uid() = parent_user_id);
create policy "guides_update_own" on guides
  for update using (auth.uid() = parent_user_id);
create policy "guides_delete_own" on guides
  for delete using (auth.uid() = parent_user_id);

-- ═══════════════════════════════════════════════════════
-- tiles: scoped via guide ownership
-- ═══════════════════════════════════════════════════════
create policy "tiles_select_own" on tiles
  for select using (
    exists (select 1 from guides where guides.id = tiles.guide_id and guides.parent_user_id = auth.uid())
  );
create policy "tiles_insert_own" on tiles
  for insert with check (
    exists (select 1 from guides where guides.id = tiles.guide_id and guides.parent_user_id = auth.uid())
  );
create policy "tiles_update_own" on tiles
  for update using (
    exists (select 1 from guides where guides.id = tiles.guide_id and guides.parent_user_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════
-- interview_sessions: scoped via guide ownership
-- ═══════════════════════════════════════════════════════
create policy "interview_sessions_select_own" on interview_sessions
  for select using (
    exists (select 1 from guides where guides.id = interview_sessions.guide_id and guides.parent_user_id = auth.uid())
  );
create policy "interview_sessions_insert_own" on interview_sessions
  for insert with check (
    exists (select 1 from guides where guides.id = interview_sessions.guide_id and guides.parent_user_id = auth.uid())
  );
create policy "interview_sessions_update_own" on interview_sessions
  for update using (
    exists (select 1 from guides where guides.id = interview_sessions.guide_id and guides.parent_user_id = auth.uid())
  );
create policy "interview_sessions_delete_own" on interview_sessions
  for delete using (
    exists (select 1 from guides where guides.id = interview_sessions.guide_id and guides.parent_user_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════
-- messages: scoped via session -> guide ownership
-- ═══════════════════════════════════════════════════════
create policy "messages_select_own" on messages
  for select using (
    exists (
      select 1 from interview_sessions s
      join guides g on g.id = s.guide_id
      where s.id = messages.session_id and g.parent_user_id = auth.uid()
    )
  );
create policy "messages_insert_own" on messages
  for insert with check (
    exists (
      select 1 from interview_sessions s
      join guides g on g.id = s.guide_id
      where s.id = messages.session_id and g.parent_user_id = auth.uid()
    )
  );

-- ═══════════════════════════════════════════════════════
-- access_events: parent can read events for their guide;
-- insert allowed when triggered_by matches auth user
-- ═══════════════════════════════════════════════════════
create policy "access_events_select_own" on access_events
  for select using (
    exists (select 1 from guides where guides.id = access_events.guide_id and guides.parent_user_id = auth.uid())
  );
create policy "access_events_insert" on access_events
  for insert with check (auth.uid() = triggered_by_user_id);

-- ═══════════════════════════════════════════════════════
-- check_in_settings: scoped via guide ownership
-- ═══════════════════════════════════════════════════════
create policy "check_in_settings_select_own" on check_in_settings
  for select using (
    exists (select 1 from guides where guides.id = check_in_settings.guide_id and guides.parent_user_id = auth.uid())
  );
create policy "check_in_settings_insert_own" on check_in_settings
  for insert with check (
    exists (select 1 from guides where guides.id = check_in_settings.guide_id and guides.parent_user_id = auth.uid())
  );
create policy "check_in_settings_update_own" on check_in_settings
  for update using (
    exists (select 1 from guides where guides.id = check_in_settings.guide_id and guides.parent_user_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════
-- subscriptions: owner-only via user_id
-- ═══════════════════════════════════════════════════════
create policy "subscriptions_select_own" on subscriptions
  for select using (auth.uid() = user_id);
create policy "subscriptions_insert_own" on subscriptions
  for insert with check (auth.uid() = user_id);
create policy "subscriptions_update_own" on subscriptions
  for update using (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════
-- occasions: scoped via guide ownership
-- ═══════════════════════════════════════════════════════
create policy "occasions_select_own" on occasions
  for select using (
    exists (select 1 from guides where guides.id = occasions.guide_id and guides.parent_user_id = auth.uid())
  );
create policy "occasions_insert_own" on occasions
  for insert with check (
    exists (select 1 from guides where guides.id = occasions.guide_id and guides.parent_user_id = auth.uid())
  );
create policy "occasions_update_own" on occasions
  for update using (
    exists (select 1 from guides where guides.id = occasions.guide_id and guides.parent_user_id = auth.uid())
  );
create policy "occasions_delete_own" on occasions
  for delete using (
    exists (select 1 from guides where guides.id = occasions.guide_id and guides.parent_user_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════
-- vault_items: scoped via guide ownership
-- ═══════════════════════════════════════════════════════
create policy "vault_items_select_own" on vault_items
  for select using (
    exists (select 1 from guides where guides.id = vault_items.guide_id and guides.parent_user_id = auth.uid())
  );
create policy "vault_items_insert_own" on vault_items
  for insert with check (
    exists (select 1 from guides where guides.id = vault_items.guide_id and guides.parent_user_id = auth.uid())
  );
create policy "vault_items_update_own" on vault_items
  for update using (
    exists (select 1 from guides where guides.id = vault_items.guide_id and guides.parent_user_id = auth.uid())
  );
create policy "vault_items_delete_own" on vault_items
  for delete using (
    exists (select 1 from guides where guides.id = vault_items.guide_id and guides.parent_user_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════
-- notifications: recipient can read and mark as read;
-- no user insert (system-only inserts via service role)
-- ═══════════════════════════════════════════════════════
create policy "notifications_select_own" on notifications
  for select using (auth.uid() = user_id);
create policy "notifications_update_own" on notifications
  for update using (auth.uid() = user_id);
