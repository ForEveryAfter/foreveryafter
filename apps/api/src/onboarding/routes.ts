import { Router } from 'express';
import { supabase } from '../shared/supabase';
import { provisionInvitee } from '../shared/provisioning';
import { sendEmail } from '../shared/email';
import { sendTrustedIndividualInvite } from '../shared/notification-emails';

const router = Router();

// Session-authed; everything is scoped to the internal profiles.user_id, and writes
// match the public guid the frontend sends (see assertGuid) — same pattern as settings.
const requireUser = (req: any, res: any, next: any) => {
  if (!req.isAuthenticated?.() || !req.user?.userId || !req.user?.guid) {
    return res.status(401).json({ error: 'Unauthenticated or profile not provisioned' });
  }
  next();
};

const assertGuid = (req: any, res: any): boolean => {
  const bodyGuid = req.body?.guid;
  if (bodyGuid && bodyGuid !== req.user.guid) {
    res.status(403).json({ error: 'GUID does not match the authenticated user' });
    return false;
  }
  return true;
};

const PLAN_TYPES = ['annual', 'five_year', 'ten_year', 'archive'];
const INTERVALS = [3, 6, 12];
const planYears = (plan: string) => (plan === 'ten_year' ? 10 : plan === 'five_year' ? 5 : 1);

async function getOrCreateGuide(userId: string) {
  const { data } = await supabase.from('guides').select('id').eq('parent_user_id', userId).maybeSingle();
  if (data) return data;
  const { data: created, error } = await supabase
    .from('guides')
    .insert({ parent_user_id: userId })
    .select('id')
    .single();
  if (error) throw error;
  return created;
}

// Upsert the family set by email/name so member ids stay stable across saves
// (the access step references family_members.id). Removes members no longer present.
async function upsertFamily(parentGuid: string, members: any[]) {
  const { data: existing } = await supabase
    .from('family_members')
    .select('id, email, display_name')
    .eq('parent_guid', parentGuid);

  const byEmail = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const m of existing || []) {
    if (m.email) byEmail.set(m.email.toLowerCase(), m.id);
    if (m.display_name) byName.set(m.display_name.toLowerCase(), m.id);
  }

  const keep = new Set<string>();
  for (const m of members) {
    if (!m?.displayName) continue;
    const row = {
      parent_guid: parentGuid,
      display_name: m.displayName,
      relationship: m.relationship ?? null,
      email: m.email ?? null,
      phone: m.phone ?? null,
    };
    let fmId: string | null =
      (m.email && byEmail.get(String(m.email).toLowerCase())) ||
      byName.get(String(m.displayName).toLowerCase()) ||
      null;
    if (fmId) {
      await supabase.from('family_members').update(row).eq('id', fmId);
    } else {
      const { data: ins } = await supabase.from('family_members').insert(row).select('id').single();
      fmId = ins?.id ?? null;
    }
    if (fmId) keep.add(fmId);

    // A son/daughter gets an invited account, claimed when they log in with this email.
    const rel = (m.relationship || '').toLowerCase();
    if (fmId && m.email && (rel === 'son' || rel === 'daughter')) {
      const inviteeId = await provisionInvitee(m.email, m.displayName);
      if (inviteeId) await supabase.from('family_members').update({ member_guid: inviteeId }).eq('id', fmId);
    }
  }

  const remove = (existing || []).filter((m) => !keep.has(m.id)).map((m) => m.id);
  if (remove.length) await supabase.from('family_members').delete().in('id', remove);
}

// ─── GET /onboarding — current data for prefilling the signup flow ──────────
router.get('/', requireUser, async (req: any, res) => {
  const userId = req.user.userId;
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name, email, phone, role, onboarding_completed_at')
      .eq('user_id', userId)
      .single();

    const { data: guide } = await supabase
      .from('guides')
      .select('id, primary_ti_member_id, secondary_ti_member_id')
      .eq('parent_user_id', userId)
      .maybeSingle();

    const { data: family } = await supabase
      .from('family_members')
      .select('id, display_name, relationship, email, phone')
      .eq('parent_guid', userId)
      .order('created_at');

    let intervalMonths: number | null = null;
    if (guide) {
      const { data: cis } = await supabase
        .from('check_in_settings')
        .select('interval_months')
        .eq('guide_id', guide.id)
        .maybeSingle();
      intervalMonths = cis?.interval_months ?? null;
    }

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('plan_type, coverage, billing_owner')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    res.json({
      onboardingComplete: !!profile?.onboarding_completed_at,
      profile: {
        firstName: profile?.first_name ?? null,
        lastName: profile?.last_name ?? null,
        email: profile?.email ?? null,
        phone: profile?.phone ?? null,
        role: profile?.role ?? null,
      },
      family: (family || []).map((m) => ({
        id: m.id,
        displayName: m.display_name,
        relationship: m.relationship,
        email: m.email,
        phone: m.phone,
      })),
      access: {
        primaryTiMemberId: guide?.primary_ti_member_id ?? null,
        secondaryTiMemberId: guide?.secondary_ti_member_id ?? null,
        intervalMonths,
      },
      plan: sub
        ? { planType: sub.plan_type, coverage: sub.coverage, billingOwner: sub.billing_owner }
        : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /onboarding — persist any subset of the signup sections ──────────
router.patch('/', requireUser, async (req: any, res) => {
  if (!assertGuid(req, res)) return;
  const userId = req.user.userId;
  const body = req.body || {};
  try {
    // Profile (name + phone). Email is the login identity and isn't editable.
    if (body.profile) {
      const p: Record<string, string> = {};
      if (typeof body.profile.firstName === 'string') p.first_name = body.profile.firstName.trim();
      if (typeof body.profile.lastName === 'string') p.last_name = body.profile.lastName.trim();
      if (typeof body.profile.phone === 'string') p.phone = body.profile.phone.trim();
      if (Object.keys(p).length) {
        await supabase
          .from('profiles')
          .update({ ...p, updated_at: new Date().toISOString() })
          .eq('user_id', userId);
      }
    }

    // Family members (spouse + children).
    if (Array.isArray(body.family)) {
      await upsertFamily(userId, body.family);
    }

    // Access: chosen Trusted Individuals (on the guide) + check-in cadence.
    if (body.access) {
      const guide = await getOrCreateGuide(userId);

      // The frontend identifies the chosen person by email (member ids aren't
      // stable in its hands); resolve to the family_members.id here. Direct ids
      // are also accepted (the settings page uses those).
      const resolveMember = async (email?: string) => {
        if (!email) return null;
        const { data } = await supabase
          .from('family_members')
          .select('id')
          .eq('parent_guid', userId)
          .ilike('email', email)
          .maybeSingle();
        return data?.id ?? null;
      };

      const g: Record<string, any> = {};
      if ('primaryMemberEmail' in body.access) g.primary_ti_member_id = await resolveMember(body.access.primaryMemberEmail);
      else if ('primaryTiMemberId' in body.access) g.primary_ti_member_id = body.access.primaryTiMemberId || null;
      if ('secondaryMemberEmail' in body.access) g.secondary_ti_member_id = await resolveMember(body.access.secondaryMemberEmail);
      else if ('secondaryTiMemberId' in body.access) g.secondary_ti_member_id = body.access.secondaryTiMemberId || null;

      // A designated trusted individual also gets an invited account.
      if (body.access.primaryMemberEmail) await provisionInvitee(body.access.primaryMemberEmail);
      if (body.access.secondaryMemberEmail) await provisionInvitee(body.access.secondaryMemberEmail);
      if (Object.keys(g).length) {
        await supabase.from('guides').update({ ...g, updated_at: new Date().toISOString() }).eq('id', guide.id);
      }
      if (body.access.intervalMonths != null) {
        const months = Number(body.access.intervalMonths);
        if (!INTERVALS.includes(months)) return res.status(400).json({ error: 'Invalid intervalMonths' });
        const next = new Date();
        next.setMonth(next.getMonth() + months);
        await supabase
          .from('check_in_settings')
          .upsert(
            { guide_id: guide.id, interval_months: months, next_due_at: next.toISOString(), updated_at: new Date().toISOString() },
            { onConflict: 'guide_id' }
          );
      }
    }

    // Plan selection -> subscription (records the choice; no payment until Stripe).
    if (body.plan?.planType) {
      if (!PLAN_TYPES.includes(body.plan.planType)) return res.status(400).json({ error: 'Invalid planType' });
      const coverage = body.plan.coverage === 'both' ? 'both' : 'single';
      const billingOwner = body.plan.billingOwner === 'child' ? 'child' : 'self';
      const activated = new Date();
      const expires = new Date(activated);
      expires.setFullYear(expires.getFullYear() + planYears(body.plan.planType));
      const row = {
        user_id: userId,
        plan_type: body.plan.planType,
        status: 'active',
        coverage,
        billing_owner: billingOwner,
        activated_at: activated.toISOString(),
        expires_at: expires.toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { data: existing } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing) await supabase.from('subscriptions').update(row).eq('id', existing.id);
      else await supabase.from('subscriptions').insert(row);
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /onboarding/complete — mark signup finished ───────────────────────
router.post('/complete', requireUser, async (req: any, res) => {
  if (!assertGuid(req, res)) return;
  const userId = req.user.userId;
  try {
    const now = new Date().toISOString();
    // Finishing signup clears any trial flag.
    await supabase.from('profiles').update({ onboarding_completed_at: now, is_trial: false, updated_at: now }).eq('user_id', userId);
    const guide = await getOrCreateGuide(userId);
    await supabase.from('guides').update({ completed_at: now, completion_percentage: 100, updated_at: now }).eq('id', guide.id);

    // Reflect completion in the live session so the dashboard gate passes immediately.
    if ((req.session as any)?.passport?.user) {
      (req.session as any).passport.user.onboardingComplete = true;
      (req.session as any).passport.user.isTrial = false;
    }
    if (req.user) {
      (req.user as any).onboardingComplete = true;
      (req.user as any).isTrial = false;
    }
    req.session?.save?.(() => res.json({ success: true }));
    if (!req.session?.save) res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /onboarding/notify — actually sends the draft messages the parent reviewed on
// the notify-preview page. Family members + their emails live on family_members
// already (saved during the earlier onboarding steps); the parent only sends the per-
// recipient personalNote overrides. Each send is best-effort: a single failed send
// doesn't stop the others. Returns a summary so the UI can decide what to show.
router.post('/notify', requireUser, async (req: any, res) => {
  const childrenNote: string = String(req.body?.childrenNote || '').trim();
  const spouseNote: string = String(req.body?.spouseNote || '').trim();

  try {
    // Parent's name for the greeting / subject lines.
    const { data: parent } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', req.user.userId)
      .maybeSingle();
    const parentFirst = parent?.first_name?.trim() || 'Your parent';
    const parentFull = `${parent?.first_name || ''} ${parent?.last_name || ''}`.trim() || parentFirst;

    // Children + spouse — same `family_members` rows the parent edited in onboarding.
    const { data: members } = await supabase
      .from('family_members')
      .select('email, display_name, relationship')
      .eq('parent_guid', req.user.userId);

    const children = (members || []).filter(
      (m) => ['son', 'daughter'].includes((m.relationship || '').toLowerCase()) && m.email
    );
    const spouse = (members || []).find(
      (m) => (m.relationship || '').toLowerCase() === 'spouse' && m.email
    );

    const webBase = process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000';
    const loginUrl = `${webBase}/login`;

    let sent = 0;
    let failed = 0;

    // ─── Children: notification-only (no action button) ────────────────────────────
    for (const c of children) {
      const firstName = c.display_name?.split(/\s+/)[0] || 'there';
      const noteBlock = childrenNote ? `\n\n${childrenNote}\n\n` : '\n\n';
      const text =
        `Hi ${firstName},\n\n` +
        `I'm ${parentFull}.${noteBlock}` +
        `I've set up a ForEveryAfter to help organize our family's most important information and stories. ` +
        `You'll hear from me — and from ForEveryAfter — over time as I add to it.\n\n` +
        `With love,\n${parentFirst}`;
      const html =
        `<p>Hi ${firstName},</p>` +
        `<p>I'm ${parentFull}.</p>` +
        (childrenNote ? `<blockquote style="border-left:3px solid #ddd;padding-left:12px;color:#555;"><em>${childrenNote.replace(/\n/g, '<br/>')}</em></blockquote>` : '') +
        `<p>I've set up a <strong>ForEveryAfter</strong> to help organize our family's most important information and stories. You'll hear from me — and from ForEveryAfter — over time as I add to it.</p>` +
        `<p>With love,<br/>${parentFirst}</p>`;
      const r = await sendEmail({
        to: c.email!,
        subject: `${parentFirst} set something up for you.`,
        text,
        html,
      });
      if (r.sent) sent++;
      else failed++;
    }

    // ─── Spouse: invitation with a "Set up your guide" link ────────────────────────
    if (spouse) {
      const firstName = spouse.display_name?.split(/\s+/)[0] || '';
      const noteBlock = spouseNote ? `\n\n${spouseNote}\n\n` : '\n\n';
      const text =
        `Hi ${firstName},${noteBlock}` +
        `${parentFull} has invited you to join ForEveryAfter — a place to organize our family's important information and stories together.\n\n` +
        `Set up your guide: ${loginUrl}\n\n` +
        `With love,\n${parentFirst}`;
      const html =
        `<p>Hi ${firstName},</p>` +
        (spouseNote ? `<blockquote style="border-left:3px solid #ddd;padding-left:12px;color:#555;"><em>${spouseNote.replace(/\n/g, '<br/>')}</em></blockquote>` : '') +
        `<p>${parentFull} has invited you to join <strong>ForEveryAfter</strong> — a place to organize our family's important information and stories together.</p>` +
        `<p><a href="${loginUrl}" style="display:inline-block;background:#C9A961;color:#fff;padding:12px 24px;border-radius:12px;font-weight:bold;text-decoration:none;">Set up your guide</a></p>` +
        `<p>With love,<br/>${parentFirst}</p>`;
      const r = await sendEmail({
        to: spouse.email!,
        subject: `${parentFirst} set up a family guide.`,
        text,
        html,
      });
      if (r.sent) sent++;
      else failed++;
    }

    // ─── Trusted individuals: notify primary + secondary if either is designated ──
    // Note: a person who is BOTH a child and a TI (e.g. an adult son named as TI) will
    // receive both emails — they convey different info. Easy to dedupe later if needed.
    const { data: guide } = await supabase
      .from('guides')
      .select('primary_ti_member_id, secondary_ti_member_id')
      .eq('parent_user_id', req.user.userId)
      .maybeSingle();
    const tiIds: string[] = [];
    if (guide?.primary_ti_member_id) tiIds.push(guide.primary_ti_member_id);
    if (guide?.secondary_ti_member_id) tiIds.push(guide.secondary_ti_member_id);
    let tiCount = 0;
    if (tiIds.length) {
      const { data: tis } = await supabase
        .from('family_members')
        .select('email')
        .in('id', tiIds);
      for (const ti of tis || []) {
        if (!ti.email) continue;
        const r = await sendTrustedIndividualInvite({
          to: ti.email,
          parentFirstName: parentFirst,
          parentFullName: parentFull,
          loginUrl,
        });
        if (r.sent) sent++;
        else failed++;
        tiCount++;
      }
    }

    res.json({ sent, failed, recipients: { children: children.length, spouse: spouse ? 1 : 0, ti: tiCount } });
  } catch (err: any) {
    console.error('[onboarding/notify] error:', err?.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
