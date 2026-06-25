import dotenv from 'dotenv';
dotenv.config();

// Email via Resend. Opt-in via env vars in apps/api/.env:
//   RESEND_API_KEY      (starts with "re_")
//   EMAIL_FROM          (verified sender — must be a domain you've verified in Resend,
//                        or use "onboarding@resend.dev" for quick testing on the free tier)
//   EMAIL_FROM_NAME     (optional display name; falls back to "LegacyBridge")
// Without the key + from address, sendEmail is a no-op that logs — callers don't need
// to guard each call (same pattern as Twilio / Whisper / Stripe).
export const isEmailConfigured = () =>
  !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;

export interface EmailArgs {
  to: string;            // recipient address
  subject: string;
  text: string;          // plain-text body (recommended for deliverability)
  html?: string;         // optional HTML body
  replyTo?: string;      // optional Reply-To
}

// Send an email. Returns { sent: true, id } on success, { sent: false, reason } when
// Resend isn't configured or the API call fails — never throws, so a notification
// failure doesn't break the caller's primary write.
export async function sendEmail({ to, subject, text, html, replyTo }: EmailArgs): Promise<{ sent: boolean; id?: string; reason?: string }> {
  if (!isEmailConfigured()) {
    console.warn('[email] skipped — RESEND_API_KEY / EMAIL_FROM not set');
    return { sent: false, reason: 'not_configured' };
  }
  const key = process.env.RESEND_API_KEY!;
  const fromEmail = process.env.EMAIL_FROM!;
  const fromName = process.env.EMAIL_FROM_NAME || 'LegacyBridge';
  // Resend accepts "Name <addr@domain>" in `from` directly — cleaner than splitting.
  const from = `${fromName} <${fromEmail}>`;

  const payload: any = { from, to, subject, text };
  if (html) payload.html = html;
  if (replyTo) payload.reply_to = replyTo;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[email] Resend API ${res.status}: ${body.slice(0, 200)}`);
      return { sent: false, reason: `api_${res.status}` };
    }
    const data: any = await res.json();
    return { sent: true, id: data?.id };
  } catch (e: any) {
    console.error('[email] Resend network error:', e?.message);
    return { sent: false, reason: 'network' };
  }
}
