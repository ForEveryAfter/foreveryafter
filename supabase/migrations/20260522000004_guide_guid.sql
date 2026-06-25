-- Public, opaque handle for a guide, distinct from the internal guides.id
-- (mirrors profiles.guid). Used as the S3 key prefix so internal ids never
-- appear in storage paths: guides/{guid}/{tile}/{question}/...
alter table guides add column if not exists guid uuid not null default gen_random_uuid();
create unique index if not exists guides_guid_key on guides (guid);
