# LegacyBridge

## Database Discipline

- Schema changes are made ONLY through migration files in `supabase/migrations/`
- Supabase Studio is read-only — never use the Table Editor or SQL Editor to alter schema
- Every new table requires: migration file, RLS enabled, policies for the operations the app uses
- Migrations are applied via `supabase db push`, never by pasting SQL into Studio
- Before modifying any table's schema, first read the baseline migration to see current state
- The baseline migration (`20260429000000_baseline_from_production.sql`) represents production as of 2026-04-29 — do not re-run it against production
