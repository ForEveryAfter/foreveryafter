-- Invite-flow flag: distinguishes an INVITED child/TI (who may observe or do their
-- own invite flow) from a pure guide owner or a pure observer. Set 'pending' when a
-- parent adds someone as son/daughter or a trusted individual; 'completed' when they
-- finish the invite flow. NULL = never invited.
alter table profiles add column if not exists invite_flow_status text
  check (invite_flow_status in ('pending', 'completed'));

-- Backfill: provision shell profiles (pending) for the established guide's (Harold's)
-- existing son/daughter + trusted-individual family members, so those invited accounts
-- exist and get claimed when the person logs in with the same email.
do $$
declare
  v_owner uuid := '2891f294-80ea-439a-bb4d-8f00adb05252';
  v_primary uuid;
  fm record;
  new_uid uuid;
begin
  if not exists (select 1 from profiles where user_id = v_owner) then return; end if;
  select primary_ti_member_id into v_primary from guides where parent_user_id = v_owner;

  for fm in
    select id, display_name, email, relationship
    from family_members
    where parent_guid = v_owner
      and email is not null
      and (lower(relationship) in ('son', 'daughter') or id = v_primary)
  loop
    if not exists (select 1 from profiles where lower(email) = lower(fm.email)) then
      insert into profiles (email, first_name, last_name, role, invite_flow_status)
      values (
        fm.email,
        split_part(fm.display_name, ' ', 1),
        nullif(split_part(fm.display_name, ' ', 2), ''),
        'child',
        'pending'
      )
      returning user_id into new_uid;
      update family_members set member_guid = new_uid where id = fm.id;
    end if;
  end loop;
end $$;
