// Release-flow email + in-app copy. Per spec Part 5 + 6:
//   - Recipients ("designated recipients"): the guide is now available. NO mention of
//     who else received it.
//   - Other Trusted Representative(s): the release happened. Neutral, no content, no
//     financial detail.
//   - Subscription owner: confirmation + refund result. ONLY this recipient sees the
//     refund amount.
//   - Hold-mode notifications (release requested but not yet executed) go to the
//     guide owner with a cancel link, and the OTHER TR(s) for awareness.

import type { InAppPayload, EmailPayload } from '../shared/notifications-queue';

const friendlyDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });

export interface ReleaseExecutedCtx {
  guideOwnerName: string;
  guideUrl: string;       // where recipients can view the released guide
  paymentsUrl: string;    // for sub owner to see refund / billing
  refundCents?: number | null; // sub owner only
}

export interface ReleaseRequestedCtx {
  guideOwnerName: string;
  cancelUrl: string;
  executesAtIso: string;
}

// ────────────────────────────────────────────────────────────────────────────────
//  EXECUTED release (one-time, after status flips to 'released')
// ────────────────────────────────────────────────────────────────────────────────

export function releasedEmailForRecipient(
  ctx: ReleaseExecutedCtx
): Omit<EmailPayload, 'to'> {
  return {
    subject: `${ctx.guideOwnerName}'s LegacyBridge guide is now available to you`,
    text:
      `${ctx.guideOwnerName}'s LegacyBridge guide has been released and is now available to view.\n\n` +
      `${ctx.guideUrl}\n\n` +
      `Take whatever time you need with it.`,
    html:
      `<p><strong>${ctx.guideOwnerName}</strong>'s LegacyBridge guide has been released and is now available to view.</p>` +
      `<p><a href="${ctx.guideUrl}">Open the guide</a></p>` +
      `<p>Take whatever time you need with it.</p>`,
  };
}

export function releasedInAppForRecipient(ctx: ReleaseExecutedCtx): InAppPayload {
  return {
    title: `${ctx.guideOwnerName}'s guide is available`,
    body: `${ctx.guideOwnerName}'s LegacyBridge guide has been released and is now available to you.`,
    href: ctx.guideUrl,
  };
}

// "Other Trusted Representative" — neutral; doesn't expose who triggered or to whom.
export function releasedEmailForOtherRep(
  ctx: ReleaseExecutedCtx
): Omit<EmailPayload, 'to'> {
  return {
    subject: `${ctx.guideOwnerName}'s LegacyBridge guide has been released`,
    text:
      `${ctx.guideOwnerName}'s LegacyBridge guide has been released to the designated recipients.\n\n` +
      `No further action is needed from you.`,
    html:
      `<p><strong>${ctx.guideOwnerName}</strong>'s LegacyBridge guide has been released to the designated recipients.</p>` +
      `<p>No further action is needed from you.</p>`,
  };
}

export function releasedInAppForOtherRep(ctx: ReleaseExecutedCtx): InAppPayload {
  return {
    title: `${ctx.guideOwnerName}'s guide has been released`,
    body: `The guide has been released to the designated recipients. No further action is needed.`,
  };
}

// Subscription owner — the only recipient who sees the refund amount.
export function releasedEmailForSubscriptionOwner(
  ctx: ReleaseExecutedCtx
): Omit<EmailPayload, 'to'> {
  const refundDollars = ctx.refundCents != null && ctx.refundCents > 0
    ? `$${(ctx.refundCents / 100).toFixed(2)}`
    : null;
  const refundLine = refundDollars
    ? `A prorated refund of ${refundDollars} for the unused portion of your subscription has been issued to the card on file.\n\n`
    : `The remaining time on the current term was under the refund threshold, so no refund was issued.\n\n`;
  return {
    subject: 'Your LegacyBridge guide has been released',
    text:
      `Your LegacyBridge guide has been released.\n\n` +
      `${refundLine}` +
      `Your subscription has dropped to the storage tier ($5/year) so the guide stays available to the designated recipients.\n\n` +
      `You can review billing at any time: ${ctx.paymentsUrl}`,
    html:
      `<p>Your <strong>LegacyBridge</strong> guide has been released.</p>` +
      `<p>${refundLine.replace(/\n\n/g, '')}</p>` +
      `<p>Your subscription has dropped to the <strong>storage tier ($5/year)</strong> so the guide stays available to the designated recipients.</p>` +
      `<p><a href="${ctx.paymentsUrl}">Review billing</a></p>`,
  };
}

// ────────────────────────────────────────────────────────────────────────────────
//  REQUESTED release (hold > 0 — sits in 'release_pending' awaiting cancel/execute)
// ────────────────────────────────────────────────────────────────────────────────

// Goes to the guide owner. They can cancel during the hold window.
export function releaseRequestedEmailForGuideOwner(
  ctx: ReleaseRequestedCtx
): Omit<EmailPayload, 'to'> {
  return {
    subject: 'A release has been requested for your LegacyBridge guide',
    text:
      `A release has been requested for your LegacyBridge guide. Unless canceled, the release will execute at ${friendlyDateTime(ctx.executesAtIso)}.\n\n` +
      `If this is an error, you can cancel here: ${ctx.cancelUrl}`,
    html:
      `<p>A release has been requested for your <strong>LegacyBridge</strong> guide.</p>` +
      `<p>Unless canceled, the release will execute at <strong>${friendlyDateTime(ctx.executesAtIso)}</strong>.</p>` +
      `<p>If this is an error, you can <a href="${ctx.cancelUrl}">cancel here</a>.</p>`,
  };
}

export function releaseRequestedInAppForGuideOwner(
  ctx: ReleaseRequestedCtx
): InAppPayload {
  return {
    title: 'A release has been requested for your guide',
    body: `Unless canceled, the release will execute at ${friendlyDateTime(ctx.executesAtIso)}.`,
    href: ctx.cancelUrl,
  };
}

// Goes to OTHER Trusted Representative(s). Neutral.
export function releaseRequestedEmailForOtherRep(
  ctx: ReleaseRequestedCtx
): Omit<EmailPayload, 'to'> {
  return {
    subject: `A release has been requested for ${ctx.guideOwnerName}'s guide`,
    text:
      `A release has been requested for ${ctx.guideOwnerName}'s LegacyBridge guide. The release will execute at ${friendlyDateTime(ctx.executesAtIso)} unless the guide owner cancels.`,
    html:
      `<p>A release has been requested for <strong>${ctx.guideOwnerName}</strong>'s LegacyBridge guide.</p>` +
      `<p>The release will execute at <strong>${friendlyDateTime(ctx.executesAtIso)}</strong> unless the guide owner cancels.</p>`,
  };
}

export function releaseRequestedInAppForOtherRep(
  ctx: ReleaseRequestedCtx
): InAppPayload {
  return {
    title: `Release requested for ${ctx.guideOwnerName}'s guide`,
    body: `Executes at ${friendlyDateTime(ctx.executesAtIso)} unless canceled.`,
  };
}
