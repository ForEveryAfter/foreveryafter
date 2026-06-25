-- family_members.notify — the single source of truth for "who gets a heads-up
-- when the guide activates." Both the Family & Friends page and the Final
-- Wishes "Who should be notified?" picker read/write this column.
--
-- Why: previously the notify list lived as a JSONB array on
-- final_wishes.notify_list. That couldn't represent the natural per-person
-- toggle on the family roster, and the two surfaces (Family & Friends + Final
-- Wishes Q3) couldn't agree on state. Moving it onto family_members itself
-- gives us one row-per-person fact, and the Final Wishes picker is now just a
-- view onto family_members where notify=true and the relationship isn't
-- immediate family.
--
-- Default true: per product, everyone added is opted in unless the user
-- explicitly turns them off. Existing rows pick up the default automatically,
-- so the current Family & Friends roster lights up "on" without backfill.
--
-- The final_wishes.notify_list JSONB column stays around (don't drop) because
-- it's referenced by application code we haven't migrated yet. New writes go
-- through family_members.notify exclusively.

alter table public.family_members
  add column if not exists notify boolean not null default true;

comment on column public.family_members.notify is
  'Should this person be notified when the guide activates? Default true. Toggled from Family & Friends and from the Final Wishes "Who should be notified?" picker.';
