import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORY_META, groupedServices, serviceAvailability } from '../src/lib/catalogue.js';
import { CUSTOMER_REQUEST_RELEASE_FLAGS, PHASE1_SERVICES, PHASE1_SERVICE_MAP } from '../src/domain/catalogue.js';

const expectedCategories = ['cleaning','gardening','beauty','handyman','electrical','plumbing','carpentry','building-renovation','painting','rubbish-removal','pest-control','not-sure'];
const expectedServices = [
  'cleaning.routine_domestic','cleaning.ordinary_deep_clean',
  'gardening.basic_maintenance','gardening.small_shrub_pruning',
  'beauty.adult_low_risk','handyman.minor_tasks','electrical.licensed_services',
  'plumbing.licensed_services','carpentry.household','building-renovation.managed_quote',
  'painting.residential','general.guided_request','rubbish-removal.ordinary',
  'pest-control.diagnostic','pest-control.pesticide_treatment',
];

test('catalogue exposes exactly 12 categories and 15 stable service pathways', () => {
  assert.deepEqual(CATEGORY_META.map(({ key }) => key), expectedCategories);
  assert.deepEqual(PHASE1_SERVICES.map(({ key }) => key), expectedServices);
  assert.equal(groupedServices().flatMap((group) => group.services).length, 15);
  assert.equal(new Set(PHASE1_SERVICES.map(({ key }) => key)).size, 15);
});

test('all services accept private customer requests while provider and booking gates stay closed', () => {
  const keys = ['publicly_visible','request_enabled','provider_onboarding_enabled','quote_enabled','booking_enabled','recurrence_enabled','public_release_enabled'];
  assert.deepEqual(Object.keys(CUSTOMER_REQUEST_RELEASE_FLAGS), keys);
  for (const service of PHASE1_SERVICES) {
    assert.deepEqual(service.flags, CUSTOMER_REQUEST_RELEASE_FLAGS);
    assert.equal(service.flags.publicly_visible, true);
    assert.equal(service.flags.request_enabled, true);
    assert.equal(service.flags.public_release_enabled, true);
    assert.equal(service.flags.provider_onboarding_enabled, false);
    assert.equal(service.flags.quote_enabled, false);
    assert.equal(service.flags.booking_enabled, false);
    assert.equal(serviceAvailability(service), 'available');
  }
});

test('Building is consultation-only and regulated pathways carry exact worker evidence', () => {
  const building = PHASE1_SERVICE_MAP['building-renovation.managed_quote'];
  assert.deepEqual(building.scope_options.map(({ id }) => id), ['renovation-consultation']);
  assert.match(building.blocked_scope.join(' '), /performing building work/i);
  const electricalWorkerTypes = PHASE1_SERVICE_MAP['electrical.licensed_services'].evidence_requirements.filter((item) => item.subject === 'worker').map((item) => item.evidence_type);
  assert.deepEqual(electricalWorkerTypes, ['victorian_electrical_licence','electrical_scope_authorisation']);
  const pestWorkerTypes = PHASE1_SERVICE_MAP['pest-control.diagnostic'].evidence_requirements.filter((item) => item.subject === 'worker').map((item) => item.evidence_type);
  assert.ok(pestWorkerTypes.includes('victorian_pest_licence'));
  assert.ok(pestWorkerTypes.includes('pest_scope_authorisation'));
});
