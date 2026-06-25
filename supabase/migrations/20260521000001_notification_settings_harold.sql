-- Add Harold Lee (the parent / guide owner) to notification_settings.
-- His login email is myron_lee@hotmail.com (the Microsoft test account used
-- for the parent persona). Myron the son keeps myronlee@gmail.com.
-- Toggle columns fall back to their defaults.

insert into notification_settings (name, email, relationship) values
  ('Harold Lee', 'myron_lee@hotmail.com', 'self')
on conflict (email) do nothing;
