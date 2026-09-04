import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PROVIDER_NAV,
  invitationCountdown,
  providerApplicationCompletion,
  providerApplicationStatusLabel,
  providerEvidenceRequirements,
  providerNextActions,
  providerStatusLabel,
  validProviderPriceRange,
} from '../src/lib/provider.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('provider workspace has exactly Today, Jobs, Calendar and Account', () => {
  assert.deepEqual(PROVIDER_NAV.map((item) => item.label), ['Today', 'Jobs', 'Calendar', 'Account']);
});

test('selected services create a deduplicated, exact verification checklist', () => {
  const requirements = providerEvidenceRequirements(['cleaning.routine_domestic', 'plumbing.licensed_services']);
  assert.equal(new Set(requirements.map((item) => item.key)).size, requirements.length);
  assert.equal(requirements.filter((item) => item.evidence_type === 'responsible_identity').length, 1);
  assert.equal(requirements.filter((item) => item.evidence_type === 'abn_entity_match').length, 1);
  assert.equal(requirements.filter((item) => item.evidence_type === 'worker_identity').length, 1);
  assert.equal(requirements.filter((item) => item.evidence_type === 'worker_relationship').length, 1);
  assert.ok(requirements.some((item) => item.evidence_type === 'victorian_plumbing_registration_or_licence' && item.subject === 'worker'));
  assert.ok(requirements.every((item) => item.service_keys.length >= 1));
});

test('provider-facing statuses use the six plain application states', () => {
  assert.equal(providerApplicationStatusLabel(), 'Not started');
  assert.equal(providerApplicationStatusLabel('draft'), 'In progress');
  assert.equal(providerApplicationStatusLabel('submitted'), 'Under review');
  assert.equal(providerApplicationStatusLabel('action_required'), 'Action needed');
  assert.equal(providerApplicationStatusLabel('approved'), 'Approved');
  assert.equal(providerApplicationStatusLabel('expired'), 'Expired');
  assert.equal(providerStatusLabel({ review_status: 'rejected' }), 'Action needed');
  assert.equal(providerStatusLabel({ review_status: 'verified', expires_date: '2000-01-01' }), 'Expired');
});

test('provider price ranges must be positive and ordered', () => {
  assert.equal(validProviderPriceRange(100, 180), true);
  assert.equal(validProviderPriceRange(100, 100), true);
  assert.equal(validProviderPriceRange(0, 100), false);
  assert.equal(validProviderPriceRange(180, 100), false);
  assert.equal(validProviderPriceRange('no', 100), false);
});

test('countdown and Today actions focus only on useful work', () => {
  const now = new Date('2026-09-04T00:00:00Z');
  assert.equal(invitationCountdown('2026-09-04T02:30:00Z', now), '2h 30m left');
  assert.equal(invitationCountdown('2026-09-03T23:59:00Z', now), 'Expired');
  const actions = providerNextActions({
    application: { status: 'draft', current_step: 2 },
    invitations: [{ status: 'pending', expires_at: '2026-09-04T03:00:00Z' }],
    bookings: [], evidence: [], now,
  });
  assert.deepEqual(actions.map((item) => item.key), ['application', 'matches']);
});

test('application completion reports steps and evidence without granting approval', () => {
  assert.deepEqual(providerApplicationCompletion({ completed_steps: [1, 2] }, [{ submission_status: 'submitted' }, { submission_status: 'draft' }]), {
    completed_steps: 2, total_steps: 4, evidence_total: 2, evidence_ready: 1, complete: false,
  });
});

test('provider migration keeps every consequential feature independently off', async () => {
  const sql = await read('../supabase/migrations/20260904000000_seamless_provider_experience.sql');
  for (const control of ['application_writes_enabled','sensitive_uploads_enabled','hybrid_checks_enabled','transactional_email_enabled','provider_job_actions_enabled']) {
    assert.match(sql, new RegExp(`${control} boolean not null default false`));
  }
  assert.doesNotMatch(sql, /update public\.service_definitions set[\s\S]{0,300}(provider_onboarding_enabled|quote_enabled|booking_enabled)\s*=\s*true/i);
});

test('provider applications and evidence remain private and RPC-only', async () => {
  const sql = await read('../supabase/migrations/20260904000000_seamless_provider_experience.sql');
  assert.match(sql, /provider application private read[\s\S]*provider_id = auth\.uid\(\) or public\.is_admin\(\)/i);
  assert.match(sql, /provider evidence gated upload[\s\S]*application_writes_enabled and sensitive_uploads_enabled/i);
  assert.match(sql, /values \('provider-evidence','provider-evidence',false/i);
  assert.match(sql, /revoke insert, update, delete on public\.provider_applications from anon, authenticated/i);
  assert.doesNotMatch(sql, /values \('provider-evidence','provider-evidence',true/i);
  assert.match(sql, /Private document path is invalid/i);
});

test('automated checks are service-role-only and cannot activate provider resources', async () => {
  const sql = await read('../supabase/migrations/20260904000000_seamless_provider_experience.sql');
  const start = sql.indexOf('function public.oneforall_record_automated_evidence_result');
  const end = sql.indexOf('function public.oneforall_provider_invitation_snapshots', start);
  const block = sql.slice(start, end);
  assert.match(block, /auth\.role\(\) <> 'service_role'/);
  assert.match(sql, /grant execute on function public\.oneforall_record_automated_evidence_result\(jsonb\) to service_role/);
  assert.match(block, /review_status = case when v_result = 'passed' then 'verified'/);
  assert.doesNotMatch(block, /active\s*=\s*true|provider_standing\s*=\s*'active'/i);
});

test('private matches omit customer identity and enforce safe pricing, expiry and workers', async () => {
  const sql = await read('../supabase/migrations/20260904000000_seamless_provider_experience.sql');
  const snapshotStart = sql.indexOf('function public.oneforall_provider_invitation_snapshots');
  const snapshotEnd = sql.indexOf('function public.oneforall_invite_provider', snapshotStart);
  const snapshot = sql.slice(snapshotStart, snapshotEnd);
  assert.doesNotMatch(snapshot, /customer_id|customer_name|exact_address|contact|access_notes|safety_info/i);
  assert.match(sql, /now\(\) \+ interval '12 hours'/);
  assert.match(sql, /v_action not in \('available','decline'\)/);
  assert.match(sql, /v_pricing_mode not in \('indicative','custom'\)/);
  assert.match(sql, /v_low <= 0 or v_high < v_low/);
  assert.match(sql, /Team providers must choose an eligible attending worker/);
  assert.match(sql, /oneforall_exact_worker_eligible_v2/);
});

test('booking wrapper permits only schedule, start and complete provider actions', async () => {
  const sql = await read('../supabase/migrations/20260904000000_seamless_provider_experience.sql');
  const start = sql.indexOf('function public.oneforall_provider_transition_booking');
  const end = sql.indexOf('function public.oneforall_confirm_provider_response', start);
  const block = sql.slice(start, end);
  assert.match(block, /not in \('scheduled','in_progress','completed'\)/);
  assert.match(block, /Use OneForAll support for cancellation or disputes/);
  assert.match(block, /oneforall_provider_control_open\('provider_job_actions'\)/);
});

test('provider responses can be confirmed only by the customer or OneForAll', async () => {
  const sql = await read('../supabase/migrations/20260904000000_seamless_provider_experience.sql');
  const start = sql.indexOf('function public.oneforall_confirm_provider_response');
  const end = sql.indexOf('-- Remove direct client paths', start);
  const block = sql.slice(start, end);
  assert.match(block, /v_job\.customer_id <> v_actor and not public\.is_admin\(\)/);
  assert.match(block, /confirmed_service_address/);
  assert.match(block, /confirmed_customer_contact/);
  assert.match(block, /contact_unlocked,created_by/);
  assert.match(block, /oneforall_exact_worker_eligible_v2/);
});
