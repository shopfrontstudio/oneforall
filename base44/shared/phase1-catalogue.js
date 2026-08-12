export const PHASE1_POLICY_VERSION = 'phase1-foundation-2026-08-12';

export const RELEASE_FLAGS_OFF = Object.freeze({
  publicly_visible: false,
  request_enabled: false,
  provider_onboarding_enabled: false,
  quote_enabled: false,
  booking_enabled: false,
  recurrence_enabled: false,
  public_release_enabled: false,
});

const providerRequirement = (evidence_type, expiry_required = false, scope_ids = ['*']) => Object.freeze({
  evidence_type, subject: 'provider', expiry_required, scope_ids,
});
const workerRequirement = (evidence_type, expiry_required = false, scope_ids = ['*']) => Object.freeze({
  evidence_type, subject: 'worker', expiry_required, scope_ids,
});
const option = (id, label, match_terms) => Object.freeze({ id, label, match_terms: Object.freeze(match_terms) });

const GLOBAL_PROVIDER_EVIDENCE = [
  providerRequirement('responsible_identity'),
  providerRequirement('abn_entity_match'),
  providerRequirement('service_specific_insurance', true),
];

const service = (definition) => {
  const evidence_requirements = Object.freeze([
    ...GLOBAL_PROVIDER_EVIDENCE,
    ...(definition.evidence_requirements || []),
  ]);
  return Object.freeze({
    ...definition,
    scope_options: Object.freeze(definition.scope_options),
    allowed_scope: Object.freeze(definition.scope_options.map((item) => item.label)),
    excluded_scope: Object.freeze([...definition.blocked_scope]),
    evidence_requirements,
    // Retained as a read-only compatibility projection. Eligibility uses the
    // structured requirements above, including subject and expiry metadata.
    required_evidence: Object.freeze(evidence_requirements.map((item) => item.evidence_type)),
    trigger_configuration: Object.freeze({
      expiry_alert_days: [30, 7],
      block_at_expiry: true,
      reverify_on: ['scope_change', 'entity_change', 'worker_change', 'incident', 'complaint'],
      unknown_scope: 'manual_review',
      mixed_scope: 'manual_review',
      regulated_scope: 'blocked',
    }),
    flags: RELEASE_FLAGS_OFF,
  });
};

export const PHASE1_SERVICES = Object.freeze([
  service({
    key: 'cleaning.routine_domestic', category: 'cleaning', name: 'Routine domestic cleaning', pathway: 'scheduled_or_recurring',
    scope_options: [
      option('vacuum-mop-dust', 'Vacuuming, mopping and dusting', ['vacuum', 'mop', 'dust']),
      option('kitchen-bathroom', 'Ordinary kitchen and bathroom cleaning', ['kitchen', 'bathroom', 'toilet', 'shower']),
      option('bins-linen', 'Bins and linen', ['bin', 'linen', 'bed sheet']),
      option('internal-glass', 'Ground-level internal glass', ['internal glass', 'inside window', 'ground-level window']),
    ],
    review_scope: ['End-of-lease cleaning', 'Unoccupied or keyholding access', 'Heavy soiling or furniture moving', 'Industrial products'],
    blocked_scope: ['Commercial cleaning', 'Ladders or elevated windows', 'Hoarding, trauma, sewage, sharps or body fluids', 'Infestation cleanup', 'Significant mould, fire or flood remediation', 'Asbestos or drug contamination'],
    evidence_requirements: [providerRequirement('chemical_equipment_declaration'), workerRequirement('safe_chemical_process')],
    block_terms: ['commercial', 'ladder', 'elevated window', 'hoarding', 'trauma', 'sewage', 'sharp', 'body fluid', 'infestation cleanup', 'significant mould', 'fire remediation', 'flood remediation', 'asbestos', 'drug contamination', 'pool clean', 'pool filter', 'filter cleaning'],
    review_terms: ['end of lease', 'end-of-lease', 'unoccupied', 'keyholding', 'heavy soil', 'furniture', 'industrial product'],
  }),
  service({
    key: 'cleaning.ordinary_deep_clean', category: 'cleaning', name: 'Ordinary deep clean', pathway: 'managed_quote', manual_review_required: true,
    scope_options: [option('ordinary-deep-clean', 'Non-hazardous deep cleaning after manual review', ['deep clean'])],
    review_scope: ['Every request'], blocked_scope: ['Biohazard or remediation work', 'Hazardous chemical mixing'],
    evidence_requirements: [providerRequirement('chemical_equipment_declaration'), workerRequirement('safe_chemical_process')],
    block_terms: ['biohazard', 'remediation', 'mix chemicals', 'chemical mixing', 'pool clean', 'pool filter', 'filter cleaning'], review_terms: ['deep clean'],
  }),
  service({
    key: 'gardening.basic_maintenance', category: 'gardening', name: 'Basic garden maintenance', pathway: 'scheduled_or_recurring',
    scope_options: [
      option('mowing', 'Mowing', ['mow', 'lawn']),
      option('hand-weeding-raking', 'Hand weeding and raking', ['hand weed', 'weeding', 'rake', 'raking']),
      option('watering-leaves', 'Watering and leaf collection', ['water plants', 'watering', 'leaf collection', 'collect leaves']),
      option('ground-edging', 'Ground-level edging', ['edging', 'edge lawn']),
    ],
    review_scope: ['Steep or roadside work', 'Unusual equipment', 'Underground services', 'Chemical request'],
    blocked_scope: ['Chemical application', 'Excavation', 'Drainage, irrigation or retaining walls', 'Powerlines', 'Contaminated soil', 'Pest poison'],
    evidence_requirements: [workerRequirement('equipment_competence'), workerRequirement('ppe_exclusion_zone')],
    block_terms: ['chemical application', 'excavat', 'drainage', 'irrigation', 'retaining wall', 'raised garden bed', 'powerline', 'contaminated soil', 'pest poison'],
    review_terms: ['steep', 'roadside', 'unusual equipment', 'underground service', 'chemical'],
  }),
  service({
    key: 'gardening.small_shrub_pruning', category: 'gardening', name: 'Small shrub pruning', pathway: 'managed_quote',
    scope_options: [option('ground-hand-pruning', 'Ground-level pruning with hand tools', ['ground-level pruning', 'hand pruning', 'prune shrub'])],
    review_scope: ['Green-waste removal'], blocked_scope: ['Ladders or climbing', 'Chainsaws, pole saws or chippers', 'Stump grinding or tree felling'],
    evidence_requirements: [workerRequirement('equipment_competence'), workerRequirement('ppe_exclusion_zone'), providerRequirement('green_waste_receiver'), workerRequirement('load_restraint')],
    block_terms: ['ladder', 'climb', 'chainsaw', 'pole saw', 'chipper', 'stump grind', 'tree fell', 'raised garden bed'], review_terms: ['green waste', 'remove waste'],
  }),
  service({
    key: 'beauty.adult_low_risk', category: 'beauty', name: 'Adult low-risk mobile beauty', pathway: 'scheduled_or_recurring', adults_only: true,
    scope_options: [
      option('dry-hair-styling', 'Dry styling, wash/blow-dry and non-clinical hair styling', ['dry styling', 'hair styling', 'wash and blow', 'wash/blow', 'blow-dry']),
      option('makeup-strip-lashes', 'Ordinary makeup and non-invasive strip lashes', ['makeup', 'strip lashes', 'false strip lashes']),
      option('basic-nails-polish', 'Basic nail shaping, non-cutting cuticle care and standard polish', ['nail shaping', 'standard polish', 'basic nails', 'non-cutting cuticle']),
    ],
    review_scope: ['Colour or bleach', 'Allergy or recent eye/skin procedure', 'Diabetes, reduced sensation, circulation issue or anticoagulants', 'Active condition or infection'],
    blocked_scope: ['Minor or impaired consent', 'Broken or infected skin', 'Cutting tissue or blades', 'Clinical claims', 'Injectables or prescription products', 'Skin penetration, laser/IPL or intense peel', 'Intimate services', 'Eyelash extensions'],
    evidence_requirements: [workerRequirement('relevant_training'), workerRequirement('infection_control'), providerRequirement('clean_tools_linen'), providerRequirement('business_registration_position')],
    block_terms: ['minor', 'under 18', 'cannot consent', 'broken skin', 'infected skin', 'cut tissue', 'blade', 'clinical', 'injectable', 'prescription', 'microneedl', 'dermaplan', 'tattoo', 'pierc', 'skin penetration', 'laser', 'ipl', 'intense peel', 'intimate', 'eyelash extension', 'lash extension'],
    review_terms: ['colour', 'bleach', 'allerg', 'recent eye', 'recent skin', 'diabetes', 'reduced sensation', 'circulation', 'anticoagulant', 'infection'],
  }),
  service({
    key: 'handyman.minor_tasks', category: 'handyman', name: 'Minor handyman tasks', pathway: 'managed_quote',
    scope_options: [
      option('flat-pack', 'Flat-pack assembly', ['flat-pack', 'flat pack', 'assemble furniture']),
      option('minor-furniture', 'Minor furniture adjustment', ['furniture adjustment', 'adjust furniture']),
      option('surface-hardware', 'Surface handles and door stops', ['surface handle', 'cabinet handle', 'door stop']),
      option('light-picture', 'Lightweight pictures on a known safe surface', ['lightweight picture', 'hang picture', 'picture frame']),
    ],
    review_scope: ['Wall anchors', 'Heavy or safety-critical items', 'Unknown surface or hidden services', 'TVs, mirrors, shelves, masonry, tile, wet areas or old properties'],
    blocked_scope: ['Electrical, plumbing, gas, drainage or waterproofing', 'Structural, load-bearing, demolition or permit work', 'Roof or ladder work', 'Asbestos or smoke alarms', 'Garage door openers', 'Job splitting to avoid licensed work'],
    evidence_requirements: [workerRequirement('task_experience'), workerRequirement('hidden_service_process'), workerRequirement('fixing_competence')],
    block_terms: ['electrical', 'wiring', 'power point', 'switchboard', 'plumbing', 'gas', 'drainage', 'waterproof', 'structural', 'load-bearing', 'demolition', 'permit', 'roof', 'ladder', 'asbestos', 'smoke alarm', 'garage door opener', 'split the job'],
    review_terms: ['wall anchor', 'heavy', 'safety-critical', 'unknown surface', 'hidden service', 'tv', 'mirror', 'shelf', 'masonry', 'tile', 'wet area', 'old propert'],
  }),
  service({
    key: 'rubbish-removal.ordinary', category: 'rubbish-removal', name: 'Ordinary rubbish removal', pathway: 'managed_quote',
    scope_options: [
      option('household-furniture', 'Household goods and furniture', ['household goods', 'furniture', 'couch', 'sofa', 'table']),
      option('cardboard-recyclables', 'Cardboard and recyclables', ['cardboard', 'recyclable', 'recycling']),
      option('clean-green-waste', 'Clean green waste', ['clean green waste', 'garden clippings', 'branches']),
    ],
    review_scope: ['Renovation material, soil or rubble', 'Mattress, tyre, e-waste or fridge', 'Battery, paint, gas cylinder, unknown container or mixed load'],
    blocked_scope: ['Asbestos', 'Clinical waste, sharps or pharmaceuticals', 'Fuel, oil, solvent, acid or pesticide', 'Unknown chemical', 'Sewage, contaminated soil, drug waste or animal carcasses', 'Illegal dumping'],
    evidence_requirements: [providerRequirement('vehicle_identity'), workerRequirement('load_restraint'), providerRequirement('lawful_receivers'), providerRequirement('disposal_receipts_process')],
    block_terms: ['asbestos', 'clinical waste', 'sharp', 'pharma', 'fuel', 'oil', 'solvent', 'acid', 'pesticide', 'unknown chemical', 'sewage', 'contaminated soil', 'drug waste', 'dead animal', 'animal carcass', 'carcass', 'illegal dump'],
    review_terms: ['renovation', 'soil', 'rubble', 'mattress', 'tyre', 'e-waste', 'fridge', 'battery', 'paint', 'gas cylinder', 'unknown container', 'mixed load'],
  }),
  service({
    key: 'pest-control.diagnostic', category: 'pest-control', name: 'Licensed pest diagnostic', pathway: 'licensed_diagnostic',
    scope_options: [
      option('accessible-inspection', 'Accessible-area inspection', ['inspect', 'inspection', 'assessment', 'diagnostic']),
      option('reported-pest-identification', 'Identification of the reported pest', ['identify pest', 'pest identification', 'not sure what pest']),
      option('options-discussion', 'Options discussion and a separate next-step quote', ['options discussion', 'separate next-step quote', 'discuss options']),
    ],
    review_scope: ['Termite or timber pest', 'Bed bugs or broad treatment', 'Pest animal', 'Vulnerable occupant, pregnancy, child, respiratory condition or sensitive pet', 'Trainee attendance'],
    blocked_scope: ['Treatment during diagnostic', 'Pest spraying or treatment requests', 'Fumigation', 'Wildlife, snakes or protected species', 'Off-label chemical use', 'Missing SDS', 'Unsafe re-entry'],
    evidence_requirements: [workerRequirement('victorian_pest_licence', true), providerRequirement('pest_professional_liability', true), workerRequirement('pest_scope_authorisation', true), providerRequirement('sds_chemical_register'), workerRequirement('site_risk_records'), workerRequirement('spill_response')],
    block_terms: ['treat', 'treatment', 'spray', 'fumigat', 'exterminat', 'kill', 'remove nest', 'apply poison', 'poison', 'wildlife', 'snake', 'protected species', 'off-label', 'missing sds', 'no sds', 'unsafe re-entry'],
    review_terms: ['termite', 'timber pest', 'bed bug', 'broad treatment', 'pest animal', 'pregnan', 'child', 'respiratory', 'sensitive pet', 'trainee'],
  }),
  service({
    key: 'pest-control.pesticide_treatment', category: 'pest-control', name: 'Managed pesticide treatment', pathway: 'licensed_diagnostic', manual_review_required: true,
    scope_options: [option('post-diagnostic-treatment', 'Treatment only after an approved diagnostic and managed review', ['approved diagnostic'])],
    review_scope: ['Every request'], blocked_scope: ['Direct public treatment request', 'Missing licence authorisation, supervisor or SDS'],
    evidence_requirements: [workerRequirement('victorian_pest_licence', true), providerRequirement('pest_professional_liability', true), workerRequirement('pest_scope_authorisation', true), providerRequirement('sds_chemical_register'), workerRequirement('site_risk_records'), workerRequirement('spill_response')],
    block_terms: ['direct', 'pest spray', 'spray treatment', 'missing authorisation', 'no supervisor', 'missing sds', 'no sds'], review_terms: ['treatment'],
  }),
]);

export const PHASE1_SERVICE_MAP = Object.freeze(Object.fromEntries(PHASE1_SERVICES.map((item) => [item.key, item])));

export function getPhase1Service(serviceKey) {
  return PHASE1_SERVICE_MAP[serviceKey] || null;
}

const normal = (value) => String(value || '').trim().toLowerCase();

const flattenRiskText = (value) => {
  if (Array.isArray(value)) return value.flatMap(flattenRiskText);
  // Keys are implementation labels, not user statements. Inspecting them made
  // harmless values such as { apply_poison: false } look like prohibited work.
  if (value && typeof value === 'object') return Object.values(value).flatMap(flattenRiskText);
  if (value === null || value === undefined) return [];
  return ['string', 'number', 'boolean'].includes(typeof value) ? [String(value)] : [];
};

// Every non-authoritative text field that can describe work or site risk is
// collapsed into one value for fail-closed prohibited/review term screening.
// These fields can tighten a decision, but never establish allowed scope.
export function collectAdditionalRiskText(input = {}) {
  return [
    input.title,
    input.access_notes,
    input.safety_info,
    input.reported_pest,
    input.observed_signs,
    input.safety_considerations,
    input.photo_names,
    input.photos,
    input.pathway_fields,
    input.pathway_answers,
    input.pathway_data,
  ].flatMap(flattenRiskText)
    .map((value) => String(value).trim())
    .filter((value) => value && normal(value) !== 'none_declared')
    .join('\n');
}

export function classifyServiceScope(serviceKey, {
  selectedScopeIds = [],
  scopeNotes = undefined,
  additionalRiskText = '',
  // Compatibility for older callers while structured names are adopted.
  notes = '',
  adultConfirmed = false,
} = {}) {
  const definition = getPhase1Service(serviceKey);
  if (!definition) return { decision: 'blocked', reason: 'service_unknown' };
  const scopeValue = normal(scopeNotes ?? notes);
  const riskValue = normal(additionalRiskText);
  const screeningValue = `${scopeValue}\n${riskValue}`;
  const blockedTerm = definition.block_terms.find((term) => screeningValue.includes(term));
  if (blockedTerm) return { decision: 'blocked', reason: 'prohibited_scope', matched_term: blockedTerm, selected_scope_ids: Array.isArray(selectedScopeIds) ? selectedScopeIds : [] };
  const selected = [...new Set(Array.isArray(selectedScopeIds) ? selectedScopeIds.filter(Boolean) : [])];
  const options = new Map(definition.scope_options.map((item) => [item.id, item]));
  if (!selected.length) return { decision: 'manual_review', reason: 'scope_unknown', selected_scope_ids: [] };
  if (selected.some((id) => !options.has(id))) return { decision: 'manual_review', reason: 'scope_unknown', selected_scope_ids: selected };
  if (definition.adults_only && adultConfirmed !== true) return { decision: 'blocked', reason: 'adult_confirmation_required', selected_scope_ids: selected };

  const reviewTerm = definition.review_terms.find((term) => screeningValue.includes(term));
  const privateSafetyReview = riskValue.includes('considerations_present') || riskValue.includes('prefer_not_to_say');
  if (definition.manual_review_required || reviewTerm || privateSafetyReview) {
    return { decision: 'manual_review', reason: privateSafetyReview ? 'safety_review_required' : 'review_required', matched_term: reviewTerm, selected_scope_ids: selected };
  }

  // Structured selected_scope_ids are the sole allow authority. Any extra user
  // description, title, site/safety context, filename or pathway value can still
  // block above, but otherwise requires a human rather than widening scope.
  if (scopeValue || riskValue) return { decision: 'manual_review', reason: 'additional_context_review_required', selected_scope_ids: selected };
  return { decision: 'allowed', reason: 'configured_scope_selected', selected_scope_ids: selected };
}
