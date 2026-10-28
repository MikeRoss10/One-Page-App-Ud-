import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && anonKey);
export const supabase = createClient(url || 'http://localhost', anonKey || 'missing');

/** On the web the API lives on the same origin; the APK needs the full Vercel URL. */
export const apiUrl = (path: string) =>
  `${((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').replace(/\/$/, '')}${path}`;

export const STATUSES = ['new', 'reviewing', 'quoted', 'completed', 'rejected'] as const;
export type Status = (typeof STATUSES)[number];

export interface Submission {
  id: string;
  created_at: string;
  full_name: string;
  email: string;
  phone: string;
  postcode: string | null;
  bill_type: string;
  message: string | null;
  file_path: string;
  file_name: string | null;
  status: Status;
  admin_notes: string | null;
  notified_at: string | null;
}
