import dotenv from 'dotenv';
dotenv.config();

// Twilio Programmable Messaging. Opt-in via three env vars in apps/api/.env:
//   TWILIO_ACCOUNT_SID    (the SID — starts with "AC…")
//   TWILIO_AUTH_TOKEN     (the Auth Token)
//   TWILIO_FROM_NUMBER    (a Twilio phone number in E.164, e.g. "+15551234567")
// Without these, sendSms is a no-op that logs — callers don't need to guard each call
// (same pattern as Whisper / Stripe).
export const isTwilioConfigured = () =>
  !!process.env.TWILIO_ACCOUNT_SID &&
  !!process.env.TWILIO_AUTH_TOKEN &&
  !!process.env.TWILIO_FROM_NUMBER;

export interface SmsArgs {
  to: string;     // E.164 (e.g. "+15551234567")
  body: string;   // up to ~1600 chars; longer = multipart, charged per segment
}

// Send an SMS. Returns { sent: true, sid } on success, { sent: false, reason } when
// Twilio isn't configured or the API call fails — never throws, so a notification
// failure doesn't break the caller's primary write.
export async function sendSms({ to, body }: SmsArgs): Promise<{ sent: boolean; sid?: string; reason?: string }> {
  if (!isTwilioConfigured()) {
    console.warn('[twilio] SMS skipped — TWILIO_* env vars not set');
    return { sent: false, reason: 'not_configured' };
  }
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_FROM_NUMBER!;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  // Twilio Messages API takes application/x-www-form-urlencoded; auth is HTTP Basic.
  const auth = 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
  const form = new URLSearchParams({ To: to, From: from, Body: body });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[twilio] SMS API ${res.status}: ${text.slice(0, 200)}`);
      return { sent: false, reason: `api_${res.status}` };
    }
    const data: any = await res.json();
    return { sent: true, sid: data?.sid };
  } catch (e: any) {
    console.error('[twilio] SMS network error:', e?.message);
    return { sent: false, reason: 'network' };
  }
}
