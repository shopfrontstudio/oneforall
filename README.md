# OneForAll

Local jobs matched with verified local tradies. React + Vite frontend with a
Supabase backend (auth, Postgres with row-level security, file storage), and a
PWA/Trusted-Web-Activity wrapper for the Google Play Store.

## Stack

- **Frontend**: React 18, Vite, Tailwind, Radix UI, React Router
- **Backend**: Supabase — email/password + Google auth, Postgres, storage
- **Hosting**: GitHub Pages with a custom domain (Actions workflow in `.github/workflows/deploy.yml`)
- **Android**: Trusted Web Activity generated with Bubblewrap

## Local setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in your Supabase project URL
   and anon key (Supabase Dashboard → Project Settings → API).
3. `npm run dev`

## Supabase setup (one-time)

1. Create a project at [supabase.com](https://supabase.com).
2. Open the SQL editor and run `supabase/migrations/20260816000000_init.sql`
   (tables, row-level security, storage bucket, seed categories).
3. **Auth → Providers**: enable Email. For Google sign-in, add your Google
   OAuth client ID/secret (Google Cloud Console → OAuth credentials, with
   `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback` as the redirect URI).
4. **Auth → Email Templates → Confirm signup**: the app verifies signups with a
   6-digit code, so include `{{ .Token }}` in the template body.
5. **Auth → URL Configuration**: set the Site URL to your deployed domain and
   add `http://localhost:5173` to the redirect allow-list for local dev.

## Deploying (GitHub Pages)

Every push to `main` builds and deploys via `.github/workflows/deploy.yml`.
One-time repo setup:

1. **Settings → Pages**: set Source to "GitHub Actions", and enter the custom
   domain (then follow GitHub's DNS instructions; enable "Enforce HTTPS").
2. **Settings → Secrets and variables → Actions → Variables**: add
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

GitHub Pages cannot rewrite URLs for SPAs, so `scripts/postbuild-pages.mjs`
copies `index.html` to `404.html` (deep-link fallback) and pre-creates the
public routes (`/privacy`, `/login`, …) as real files so they return HTTP 200.

## Architecture note

The app was originally built on Base44; the data layer was kept call-compatible
during the migration. All entity and auth calls go through
`src/api/base44Client.js`, which now re-implements the old
`base44.entities.X.filter/get/create/update` and `base44.auth.*` API on top of
`@supabase/supabase-js`. Table schemas and RLS policies live in
`supabase/migrations/`.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm run build`
