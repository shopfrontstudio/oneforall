import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  canShowProviderBookingLink,
  externalPaymentSummary,
  latestCustomerQuote,
  nextBookingState,
  recurrenceSummary,
} from '../src/domain/marketplaceWorkflow.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('workflow presentation models revisions, external payment and mutual recurrence honestly', () => {
  assert.equal(latestCustomerQuote([
    { id: 'old', status: 'superseded', revision_number: 1 },
    { id: 'new', status: 'pending', revision_number: 2 },
  ]).id, 'new');
  assert.equal(externalPaymentSummary([{ participant_role: 'provider', status: 'confirmed' }]).state, 'provider_only');
  assert.equal(externalPaymentSummary([
    { participant_role: 'provider', status: 'confirmed' },
    { participant_role: 'customer', status: 'confirmed' },
  ]).state, 'both_confirmed');
  assert.match(recurrenceSummary({ state: 'proposed', provider_confirmed_at: '2026-10-01' }), /awaiting mutual confirmation/i);
  assert.match(recurrenceSummary({ state: 'active', provider_confirmed_at: 'x', customer_confirmed_at: 'y', frequency: 'weekly' }), /confirmed/i);
  assert.equal(nextBookingState('accepted'), 'scheduled');
  assert.equal(nextBookingState('completed'), null);
});

test('provider booking links fail closed in the client model', () => {
  const link = { token: 'opaque', service_key: 'cleaning.routine_domestic', provider_display_name: 'Sample Provider', status: 'active', public_release_enabled: true, quote_enabled: true };
  assert.equal(canShowProviderBookingLink(link), true);
  for (const drift of [
    { status: 'disabled' }, { public_release_enabled: false }, { quote_enabled: false },
    { token: '' }, { provider_display_name: '' }, { expires_at: '2020-01-01T00:00:00Z' },
  ]) assert.equal(canShowProviderBookingLink({ ...link, ...drift }), false);
});

test('marketplace migration keeps protected workflow server-authoritative and flags unchanged', async () => {
  const sql = await read('../supabase/migrations/20261011000000_complete_marketplace_workflow.sql');
  assert.match(sql, /revoke insert, update, delete on public\.external_payment_confirmations,[\s\S]*public\.provider_booking_links,[\s\S]*public\.marketplace_workflow_events from anon, authenticated/i);
  assert.match(sql, /Participant statements about direct external payment\. Never bank-, payout- or processor-verified/i);
  assert.match(sql, /customer_confirmed_at/);
  assert.match(sql, /provider_confirmed_at/);
  assert.match(sql, /superseded_by_quote_id/);
  assert.doesNotMatch(sql, /set\s+(publicly_visible|request_enabled|provider_onboarding_enabled|quote_enabled|booking_enabled|recurrence_enabled|public_release_enabled)\s*=\s*true/i);
});

test('request v2 persists bounded demand and exact provider-link targeting without bypassing release gates', async () => {
  const sql = await read('../supabase/migrations/20261011000000_complete_marketplace_workflow.sql');
  const block = sql.slice(sql.indexOf('function public.oneforall_submit_request_v2'));
  assert.match(block, /Planning quantity and budget are required/);
  assert.match(block, /v_units<v_service\.minimum_request_units/);
  assert.match(block, /provider_booking_link_id/);
  assert.match(block, /requested_provider_id/);
  assert.match(block, /approved_scope_ids@>v_scopes/);
  assert.match(block, /oneforall_release_open\(v_service\.service_key,'quote'\)/);
  assert.match(block, /Provider request link is not currently eligible/);
  assert.ok(block.indexOf('Provider request link is unavailable') < block.indexOf('insert into public.jobs'));
});

test('public provider link route resolves only the safe RPC projection', async () => {
  const [app, page, intake, facade] = await Promise.all([
    read('../src/App.jsx'), read('../src/pages/public/ProviderBookingLink.jsx'),
    read('../src/pages/public/Intake.jsx'), read('../src/api/base44Client.js'),
  ]);
  assert.match(app, /path="\/book\/:token"/);
  assert.match(page, /resolve-provider-booking-link/);
  assert.doesNotMatch(page, /ProviderOffering|ProviderEvidence|ProviderWorker|TradieProfile/);
  assert.match(intake, /booking_link_token/);
  assert.match(facade, /'resolve-provider-booking-link': 'oneforall_resolve_provider_booking_link'/);
});

test('provider demo payment and recurrence controls stay browser-only', async () => {
  const detail = await read('../src/pages/provider/JobDetail.jsx');
  assert.match(detail, /if \(user\.demo_mode\) recordDemoExternalPayment/);
  assert.match(detail, /if \(user\.demo_mode\) updateDemoRecurringSchedule/);
});
