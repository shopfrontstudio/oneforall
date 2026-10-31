# Intelligent UI — no-paid-API integration

## Release state

Implementation branch: codex/intelligent-ui-integration.
This document is not evidence of a production deployment.
Do not deploy the frontend before the matching database migration is applied.

## Scope and limits

| Idea | Implementation / boundary |
| --- | --- |
| Natural-language discovery | Existing local catalogue matching and emergency redirection; not generative AI. |
| Dynamic booking | Existing service-specific questions plus clickable photo scope cards and validated preselection. |
| Professional matching | Existing private service/worker/evidence eligibility remains authoritative. No public bidding or invented rankings. |
| Photo assistance | Private photos and customer-marked problem areas for human review; no automated diagnosis. |
| Adaptive homepage | Signed-in customer gets recent-request, home and service-list shortcuts. No inferred personal profile. |
| Indicative prices | Approved, dated service guide calculation. No seeded rates; requires separately approved business data. |
| Guided troubleshooting | Catalogue guidance and safety screening, not hazardous DIY instructions or AI diagnosis. |
| Annotations | Bounded image coordinates and notes, versioned writes before booking; confirmed provider can read. |
| Availability | Provider publishes worker/service windows. Quote owner can view eligible times; these are NOT reservations. Existing schedule confirmation remains authoritative. |
| My Home | Private property/appliance records, maintenance list and service history. No verification claim. |
| Verification passport | Only current bounded public assertions. Private evidence is never exposed. |
| Job journey | Recorded request/booking stages refreshed periodically. No GPS or inferred arrival times. |
| Quote comparison | Actionable latest provider revisions, agreed ranges, terms and attending worker. Approval resets on revision changes. |
| Before/after proof | Private provider photos visible to booking participants. Not an independent inspection or proof of customer acceptance. |
| Maintenance reminders | Customer-chosen dates and in-app due states; no SMS/email/background auto-booking. |
| Repeat booking | Existing server-authoritative rebook flow retained; independent quote/eligibility checks still apply. |
| Multi-service list | Up to eight independent requests submitted atomically with retry protection. No combined charge or booking promise. Photos attach after submission. |
| Contextual help | Page-specific plain-language help, no chatbot/API. |

Provider shell, palette and navigation design are unchanged. Payment processing,
paid AI, external notifications, automatic service activation and automatic
verification are not included.

## Validation performed

- 72 Node tests pass, including eight new feature-helper tests.
- Lint, typecheck, production build and Pages route generation pass.
- 18 isolated PostgreSQL checks pass, applying every migration unmodified.
  Includes RLS isolation, denied direct writes, version conflicts, atomic bundle
  rollback/retries, photo annotations, availability gates/overlap and private
  proof upload/read/retry. Test users and temporarily opened gates exist only
  inside disposable local databases.
- Local browser smoke test: category → service → photo scope card → correct
  preselected intake option. Production auth/data are not connected locally.

The PostgreSQL harness stubs Supabase auth/storage infrastructure. It does not
replace hosted Auth, Storage HTTP, signed-link or authenticated browser testing.

## Required release sequence

1. Sign in to the existing Supabase project and confirm its identity against
   the deployed app. Do not create a replacement project.
2. Check migration history and apply
   supabase/migrations/20261031000000_intelligent_experience.sql transactionally.
   Do not enable provider/service controls as part of this migration.
3. Check deployed RPC signatures, grants, private bucket and RLS using test accounts.
4. Exercise customer and provider flows with isolated synthetic records:
   home/reminder save, cart retry, quote selection, eligible availability,
   annotation upload, proof upload/signed read and account isolation.
5. Only after these pass, merge/push to main using the existing GitHub Pages
   workflow; verify its deployment and live deep links.

If deployment is rolled back, restore the prior frontend release. Leave the
additive tables in place rather than deleting customer records. Withdraw new
writes via explicit RPC privilege changes only after checking affected clients.

## Running isolated database checks

Install embedded-postgres from the npm registry into a temporary directory,
then run scripts/test-intelligent-db.mjs with OFA_EMBEDDED_POSTGRES_MODULE
pointing at its dist/index.js. The harness accepts no remote database URL,
listens only on loopback and stops its database on completion.
