import { sendEmail } from './email';
import { sendSms } from './twilio';

// Composed-email helpers. shared/email.ts stays a thin Resend transport wrapper;
// the actual subject + body for each notification lives here so a single source of
// truth covers every place that triggers it.

export interface TrustedIndividualInviteArgs {
  to: string;                  // TI's email
  parentFirstName: string;     // for the subject line — "{first} added you as a trusted individual"
  parentFullName: string;      // for the opening line of the body — exact copy uses [First] [Last]
  loginUrl: string;            // resolved at the call site (so envs differ per env)
}

// "When the parent is setting up, only the trusted individual they set up needs to
// send an email." — the same body fires from onboarding "Send all messages" AND from
// the settings PATCH whenever a new TI is designated.
export function sendTrustedIndividualInvite({
  to,
  parentFirstName,
  parentFullName,
  loginUrl,
}: TrustedIndividualInviteArgs) {
  const text =
    `${parentFullName} has added you as a trusted individual. ` +
    `This gives you the ability to check in on their behalf and release the guide when the time is right.\n\n` +
    `You can log into your account here: ${loginUrl} — and set up your account, but no rush.\n\n` +
    `There's nothing you need to do now. Have that conversation and go from there. ` +
    `There will be more instructions when you log in.`;

  const html =
    `<p>${parentFullName} has added you as a <strong>trusted individual</strong>. ` +
    `This gives you the ability to check in on their behalf and release the guide when the time is right.</p>` +
    `<p>You can <a href="${loginUrl}">log into your account</a> and set up your account, but no rush.</p>` +
    `<p>There's nothing you need to do now. Have that conversation and go from there. ` +
    `There will be more instructions when you log in.</p>`;

  return sendEmail({
    to,
    subject: `${parentFirstName} added you as a trusted individual`,
    text,
    html,
  });
}

// ─── Payment takeover requested ──────────────────────────────────────────────────
// Fires for a TI when a linked child taps "Take over payments" and finalizes the
// Stripe card capture. Same body for email + in-app; SMS is intentionally generic
// (no name, short — per the spec).

export interface TakeoverRequestEmailArgs {
  to: string;                  // TI's email
  requesterFullName: string;   // "First Last" — used verbatim in subject + body
  loginUrl: string;
}

export function sendTakeoverRequestEmail({
  to,
  requesterFullName,
  loginUrl,
}: TakeoverRequestEmailArgs) {
  const text =
    `${requesterFullName} has requested to take over payment for the guide. Login to confirm: ${loginUrl}`;
  const html =
    `<p>${requesterFullName} has requested to take over payment for the guide.</p>` +
    `<p><a href="${loginUrl}">Login to confirm</a></p>`;
  return sendEmail({
    to,
    subject: `${requesterFullName} requested to take over payment`,
    text,
    html,
  });
}

export function sendTakeoverRequestSms({ to }: { to: string }) {
  return sendSms({
    to,
    body: 'A child has requested to take over payment. Please login to confirm.',
  });
}

// In-app copy is identical to the email body (kept here so all the takeover-request
// wording lives in one place — easy to retune later).
export const takeoverRequestNotificationContent = (requesterFullName: string) =>
  `${requesterFullName} has requested to take over payment for the guide. Please confirm.`;

// ─── Subscription cancelled (owner cancelled their own subscription) ─────────────

export interface SubscriptionCancelledEmailArgs {
  to: string;
  endDate: string;     // ISO timestamp — formatted to a user-friendly date in the body
}

// "the date actually needs to appear" — formatted as e.g. "April 1, 2027".
export function sendSubscriptionCancelledEmail({ to, endDate }: SubscriptionCancelledEmailArgs) {
  const friendly = new Date(endDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const text =
    `Your LegacyBridge subscription has been cancelled — it won't auto-renew.\n\n` +
    `Your guide stays accessible until ${friendly}. After that date, the guide and its data will no longer be available.`;
  const html =
    `<p>Your <strong>LegacyBridge</strong> subscription has been cancelled — it won't auto-renew.</p>` +
    `<p>Your guide stays accessible until <strong>${friendly}</strong>. After that date, the guide and its data will no longer be available.</p>`;
  return sendEmail({
    to,
    subject: 'Your LegacyBridge subscription has been cancelled',
    text,
    html,
  });
}

// ─── Payment takeover cancelled by the child ─────────────────────────────────────
// Fires for the guide owner + each TI when the child who had taken over payment
// cancels. Date appears in the body so the recipient knows when the guide locks.

export interface TakeoverCancelledByChildArgs {
  to: string;
  childFullName: string;
  endDate: string; // ISO; formatted in the body
}

const friendlyDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

export function sendPaymentTakeoverCancelledEmail({ to, childFullName, endDate }: TakeoverCancelledByChildArgs) {
  const d = friendlyDate(endDate);
  const text =
    `${childFullName} has cancelled their payment for the guide.\n\n` +
    `Access to the guide is locked after ${d} unless a new subscription and payment method is added.`;
  const html =
    `<p><strong>${childFullName}</strong> has cancelled their payment for the guide.</p>` +
    `<p>Access to the guide is <strong>locked after ${d}</strong> unless a new subscription and payment method is added.</p>`;
  return sendEmail({
    to,
    subject: `${childFullName} cancelled payment for the guide`,
    text,
    html,
  });
}

// Same wording for the in-app notification (so all 'takeover cancelled' copy lives
// in one place).
export const takeoverCancelledNotificationContent = (childFullName: string, endDate: string) =>
  `${childFullName} has cancelled payment. Access to the guide is locked after ${friendlyDate(endDate)} unless a new payment method is added.`;

// ─── Payment takeover approved ───────────────────────────────────────────────────
// Sent to the child who requested the takeover, once an approver clicks Approve.

export function sendTakeoverApprovedEmail({ to }: { to: string }) {
  const text = 'Thank you for choosing to take over payment for the guide.';
  const html = `<p>Thank you for choosing to take over payment for the guide.</p>`;
  return sendEmail({
    to,
    subject: 'Payment takeover approved',
    text,
    html,
  });
}
