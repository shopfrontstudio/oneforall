import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('initial schema no longer creates an open job board or public upload bucket', async () => {
  const sql = await read('../supabase/migrations/20260816000000_init.sql');
  assert.doesNotMatch(sql, /status not in \('draft', 'cancelled'\)/i);
  assert.doesNotMatch(sql, /with check \(true\)/i);
  assert.doesNotMatch(sql, /values \('uploads', 'uploads', true\)/i);
  assert.doesNotMatch(sql, /policy "tp read all"/i);
});

test('managed migration makes protected writes RPC-only with explicit function grants', async () => {
  const sql = await read('../supabase/migrations/20260818000000_managed_marketplace_foundation.sql');
  assert.match(sql, /revoke insert, update, delete on[\s\S]*public\.jobs[\s\S]*from anon, authenticated/i);
  assert.match(sql, /revoke execute on function public\.oneforall_submit_request\(jsonb\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.oneforall_submit_request\(jsonb\) to authenticated/i);
  assert.match(sql, /security definer\s+set search_path = public, pg_temp/gi);
  assert.doesNotMatch(sql, /create policy[^;]+for (insert|update|delete)[^;]+on public\.(jobs|invitations|interest_requests|bookings|provider_evidence)/i);
});

test('release gates, zero-write ordering and idempotency fingerprints fail closed', async () => {
  const sql = await read('../supabase/migrations/20260818000000_managed_marketplace_foundation.sql');
  for (const flag of ['publicly_visible','request_enabled','provider_onboarding_enabled','quote_enabled','booking_enabled','recurrence_enabled','public_release_enabled']) assert.match(sql, new RegExp(`${flag} boolean not null default false`));
  const submit = sql.slice(sql.indexOf('function public.oneforall_submit_request'), sql.indexOf('function public.oneforall_transition_request'));
  assert.ok(submit.indexOf('oneforall_release_open') < submit.indexOf('insert into public.jobs'));
  assert.match(submit, /request_fingerprint/);
  assert.match(submit, /different request/);
  assert.doesNotMatch(submit, /insert into public\.notifications/i);
});

test('private evidence, exact worker gates and immutable approval/event records are present', async () => {
  const sql = await read('../supabase/migrations/20260818000000_managed_marketplace_foundation.sql');
  assert.match(sql, /provider evidence private read/);
  assert.match(sql, /v_evidence_count <> 1 then return false/);
  assert.match(sql, /evidence\.worker_id = p_worker_id/);
  assert.match(sql, /evidence\.expires_date is not null and evidence\.expires_date::date >= p_service_date/);
  for (const table of ['request_events','invitation_events','booking_events','provider_review_events','founder_approval_decisions']) assert.match(sql, new RegExp(`${table}_immutable`));
  assert.match(sql, /Manual-review override is not enabled/);
  assert.match(sql, /Admin review cannot override blocked or emergency scope/);
});

test('provider routes are invitation-only and active navigation has no Discover, bidding or membership gate', async () => {
  const [app, top, bottom, requests, facade] = await Promise.all([
    read('../src/App.jsx'), read('../src/components/oneforall/TopBar.jsx'), read('../src/components/oneforall/BottomNav.jsx'),
    read('../src/pages/provider/Requests.jsx'), read('../src/api/base44Client.js'),
  ]);
  for (const label of ['Home','Services','Bookings','Messages','Account']) assert.match(top + bottom, new RegExp(`label: '${label}'`));
  for (const label of ['Today','Requests','Jobs','Calendar','More']) assert.match(top + bottom, new RegExp(`label: '${label}'`));
  assert.match(requests, /Invitation\.list/);
  assert.doesNotMatch(requests, /entities\.Job|Discover/i);
  assert.doesNotMatch(app, /element=\{<Discover|element=\{<Membership/);
  assert.match(facade, /oneforall_provider_invitation_snapshots/);
  assert.doesNotMatch(facade, /Invitation:\s*'invitations'/);
  assert.match(facade, /create: blockedMutation/);
  assert.match(facade, /update: blockedMutation/);
  assert.match(facade, /delete: blockedMutation/);
});

test('security correction closes invitation identity, emergency and operational eligibility gaps', async () => {
  const sql = await read('../supabase/migrations/20260819000000_security_correction.sql');
  const snapshot = sql.slice(sql.indexOf('function public.oneforall_provider_invitation_snapshots'), sql.indexOf('function public.oneforall_review_provider_evidence'));
  assert.match(sql, /inv raw customer admin read/);
  assert.match(sql, /request events customer admin read/);
  assert.match(sql, /invitation events customer admin read/);
  assert.doesNotMatch(sql, /create policy "request events customer admin read"[\s\S]{0,180}provider_id = auth\.uid\(\)/);
  assert.doesNotMatch(sql, /create policy "invitation events customer admin read"[\s\S]{0,180}provider_id = auth\.uid\(\)/);
  assert.match(snapshot, /invitation\.tradie_id = auth\.uid\(\)/);
  assert.doesNotMatch(snapshot, /customer_id|customer_name|access_notes|safety_info/);
  assert.match(sql, /provider_standing = 'active'/);
  assert.match(sql, /v_worker\.review_status <> 'verified'/);
  assert.match(sql, /p_requested_units > v_offering\.capacity_remaining/);
  assert.match(sql, /coverage_suburbs/);
  assert.match(sql, /availability_days/);
  assert.match(sql, /minimum_notice_hours/);
  assert.match(sql, /assertion\.id = p_assertion_id/);
  assert.match(sql, /v_service_instant := now\(\)/);
  assert.match(sql, /A valid confirmed schedule is required/);
  assert.match(sql, /painting_screen_invalid/);
  assert.ok(sql.indexOf("'immediate danger','life threatening'") < sql.lastIndexOf("cardinality(v_scopes) = 0"));
});

test('security correction enforces exact-intent retries and valid helper privilege order', async () => {
  const sql = await read('../supabase/migrations/20260819000000_security_correction.sql');
  for (const conflict of [
    'Request transition idempotency conflict', 'Request review idempotency conflict',
    'Invitation idempotency conflict', 'Invitation response idempotency conflict',
    'Quote acceptance idempotency conflict', 'Evidence review idempotency conflict',
    'Booking transition idempotency conflict', 'Founder decision idempotency conflict',
  ]) assert.match(sql, new RegExp(conflict));
  assert.match(sql, /coalesce\(p_payload, '\{\}'::jsonb\) - 'idempotency_key'/);
  const helperDefinition = sql.indexOf('function public.oneforall_exact_worker_eligible_v2(');
  const helperRevoke = sql.lastIndexOf('revoke execute on function public.oneforall_exact_worker_eligible_v2(');
  assert.ok(helperDefinition >= 0 && helperRevoke > helperDefinition);
  assert.match(sql, /char_length\(v_reason\) < 10/);
  assert.match(sql, /v_job\.status not in \('draft','manual_review','submitted','published'\)/);
});

test('Supabase recovery and OAuth redirects respect the deployed base path', async () => {
  const [facade, authContext, reset, appUrl] = await Promise.all([
    read('../src/api/base44Client.js'), read('../src/lib/AuthContext.jsx'),
    read('../src/pages/ResetPassword.jsx'), read('../src/lib/appUrl.js'),
  ]);
  assert.match(appUrl, /absoluteAppUrl/);
  assert.match(facade, /resetPasswordForEmail\(email, \{ redirectTo: absoluteAppUrl\('\/reset-password'\) \}\)/);
  assert.match(facade, /signInWithOAuth[\s\S]*absoluteAppUrl/);
  assert.match(authContext, /PASSWORD_RECOVERY/);
  assert.match(reset, /getSession\(\)/);
  assert.doesNotMatch(reset, /searchParams\.get\("token"\)|resetToken/);
});

test('signup uses the default confirmation-link flow without requiring custom SMTP templates', async () => {
  const register = await read('../src/pages/Register.jsx');
  assert.match(register, /confirmation link/i);
  assert.doesNotMatch(register, /InputOTP|verifyOtp|otpCode/);
});

test('customer cancellation and provider detail errors have bounded recovery paths', async () => {
  const [jobs, requestDetail, jobDetail, intake, authLayout] = await Promise.all([
    read('../src/pages/customer/MyJobs.jsx'), read('../src/pages/provider/RequestDetail.jsx'),
    read('../src/pages/provider/JobDetail.jsx'), read('../src/pages/public/Intake.jsx'),
    read('../src/components/AuthLayout.jsx'),
  ]);
  assert.match(jobs, /reason: reason\.trim\(\)/);
  assert.match(jobs, /\['draft', 'manual_review', 'submitted', 'published'\]/);
  assert.match(jobs, /idempotencyKey/);
  assert.match(requestDetail, /onRetry=\{load\}/);
  assert.match(jobDetail, /onRetry=\{load\}/);
  assert.match(intake, /OneForAll is not an emergency service/);
  assert.match(intake, /Describe what you need help with \(required\)/);
  assert.doesNotMatch(authLayout, /job marketplace|Post a job for free|discover nearby opportunities/i);
});

test('customer request launch opens intake only and keeps supply-side gates closed', async () => {
  const [sql, facade, intake] = await Promise.all([
    read('../supabase/migrations/20260819010000_customer_request_launch.sql'),
    read('../src/api/base44Client.js'),
    read('../src/pages/public/Intake.jsx'),
  ]);
  assert.match(sql, /publicly_visible = true/);
  assert.match(sql, /request_enabled = true/);
  assert.match(sql, /public_release_enabled = true/);
  for (const flag of ['provider_onboarding_enabled','quote_enabled','booking_enabled','recurrence_enabled']) {
    assert.match(sql, new RegExp(`${flag} = false`));
  }
  assert.match(sql, /Customer account required/);
  assert.match(sql, /Service suburb is required/);
  assert.match(sql, /Preferred date cannot be in the past/);
  assert.match(sql, /intake_snapshot/);
  assert.match(facade, /'submit-request': 'oneforall_submit_request'/);
  assert.match(intake, /callFunction\('submit-request'/);
  assert.match(intake, /Send private request/);
});

test('GitHub Pages prebuilds every public catalogue route with a real 200 entry file', async () => {
  const pages = await read('../scripts/postbuild-pages.mjs');
  assert.match(pages, /PHASE1_SERVICES/);
  assert.match(pages, /'services'/);
  assert.match(pages, /`services\/\$\{key\}`/);
  assert.match(pages, /`request\/\$\{key\}`/);
  assert.match(pages, /copyFileSync\(index, new URL\('index\.html', dir\)\)/);
});
