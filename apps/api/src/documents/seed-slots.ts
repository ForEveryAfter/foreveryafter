import type { SupabaseClient } from '@supabase/supabase-js';

// Canonical list of document slots every guide should have. Lives in one place so
// /identity/onboard (parent onboarding) and GET /documents (lazy self-heal) can't
// drift. Sort order is the rendered order; upload_tier=='location_only' means the
// user can only enter a location pointer (no file upload).
//
// To add a new slot: append to this list with the next sort_order. Existing users
// won't get it retroactively (the lazy seeder only fires when slots are empty);
// you'd need a separate one-shot backfill migration to add it to existing parents.
export const DOCUMENT_SLOT_SEEDS = [
  { document_type: 'will',                 label: 'Will',                              upload_tier: 'upload_or_location', is_required: true,  sort_order: 1 },
  { document_type: 'trust',                label: 'Trust',                             upload_tier: 'upload_or_location', is_required: false, sort_order: 2 },
  { document_type: 'poa',                  label: 'Power of Attorney',                 upload_tier: 'upload_or_location', is_required: false, sort_order: 3 },
  { document_type: 'healthcare_poa',       label: 'Healthcare Power of Attorney',      upload_tier: 'upload_or_location', is_required: false, sort_order: 4 },
  { document_type: 'advance_directive',    label: 'Advance Directive / Living Will',   upload_tier: 'upload_or_location', is_required: false, sort_order: 5 },
  { document_type: 'guardianship',         label: 'Guardianship Designations',         upload_tier: 'upload_or_location', is_required: false, sort_order: 6 },
  { document_type: 'life_insurance',       label: 'Life Insurance',                    upload_tier: 'upload_or_location', is_required: false, sort_order: 7 },
  { document_type: 'retirement',           label: 'Retirement Accounts',               upload_tier: 'upload_or_location', is_required: false, sort_order: 8 },
  { document_type: 'birth_certificate',    label: 'Birth Certificate',                 upload_tier: 'location_only',      is_required: false, sort_order: 9 },
  { document_type: 'marriage_certificate', label: 'Marriage Certificate',              upload_tier: 'location_only',      is_required: false, sort_order: 10 },
  { document_type: 'military',             label: 'Military Papers (DD-214)',          upload_tier: 'location_only',      is_required: false, sort_order: 11 },
  { document_type: 'real_estate',          label: 'Real Estate Deeds',                 upload_tier: 'location_only',      is_required: false, sort_order: 12 },
  { document_type: 'vehicle',              label: 'Vehicle Titles',                    upload_tier: 'location_only',      is_required: false, sort_order: 13 },
  { document_type: 'business',             label: 'Business Documents',                upload_tier: 'upload_or_location', is_required: false, sort_order: 14 },
] as const;

// Insert the canonical seeds for a parent if they have no slots yet. Idempotent:
// re-running is a no-op once any slot exists (so users who've already added or
// renamed slots won't have surprises). Designed to be called inline from the
// /documents GET — first visit lands the slots, subsequent visits skip.
//
// Why not a CHECK by parent? Because the standard onboarding /identity/onboard
// also inserts these, and we want to seed only when truly empty (avoiding the
// rare race where onboarding succeeded AND the lazy fire both insert).
export async function ensureDocumentSlots(
  parentGuid: string,
  supabase: SupabaseClient,
): Promise<void> {
  const { data: existing, error: readErr } = await supabase
    .from('document_slots')
    .select('id')
    .eq('parent_guid', parentGuid)
    .limit(1);
  if (readErr) {
    // Don't block the page render — fall through and the GET returns []. Better
    // than 500'ing the whole panel. The next visit will retry.
    console.error('[documents] seed read failed:', readErr.message);
    return;
  }
  if (existing && existing.length > 0) return;

  const rows = DOCUMENT_SLOT_SEEDS.map((s) => ({ ...s, parent_guid: parentGuid }));
  const { error: insertErr } = await supabase.from('document_slots').insert(rows);
  if (insertErr) {
    console.error('[documents] seed insert failed:', insertErr.message);
  }
}
