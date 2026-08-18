# OneForAll

Managed local services privately routed to eligible Ballarat providers. The
React/Vite frontend uses Supabase for auth, row-level-secured Postgres and
private file storage, with a PWA/Trusted-Web-Activity wrapper for Google Play.

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
2. Apply every SQL file in `supabase/migrations/` in timestamp order. They
   create the base schema, the managed-marketplace boundary, and subsequent
   fail-closed security corrections.
3. **Auth → Providers**: enable Email. For Google sign-in, add your Google
   OAuth client ID/secret (Google Cloud Console → OAuth credentials, with
   `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback` as the redirect URI).
4. **Auth → Email Templates → Confirm signup**: the app uses Supabase's default
   confirmation-link flow, which works with the included email service.
5. **Auth → URL Configuration**: set the Site URL to the deployed app URL and
   allow the deployed and local app paths used by OAuth and recovery, including
   `/oneforall/` and `/oneforall/reset-password` (locally under
   `http://localhost:5173`).

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

The runtime is Supabase-only. A legacy-named compatibility module remains at
`src/api/base44Client.js` to avoid a risky all-at-once import rename: it exposes
authenticated, row-level-security-protected reads and a small RPC allow-list on
top of `@supabase/supabase-js`. Direct marketplace create/update/delete calls
are deliberately blocked. Table schemas, RLS policies and authoritative
operations live in `supabase/migrations/`.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
