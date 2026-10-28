import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors, escapeHtml, sendEmail, sendSms, supabaseAs, type Submission } from './_lib/server.js';

/**
 * Called by the customer app straight after a bill is uploaded. Sends the customer a
 * confirmation email + SMS and alerts the team. Only works once per submission and only
 * for submissions created in the last few minutes, so it can't be used to spam people.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const id = typeof req.body?.id === 'string' ? req.body.id : '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Invalid id' });

  // claim_notification (see supabase/schema.sql) marks the submission as notified and returns it,
  // but only once and only within 15 minutes of upload.
  const { data, error } = await supabaseAs().rpc('claim_notification', { submission_id: id });
  if (error) return res.status(500).json({ error: error.message });
  const sub = (data as Submission[] | null)?.[0];
  if (!sub) return res.status(200).json({ ok: true, skipped: 'already notified, too old or not found' });

  const firstName = sub.full_name.split(' ')[0];
  const ref = sub.id.slice(0, 8).toUpperCase();

  const [customerEmail, customerSms, teamEmail] = await Promise.all([
    sendEmail(
      sub.email,
      `We've received your bill (ref ${ref})`,
      `Thanks ${firstName}, we've got your bill!`,
      `<p>Our energy experts will review your ${escapeHtml(sub.bill_type)} bill and get back to you with the best deal we can find, usually within 1–2 business days.</p>
       <p style="background:#f4f7fb;border-radius:8px;padding:12px 16px">Your reference: <strong>${ref}</strong></p>
       <p>If you have any questions just reply to this email.</p>
       <p>Cheers,<br/>The Utility Deals team</p>`,
    ),
    sendSms(
      sub.phone,
      `Hi ${firstName}, thanks for sending your bill to Utility Deals (ref ${ref}). Our team will review it and be in touch within 1-2 business days.`,
    ),
    process.env.TEAM_NOTIFY_EMAIL
      ? sendEmail(
          process.env.TEAM_NOTIFY_EMAIL,
          `New bill uploaded: ${sub.full_name} (${ref})`,
          'New bill uploaded',
          `<p><strong>${escapeHtml(sub.full_name)}</strong><br/>${escapeHtml(sub.email)}<br/>${escapeHtml(sub.phone)}</p>
           <p>Type: ${escapeHtml(sub.bill_type)}${sub.postcode ? ` &middot; Postcode ${escapeHtml(sub.postcode)}` : ''}</p>
           ${sub.message ? `<p>${escapeHtml(sub.message)}</p>` : ''}
           <p>Open the admin dashboard to review it.</p>`,
        )
      : Promise.resolve('skipped (TEAM_NOTIFY_EMAIL not set)'),
  ]);

  return res.status(200).json({ ok: true, customerEmail, customerSms, teamEmail });
}
