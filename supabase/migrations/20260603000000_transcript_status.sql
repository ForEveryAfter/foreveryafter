-- Transcription lifecycle for a question's audio answer:
--   'transcribing' — Whisper is running in the background (set the moment we save the audio)
--   'ready'        — transcript.txt has been written to S3; transcript_path is set
--   'failed'       — Whisper failed; transcript.txt holds the failure message so the
--                    user can edit/replace it in the text box
-- null = no transcription has been attempted (e.g. only text was typed, or Whisper isn't
-- configured yet, or the answer was a video — which we don't auto-transcribe).
alter table user_question_responses
  add column if not exists transcript_status text
    check (transcript_status in ('transcribing', 'ready', 'failed'));
