# AGENTS.md

## Project Context

OneForAll — a marketplace connecting customers with local tradespeople.
React + Vite frontend, Supabase backend (auth, Postgres + RLS, storage),
deployed on Vercel, wrapped as a Trusted Web Activity for Google Play.

Start with `README.md` for setup, environment variables, and deploy workflow.

## Key Files

- `src/`: frontend application source.
- `src/api/base44Client.js`: the data/auth layer. Despite the legacy name, it is
  a Supabase-backed compatibility layer exposing the original Base44-shaped API
  (`base44.entities.X.filter/get/create/update`, `base44.auth.*`,
  `integrations.Core.UploadFile`). All data access goes through it.
- `src/api/supabase.js`: the raw Supabase client (env-configured).
- `src/lib/AuthContext.jsx`: session state via Supabase auth.
- `supabase/migrations/`: SQL schema + row-level-security policies.
- `public/manifest.json`, `public/sw.js`: PWA assets for the TWA wrapper.
- `.env.local`: local-only environment values; never commit secrets.

## Working Notes

- Preserve the `base44`-shaped call signatures when touching the data layer —
  23 files consume them.
- Schema changes need a new SQL file in `supabase/migrations/` and matching
  RLS policies; mirror the conventions in the initial migration.
- Run `npm run lint` and `npm run build` before finishing code changes.
