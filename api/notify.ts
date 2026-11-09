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

  const teamInbox = process.env.TEAM_NOTIFY_EMAIL || process.env.GMAIL_USER;
  const details = {
    reference: ref,
    full_name: sub.full_name,
    first_name: firstName,
    customer_email: sub.email,
    phone: sub.phone,
    postcode: sub.postcode,
    bill_type: sub.bill_type,
    message: sub.message,
  };

  const [customerEmail, customerSms, teamEmail] = await Promise.all([
    sendEmail(
      sub.email,
      `Welcome to Utility Deals, ${firstName}! (ref ${ref})`,
      `Welcome to Utility Deals, ${firstName}!`,
      `<p>Thanks for choosing Utility Deals. We've received your ${escapeHtml(sub.bill_type)} bill and our energy experts are already on it.</p>
       <p style="background:#e8f6fc;border-left:4px solid #0c95cc;border-radius:6px;padding:12px 16px;margin:20px 0">
         Your reference: <strong style="color:#036e9c">${ref}</strong>
       </p>
       <p><strong style="color:#036e9c">What happens next</strong></p>
       <ol style="padding-left:20px;margin:0 0 16px">
         <li style="margin-bottom:6px">We review your bill and usage.</li>
         <li style="margin-bottom:6px">We compare it against plans on the market.</li>
         <li>We get back to you with your savings, usually within 1–2 business days.</li>
       </ol>
       <p>Got a question in the meantime? Just reply to this email.</p>
       <p>Cheers,<br/>The Utility Deals team</p>`,
      { type: 'welcome', data: details },
    ),
    sendSms(
      sub.phone,
      `Hi ${firstName}, welcome to Utility Deals! We've received your bill (ref ${ref}). Our team will review it and be in touch within 1-2 business days.`,
    ),
    teamInbox
      ? sendEmail(
          teamInbox,
          `New bill uploaded: ${sub.full_name} (${ref})`,
          'New bill uploaded',
          `<p><strong>${escapeHtml(sub.full_name)}</strong><br/>${escapeHtml(sub.email)}<br/>${escapeHtml(sub.phone)}</p>
           <p>Type: ${escapeHtml(sub.bill_type)}${sub.postcode ? ` &middot; Postcode ${escapeHtml(sub.postcode)}` : ''}</p>
           ${sub.message ? `<p>${escapeHtml(sub.message)}</p>` : ''}
           <p>Open the admin dashboard to review it.</p>`,
          { type: 'team_alert', data: details },
        )
      : Promise.resolve('skipped (TEAM_NOTIFY_EMAIL not set)'),
  ]);

  console.log(`[notify] ${ref} customerEmail=${customerEmail} customerSms=${customerSms} teamEmail=${teamEmail}`);
  return res.status(200).json({ ok: true, customerEmail, customerSms, teamEmail });
}
