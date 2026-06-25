-- Fix: "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" when saving a recording (POST /interview/save) or saving typed
-- text (POST /interview/save-text).
--
-- The baseline migration [20260429000000_baseline_from_production.sql] declares
--
--   unique (parent_guid, question_id)
--
-- on user_question_responses, and the interview routes upsert against exactly
-- that column pair via `onConflict: 'parent_guid,question_id'`. But the baseline
-- file is a SNAPSHOT (per CLAUDE.md it must not be re-run against production),
-- and the live database is missing the constraint. Adding it here so the next
-- `supabase db push` brings prod in line with the API's expectations.
--
-- Wrapped in a DO block so this migration is idempotent: if some past hand-fix
-- already added the constraint with a different name, the check below sees it
-- and skips. If it's truly absent, we first dedupe (keep newest row per pair —
-- the constraint would otherwise reject the ALTER) and then add it.

do $$
declare
  v_has_unique boolean;
begin
  -- Any UNIQUE constraint (or unique index) covering exactly the column pair
  -- {parent_guid, question_id}? Compare by column names so a renamed constraint
  -- doesn't fool us. attname is type `name`; cast to text so `=` with text[] works
  -- (the original version blew up with "operator does not exist: name[] = text[]").
  select exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.user_question_responses'::regclass
      and c.contype = 'u'
      and (
        select array_agg(a.attname::text order by a.attname::text)
        from unnest(c.conkey) k
        join pg_attribute a
          on a.attrelid = c.conrelid and a.attnum = k
      ) = array['parent_guid', 'question_id']::text[]
  )
  or exists (
    select 1
    from pg_index i
    join pg_class t on t.oid = i.indrelid
    where t.relname = 'user_question_responses'
      and i.indisunique
      and (
        select array_agg(a.attname::text order by a.attname::text)
        from unnest(i.indkey) k
        join pg_attribute a
          on a.attrelid = i.indrelid and a.attnum = k
      ) = array['parent_guid', 'question_id']::text[]
  )
  into v_has_unique;

  if v_has_unique then
    raise notice 'user_question_responses unique(parent_guid, question_id) already present — skipping';
    return;
  end if;

  -- Dedupe before adding the constraint. Keep the row with the most recent
  -- recorded_at (ties broken by id desc) per (parent_guid, question_id).
  with ranked as (
    select id,
           row_number() over (
             partition by parent_guid, question_id
             order by recorded_at desc nulls last, id desc
           ) as rn
    from public.user_question_responses
  )
  delete from public.user_question_responses
  where id in (select id from ranked where rn > 1);

  alter table public.user_question_responses
    add constraint user_question_responses_parent_guid_question_id_key
    unique (parent_guid, question_id);
end $$;
