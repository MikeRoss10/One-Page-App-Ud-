import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors, escapeHtml, sendEmail, sendSms, supabaseAdmin, type Submission } from './_lib/server.js';

const STATUS_COPY: Record<string, { subject: string; text: string }> = {
  reviewing: { subject: 'We are reviewing your bill', text: 'our team has started reviewing your bill.' },
  quoted: { subject: 'Your new deal is ready', text: 'we have found a deal for you. One of our team will be in touch shortly to go through it.' },
  completed: { subject: 'All done!', text: 'your switch is complete. Thanks for choosing Utility Deals!' },
  rejected: { subject: 'An update on your bill', text: "we weren't able to find a better deal than your current plan right now. We'll keep an eye out for you." },
};

/** Admin-only: emails/SMSes the customer about a status change. Requires a logged-in admin's access token. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  const { data: userData } = await supabaseAdmin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return res.status(401).json({ error: 'Not logged in' });

  const { data: admin } = await supabaseAdmin.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!admin) return res.status(403).json({ error: 'Not an admin' });

  const { id, sms = true, email = true } = req.body ?? {};
  const { data: sub } = await supabaseAdmin
    .from('submissions')
    .select('id, created_at, full_name, email, phone, postcode, bill_type, message, status, notified_at')
    .eq('id', id)
    .single<Submission>();
  if (!sub) return res.status(404).json({ error: 'Submission not found' });

  const copy = STATUS_COPY[sub.status];
  if (!copy) return res.status(400).json({ error: `No customer message for status "${sub.status}"` });

  const firstName = sub.full_name.split(' ')[0];
  const ref = sub.id.slice(0, 8).toUpperCase();
  const [emailResult, smsResult] = await Promise.all([
    email
      ? sendEmail(sub.email, `${copy.subject} (ref ${ref})`, copy.subject,
          `<p>Hi ${escapeHtml(firstName)}, ${escapeHtml(copy.text)}</p><p>Reference: <strong>${ref}</strong></p><p>Cheers,<br/>The Utility Deals team</p>`)
      : Promise.resolve('skipped'),
    sms ? sendSms(sub.phone, `Utility Deals (ref ${ref}): Hi ${firstName}, ${copy.text}`) : Promise.resolve('skipped'),
  ]);

  return res.status(200).json({ ok: true, email: emailResult, sms: smsResult });
}
