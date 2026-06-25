const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function fetchWithAuth(path: string, userId: string, options: RequestInit = {}) {
  const isFormData = options.body instanceof FormData;
  
  const headers: any = {
    ...options.headers,
    'Authorization': `Bearer dummy-token-for-pass-8`,
    'x-user-id': userId,
  };

  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include', // section routes are now session-authed (sectionAuth)
    headers,
  });

  if (!response.ok) {
    // Surface the server's `error` field when it sends one (e.g. the
    // "too big" / "too long" recording validation messages) so the caller can
    // show the real reason instead of a generic statusText.
    let message = response.statusText;
    try {
      const body = await response.text();
      if (body) {
        try {
          const j = JSON.parse(body);
          if (j && typeof j.error === 'string' && j.error) message = j.error;
        } catch { /* not JSON — keep statusText */ }
      }
    } catch { /* network/body read failure — keep statusText */ }
    throw new Error(message);
  }

  return response.json();
}

// ─── Settings (session-authed; identity comes from the OAuth cookie session) ──
// Reads are scoped server-side to the logged-in user. Writes additionally carry
// the user's public `guid`, which the API matches for ownership before changing
// anything (the internal user id is never exposed to the client).

const settingsGet = async <T>(path: string): Promise<T> => {
  const res = await fetch(`${API_BASE_URL}/settings/${path}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
  return res.json();
};

const settingsPatch = async <T>(path: string, guid: string, patch: object): Promise<T> => {
  const res = await fetch(`${API_BASE_URL}/settings/${path}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guid, ...patch }),
  });
  if (!res.ok) throw new Error(`Failed to save ${path} (${res.status})`);
  return res.json();
};

// Notifications
export interface NotificationSettings {
  check_in_reminders: boolean;
  family_activity: boolean;
  product_updates: boolean;
}
export const getNotificationSettings = () => settingsGet<NotificationSettings>('notifications');
export const updateNotificationSettings = (guid: string, patch: Partial<NotificationSettings>) =>
  settingsPatch<NotificationSettings>('notifications', guid, patch);

// Account
export interface AccountSettings {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  role: 'parent' | 'child' | null;
}
export const getAccountSettings = () => settingsGet<AccountSettings>('account');
export const updateAccountSettings = (
  guid: string,
  patch: { firstName?: string; lastName?: string }
) => settingsPatch<AccountSettings>('account', guid, patch);

// Guide (lock status, check-in cadence, chosen Trusted Individuals)
export interface GuideSettings {
  isLocked: boolean;
  lockMode: 'checkin' | 'manual' | 'open';
  completion: number;
  primaryTiMemberId: string | null;
  secondaryTiMemberId: string | null;
  intervalMonths: 3 | 6 | 12;
  nextDueAt: string | null;
}
export const getGuideSettings = () => settingsGet<GuideSettings>('guide');

// Which guide sections have been started (drives the dashboard hero + tile pills).
// `tiles` is the raw per-section status — same set of tile_type values used by
// markTileStarted (apps/api/src/shared/section-auth.ts). Status flips from
// 'not_started' → 'in_progress' the first time the user writes to a section.
export type TileStatus = 'not_started' | 'in_progress' | 'complete';
export interface GuideTile {
  tile_type: string;
  status: TileStatus | null;
  completion_percentage: number;
  last_accessed_at: string | null;
}
export interface GuideProgress {
  startedCount: number;
  total: number;
  started: string[];
  tiles: GuideTile[];
}
export const getProgress = () => settingsGet<GuideProgress>('progress');

// ─── Notifications (the bell feed; session-authed, keyed to the logged-in user) ──
export interface NotificationItem {
  id: string;
  title: string;
  content: string;
  is_read: boolean;
  created_at: string;
}
// Guides the logged-in user belongs to (as immediate family or a trusted individual).
// Shaped to the dashboard's ParentRelationship; typed loosely here to avoid a cross-import.
export async function getParentGuides<T = any>(): Promise<T[]> {
  const res = await fetch(`${API_BASE_URL}/relationships/parent-guides`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to load parent guides (${res.status})`);
  return res.json();
}

// ─── Invite flow (an invited child / trusted individual completing their setup) ──
export interface InviteInfo {
  role: 'child' | 'trusted';
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  parentFirstName: string | null;
  inviteFlowStatus: 'pending' | 'completed' | null;
  videoSeen: boolean;
}
export async function getInviteInfo(): Promise<InviteInfo> {
  const res = await fetch(`${API_BASE_URL}/invite/info`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to load invite info (${res.status})`);
  return res.json();
}
export async function saveInviteInfo(patch: { phone?: string; firstName?: string; lastName?: string }) {
  const res = await fetch(`${API_BASE_URL}/invite/info`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to save invite info (${res.status})`);
  return res.json();
}
export async function markInviteVideoSeen(): Promise<void> {
  await fetch(`${API_BASE_URL}/invite/video-seen`, { method: 'POST', credentials: 'include' });
}
export async function completeInvite(): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE_URL}/invite/complete`, { method: 'POST', credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to complete invite (${res.status})`);
  return res.json();
}

export async function getNotifications(): Promise<NotificationItem[]> {
  const res = await fetch(`${API_BASE_URL}/notifications`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to load notifications (${res.status})`);
  return res.json();
}
export async function markNotificationsRead(): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE_URL}/notifications/read`, { method: 'POST', credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to mark notifications read (${res.status})`);
  return res.json();
}

// Manual check-in: advances next_due_at by the user's cadence + logs an access_event.
export interface CheckInResult {
  nextDueAt: string;
  intervalMonths: number;
  checkedInAt: string;
}
export async function checkInNow(guid: string): Promise<CheckInResult> {
  const res = await fetch(`${API_BASE_URL}/settings/checkin`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guid }),
  });
  if (!res.ok) throw new Error(`Failed to check in (${res.status})`);
  return res.json();
}
// Trusted-Individual check-in: "I just spoke with {parent}; they're doing well."
// Server verifies the caller is actually a TI for the named parent before
// advancing that parent's check-in clock.
export async function checkInOnBehalfOf(parentUserId: string): Promise<CheckInResult> {
  const res = await fetch(`${API_BASE_URL}/settings/checkin`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parentUserId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `Failed to check in (${res.status})`);
  }
  return res.json();
}
export const updateGuideSettings = (
  guid: string,
  patch: Partial<{
    isLocked: boolean;
    lockMode: GuideSettings['lockMode'];
    intervalMonths: GuideSettings['intervalMonths'];
    primaryTiMemberId: string | null;
    secondaryTiMemberId: string | null;
  }>
) => settingsPatch<GuideSettings>('guide', guid, patch);

// Family members (options for the Trusted Individual pickers, Final Wishes
// notify-list picker, etc.). `notify` is the single source of truth for who
// gets a heads-up when the guide activates (default true server-side; toggled
// from Family & Friends and from Final Wishes Q3).
export interface FamilyMember {
  id: string;
  display_name: string;
  relationship: string | null;
  email: string | null;
  phone: string | null;
  notify: boolean;
}
export const getFamilyMembers = () => settingsGet<FamilyMember[]>('family');

// Add a new person to the parent's family & friends list. Defaults to
// relationship='friend' AND notify=true on the server when omitted.
export async function addFamilyMember(input: {
  display_name: string;
  email?: string | null;
  phone?: string | null;
  relationship?: string | null;
  notify?: boolean;
}): Promise<FamilyMember> {
  const res = await fetch(`${API_BASE_URL}/settings/family`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `Failed to add family member (${res.status})`);
  return res.json();
}

// Patch a family member. Today only `notify` is patchable — extend when
// other editable fields land on the API side.
export async function updateFamilyMember(
  id: string,
  patch: { notify?: boolean },
): Promise<FamilyMember> {
  const res = await fetch(`${API_BASE_URL}/settings/family/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `Failed to update family member (${res.status})`);
  return res.json();
}

// ─── Billing ──────────────────────────────────────────────────────────────
export interface Subscription {
  planType: 'annual' | 'five_year' | 'ten_year' | 'archive';
  status: string;
  coverage: 'single' | 'both';
  activatedAt: string | null;
  expiresAt: string | null;
  nextPaymentAt: string | null;
  // 'self' = the guide owner pays; otherwise the payer's user_id (a child takeover).
  billingOwner: string;
  // True when cancellation was requested — the sub stays active until expiresAt
  // then lapses without renewing.
  cancelAtPeriodEnd: boolean;
  // Populated by the server when billingOwner is a user_id (a child took over).
  // null when billingOwner === 'self' OR when the resolution failed (e.g. the
  // child's profile / family_members row was deleted). Used by the Payments
  // page to render "Myron (son) is paying for this guide" instead of just a
  // raw user_id.
  payerName: string | null;
  payerRelationship: string | null;
}

export async function getSubscription(): Promise<Subscription | null> {
  const res = await fetch(`${API_BASE_URL}/billing/subscription`, { credentials: 'include' });
  if (res.status === 404) return null; // no active subscription
  if (!res.ok) throw new Error(`Failed to load subscription (${res.status})`);
  return res.json();
}

// Owner-initiated cancellation: stops auto-renew. Guide stays accessible until endDate,
// after which (TODO) all guide data will be deleted.
export async function cancelSubscription(): Promise<{ cancelAtPeriodEnd: boolean; endDate: string }> {
  const res = await fetch(`${API_BASE_URL}/billing/cancel`, { method: 'POST', credentials: 'include' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `Failed to cancel subscription (${res.status})`);
  return res.json();
}

export interface Plan {
  id: string; // matches subscriptions.plan_type: 'annual' | 'five_year' | 'ten_year'
  name: string;
  price: number;
  spouseAddon: number;
  period: string;
  features: string[];
}

export async function getPlans(): Promise<Plan[]> {
  const res = await fetch(`${API_BASE_URL}/billing/plans`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to load plans (${res.status})`);
  return res.json();
}

// The card on file (display-only fields) for the guide owner.
export interface PaymentMethodInfo {
  hasMethod: boolean;
  billingOwner: 'self' | 'child';
  brand?: string | null;
  last4?: string | null;
  expMonth?: number | null;
  expYear?: number | null;
  name?: string | null;
}
export async function getPaymentMethod(): Promise<PaymentMethodInfo> {
  const res = await fetch(`${API_BASE_URL}/billing/payment-method`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to load payment method (${res.status})`);
  return res.json();
}
// Open the Stripe Billing Portal to update the card (keeps the subscription/auto-renew).
export async function openBillingPortal(): Promise<{ url: string }> {
  const res = await fetch(`${API_BASE_URL}/billing/portal`, { method: 'POST', credentials: 'include' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `request failed (${res.status})`);
  }
  return res.json();
}
// Add a first card with no charge (Stripe Checkout in setup mode) — works with no
// existing customer, unlike the portal. The optional `intent` rides in the
// success_url so the page can chain a follow-up action (e.g. 'reclaim' fires the
// payment-reclaim flow once the card is captured).
export async function addPaymentMethod(intent?: 'reclaim'): Promise<{ url: string }> {
  const res = await fetch(`${API_BASE_URL}/billing/payment-method/setup`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(intent ? { intent } : {}),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `request failed (${res.status})`);
  }
  return res.json();
}
// Synchronously process a just-completed setup session. Returns the actual
// card details extracted from Stripe's session response (the authoritative
// record of what was just saved) — the page paints from this directly so the
// success UI doesn't depend on a subsequent DB read finding what the write
// just put down. The server also mirrors the record into our DB on the way
// through, but a failure there comes back as a non-blocking `dbWriteWarning`
// rather than throwing the whole call.
export interface FinalizePaymentMethodResult {
  finalized: boolean;
  paymentMethod: PaymentMethodInfo;
  dbWriteWarning: string | null;
  stripeSessionId: string;
  stripePaymentMethodId: string;
  stripeCustomerId: string;
}
export async function finalizePaymentMethodSetup(sessionId: string): Promise<FinalizePaymentMethodResult> {
  const res = await fetch(`${API_BASE_URL}/billing/payment-method/finalize`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `request failed (${res.status})`);
  }
  return res.json();
}

// Create a Stripe Checkout Session and return its hosted URL (redirect the browser).
export async function createCheckoutSession(planId: string, coverage: 'single' | 'both'): Promise<{ url: string }> {
  const res = await fetch(`${API_BASE_URL}/billing/checkout`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId, coverage }),
  });
  if (!res.ok) throw new Error(`Failed to start checkout (${res.status})`);
  return res.json();
}

// ─── Payment takeover (a linked child/TI asks to become the payer for a guide) ──
// The requester's card is captured UP FRONT (Stripe setup Checkout); the request then
// sits 'pending' with the card held. Approval promotes it to be used at the next
// renewal; decline/cancel deactivates the card.
export interface OutgoingTransfer {
  id: string;
  guideId: string;
  status: 'pending' | 'approved' | 'declined' | 'cancelled' | 'completed';
  paymentState: 'captured' | 'active' | 'deactivated' | null;
  effectiveAt: string | null;
  createdAt: string;
  decidedAt: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
}
export interface IncomingTransfer {
  id: string;
  guideId: string;
  status: string;
  createdAt: string;
  requesterName: string;
  cardBrand: string | null;
  cardLast4: string | null;
}

// Data the takeover plan-picker modal renders before the card-capture step.
//   - currentPlanType: parent's current subscriptions.plan_type (null if no sub)
//   - nextBillingAt:   parent's sub.expires_at — the date the takeover would take effect
//   - coverage / spouseName: forwarded so the picker shows the same combined price
//     the parent's /dashboard/payments page does
//   - plans:           catalog the picker grid renders from
export interface TakeoverPreview {
  parentFirstName: string | null;
  currentPlanType: string | null;
  nextBillingAt: string | null;
  coverage: 'single' | 'both';
  spouseName: string | null;
  plans: Plan[];
}
export async function getTakeoverPreview(guideId: string): Promise<TakeoverPreview> {
  const res = await fetch(
    `${API_BASE_URL}/payment-transfers/preview?guideId=${encodeURIComponent(guideId)}`,
    { credentials: 'include' }
  );
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `Couldn’t load the takeover preview (${res.status})`);
  return res.json();
}

// Step 1: start a takeover by capturing a card on Stripe (redirect to the returned URL).
//   - planType:      plan the child picked. '' / undefined = inherit parent's current.
//   - coverage:      'single' | 'both' if the spouse toggle override was used;
//                    '' / undefined = inherit current. When the parent's sub is
//                    already 'both' the picker locks the toggle on, so this can
//                    only ever be 'both' in that case.
//   - discountCode:  literal code the child applied; server re-validates and
//                    rejects (400) if invalid/expired.
export interface StartTakeoverOptions {
  planType?: string | null;
  coverage?: 'single' | 'both' | null;
  discountCode?: string | null;
}
export async function startTakeoverRequest(
  guideId: string,
  opts: StartTakeoverOptions = {},
): Promise<{ url: string }> {
  const res = await fetch(`${API_BASE_URL}/payment-transfers/checkout`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      guideId,
      planType: opts.planType || '',
      coverage: opts.coverage || '',
      discountCode: opts.discountCode || '',
    }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `Couldn’t start the request (${res.status})`);
  return res.json();
}
// Step 2: on return from Stripe, create the pending request from the captured card.
export async function finalizeTakeoverRequest(sessionId: string): Promise<{ request: OutgoingTransfer; alreadyExists?: boolean }> {
  const res = await fetch(`${API_BASE_URL}/payment-transfers/finalize`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `Couldn’t finish the request (${res.status})`);
  return res.json();
}
// My own takeover requests + their status (requester view).
export async function getOutgoingTransfers(): Promise<OutgoingTransfer[]> {
  const res = await fetch(`${API_BASE_URL}/payment-transfers/outgoing`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to load your requests (${res.status})`);
  return res.json();
}
// Takeover requests awaiting MY approval (I'm the guide owner or TI).
export async function getIncomingTransfers(): Promise<IncomingTransfer[]> {
  const res = await fetch(`${API_BASE_URL}/payment-transfers/incoming`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to load incoming requests (${res.status})`);
  return res.json();
}
export async function approveTransfer(id: string): Promise<{ status: string; effectiveAt: string }> {
  const res = await fetch(`${API_BASE_URL}/payment-transfers/${id}/approve`, { method: 'POST', credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to approve (${res.status})`);
  return res.json();
}
export async function declineTransfer(id: string): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE_URL}/payment-transfers/${id}/decline`, { method: 'POST', credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to decline (${res.status})`);
  return res.json();
}
// Cancel my own active payment takeover ('approved' or 'completed' state). Detaches
// the captured card and flips the parent guide's subscription to lapse at term end.
// Server notifies the owner + TIs.
export async function cancelTakeoverPayment(): Promise<{ cancelled: boolean; endDate: string | null }> {
  const res = await fetch(`${API_BASE_URL}/payment-transfers/cancel-takeover`, { method: 'POST', credentials: 'include' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `Couldn’t cancel (${res.status})`);
  return res.json();
}

// Owner-side: take back ownership of payments while a child has an active
// takeover. Mirror of cancelTakeoverPayment but initiated by the guide owner.
// Detaches the child's captured card, flips billing_owner back to 'self', and
// notifies the child. Does NOT cancel the subscription — the parent is
// reclaiming, so they're expected to keep paying.
export async function reclaimPaymentOwnership(): Promise<{ reclaimed: boolean }> {
  const res = await fetch(`${API_BASE_URL}/payment-transfers/reclaim`, { method: 'POST', credentials: 'include' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `Couldn’t reclaim payments (${res.status})`);
  return res.json();
}

export async function cancelTransfer(id: string): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE_URL}/payment-transfers/${id}/cancel`, { method: 'POST', credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to cancel (${res.status})`);
  return res.json();
}

// ─── Release flow (a trusted individual releases the guide to the family) ────────
export interface ReleaseStatus {
  released: boolean;
  releaseStatus: 'active' | 'release_pending' | 'released' | 'release_canceled' | null;
  releasedAt: string | null;
  releaseExecutesAt: string | null;
  holdHours: number; // RELEASE_HOLD_HOURS — 0 = immediate execution
  event: {
    id: string;
    status: 'pending' | 'executed' | 'canceled';
    requested_at?: string;
    executes_at?: string;
    executed_at?: string | null;
    canceled_at?: string | null;
  } | null;
}

export async function getReleaseStatus(guideId: string): Promise<ReleaseStatus> {
  const res = await fetch(`${API_BASE_URL}/release/${encodeURIComponent(guideId)}/status`, { credentials: 'include' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `Failed to load release status (${res.status})`);
  return res.json();
}

// Trusted-rep-triggered release. Returns either 'executed' (hold==0) or 'pending'
// (hold>0; guide owner can cancel during the window before executes_at).
export interface TriggerReleaseResult {
  status: 'executed' | 'pending';
  releaseEventId: string;
  executesAt?: string;
  executedAt?: string;
  refundCents?: number | null;
  holdHours?: number;
}
export async function triggerRelease(guideId: string): Promise<TriggerReleaseResult> {
  const res = await fetch(`${API_BASE_URL}/release/${encodeURIComponent(guideId)}`, {
    method: 'POST', credentials: 'include',
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `Couldn’t start the release (${res.status})`);
  return res.json();
}

// Guide owner only, during the hold window.
export async function cancelRelease(guideId: string): Promise<{ status: 'canceled' }> {
  const res = await fetch(`${API_BASE_URL}/release/${encodeURIComponent(guideId)}/cancel`, {
    method: 'POST', credentials: 'include',
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `Couldn’t cancel the release (${res.status})`);
  return res.json();
}

// ─── Onboarding (signup flow; session-authed, prefilled from + saved to the DB) ─
export interface OnboardingMember {
  id: string;
  displayName: string;
  relationship: string | null;
  email: string | null;
  phone: string | null;
}
export interface OnboardingData {
  onboardingComplete: boolean;
  profile: { firstName: string | null; lastName: string | null; email: string | null; phone: string | null; role: 'parent' | 'child' | null };
  family: OnboardingMember[];
  access: { primaryTiMemberId: string | null; secondaryTiMemberId: string | null; intervalMonths: number | null };
  plan: { planType: string; coverage: 'single' | 'both'; billingOwner: 'self' | 'child' } | null;
}

export async function getOnboarding(): Promise<OnboardingData> {
  const res = await fetch(`${API_BASE_URL}/onboarding`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to load onboarding (${res.status})`);
  return res.json();
}

export async function saveOnboarding(guid: string, payload: object): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE_URL}/onboarding`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guid, ...payload }),
  });
  if (!res.ok) throw new Error(`Failed to save onboarding (${res.status})`);
  return res.json();
}

// Send the children + spouse onboarding notification emails (the ones the parent
// reviewed on /onboarding/parent/notify-preview). Server reads the family list from
// the DB; only the per-recipient personalNote overrides are passed here.
export async function sendOnboardingNotifications(payload: { childrenNote: string; spouseNote?: string }): Promise<{ sent: number; failed: number; recipients: { children: number; spouse: number } }> {
  const res = await fetch(`${API_BASE_URL}/onboarding/notify`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `Failed to send notifications (${res.status})`);
  return res.json();
}

export async function completeOnboarding(guid: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE_URL}/onboarding/complete`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guid }),
  });
  if (!res.ok) throw new Error(`Failed to complete onboarding (${res.status})`);
  return res.json();
}

// Delete the audio file from storage + clear audio_path / transcript_status on the
// response row. Keeps the transcript text. Returns the updated row.
export async function deleteRecording(userId: string, questionId: string) {
  return fetchWithAuth(`/interview/recording?questionId=${encodeURIComponent(questionId)}`, userId, {
    method: 'DELETE',
  });
}

export async function saveRecording(userId: string, data: {
  questionId: string;
  slug: string;
  type: 'audio' | 'video';
  blob: Blob;
  mimeType: string;
  section: string;
}) {
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onloadend = async () => {
      const base64data = (reader.result as string).split(',')[1];
      try {
        const result = await fetchWithAuth('/interview/save', userId, {
          method: 'POST',
          body: JSON.stringify({
            ...data,
            data: base64data,
            blob: undefined // Don't send the blob in JSON
          }),
        });
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(data.blob);
  });
}
