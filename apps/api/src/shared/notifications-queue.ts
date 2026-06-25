import { supabase } from './supabase';

// Recipient roles match the spec; the column has a CHECK constraint on these values.
export type RecipientRole = 'subscription_owner' | 'guide_owner' | 'trusted_representative';

// In-app payload: stored structured, but also mirrored to the legacy `title`/`content`
// columns so the existing /notifications GET endpoint and the bell UI keep working.
export interface InAppPayload {
  title: string;
  body: string;
  // Optional fields the UI can use (e.g. a deep link); ignored by legacy readers.
  href?: string;
}

// Email payload: fully rendered at enqueue time. The pg_cron worker reads it as-is
// and POSTs straight to Resend — no template logic in SQL.
export interface EmailPayload {
  to: string;          // recipient address (resolved at enqueue time)
  subject: string;
  text: string;
  html?: string;
}

export interface EnqueueArgs {
  userId: string;                   // notifications.user_id (the recipient profile)
  type: string;                     // e.g. 'subscription_renewal_upcoming'
  channel: 'email' | 'in_app';
  recipientRole: RecipientRole;
  subscriptionId?: string | null;   // Stripe subscription id (for trace)
  stripeEventId?: string | null;    // Stripe evt_... id (for idempotency)
  payload: InAppPayload | EmailPayload;
}

// Insert one notification row. Swallows 23505 (UNIQUE violation) so a re-delivered
// Stripe event never causes a duplicate row — the spec's idempotency guarantee.
export async function enqueueNotification(args: EnqueueArgs): Promise<{ inserted: boolean; reason?: string }> {
  // For in_app, also populate the legacy `title`/`content`/`is_read` columns so the
  // existing notifications routes + bell continue to render new rows correctly.
  const isInApp = args.channel === 'in_app';
  const inApp = isInApp ? (args.payload as InAppPayload) : null;
  const email = !isInApp ? (args.payload as EmailPayload) : null;

  const row: Record<string, any> = {
    user_id: args.userId,
    type: args.type,
    channel: args.channel,
    recipient_role: args.recipientRole,
    subscription_id: args.subscriptionId ?? null,
    stripe_event_id: args.stripeEventId ?? null,
    payload: args.payload,
    // Legacy columns — kept populated for the bell/feed UI:
    title: inApp?.title ?? email?.subject ?? null,
    content: inApp?.body ?? email?.text ?? null,
    is_read: false,
    // Email rows ride the worker queue; in_app rows aren't "sent" anywhere.
    status: isInApp ? null : 'pending',
    read_at: null,
  };

  const { error } = await supabase.from('notifications').insert(row);
  if (!error) return { inserted: true };

  // 23505 = unique_violation. Treat as success (already enqueued by an earlier delivery).
  if ((error as any).code === '23505') return { inserted: false, reason: 'duplicate' };

  console.error('[notifications-queue] insert failed:', error.message);
  throw error;
}
