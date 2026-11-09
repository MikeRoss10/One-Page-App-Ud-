# Utility Deals – Bill Upload App

Customers upload an electricity or gas bill (as a photo or PDF) from the website or the Android app. They get a confirmation **email + SMS**, your team gets an alert, and staff review everything in an **admin dashboard**.

## Live

- Customer page: <https://utility-deals-bill-upload.vercel.app>
- Staff dashboard: <https://utility-deals-bill-upload.vercel.app/#/admin>
- Supabase project: `utility-deals` (ref `rnllxphefrppqotznxkb`, Sydney)
- Vercel project: `utility-deals-bill-upload`

Emails (welcome email to the customer, alert to your team, status updates) go out once Gmail or Make is configured in Vercel. See **Email** below.

| Piece | Service | Free tier |
|---|---|---|
| Website + API | **Vercel** (Hobby) | Free |
| Database, staff login, bill storage | **Supabase** | 500 MB DB, 1 GB files, 50k users |
| Email | Your **Gmail / Google Workspace** mailbox (or **Make**, or Resend) | Workspace: 2,000/day · Gmail: 500/day |
| SMS | **TextBelt** or **Twilio** trial | TextBelt: 1 free SMS/day · Twilio: ~US$15 trial credit, verified numbers only |
| Android APK | **Capacitor**, built by **GitHub Actions** | Free |

> SMS is never truly free at volume. For production in Australia, top up TextBelt or Twilio (or use ClickSend/MessageMedia) and change `SMS_PROVIDER`. This is a one-line change in `api/_lib/server.ts`.

## How it works

```
Customer (web / APK)
  ├─ uploads bill ──────────► Supabase Storage  (private "bills" bucket, insert-only for public)
  ├─ saves details ─────────► Supabase table "submissions" (insert-only for public)
  └─ POST /api/notify ──────► Vercel function → welcome email (Gmail/Make) + SMS to customer, alert to team
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

### 2. Email (welcome email + team alerts)
Every new bill sends the customer a branded **welcome email**, and sends your team an alert. Pick one way to send:

**Option A: straight from your Gmail / Google Workspace mailbox (recommended)**
1. Sign in to the Google account that owns the Utility Deals mailbox. Turn on **2-Step Verification** under Security.
2. Go to <https://myaccount.google.com/apppasswords>, create an app password called "Utility Deals website" and copy the 16 characters.
3. In Vercel → Project → **Settings → Environment Variables**, add:
   - `GMAIL_USER` = the mailbox address, e.g. `hello@utilitydeals.com.au`
   - `GMAIL_APP_PASSWORD` = the 16-character app password (mark it *Sensitive*)
   - optional `EMAIL_FROM_ADDRESS` if you send as an alias set up in Gmail's "Send mail as"
   - optional `TEAM_NOTIFY_EMAIL` if team alerts should go somewhere other than `GMAIL_USER`
4. Redeploy (Deployments → ⋯ → Redeploy).

**Option B: through Make**
1. In Make, create a scenario: **Webhooks → Custom webhook** → **Gmail → Send an email** (connect the Utility Deals Google account).
2. Map the Gmail module: *To* = `to`, *Subject* = `subject`, *Content* = `html`. The webhook also gets `type` (`welcome`, `team_alert`, `status_update`), `reference`, `full_name`, `first_name`, `customer_email`, `phone`, `bill_type` and `postcode` for filters or extra steps such as adding the customer to a Google Sheet.
3. Copy the webhook URL into Vercel as `MAKE_WEBHOOK_URL`, turn the scenario on, and redeploy.

If both are set, Gmail is used.

### 3. SMS
- **TextBelt** (quickest): `SMS_PROVIDER=textbelt`, `TEXTBELT_KEY=textbelt` gives 1 free SMS per day for testing. Buy a key at <https://textbelt.com> for more.
- **Twilio**: sign up, get a trial number, verify the recipient numbers, then set `SMS_PROVIDER=twilio` and the three `TWILIO_*` vars.

### 4. Deploy to Vercel
1. <https://vercel.com/new> → import this GitHub repo. The framework is detected as Vite; leave the defaults.
2. Add these **Environment Variables** (see `.env.example`):
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, the email variables from step 2, `SMS_PROVIDER`, `TEXTBELT_KEY` (or the `TWILIO_*` vars).
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
Colours are taken from the logo and live at the top of [`src/index.css`](src/index.css) (`--brand-primary` #036e9c, `--brand-accent` #0c95cc, `--brand-ink` #1c1c1c). The email template is `emailLayout` in `api/_lib/server.ts`. The logo is `public/logo.png`; the browser and home-screen icons are `public/icon-*.png`. For APK icons, run `npx @capacitor/assets generate` with the logo.
