import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors, escapeHtml, sendEmail, sendSms, supabaseAdmin, type Submission } from './_lib/server.js';

const FRESH_WINDOW_MS = 15 * 60 * 1000;

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

  const { data: sub, error } = await supabaseAdmin
    .from('submissions')
    .select('id, created_at, full_name, email, phone, postcode, bill_type, message, status, notified_at')
    .eq('id', id)
    .single<Submission>();

  if (error || !sub) return res.status(404).json({ error: 'Submission not found' });
  if (sub.notified_at) return res.status(200).json({ ok: true, alreadyNotified: true });
  if (Date.now() - new Date(sub.created_at).getTime() > FRESH_WINDOW_MS) {
    return res.status(410).json({ error: 'Submission too old to notify' });
  }

  // Claim the notification first so concurrent calls can't double-send.
  const { data: claimed } = await supabaseAdmin
    .from('submissions')
    .update({ notified_at: new Date().toISOString() })
    .eq('id', id)
    .is('notified_at', null)
    .select('id');
  if (!claimed?.length) return res.status(200).json({ ok: true, alreadyNotified: true });

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
