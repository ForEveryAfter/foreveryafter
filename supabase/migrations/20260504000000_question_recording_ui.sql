-- Add columns needed for the question recording UI:
-- 1. suppress_transcribe_warning on profiles (for "don't ask me again" preference)
-- 2. text_content on user_question_responses (for typed/transcribed text answers)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS suppress_transcribe_warning boolean NOT NULL DEFAULT false;

ALTER TABLE user_question_responses
  ADD COLUMN IF NOT EXISTS text_content text;
