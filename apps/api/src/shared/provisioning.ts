import { supabase } from './supabase';

// Provision (or flag) an invited child/TI account by email when a parent adds them as
// a son/daughter or a trusted individual. Idempotent:
//   - no profile yet  → create one (role 'child', invite_flow_status 'pending')
//   - profile exists, not yet invited → set invite_flow_status 'pending'
//   - already pending/completed → leave as-is
// Returns the invitee's user_id (or undefined).
export async function provisionInvitee(
  email: string | null | undefined,
  displayName?: string | null
): Promise<string | undefined> {
  if (!email) return undefined;

  const { data: existing } = await supabase
    .from('profiles')
    .select('user_id, invite_flow_status')
    .ilike('email', email)
    .maybeSingle();

  if (existing) {
    if (!existing.invite_flow_status) {
      await supabase
        .from('profiles')
        .update({ invite_flow_status: 'pending', updated_at: new Date().toISOString() })
        .eq('user_id', existing.user_id);
    }
    return existing.user_id;
  }

  const parts = (displayName || '').trim().split(/\s+/).filter(Boolean);
  const { data: created, error } = await supabase
    .from('profiles')
    .insert({
      email,
      first_name: parts[0] || null,
      last_name: parts.length > 1 ? parts.slice(1).join(' ') : null,
      role: 'child',
      invite_flow_status: 'pending',
    })
    .select('user_id')
    .single();
  if (error) {
    console.error('[provisionInvitee] failed:', error.message);
    return undefined;
  }
  return created?.user_id;
}
