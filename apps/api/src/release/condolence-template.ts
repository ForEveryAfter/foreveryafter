// Warm condolence email — grief context, not transactional. Spec Part 6:
// pull {parent_name} and {recipient_name} from profiles; 90-day reminder window
// (CLAIM_WINDOW_DAYS). Do NOT include the OTP here; do NOT name other recipients.

import type { EmailPayload, InAppPayload } from '../shared/notifications-queue';

export const CLAIM_WINDOW_DAYS = 90;

export interface CondolenceCtx {
  parentName: string;
  recipientFirstName: string;
  accountLink: string; // login URL — recipient logs in to claim the package
}

export function condolenceEmail(ctx: CondolenceCtx): Omit<EmailPayload, 'to'> {
  const greeting = ctx.recipientFirstName ? `Dear ${ctx.recipientFirstName},` : 'Hello,';
  const text =
    `${greeting}\n\n` +
    `We're so sorry for your loss. ${ctx.parentName} created a legacy package for you, prepared for this moment.\n\n` +
    `There's nothing you need to do right now. When you feel ready, please log into your account within the next ${CLAIM_WINDOW_DAYS} days to access it: ${ctx.accountLink}\n\n` +
    `We're here whenever you're ready.`;
  const html =
    `<p>${greeting}</p>` +
    `<p>We're so sorry for your loss. <strong>${ctx.parentName}</strong> created a legacy package for you, prepared for this moment.</p>` +
    `<p>There's nothing you need to do right now. When you feel ready, please <a href="${ctx.accountLink}">log into your account</a> within the next ${CLAIM_WINDOW_DAYS} days to access it.</p>` +
    `<p>We're here whenever you're ready.</p>`;
  return {
    subject: `A message left for you by ${ctx.parentName}`,
    text,
    html,
  };
}

// SMS template for the OTP send. The raw 6-digit code travels here ONLY — never
// in the email. Brief, plain-text. No marketing wrapper.
export function otpSmsBody(code: string, parentName: string): string {
  return `${parentName}'s legacy package: your one-time code is ${code}. Enter it in your account to download.`;
}

// In-app notification mirror of the condolence email (so the package shows up in
// the bell when the recipient happens to be logged in already).
export function condolenceInApp(ctx: CondolenceCtx): InAppPayload {
  return {
    title: `A message left for you by ${ctx.parentName}`,
    body: `${ctx.parentName} prepared something for you. Log into your account when you're ready.`,
    href: ctx.accountLink,
  };
}
