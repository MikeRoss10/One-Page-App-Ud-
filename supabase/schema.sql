-- Utility Deals bill upload: run this once in Supabase → SQL Editor.

-- 1. Submissions ------------------------------------------------------------
create table if not exists public.submissions (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  full_name    text not null check (char_length(full_name) between 1 and 120),
  email        text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone        text not null check (char_length(phone) between 6 and 20),
  postcode     text check (postcode is null or postcode ~ '^\d{4}$'),
  bill_type    text not null default 'electricity'
               check (bill_type in ('electricity', 'gas', 'both', 'internet', 'other')),
  message      text check (message is null or char_length(message) <= 2000),
  file_path    text not null,
  file_name    text,
  status       text not null default 'new'
               check (status in ('new', 'reviewing', 'quoted', 'completed', 'rejected')),
  admin_notes  text,
  notified_at  timestamptz,
  updated_at   timestamptz not null default now()
);

create index if not exists submissions_created_at_idx on public.submissions (created_at desc);

-- 2. Admins (staff who can log in to the dashboard) ---------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- 3. Row level security -------------------------------------------------------
alter table public.submissions enable row level security;
alter table public.admins      enable row level security;

-- Anyone (customer app, not logged in) may create a submission but never read one back.
drop policy if exists "public can submit" on public.submissions;
create policy "public can submit" on public.submissions
  for insert to anon, authenticated
  with check (status = 'new' and admin_notes is null and notified_at is null);

drop policy if exists "admins read" on public.submissions;
create policy "admins read" on public.submissions
  for select to authenticated using (public.is_admin());

drop policy if exists "admins update" on public.submissions;
create policy "admins update" on public.submissions
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins delete" on public.submissions;
create policy "admins delete" on public.submissions
  for delete to authenticated using (public.is_admin());

drop policy if exists "admins see admins" on public.admins;
create policy "admins see admins" on public.admins
  for select to authenticated using (user_id = auth.uid());

-- 4. Private storage bucket for bills ----------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bills', 'bills', false, 15728640,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

drop policy if exists "public upload bills" on storage.objects;
create policy "public upload bills" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'bills');

drop policy if exists "admins read bills" on storage.objects;
create policy "admins read bills" on storage.objects
  for select to authenticated using (bucket_id = 'bills' and public.is_admin());

drop policy if exists "admins delete bills" on storage.objects;
create policy "admins delete bills" on storage.objects
  for delete to authenticated using (bucket_id = 'bills' and public.is_admin());

-- 5. Make yourself an admin ---------------------------------------------------
-- a) Supabase → Authentication → Users → "Add user" (email + password, auto-confirm)
-- b) then run, with that email:
-- insert into public.admins (user_id)
--   select id from auth.users where email = 'you@utilitydeals.com.au';

-- 6. Live updates in the admin dashboard --------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.submissions;
exception when duplicate_object then null;
end $$;
