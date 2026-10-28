# Utility Deals – Bill Upload App

Customers upload an electricity or gas bill (as a photo or PDF) from the website or the Android app. They get a confirmation **email + SMS**, your team gets an alert, and staff review everything in an **admin dashboard**.

## Live

- Customer page: <https://utility-deals-bill-upload.vercel.app>
- Staff dashboard: <https://utility-deals-bill-upload.vercel.app/#/admin>
- Supabase project: `utility-deals` (ref `rnllxphefrppqotznxkb`, Sydney)
- Vercel project: `utility-deals-bill-upload`

Email and SMS stay off until `RESEND_API_KEY` and `SMS_PROVIDER` are set in Vercel (see below).

| Piece | Service | Free tier |
|---|---|---|
| Website + API | **Vercel** (Hobby) | Free |
| Database, staff login, bill storage | **Supabase** | 500 MB DB, 1 GB files, 50k users |
| Email | **Resend** | 3,000 emails/month (100/day) |
| SMS | **TextBelt** or **Twilio** trial | TextBelt: 1 free SMS/day · Twilio: ~US$15 trial credit, verified numbers only |
| Android APK | **Capacitor**, built by **GitHub Actions** | Free |

> SMS is never truly free at volume. For production in Australia, top up TextBelt or Twilio (or use ClickSend/MessageMedia) and change `SMS_PROVIDER`. This is a one-line change in `api/_lib/server.ts`.

## How it works

```
Customer (web / APK)
  ├─ uploads bill ──────────► Supabase Storage  (private "bills" bucket, insert-only for public)
  ├─ saves details ─────────► Supabase table "submissions" (insert-only for public)
  └─ POST /api/notify ──────► Vercel function → Resend email + SMS to customer, email to team
                                (once per submission, only within 15 min of upload)

Staff (/#/admin)
  ├─ email+password login ──► Supabase Auth (must be listed in "admins" table)
  ├─ view / filter / preview bills, add notes, change status (live updates)
  └─ status change ─────────► POST /api/status-update → email + SMS to customer
```

## Setup (about 15 minutes)

### 1. Supabase
1. Create a free project at <https://supabase.com>.
2. **SQL Editor** → paste all of [`supabase/schema.sql`](supabase/schema.sql) → Run.
3. **Authentication → Users → Add user**: enter your staff email and password and tick *Auto confirm*.
4. Make that user an admin (SQL Editor):
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'you@utilitydeals.com.au';
   ```
5. **Authentication → Providers → Email**: turn off "Allow new users to sign up" so only users you add can log in.
6. **Project Settings → API**: copy the *Project URL* and *anon public* key. (No service-role key is needed: the API relies on row level security.)

### 2. Resend (email)
1. Sign up at <https://resend.com> and create an API key.
2. To send from `@utilitydeals.com.au`, add the domain under **Domains** and add the DNS records it shows. Until then, `onboarding@resend.dev` can only email your own Resend address.

### 3. SMS
- **TextBelt** (quickest): `SMS_PROVIDER=textbelt`, `TEXTBELT_KEY=textbelt` gives 1 free SMS per day for testing. Buy a key at <https://textbelt.com> for more.
- **Twilio**: sign up, get a trial number, verify the recipient numbers, then set `SMS_PROVIDER=twilio` and the three `TWILIO_*` vars.

### 4. Deploy to Vercel
1. <https://vercel.com/new> → import this GitHub repo. The framework is detected as Vite; leave the defaults.
2. Add these **Environment Variables** (see `.env.example`):
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `TEAM_NOTIFY_EMAIL`, `SMS_PROVIDER`, `TEXTBELT_KEY` (or the `TWILIO_*` vars).
3. Deploy. The customer page is at `/` and the staff dashboard at `/#/admin`.
4. Optional: add `upload.utilitydeals.com.au` under **Settings → Domains**.

### 5. Build the Android APK
The APK is built automatically by GitHub Actions ([`.github/workflows/android-apk.yml`](.github/workflows/android-apk.yml)).

1. GitHub repo → **Settings → Secrets and variables → Actions** → add:
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL` (your Vercel URL, e.g. `https://utility-deals.vercel.app`).
2. **Actions → Build Android APK → Run workflow** (it also runs on every push).
3. Open the finished run and download **utility-deals-apk** → `app-debug.apk`. Send it to a phone and install it (allow "install unknown apps").

For the Google Play Store you need a signed release build (`./gradlew bundleRelease` with your keystore). Ask and this can be added to the workflow.

To build locally instead, install Android Studio and run `npm run apk`.

## Local development
```bash
cp .env.example .env.local   # fill in values
npm install
npm run dev                  # http://localhost:5173
```
The `/api` functions run under `npx vercel dev`.

## Customising the brand
All colours and the font live at the top of [`src/index.css`](src/index.css) (`--brand-primary`, `--brand-accent`, …). The email template colours are in `api/_lib/server.ts` (`emailLayout`). The logo is an inline SVG in `src/components/Header.tsx` and `public/favicon.svg`. Swap in the real logo file if you have one. For APK icons, run `npx @capacitor/assets generate` with your logo.
