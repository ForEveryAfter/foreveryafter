// Subscription-lifecycle email + in-app copy. All four event types and all three
// recipient roles live here so the wording is in one place.
//
// PRIVACY RULE (spec Part 4): trusted_representative and guide_owner must NOT receive
// financial details (no amounts, no card info). Only the subscription_owner sees
// payment-method / billing-issue language.

import type { InAppPayload, EmailPayload, RecipientRole } from './notifications-queue';

const friendlyDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'the upcoming renewal date';

export interface SubscriptionContext {
  /** Display name for the guide owner — used in TI/guide_owner copy. */
  guideOwnerName: string;
  /** Display name for the subscription owner — used in TI copy. */
  subscriptionOwnerName: string;
  /** Friendly-formatted upcoming/end date when known. */
  dateIso: string | null;
  /** Public link to the Payments tab (where the user can update payment / reactivate). */
  paymentsUrl: string;
}

// ────────────────────────────────────────────────────────────────────────────────
//  EMAIL templates
// ────────────────────────────────────────────────────────────────────────────────

export function emailFor(
  type:
    | 'subscription_renewal_upcoming'
    | 'subscription_renewed'
    | 'subscription_payment_failed'
    | 'subscription_expired',
  role: RecipientRole,
  ctx: SubscriptionContext
): Omit<EmailPayload, 'to'> {
  const date = friendlyDate(ctx.dateIso);

  switch (type) {
    // ── invoice.upcoming → only the subscription_owner gets this ────────────────
    case 'subscription_renewal_upcoming':
      return {
        subject: `Your ForEveryAfter subscription renews on ${date}`,
        text:
          `Heads up — your ForEveryAfter subscription is set to renew on ${date} and the card on file will be charged automatically.\n\n` +
          `If you need to update your payment method first, you can do so in your Payments tab: ${ctx.paymentsUrl}\n\n` +
          `Nothing else to do otherwise. We'll send you a confirmation once the renewal goes through.`,
        html:
          `<p>Heads up — your <strong>ForEveryAfter</strong> subscription is set to renew on <strong>${date}</strong> and the card on file will be charged automatically.</p>` +
          `<p>If you need to update your payment method first, you can do so in your <a href="${ctx.paymentsUrl}">Payments tab</a>.</p>` +
          `<p>Nothing else to do otherwise. We'll send you a confirmation once the renewal goes through.</p>`,
      };

    // ── invoice.paid (cycle) → only the subscription_owner gets this ────────────
    case 'subscription_renewed':
      return {
        subject: 'Your ForEveryAfter subscription has been renewed',
        text:
          `Your ForEveryAfter subscription has renewed. Thanks for keeping the guide active — there's nothing else you need to do.\n\n` +
          `You can review your plan anytime in the Payments tab: ${ctx.paymentsUrl}`,
        html:
          `<p>Your <strong>ForEveryAfter</strong> subscription has renewed. Thanks for keeping the guide active — there's nothing else you need to do.</p>` +
          `<p>You can review your plan anytime in the <a href="${ctx.paymentsUrl}">Payments tab</a>.</p>`,
      };

    // ── invoice.payment_failed (cycle) → owner / TI / guide_owner all get email ──
    case 'subscription_payment_failed':
      if (role === 'subscription_owner') {
        // Owner only: payment-method language. NO card numbers, NO amounts.
        return {
          subject: 'Action needed: your ForEveryAfter renewal payment didn’t go through',
          text:
            `Your renewal payment didn't go through. This is usually a billing issue — an expired card, an updated address on file with your bank, or a temporary hold.\n\n` +
            `Please update your payment method in the Payments tab so the guide doesn't lapse: ${ctx.paymentsUrl}\n\n` +
            `Stripe will retry automatically a couple of times; updating the card on file is the fastest fix.`,
          html:
            `<p>Your renewal payment didn't go through. This is usually a billing issue — an expired card, an updated address on file with your bank, or a temporary hold.</p>` +
            `<p>Please <a href="${ctx.paymentsUrl}">update your payment method</a> so the guide doesn't lapse.</p>` +
            `<p>Stripe will retry automatically a couple of times; updating the card on file is the fastest fix.</p>`,
        };
      }
      // TI + guide_owner: neutral, no financial detail. "Authority without access."
      return {
        subject: `${ctx.guideOwnerName}'s ForEveryAfter guide needs attention`,
        text:
          `The subscription keeping ${ctx.guideOwnerName}'s ForEveryAfter guide active needs attention.\n\n` +
          `Please reach out to ${ctx.subscriptionOwnerName} so it doesn't lapse — they can resolve it from their Payments tab.`,
        html:
          `<p>The subscription keeping <strong>${ctx.guideOwnerName}</strong>'s ForEveryAfter guide active needs attention.</p>` +
          `<p>Please reach out to <strong>${ctx.subscriptionOwnerName}</strong> so it doesn't lapse — they can resolve it from their Payments tab.</p>`,
      };

    // ── customer.subscription.deleted → owner / TI / guide_owner all get email ──
    case 'subscription_expired':
      if (role === 'subscription_owner') {
        return {
          subject: 'Your ForEveryAfter subscription has ended',
          text:
            `Your ForEveryAfter subscription has ended. Access to the guide is at risk and will be removed unless a new subscription is started.\n\n` +
            `You can reactivate from the Payments tab: ${ctx.paymentsUrl}`,
          html:
            `<p>Your <strong>ForEveryAfter</strong> subscription has ended. Access to the guide is at risk and will be removed unless a new subscription is started.</p>` +
            `<p>You can <a href="${ctx.paymentsUrl}">reactivate from the Payments tab</a>.</p>`,
        };
      }
      // TI + guide_owner: neutral.
      return {
        subject: `${ctx.guideOwnerName}'s ForEveryAfter guide is at risk`,
        text:
          `${ctx.guideOwnerName}'s ForEveryAfter subscription has ended. Access to the guide is at risk and will be removed unless a new subscription is started.\n\n` +
          `Please reach out to ${ctx.subscriptionOwnerName} so they can reactivate it.`,
        html:
          `<p><strong>${ctx.guideOwnerName}</strong>'s ForEveryAfter subscription has ended. Access to the guide is at risk and will be removed unless a new subscription is started.</p>` +
          `<p>Please reach out to <strong>${ctx.subscriptionOwnerName}</strong> so they can reactivate it.</p>`,
      };
  }
}

// ────────────────────────────────────────────────────────────────────────────────
//  IN-APP templates (only payment_failed per spec — subscription_owner + TI)
// ────────────────────────────────────────────────────────────────────────────────

export function inAppFor(
  type: 'subscription_payment_failed',
  role: 'subscription_owner' | 'trusted_representative',
  ctx: SubscriptionContext
): InAppPayload {
  if (type === 'subscription_payment_failed') {
    if (role === 'subscription_owner') {
      return {
        title: 'Renewal payment failed — update your payment method',
        body: `Your renewal payment didn't go through. Update your payment method in the Payments tab so the guide doesn't lapse.`,
        href: ctx.paymentsUrl,
      };
    }
    // TI: neutral, no financial detail.
    return {
      title: 'A subscription you oversee needs attention',
      body: `${ctx.guideOwnerName}'s ForEveryAfter guide subscription needs attention. Please reach out to ${ctx.subscriptionOwnerName}.`,
    };
  }
  // Exhaustiveness fallback.
  return { title: 'Notification', body: '' };
}
