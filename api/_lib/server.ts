import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  { auth: { persistSession: false } },
);

export interface Submission {
  id: string;
  created_at: string;
  full_name: string;
  email: string;
  phone: string;
  postcode: string | null;
  bill_type: string;
  message: string | null;
  status: string;
  notified_at: string | null;
}

/** CORS so the Android app (origin https://localhost) can call the API. Returns true if the request was a preflight. */
export function cors(req: VercelRequest, res: VercelResponse): boolean {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function emailLayout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
      <tr><td style="background:#0b3d91;padding:20px 28px;color:#ffffff;font-size:20px;font-weight:bold">Utility <span style="color:#7ed957">Deals</span></td></tr>
      <tr><td style="padding:28px">
        <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>
        ${bodyHtml}
      </td></tr>
      <tr><td style="background:#f4f7fb;padding:16px 28px;font-size:12px;color:#6b7280">Utility Deals &middot; utilitydeals.com.au</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

export async function sendEmail(to: string, subject: string, title: string, bodyHtml: string): Promise<string> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return 'skipped (RESEND_API_KEY not set)';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? 'Utility Deals <onboarding@resend.dev>',
      to: [to],
      subject,
      html: emailLayout(title, bodyHtml),
    }),
  });
  return r.ok ? 'sent' : `failed (${r.status}: ${await r.text()})`;
}

/** Australian mobiles typed as 04xx xxx xxx become +614xxxxxxxx. */
export function toE164(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('0')) return `+61${digits.slice(1)}`;
  if (digits.startsWith('61')) return `+${digits}`;
  return digits;
}

export async function sendSms(phone: string, message: string): Promise<string> {
  const provider = (process.env.SMS_PROVIDER ?? 'none').toLowerCase();
  const to = toE164(phone);

  if (provider === 'textbelt') {
    const r = await fetch('https://textbelt.com/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: to, message, key: process.env.TEXTBELT_KEY ?? 'textbelt' }),
    });
    const data = (await r.json()) as { success: boolean; error?: string };
    return data.success ? 'sent' : `failed (${data.error ?? r.status})`;
  }

  if (provider === 'twilio') {
    const sid = process.env.TWILIO_ACCOUNT_SID ?? '';
    const token = process.env.TWILIO_AUTH_TOKEN ?? '';
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM ?? '', Body: message }),
    });
    return r.ok ? 'sent' : `failed (${r.status}: ${await r.text()})`;
  }

  return 'skipped (SMS_PROVIDER not set)';
}

export { escapeHtml };
