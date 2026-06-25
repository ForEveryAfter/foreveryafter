-- SEED CHAPTERS
INSERT INTO chapters (id, name, "order") VALUES
  (uuid_generate_v4(), 'Early Life & Childhood', 1),
  (uuid_generate_v4(), 'Adulthood & Career', 2),
  (uuid_generate_v4(), 'Family & Relationships', 3),
  (uuid_generate_v4(), 'Values & Wisdom', 4),
  (uuid_generate_v4(), 'Final Wishes', 5);

-- SEED QUESTIONS (Examples)
-- Note: You'll need the chapter IDs generated above if you want to link them properly.
-- Alternatively, we can use fixed UUIDs for seeding to make it easier.

-- Fixed UUIDs for Chapters to enable seeding questions
DELETE FROM chapters;
INSERT INTO chapters (id, name, "order") VALUES
  ('a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Early Life & Childhood', 1),
  ('b2c3d4e5-f6a7-4b6c-9d0e-1f2a3b4c5d6e', 'Adulthood & Career', 2),
  ('c3d4e5f6-a7b8-4c7d-0e1f-2a3b4c5d6e7f', 'Family & Relationships', 3),
  ('d4e5f6a7-b8c9-4d8e-1f2a-3b4c5d6e7f8a', 'Values & Wisdom', 4),
  ('e5f6a7b8-c9d0-4e9f-2a3b-4c5d6e7f8a9b', 'Final Wishes', 5);

INSERT INTO questions (id, chapter_id, title, slug, prompt_audio_slug, type, "order") VALUES
  (uuid_generate_v4(), 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Where were you born and what was your home like?', 'birthplace-home', 'q-birthplace', 'core', 1),
  (uuid_generate_v4(), 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'What is your earliest childhood memory?', 'earliest-memory', 'q-memory', 'core', 2),
  (uuid_generate_v4(), 'b2c3d4e5-f6a7-4b6c-9d0e-1f2a3b4c5d6e', 'What was your first job and what did it teach you?', 'first-job', 'q-job', 'core', 1),
  (uuid_generate_v4(), 'c3d4e5f6-a7b8-4c7d-0e1f-2a3b4c5d6e7f', 'How did you meet your spouse or partner?', 'meeting-partner', 'q-partner', 'core', 1),
  (uuid_generate_v4(), 'd4e5f6a7-b8c9-4d8e-1f2a-3b4c5d6e7f8a', 'What are the three most important values you live by?', 'core-values', 'q-values', 'core', 1);
