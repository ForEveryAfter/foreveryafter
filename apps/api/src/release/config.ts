// Named constants for the release flow (spec mandates no magic numbers). All read
// from env so they can be tuned per environment without code changes.

// Hours the manual-release request sits in 'release_pending' before executing.
// 0 = execute immediately on TR confirmation (matches the pre-v2 behavior). Set higher
// for a cancellation window where the guide owner can review the request and abort.
export const RELEASE_HOLD_HOURS = Number(process.env.RELEASE_HOLD_HOURS ?? 0);

// Refund threshold: if the prepaid term has MORE than this many days remaining when
// release executes, prorate-refund the unused portion. Otherwise no refund.
// Default matches "more than ~1 month remains" from the spec.
export const REFUND_MIN_REMAINING_DAYS = Number(process.env.REFUND_MIN_REMAINING_DAYS ?? 30);

// $5/year storage tier the subscription downgrades to once a guide is released.
export const STORAGE_PRICE_CENTS = 500;
export const STORAGE_PLAN_ID = 'storage'; // subscription_plans.id

// Shared secret for the internal monitor endpoint (checkin worker calls this to
// execute due 'pending' release events). Set in apps/api/.env. When unset, the
// internal endpoint refuses every call.
export const CHECKIN_MONITOR_SECRET = process.env.CHECKIN_MONITOR_SECRET || '';
