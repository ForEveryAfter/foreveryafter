-- Add photo columns to final_wishes for obituary and funeral program photos.
-- These are uploaded by the parent and surface read-only on the kid-side memorial page.

ALTER TABLE final_wishes
  ADD COLUMN IF NOT EXISTS obituary_photo_path text,
  ADD COLUMN IF NOT EXISTS funeral_program_photo_path text;
