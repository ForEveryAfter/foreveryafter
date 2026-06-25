-- Reshape occasions table for v1 Special Occasions feature.
-- Table is empty (0 rows) — no data migration needed.

-- Rename date → occasion_date, change type, make nullable
ALTER TABLE occasions RENAME COLUMN date TO occasion_date;
ALTER TABLE occasions ALTER COLUMN occasion_date DROP NOT NULL;
ALTER TABLE occasions ALTER COLUMN occasion_date TYPE date USING occasion_date::date;

-- Drop unused column
ALTER TABLE occasions DROP COLUMN occasion_type;

-- Add new columns
ALTER TABLE occasions ADD COLUMN recipient_guid uuid REFERENCES family_members(id);
ALTER TABLE occasions ADD COLUMN is_family_message boolean NOT NULL DEFAULT false;
ALTER TABLE occasions ADD COLUMN format text NOT NULL DEFAULT 'text'
  CHECK (format IN ('text', 'audio', 'video'));
ALTER TABLE occasions ADD COLUMN content_text text;
ALTER TABLE occasions ADD COLUMN audio_path text;
ALTER TABLE occasions ADD COLUMN video_path text;
ALTER TABLE occasions ADD COLUMN status text NOT NULL DEFAULT 'not_started'
  CHECK (status IN ('not_started', 'in_progress', 'complete'));

-- Enforce recipient logic
ALTER TABLE occasions ADD CONSTRAINT occasions_recipient_check
  CHECK (
    (is_family_message = true AND recipient_guid IS NULL)
    OR
    (is_family_message = false AND recipient_guid IS NOT NULL)
  );
