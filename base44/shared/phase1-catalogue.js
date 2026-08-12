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

const GLOBAL_EVIDENCE = ['responsible_identity', 'abn_entity_match', 'service_specific_insurance'];

const service = (definition) => Object.freeze({
  ...definition,
  required_evidence: [...GLOBAL_EVIDENCE, ...definition.required_evidence],
  flags: RELEASE_FLAGS_OFF,
});

export const PHASE1_SERVICES = Object.freeze([
  service({
    key: 'cleaning.routine_domestic', category: 'cleaning', name: 'Routine domestic cleaning', pathway: 'scheduled_or_recurring',
    allowed_scope: ['Vacuuming, mopping and dusting', 'Ordinary kitchen and bathroom cleaning', 'Bins and linen', 'Ground-level internal glass'],
    review_scope: ['End-of-lease cleaning', 'Unoccupied or keyholding access', 'Heavy soiling or furniture moving', 'Industrial products'],
    blocked_scope: ['Commercial cleaning', 'Ladders or elevated windows', 'Hoarding, trauma, sewage, sharps or body fluids', 'Infestation cleanup', 'Significant mould, fire or flood remediation', 'Asbestos or drug contamination'],
    required_evidence: ['chemical_equipment_declaration', 'safe_chemical_process'],
    block_terms: ['commercial', 'ladder', 'elevated window', 'hoarding', 'trauma', 'sewage', 'sharp', 'body fluid', 'infestation cleanup', 'significant mould', 'fire remediation', 'flood remediation', 'asbestos', 'drug contamination'],
    review_terms: ['end of lease', 'end-of-lease', 'unoccupied', 'keyholding', 'heavy soil', 'furniture', 'industrial product'],
  }),
  service({
    key: 'cleaning.ordinary_deep_clean', category: 'cleaning', name: 'Ordinary deep clean', pathway: 'managed_quote', manual_review_required: true,
    allowed_scope: ['Non-hazardous deep cleaning after manual review'],
    review_scope: ['Every request'], blocked_scope: ['Biohazard or remediation work', 'Hazardous chemical mixing'],
    required_evidence: ['chemical_equipment_declaration', 'safe_chemical_process'],
    block_terms: ['biohazard', 'remediation', 'mix chemicals', 'chemical mixing'], review_terms: ['deep clean'],
  }),
  service({
    key: 'gardening.basic_maintenance', category: 'gardening', name: 'Basic garden maintenance', pathway: 'scheduled_or_recurring',
    allowed_scope: ['Mowing', 'Hand weeding and raking', 'Watering and leaf collection', 'Ground-level edging'],
    review_scope: ['Steep or roadside work', 'Unusual equipment', 'Underground services', 'Chemical request'],
    blocked_scope: ['Chemical application', 'Excavation', 'Drainage, irrigation or retaining walls', 'Powerlines', 'Contaminated soil', 'Pest poison'],
    required_evidence: ['equipment_competence', 'ppe_exclusion_zone'],
    block_terms: ['chemical application', 'excavat', 'drainage', 'irrigation', 'retaining wall', 'powerline', 'contaminated soil', 'pest poison'],
    review_terms: ['steep', 'roadside', 'unusual equipment', 'underground service', 'chemical'],
  }),
  service({
    key: 'gardening.small_shrub_pruning', category: 'gardening', name: 'Small shrub pruning', pathway: 'managed_quote',
    allowed_scope: ['Ground-level pruning with hand tools'], review_scope: ['Green-waste removal'],
    blocked_scope: ['Ladders or climbing', 'Chainsaws, pole saws or chippers', 'Stump grinding or tree felling'],
    required_evidence: ['equipment_competence', 'ppe_exclusion_zone', 'green_waste_receiver', 'load_restraint'],
    block_terms: ['ladder', 'climb', 'chainsaw', 'pole saw', 'chipper', 'stump grind', 'tree fell'], review_terms: ['green waste', 'remove waste'],
  }),
  service({
    key: 'beauty.adult_low_risk', category: 'beauty', name: 'Adult low-risk mobile beauty', pathway: 'scheduled_or_recurring', adults_only: true,
    allowed_scope: ['Dry styling, wash/blow-dry and non-clinical hair styling', 'Ordinary makeup and non-invasive false lashes', 'Basic nail shaping, non-cutting cuticle care and standard polish'],
    review_scope: ['Colour or bleach', 'Allergy or recent eye/skin procedure', 'Diabetes, reduced sensation, circulation issue or anticoagulants', 'Active condition or infection'],
    blocked_scope: ['Minor or impaired consent', 'Broken or infected skin', 'Cutting tissue or blades', 'Clinical claims', 'Injectables or prescription products', 'Skin penetration, laser/IPL or intense peel', 'Intimate services'],
    required_evidence: ['relevant_training', 'infection_control', 'clean_tools_linen', 'business_registration_position'],
    block_terms: ['minor', 'under 18', 'cannot consent', 'broken skin', 'infected skin', 'cut tissue', 'blade', 'clinical', 'injectable', 'prescription', 'microneedl', 'dermaplan', 'tattoo', 'pierc', 'skin penetration', 'laser', 'ipl', 'intense peel', 'intimate'],
    review_terms: ['colour', 'bleach', 'allerg', 'recent eye', 'recent skin', 'diabetes', 'reduced sensation', 'circulation', 'anticoagulant', 'infection'],
  }),
  service({
    key: 'handyman.minor_tasks', category: 'handyman', name: 'Minor handyman tasks', pathway: 'managed_quote',
    allowed_scope: ['Flat-pack assembly', 'Minor furniture adjustment', 'Surface handles and door stops', 'Lightweight pictures on a known safe surface'],
    review_scope: ['Wall anchors', 'Heavy or safety-critical items', 'Unknown surface or hidden services', 'TVs, mirrors, shelves, masonry, tile, wet areas or old properties'],
    blocked_scope: ['Electrical, plumbing, gas, drainage or waterproofing', 'Structural, load-bearing, demolition or permit work', 'Roof or ladder work', 'Asbestos or smoke alarms', 'Job splitting to avoid licensed work'],
    required_evidence: ['task_experience', 'hidden_service_process', 'fixing_competence'],
    block_terms: ['electrical', 'wiring', 'power point', 'switchboard', 'plumbing', 'gas', 'drainage', 'waterproof', 'structural', 'load-bearing', 'demolition', 'permit', 'roof', 'ladder', 'asbestos', 'smoke alarm', 'split the job'],
    review_terms: ['wall anchor', 'heavy', 'safety-critical', 'unknown surface', 'hidden service', 'tv', 'mirror', 'shelf', 'masonry', 'tile', 'wet area', 'old propert'],
  }),
  service({
    key: 'rubbish-removal.ordinary', category: 'rubbish-removal', name: 'Ordinary rubbish removal', pathway: 'managed_quote',
    allowed_scope: ['Household goods and furniture', 'Cardboard and recyclables', 'Clean green waste'],
    review_scope: ['Renovation material, soil or rubble', 'Mattress, tyre, e-waste or fridge', 'Battery, paint, gas cylinder, unknown container or mixed load'],
    blocked_scope: ['Asbestos', 'Clinical waste, sharps or pharmaceuticals', 'Fuel, oil, solvent, acid or pesticide', 'Unknown chemical', 'Sewage, contaminated soil or drug waste', 'Illegal dumping'],
    required_evidence: ['vehicle_identity', 'load_restraint', 'lawful_receivers', 'disposal_receipts_process'],
    block_terms: ['asbestos', 'clinical waste', 'sharp', 'pharma', 'fuel', 'oil', 'solvent', 'acid', 'pesticide', 'unknown chemical', 'sewage', 'contaminated soil', 'drug waste', 'illegal dump'],
    review_terms: ['renovation', 'soil', 'rubble', 'mattress', 'tyre', 'e-waste', 'fridge', 'battery', 'paint', 'gas cylinder', 'unknown container', 'mixed load'],
  }),
  service({
    key: 'pest-control.diagnostic', category: 'pest-control', name: 'Licensed pest diagnostic', pathway: 'licensed_diagnostic',
    allowed_scope: ['Accessible-area inspection', 'Identification of the reported pest', 'Options discussion and a separate treatment quote'],
    review_scope: ['Termite or timber pest', 'Bed bugs or broad treatment', 'Pest animal', 'Vulnerable occupant, pregnancy, child, respiratory condition or sensitive pet', 'Trainee attendance'],
    blocked_scope: ['Treatment during diagnostic', 'Fumigation', 'Wildlife, snakes or protected species', 'Off-label chemical use', 'Missing SDS', 'Unsafe re-entry'],
    required_evidence: ['victorian_pest_licence', 'pest_professional_liability', 'sds_chemical_register', 'site_risk_records', 'spill_response'],
    block_terms: ['treat now', 'direct treatment', 'fumigat', 'wildlife', 'snake', 'protected species', 'off-label', 'missing sds', 'no sds', 'unsafe re-entry'],
    review_terms: ['termite', 'timber pest', 'bed bug', 'broad treatment', 'pest animal', 'pregnan', 'child', 'respiratory', 'sensitive pet', 'trainee'],
  }),
  service({
    key: 'pest-control.pesticide_treatment', category: 'pest-control', name: 'Managed pesticide treatment', pathway: 'licensed_diagnostic', manual_review_required: true,
    allowed_scope: ['Treatment only after an approved diagnostic and managed review'], review_scope: ['Every request'],
    blocked_scope: ['Direct public treatment request', 'Missing licence authorisation, supervisor or SDS'],
    required_evidence: ['victorian_pest_licence', 'pest_professional_liability', 'sds_chemical_register', 'site_risk_records', 'spill_response'],
    block_terms: ['direct', 'missing authorisation', 'no supervisor', 'missing sds', 'no sds'], review_terms: ['treatment'],
  }),
]);

export const PHASE1_SERVICE_MAP = Object.freeze(Object.fromEntries(PHASE1_SERVICES.map((item) => [item.key, item])));

export function getPhase1Service(serviceKey) {
  return PHASE1_SERVICE_MAP[serviceKey] || null;
}

export function classifyServiceScope(serviceKey, text) {
  const definition = getPhase1Service(serviceKey);
  if (!definition) return { decision: 'blocked', reason: 'service_unknown' };
  const value = String(text || '').trim().toLowerCase();
  if (!value) return { decision: 'manual_review', reason: 'scope_unknown' };
  const blockedTerm = definition.block_terms.find((term) => value.includes(term));
  if (blockedTerm) return { decision: 'blocked', reason: 'prohibited_scope', matched_term: blockedTerm };
  const reviewTerm = definition.review_terms.find((term) => value.includes(term));
  if (definition.manual_review_required || reviewTerm) return { decision: 'manual_review', reason: 'review_required', matched_term: reviewTerm };
  return { decision: 'allowed', reason: 'within_configured_scope' };
}
