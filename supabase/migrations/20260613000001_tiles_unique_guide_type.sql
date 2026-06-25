-- Two-part fix for "the dashboard says 13 of 7 sections started":
--
-- 1) Dedupe existing tiles. Without a unique constraint, the read-then-write
--    pattern in markTileStarted (apps/api/src/shared/section-auth.ts) races
--    under concurrent requests — each one sees no existing row and inserts a
--    fresh one. That's how Harold's guide ended up with 7 rows for
--    tile_type='occasions' even though only one is meaningful.
--
-- 2) Add unique(guide_id, tile_type) so the API can switch to an upsert and
--    the race becomes impossible. The dedupe must run BEFORE the constraint
--    is added (otherwise the ALTER fails on existing duplicates).
--
-- Idempotent — the dedupe is a no-op once there are no duplicates, and the
-- constraint add is guarded by an existence check so re-runs are safe.

do $$
declare
  v_has_unique boolean;
begin
  -- Dedupe first: keep the row with the most recent last_accessed_at per
  -- (guide_id, tile_type); ties broken by created_at then id. The status on
  -- the surviving row is whichever row was last touched — fine for our
  -- semantics (all duplicates were 'in_progress' anyway).
  with ranked as (
    select id,
           row_number() over (
             partition by guide_id, tile_type
             order by last_accessed_at desc nulls last,
                      created_at desc nulls last,
                      id desc
           ) as rn
    from public.tiles
  )
  delete from public.tiles
  where id in (select id from ranked where rn > 1);

  -- Add the unique constraint only if missing. attname compared as text to
  -- avoid the name[] = text[] type mismatch that bit us once before
  -- (migration 20260611000000).
  select exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.tiles'::regclass
      and c.contype = 'u'
      and (
        select array_agg(a.attname::text order by a.attname::text)
        from unnest(c.conkey) k
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k
      ) = array['guide_id', 'tile_type']::text[]
  ) into v_has_unique;

  if not v_has_unique then
    alter table public.tiles
      add constraint tiles_guide_id_tile_type_key
      unique (guide_id, tile_type);
  end if;
end $$;
