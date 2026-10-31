import test from 'node:test';
import assert from 'node:assert/strict';
import { activeAssertions, comparableQuotes, estimatePrice, journeySteps, melbourneDate, reminderIsDue, validateAnnotation } from '../src/lib/intelligentExperience.js';
import { melbourneInputToISO, validateAvailabilityWindow } from '../src/components/provider/providerDateTime.js';
import { createIntakeDraft } from '../src/lib/intake.js';
import { addToCart, loadCart, requestPayload, saveCart } from '../src/lib/serviceCart.js';

const now = new Date('2026-10-31T00:00:00Z');
test('Ballarat dates do not depend on browser timezone', () => {
  assert.equal(melbourneDate('2026-10-31T15:00:00Z'), '2026-11-01');
  assert.equal(melbourneInputToISO('2026-12-01T09:00'), '2026-11-30T22:00:00.000Z');
  assert.equal(melbourneInputToISO('2027-06-01T09:00'), '2027-05-31T23:00:00.000Z');
  assert.throws(() => melbourneInputToISO('2027-04-04T02:30'), /skipped or repeated/);
  assert.throws(() => melbourneInputToISO('2026-10-04T02:30'), /skipped or repeated/);
  assert.throws(() => melbourneInputToISO('2026-02-30T12:00'));
});
test('availability requires a future usable window', () => {
  assert.throws(() => validateAvailabilityWindow('2026-12-01T09:00', '2026-12-01T09:10', now.getTime()));
  assert.throws(() => validateAvailabilityWindow('2026-12-01T09:00', '2026-12-01T22:00', now.getTime()));
  assert.equal(validateAvailabilityWindow('2026-12-01T09:00', '2026-12-01T10:00', now.getTime()).ends_at, '2026-11-30T23:00:00.000Z');
});
test('passport requires active bounded approval, exact service and current evidence', () => {
  const valid = {status:'active', approved_service_ids:['cleaning'], evidence_checked_date:'2026-10-01', valid_through:'2026-12-01'};
  assert.equal(activeAssertions([valid], 'cleaning', now).length, 1);
  for (const change of [{status:'expired'}, {approved_service_ids:['other']}, {valid_through:'2026-10-01'}, {evidence_checked_date:'2026-12-01'}, {superseded_by_assertion_id:'new'}]) {
    assert.equal(activeAssertions([{...valid,...change}], 'cleaning', now).length, 0);
  }
});
test('quote comparison uses only current pending revisions', () => {
  const quote = {id:'old', tradie_id:'p', status:'pending', response_deadline:'2026-12-01', revision_number:1};
  const result = comparableQuotes([quote, {...quote,id:'new',revision_number:2}, {...quote,id:'declined',tradie_id:'q',status:'declined'}, {...quote,id:'expired',tradie_id:'r',response_deadline:'2026-10-01'}], now);
  assert.deepEqual(result.map(row => row.id), ['new']);
});
test('estimates refuse absent, expired or malformed prices', () => {
  const guide = {valid_through:'2026-12-01',low_per_unit:30,high_per_unit:50,callout:20};
  assert.deepEqual(estimatePrice(guide, 2, now), {low:80, high:120});
  for (const change of [{valid_through:undefined}, {valid_through:'2026-10-01'}, {low_per_unit:0}, {high_per_unit:10}, {callout:-1}]) assert.equal(estimatePrice({...guide,...change},2,now), null);
  assert.equal(estimatePrice(guide, -1, now), null);
});
test('journey never invents work progress or bank verification', () => {
  assert.equal(journeySteps({status:'submitted'}, null).current, 0);
  assert.equal(journeySteps({}, {state:'in_progress'}).current, 3);
  assert.equal(journeySteps({}, {state:'cancelled'}).special, true);
  assert.equal(reminderIsDue({enabled:true,due_date:'2026-10-30'},now), true);
  assert.equal(reminderIsDue({enabled:false,due_date:'2026-10-30'},now), false);
});
test('photo markers require bounded coordinates and useful notes', () => {
  assert.equal(validateAnnotation({x:0,y:1,note:'Here'}), true);
  for (const point of [{x:-1,y:0,note:'Here'}, {x:0,y:NaN,note:'Here'}, {x:0,y:0,note:' '}]) assert.equal(validateAnnotation(point), false);
});
test('service list is account separated, expiring, bounded and retry stable', () => {
  const records = new Map();
  const storage = {getItem:key=>records.get(key),setItem:(key,value)=>records.set(key,value)};
  const draft = {...createIntakeDraft('cleaning.routine_domestic'),selected_scope_ids:['vacuum-mop-dust'],suburb:'Ballarat',requested_value:100,requested_units:2,preferred_date:'2027-01-01'};
  addToCart('one',draft,storage,1000);
  addToCart('one',draft,storage,1001);
  assert.equal(loadCart('one',storage,1002).length,1);
  assert.equal(loadCart('two',storage,1002).length,0);
  assert.equal(loadCart('one',storage,1000+31*60*1000).length,0);
  assert.equal(requestPayload(draft).idempotency_key,draft.idempotency_key);
  assert.equal(Object.hasOwn(requestPayload(draft),'photo_names'),false);
  assert.throws(()=>saveCart('one',Array(9).fill(draft),storage));
  assert.throws(()=>saveCart('',[draft],storage));
});
