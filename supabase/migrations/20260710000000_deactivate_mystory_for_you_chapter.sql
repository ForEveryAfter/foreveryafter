-- Deactivate the "For You" chapter under section='mystory'.
--
-- Context: the chapter was added to production after the baseline
-- (not in any migration in this repo). It never received any questions,
-- so the interview engine renders it as a dead-end tile. Setting
-- is_active=false hides it — GET /interview/chapters filters WHERE
-- is_active = true, so the UI stops surfacing the row on the next load.
--
-- Chose soft-delete over DELETE for reversibility (flip is_active back
-- to true and it reappears) and to avoid any cascade risk on FK we
-- haven't audited (user_question_recordings, etc.).
--
-- ILIKE matches case + trailing-whitespace variants so a "For You "
-- or "for you" row is still caught. If no row matches, the UPDATE is
-- a no-op — safe to re-run.

UPDATE chapters
   SET is_active = false
 WHERE section = 'mystory'
   AND name ILIKE 'for you';
