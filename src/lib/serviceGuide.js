import { detectEmergencyText, getPhase1Service, PHASE1_SERVICES } from '../domain/catalogue.js';

export const SERVICE_GUIDE_STORAGE_KEY = 'oneforall.service-guide';
export const SERVICE_GUIDE_TTL_MS = 30 * 60 * 1000;
export const SERVICE_GUIDE_MAX_LENGTH = 1000;
const SERVICE_GUIDE_MAX_BYTES = 24 * 1024;
const GUIDED_SERVICE_KEY = 'general.guided_request';
const GUIDED_SCOPE_ID = 'guided-triage';

const SERVICE_ALIASES = Object.freeze({
  'cleaning.routine_domestic': ['cleaning', 'cleaner', 'house cleaning', 'home cleaning', 'regular clean', 'weekly cleaning', 'fortnightly cleaning', 'domestic cleaning', 'clean my house'],
  'cleaning.ordinary_deep_clean': ['deep cleaning', 'spring clean', 'thorough clean', 'full house clean'],
  'gardening.basic_maintenance': ['garden', 'gardening', 'gardener', 'garden maintenance', 'yard maintenance', 'yard work', 'overgrown garden'],
  'gardening.small_shrub_pruning': ['pruning', 'shrub pruning', 'trim shrubs', 'trim bushes', 'prune bushes'],
  'beauty.adult_low_risk': ['beauty', 'mobile beauty', 'beautician', 'beauty appointment'],
  'handyman.minor_tasks': ['handyman', 'odd jobs', 'minor home repair', 'small household job'],
  'electrical.licensed_services': ['electrical', 'electrician', 'electrical work', 'electrical problem', 'power problem'],
  'plumbing.licensed_services': ['plumbing', 'plumber', 'plumbing work', 'plumbing problem'],
  'carpentry.household': ['carpentry', 'carpenter', 'carpentry work', 'woodwork'],
  'building-renovation.managed_quote': ['renovation', 'renovate', 'remodel', 'home extension', 'building project'],
  'painting.residential': ['paint', 'painting', 'painter', 'house painting', 'painting job', 'need painting'],
  'rubbish-removal.ordinary': ['rubbish', 'rubbish removal', 'junk removal', 'hard rubbish', 'tip run', 'remove rubbish', 'take rubbish away'],
  'pest-control.diagnostic': ['pest', 'pests', 'pest control', 'pest problem', 'exterminator', 'bugs in house'],
  'pest-control.pesticide_treatment': ['approved pest diagnostic', 'pest diagnostic completed'],
  'moving-packing.household': ['packers and movers', 'packing and moving', 'moving house', 'house move', 'home move', 'removalist', 'removalists'],
});

const SCOPE_ALIASES = Object.freeze({
  'cleaning.routine_domestic': {
    'vacuum-mop-dust': ['mopping', 'clean floors', 'floor cleaning', 'dirty floors', 'dusty house'],
    'kitchen-bathroom': ['clean bathroom', 'bathroom cleaning', 'clean kitchen', 'kitchen cleaning', 'dirty shower'],
    'bins-linen': ['empty bins', 'change sheets', 'bed linen'],
    'internal-glass': ['clean inside windows', 'inside window cleaning'],
  },
  'cleaning.ordinary_deep_clean': {
    'ordinary-deep-clean': ['deep cleaning', 'spring clean', 'thorough clean', 'full deep clean'],
  },
  'gardening.basic_maintenance': {
    mowing: ['mowing', 'mowing lawn', 'cut grass', 'grass too long', 'overgrown lawn'],
    'hand-weeding-raking': ['pull weeds', 'garden weeds'],
    'watering-leaves': ['fallen leaves', 'leaf cleanup', 'clear leaves'],
    'ground-edging': ['lawn edges', 'edge the lawn'],
  },
  'gardening.small_shrub_pruning': {
    'ground-hand-pruning': ['trim shrubs', 'trim bushes', 'prune bushes', 'shrub trimming'],
  },
  'beauty.adult_low_risk': {
    'dry-hair-styling': ['blow dry', 'style my hair', 'hair appointment'],
    'makeup-strip-lashes': ['make up', 'event makeup', 'party makeup'],
    'basic-nails-polish': ['nail polish', 'paint my nails'],
  },
  'handyman.minor_tasks': {
    'flat-pack': ['ikea furniture', 'assemble table', 'assemble chair', 'assemble bed', 'assemble cabinet'],
    'minor-furniture': ['wobbly chair', 'wobbly table', 'loose furniture'],
    'surface-hardware': ['replace cabinet handle', 'loose cabinet handle', 'install door stop'],
    'light-picture': ['hang a picture', 'hang a photo', 'hang a frame'],
  },
  'electrical.licensed_services': {
    'lights-switches-powerpoints': ['light not working', 'install light', 'broken switch', 'replace powerpoint', 'replace power point'],
    'fault-assessment': ['circuit tripping', 'power keeps tripping', 'electrical issue', 'electrical fault'],
    'switchboard-safety': ['circuit breaker', 'fuse box'],
    'appliance-connection': ['connect oven', 'install cooktop', 'connect cooktop'],
  },
  'plumbing.licensed_services': {
    'tap-toilet-repair': ['leaking tap', 'broken tap', 'toilet repair', 'toilet not flushing'],
    'leak-assessment': ['leaking pipe', 'pipe leak', 'water dripping', 'water leak'],
    'drain-assessment': ['sink blocked', 'blocked sink', 'clogged drain', 'drain clogged'],
    'hot-water-assessment': ['no hot water', 'hot water not working'],
  },
  'carpentry.household': {
    'doors-trim': ['door will not close', 'door wont close', 'broken door', 'skirting board'],
    'shelving-storage': ['build shelf', 'install shelves', 'storage shelves'],
    'timber-repairs': ['damaged wood', 'broken timber', 'rotten timber'],
    'small-installations': ['wooden installation', 'install timber'],
  },
  'building-renovation.managed_quote': {
    'renovation-consultation': ['renovation', 'renovate', 'remodel', 'home extension', 'building plans'],
  },
  'painting.residential': {
    'interior-walls-ceilings': ['paint room', 'paint walls', 'paint ceiling', 'interior walls'],
    'doors-trim': ['paint cabinets', 'paint cupboard', 'repaint door'],
    'ground-level-exterior': ['paint outside', 'exterior wall', 'outside wall'],
    'ordinary-preparation': ['patch wall', 'holes in wall', 'prepare wall'],
  },
  'rubbish-removal.ordinary': {
    'household-furniture': ['remove couch', 'old furniture', 'furniture disposal', 'remove sofa'],
    'cardboard-recyclables': ['remove boxes', 'cardboard boxes', 'recycling removal'],
    'clean-green-waste': ['garden waste', 'remove branches', 'green waste removal'],
  },
  'pest-control.diagnostic': {
    'accessible-inspection': ['pest inspection', 'check for pests'],
    'reported-pest-identification': ['ants', 'cockroach', 'cockroaches', 'roaches', 'rodent', 'rats', 'mice', 'mouse', 'spiders', 'termite', 'termites', 'bed bugs', 'wasp nest'],
    'options-discussion': ['pest advice', 'treatment options'],
  },
  'pest-control.pesticide_treatment': {
    'post-diagnostic-treatment': ['approved pest diagnostic', 'pest diagnostic completed'],
  },
  'moving-packing.household': {
    'packing-unpacking': ['pack my house', 'pack boxes', 'unpack boxes', 'unpack my house'],
    'home-move': ['move home', 'move house', 'moving homes', 'local move'],
    'single-item': ['move couch', 'move sofa', 'move fridge', 'move washing machine', 'move one item'],
    'loading-unloading': ['load moving truck', 'unload moving truck', 'help load van', 'help unload van'],
  },
});

const bounded = (value, max = SERVICE_GUIDE_MAX_LENGTH) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
const MATCH_STOP_WORDS = new Set(['a', 'an', 'the', 'my', 'our', 'your', 'please', 'need', 'want', 'someone', 'to', 'for', 'of', 'with']);
const normalize = (value) => bounded(value)
  .normalize('NFKD')
  .replace(/[’']/g, '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

function matchingTerm(problem, term) {
  const candidate = normalize(term);
  if (!candidate) return false;
  const problemWords = problem.split(' ').filter((word) => word && !MATCH_STOP_WORDS.has(word));
  const candidateWords = candidate.split(' ').filter((word) => word && !MATCH_STOP_WORDS.has(word));
  const equivalent = (left, right) => left === right
    || (left.length >= 4 && right.length >= 4 && Math.abs(left.length - right.length) <= 3 && (left.startsWith(right) || right.startsWith(left)));
  if (candidateWords.length === 0 || candidateWords.length > problemWords.length) return false;
  return problemWords.some((_word, start) => candidateWords.every((word, offset) => equivalent(problemWords[start + offset] || '', word)));
}

function scoreTerm(term, scopeMatch) {
  const words = normalize(term).split(' ').filter((word) => word && !MATCH_STOP_WORDS.has(word));
  return (scopeMatch ? 30 : 16) + (words.length * 7) + Math.min(words.join(' ').length, 18);
}

function strongestMatch(problem, terms, scopeMatch) {
  return terms
    .filter((term) => matchingTerm(problem, term))
    .map((term) => ({ term: bounded(term, 80), score: scoreTerm(term, scopeMatch) }))
    .sort((left, right) => right.score - left.score)[0] || null;
}

function shortReason(term) {
  const words = bounded(term, 80).split(/\s+/).filter(Boolean).slice(0, 4);
  return `Matches “${words.join(' ')}”`;
}

function summariseProblem(problem) {
  if (problem.length <= 180) return problem;
  return `${problem.slice(0, 177).trimEnd()}…`;
}

function rankedSuggestions(problem) {
  return PHASE1_SERVICES
    .filter((service) => service.key !== GUIDED_SERVICE_KEY)
    .map((service, catalogueIndex) => {
      const serviceMatch = strongestMatch(problem, SERVICE_ALIASES[service.key] || [], false);
      const scopeMatches = service.scope_options.map((scope) => {
        const terms = [...scope.match_terms, ...(SCOPE_ALIASES[service.key]?.[scope.id] || [])];
        const match = strongestMatch(problem, terms, true);
        return match ? { scope_id: scope.id, ...match } : null;
      }).filter(Boolean);
      if (!serviceMatch && scopeMatches.length === 0) return null;
      const strongest = [serviceMatch, ...scopeMatches].filter(Boolean).sort((left, right) => right.score - left.score)[0];
      const score = strongest.score + Math.min(scopeMatches.length, 3) * 4;
      return {
        service_key: service.key,
        scope_ids: scopeMatches.map((match) => match.scope_id),
        scope_matches: scopeMatches.map((match) => ({ scope_id: match.scope_id, reason: shortReason(match.term) })),
        reason: shortReason(strongest.term),
        score,
        catalogueIndex,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.catalogueIndex - right.catalogueIndex)
    .slice(0, 3)
    .map(({ score: _score, catalogueIndex: _catalogueIndex, ...suggestion }) => suggestion);
}

export function findServiceProblem(value) {
  const problem = bounded(value);
  const emergency = detectEmergencyText(problem);
  if (emergency.emergency) {
    return { state: 'emergency', problem, summary: summariseProblem(problem), suggestions: [] };
  }
  if (normalize(problem).length < 3) {
    return { state: 'uncertain', problem, summary: summariseProblem(problem), suggestions: [] };
  }
  const suggestions = rankedSuggestions(normalize(problem));
  if (suggestions.length === 0) {
    return { state: 'uncertain', problem, summary: summariseProblem(problem), suggestions: [] };
  }
  return { state: 'matched', problem, summary: summariseProblem(problem), suggestions };
}

function safeStorage(storage) {
  if (storage !== undefined) return storage;
  try { return globalThis.sessionStorage; } catch { return null; }
}

function validSuggestion(input) {
  const service = getPhase1Service(input?.service_key);
  if (!service || service.key === GUIDED_SERVICE_KEY) return null;
  const validIds = new Set(service.scope_options.map((scope) => scope.id));
  const scopeIds = Array.isArray(input.scope_ids) ? [...new Set(input.scope_ids.filter((id) => validIds.has(id)))] : [];
  const reason = bounded(input.reason, 80);
  if (!reason || reason.split(/\s+/).length > 6) return null;
  const seenMatchIds = new Set();
  const scopeMatches = Array.isArray(input.scope_matches) ? input.scope_matches.map((match) => {
    const matchReason = bounded(match?.reason, 80);
    if (!scopeIds.includes(match?.scope_id) || seenMatchIds.has(match.scope_id) || !matchReason || matchReason.split(/\s+/).length > 6) return null;
    seenMatchIds.add(match.scope_id);
    return { scope_id: match.scope_id, reason: matchReason };
  }).filter(Boolean) : [];
  return { service_key: service.key, scope_ids: scopeIds, scope_matches: scopeMatches, reason };
}

function sanitiseResult(input, now = Date.now()) {
  const state = ['matched', 'uncertain', 'emergency'].includes(input?.state) ? input.state : 'uncertain';
  const problem = bounded(input?.problem);
  const suggestions = state === 'matched' && Array.isArray(input?.suggestions)
    ? input.suggestions.map(validSuggestion).filter(Boolean).slice(0, 3)
    : [];
  const safeState = state === 'matched' && suggestions.length === 0 ? 'uncertain' : state;
  const result = {
    version: 1,
    state: safeState,
    problem,
    summary: summariseProblem(problem),
    suggestions,
    saved_at: Number(input?.saved_at) || now,
  };
  const selectedService = getPhase1Service(input?.selected_service_key);
  if (selectedService) {
    const matchedSuggestion = suggestions.find((suggestion) => suggestion.service_key === selectedService.key);
    const guidedSelection = safeState === 'uncertain' && selectedService.key === GUIDED_SERVICE_KEY;
    if (matchedSuggestion || guidedSelection) {
      result.selected_service_key = selectedService.key;
      result.selected_scope_ids = guidedSelection ? [GUIDED_SCOPE_ID] : matchedSuggestion.scope_ids;
    }
  }
  return result;
}

function writeResult(result, storage) {
  const target = safeStorage(storage);
  if (!target) return false;
  const serialized = JSON.stringify(result);
  if (new TextEncoder().encode(serialized).length > SERVICE_GUIDE_MAX_BYTES) return false;
  try {
    target.setItem(SERVICE_GUIDE_STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

export function saveServiceGuideResult(result, storage, now = Date.now()) {
  return writeResult(sanitiseResult({ ...result, saved_at: now }, now), storage);
}

export function loadServiceGuideResult(storage, now = Date.now()) {
  const target = safeStorage(storage);
  if (!target) return null;
  try {
    const parsed = JSON.parse(target.getItem(SERVICE_GUIDE_STORAGE_KEY) || 'null');
    if (!parsed || now - Number(parsed.saved_at) > SERVICE_GUIDE_TTL_MS) {
      target.removeItem(SERVICE_GUIDE_STORAGE_KEY);
      return null;
    }
    return sanitiseResult(parsed, now);
  } catch {
    return null;
  }
}

export function selectServiceGuideSuggestion(serviceKey, storage, now = Date.now()) {
  const result = loadServiceGuideResult(storage, now);
  if (!result || result.state === 'emergency') return false;
  const matched = result.suggestions.find((suggestion) => suggestion.service_key === serviceKey);
  const guided = result.state === 'uncertain' && serviceKey === GUIDED_SERVICE_KEY;
  if (!matched && !guided) return false;
  return writeResult(sanitiseResult({ ...result, selected_service_key: serviceKey, selected_scope_ids: guided ? [GUIDED_SCOPE_ID] : matched.scope_ids }, now), storage);
}

export function loadServiceGuideHandoff(serviceKey, storage, now = Date.now()) {
  const result = loadServiceGuideResult(storage, now);
  if (!result || result.selected_service_key !== serviceKey) return null;
  const service = getPhase1Service(serviceKey);
  if (!service) return null;
  const validIds = new Set(service.scope_options.map((scope) => scope.id));
  return {
    service_key: service.key,
    scope_ids: (result.selected_scope_ids || []).filter((id) => validIds.has(id)),
    problem: result.problem,
    saved_at: result.saved_at,
  };
}

export function clearServiceGuideHandoff(serviceKey, storage, now = Date.now()) {
  const result = loadServiceGuideResult(storage, now);
  if (!result || result.selected_service_key !== serviceKey) return false;
  const { selected_service_key: _serviceKey, selected_scope_ids: _scopeIds, ...rest } = result;
  return writeResult(sanitiseResult(rest, now), storage);
}
