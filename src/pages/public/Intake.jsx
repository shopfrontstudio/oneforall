import React, { useEffect, useId, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle2, Clock3, Info, Loader2, LockKeyhole, RotateCcw } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { PHASE1_SERVICE_MAP, servicePathwayLabel } from '@/lib/catalogue';
import { clearSessionIntake, createIntakeDraft, createIntakeDraftFromGuide, evaluateIntakeDraft, loadSessionIntake, nextPreviewState, saveSessionIntake } from '@/lib/intake';
import { EmptyState } from '@/components/oneforall/Bits';
import { IS_DEV_PREVIEW } from '@/lib/runtime';
import { callFunction, ensureProfile, setAccountType } from '@/lib/oneforall';
import { clearServiceGuideHandoff, loadServiceGuideHandoff, loadServiceGuideResult } from '@/lib/serviceGuide';
import { PUBLIC_PATHS } from '@/lib/routes';

const FieldError = ({ id, children }) => children ? <p id={id} className="mt-1 text-sm font-medium text-destructive" role="alert">{children}</p> : null;
const FOCUSABLE_CONTROL = 'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Intake() {
  const { serviceKey } = useParams();
  const service = PHASE1_SERVICE_MAP[serviceKey];
  const { isAuthenticated, user, checkUserAuth } = useAuth();
  const formId = useId();
  const formRef = useRef(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [previewCount, setPreviewCount] = useState(0);
  const [restored, setRestored] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState({});
  const [storageWarning, setStorageWarning] = useState(false);
  const [invalidFocusRequest, setInvalidFocusRequest] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [guidePrefilled, setGuidePrefilled] = useState(false);

  useEffect(() => {
    if (!service) { setLoading(false); return; }
    const saved = loadSessionIntake(service.key);
    const guideHandoff = saved ? null : loadServiceGuideHandoff(service.key);
    setDraft(saved || createIntakeDraftFromGuide(service.key, guideHandoff));
    setRestored(Boolean(saved));
    setGuidePrefilled(Boolean(guideHandoff));
    setLoading(false);
  }, [service]);

  useEffect(() => {
    if (draft) setStorageWarning(!saveSessionIntake(draft));
  }, [draft]);

  useEffect(() => {
    if (!invalidFocusRequest) return;
    // Effects run after React commits the submitted/error state. DOM order is
    // therefore the deterministic error order; an invalid fieldset delegates
    // focus to its first usable form control.
    const invalidElement = formRef.current?.querySelector('[aria-invalid="true"]');
    const focusTarget = invalidElement?.matches(FOCUSABLE_CONTROL)
      ? invalidElement
      : invalidElement?.querySelector(FOCUSABLE_CONTROL);
    focusTarget?.focus();
  }, [invalidFocusRequest]);

  if (loading) return <div className="glass-soft h-72 animate-pulse rounded-3xl" role="status" aria-label="Loading request questions" />;
  if (!service || !draft) return <EmptyState title="Request pathway not found" body="Choose a service from the Phase 1 catalogue." action={<Link to="/services" className="font-semibold text-eucalyptus-deep">Browse services</Link>} />;

  const assessment = result || evaluateIntakeDraft(draft);
  const hasVisibleError = Object.keys(assessment.errors || {}).some((field) => touched[field]);
  const visibleState = assessment.state === 'error' && !submitted && !hasVisibleError ? 'empty' : assessment.state;
  const set = (field, value) => { setDraft((current) => ({ ...current, [field]: value })); setTouched((current) => ({ ...current, [field]: true })); setResult(null); };
  const toggleScope = (scopeId) => set('selected_scope_ids', draft.selected_scope_ids.includes(scopeId) ? draft.selected_scope_ids.filter((id) => id !== scopeId) : [...draft.selected_scope_ids, scopeId]);
  const markGroupTouched = (field) => (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setTouched((current) => ({ ...current, [field]: true }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setSubmitted(true);
    const next = evaluateIntakeDraft(draft);
    if (!['ready', 'manual_review'].includes(next.state)) {
      setResult(next);
      if (next.state === 'error' && Object.keys(next.errors || {}).length) {
        setInvalidFocusRequest((request) => request + 1);
      }
      return;
    }
    if (IS_DEV_PREVIEW) {
      setPreviewCount((count) => count + 1);
      setResult({ ...next, state: nextPreviewState(previewCount) });
      return;
    }
    if (!isAuthenticated) {
      setResult({ ...next, state: 'login_required' });
      return;
    }
    if (user?.account_type === 'tradie') {
      setResult({ ...next, state: 'submit_error', message: 'Provider accounts cannot create customer requests.' });
      return;
    }
    setSubmitting(true);
    try {
      if (!user?.account_type) {
        await setAccountType('customer');
        await ensureProfile('customer');
        await checkUserAuth();
      }
      const response = await callFunction('submit-request', {
        idempotency_key: draft.idempotency_key,
        service_key: draft.service_key,
        pathway: draft.pathway,
        selected_scope_ids: draft.selected_scope_ids,
        scope_description: draft.scope_description,
        suburb: draft.suburb,
        preferred_date: draft.preferred_date,
        recurrence: draft.recurrence,
        urgency: draft.urgency,
        adult_scope_confirmed: draft.adult_scope_confirmed,
        reported_pest: draft.reported_pest,
        observed_signs: draft.observed_signs,
        safety_considerations: draft.safety_considerations,
        painting_property_era: draft.painting_property_era,
        painting_surface_hazard: draft.painting_surface_hazard,
        painting_access_height: draft.painting_access_height,
      });
      clearSessionIntake();
      clearServiceGuideHandoff(service.key);
      setGuidePrefilled(false);
      setResult({ ...next, state: 'submitted', submission: response });
    } catch (error) {
      setResult({ ...next, state: 'submit_error', message: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => { clearSessionIntake(); clearServiceGuideHandoff(service.key); setDraft(createIntakeDraft(service.key)); setResult(null); setRestored(false); setGuidePrefilled(false); setPreviewCount(0); setSubmitted(false); setTouched({}); setStorageWarning(false); setInvalidFocusRequest(0); };
  const error = (field) => submitted || touched[field] ? assessment.errors?.[field] : undefined;

  if (result?.state === 'submitted') {
    const guideResult = loadServiceGuideResult();
    const hasOtherSuggestions = guideResult?.state === 'matched' && guideResult.suggestions.some((suggestion) => suggestion.service_key !== service.key);
    return <div className="mx-auto max-w-2xl space-y-5"><Link to={PUBLIC_PATHS.category(service.category)} className="inline-flex items-center gap-1 text-sm font-semibold text-eucalyptus-deep"><ArrowLeft size={15} />{service.category === 'not-sure' ? 'Service categories' : 'Category services'}</Link><section className="glass rounded-3xl p-6 sm:p-8" role="status"><CheckCircle2 size={34} className="text-eucalyptus-deep" /><p className="mt-4 text-xs font-bold uppercase tracking-[0.14em] text-terracotta">Request received</p><h1 className="mt-2 text-3xl font-semibold">We’ll confirm the next step.</h1><p className="mt-3 text-muted-foreground">Your {service.name.toLowerCase()} request is private. OneForAll will review scope and confirm provider availability, price and timing before it becomes a booking.</p><p className="mt-3 rounded-xl bg-sage/35 px-4 py-3 text-sm font-semibold">Status: {result.submission?.status === 'manual_review' ? 'Private review' : 'Received'}</p><div className="mt-5 flex flex-wrap gap-3"><Link to="/bookings" className="inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">View my requests</Link>{hasOtherSuggestions && <Link to={PUBLIC_PATHS.serviceGuideResults} className="inline-flex rounded-xl border border-border bg-white px-5 py-3 text-sm font-semibold text-eucalyptus-deep">View other suggestions</Link>}</div></section></div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to={`/services/${encodeURIComponent(service.key)}`} className="inline-flex items-center gap-1 text-sm font-semibold text-eucalyptus-deep"><ArrowLeft size={15} />Service details</Link>
      <header className="glass rounded-3xl p-5 sm:p-7"><p className="text-xs font-bold uppercase tracking-[0.14em] text-terracotta">{servicePathwayLabel(service)}</p><h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{service.name}</h1><p className="mt-2 text-sm text-muted-foreground">Tell us what you need. Your request stays private while scope, provider eligibility, price and timing are confirmed.</p>{restored && <p className="mt-3 inline-flex items-center gap-2 rounded-xl bg-sage/35 px-3 py-2 text-sm font-semibold" role="status"><Clock3 size={16} />Restored from this browser session</p>}{guidePrefilled && <p className="mt-3 inline-flex items-center gap-2 rounded-xl bg-sage/35 px-3 py-2 text-sm font-semibold" role="status"><Info size={16} />Suggested options added — please review and edit them</p>}</header>

      <div className="rounded-2xl border border-sandstone-deep/45 bg-sandstone/30 p-4" role="status"><b>Requests are open.</b><p className="mt-1 text-sm text-muted-foreground">Submitting does not confirm a booking or charge you. OneForAll confirms availability and price first.</p>{IS_DEV_PREVIEW && <p className="mt-2 text-sm font-bold text-terracotta">Local QA preview · no authoritative record is written.</p>}</div>
      {storageWarning && <div className="rounded-2xl border border-sandstone-deep/45 bg-white/70 p-4 text-sm" role="status"><b>Draft not saved in this browser.</b><p className="mt-1 text-muted-foreground">You can keep completing this form; leaving or refreshing may clear it.</p></div>}

      <form ref={formRef} onSubmit={submit} noValidate className="glass space-y-6 rounded-3xl p-5 sm:p-7">
        {service.adults_only && <fieldset className="rounded-2xl border border-terracotta/25 bg-terracotta/5 p-4 text-sm" aria-invalid={Boolean(error('adult_scope_confirmed'))} aria-describedby={error('adult_scope_confirmed') ? `${formId}-adult-error` : undefined} onBlur={markGroupTouched('adult_scope_confirmed')}><legend className="px-1 font-semibold">Adults-only, low-risk pathway</legend><p className="mt-1 text-muted-foreground">Requests involving minors, impaired consent, broken/infected skin or invasive treatments are blocked.</p><label className="mt-3 flex items-start gap-2 font-semibold"><input type="checkbox" checked={draft.adult_scope_confirmed} onChange={(event) => set('adult_scope_confirmed', event.target.checked)} /><span>I confirm the person receiving the service is 18 or older and can consent.</span></label><FieldError id={`${formId}-adult-error`}>{error('adult_scope_confirmed')}</FieldError></fieldset>}

        <fieldset onBlur={markGroupTouched('selected_scope_ids')} aria-invalid={Boolean(error('selected_scope_ids'))} aria-describedby={error('selected_scope_ids') ? `${formId}-scope-options-error` : undefined}><legend className="text-sm font-semibold">Choose the listed work you need</legend><p className="mt-1 text-xs text-muted-foreground">Only these configured options can proceed automatically. Notes can narrow the request but cannot add a new service.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{service.scope_options.map((option) => <label key={option.id} className="flex items-start gap-2 rounded-xl border border-border bg-white/65 p-3 text-sm"><input type="checkbox" checked={draft.selected_scope_ids.includes(option.id)} onChange={() => toggleScope(option.id)} /><span>{option.label}</span></label>)}</div><FieldError id={`${formId}-scope-options-error`}>{error('selected_scope_ids')}</FieldError></fieldset>

        <div><label htmlFor={`${formId}-scope`} className="text-sm font-semibold">{service.key === 'general.guided_request' ? 'Describe what you need help with (required)' : 'Optional notes'}</label><p className="mt-1 text-xs text-muted-foreground">{service.key === 'general.guided_request' ? 'Give enough detail for private operations triage. This does not publish a job or send it to providers.' : 'Add context only. Unknown, mixed, review or prohibited wording will tighten the decision; it never widens the selected options. Do not enter identity documents, health records or payment details.'}</p><textarea id={`${formId}-scope`} value={draft.scope_description} onChange={(event) => set('scope_description', event.target.value)} rows={5} required={service.key === 'general.guided_request'} aria-invalid={Boolean(error('scope_description'))} aria-describedby={error('scope_description') ? `${formId}-scope-error` : undefined} className="inp mt-2" /><FieldError id={`${formId}-scope-error`}>{error('scope_description')}</FieldError></div>

        <div><label htmlFor={`${formId}-suburb`} className="text-sm font-semibold">Service suburb</label><input id={`${formId}-suburb`} value={draft.suburb} onChange={(event) => set('suburb', event.target.value)} aria-invalid={Boolean(error('suburb'))} aria-describedby={error('suburb') ? `${formId}-suburb-error` : undefined} autoComplete="address-level2" className="inp mt-2" /><FieldError id={`${formId}-suburb-error`}>{error('suburb')}</FieldError></div>

        <fieldset className="space-y-4"><legend className="text-lg font-semibold">Timing preference</legend><div><label htmlFor={`${formId}-urgency`} className="text-sm font-semibold">How soon?</label><select id={`${formId}-urgency`} value={draft.urgency} onChange={(event) => set('urgency', event.target.value)} className="inp mt-2"><option value="flexible">Flexible</option><option value="this_week">This week</option><option value="urgent">Urgent — not an emergency</option></select><p className="mt-1 text-xs text-muted-foreground">For immediate danger, life risk, gas, fire, electrical or structural emergencies, call 000 or the relevant emergency authority.</p></div>{service.pathway === 'scheduled_or_recurring' && <><div><label htmlFor={`${formId}-date`} className="text-sm font-semibold">Preferred date</label><input id={`${formId}-date`} type="date" value={draft.preferred_date} onChange={(event) => set('preferred_date', event.target.value)} aria-invalid={Boolean(error('preferred_date'))} aria-describedby={error('preferred_date') ? `${formId}-date-error` : undefined} className="inp mt-2" /><FieldError id={`${formId}-date-error`}>{error('preferred_date')}</FieldError></div><div><label htmlFor={`${formId}-recurrence`} className="text-sm font-semibold">Frequency</label><select id={`${formId}-recurrence`} value={draft.recurrence} onChange={(event) => set('recurrence', event.target.value)} className="inp mt-2"><option value="once">One time</option><option value="weekly">Weekly</option><option value="fortnightly">Fortnightly</option><option value="monthly">Monthly</option></select></div></>}</fieldset>

        {service.pathway === 'managed_quote' && <section className="rounded-2xl border border-border bg-white/55 p-4"><h2 className="font-semibold">Managed quote</h2><p className="mt-1 text-sm text-muted-foreground">If photos or documents are needed, OneForAll will request them through a private review step. Do not add identity, health or payment details here.</p></section>}

        {service.key === 'painting.residential' && <fieldset className="space-y-4 rounded-2xl border border-sandstone-deep/40 bg-sandstone/20 p-4"><legend className="px-1 text-lg font-semibold">Painting safety screen</legend><p className="text-xs text-muted-foreground">These structured answers can only tighten the pathway. Lead, asbestos and roof work are blocked; uncertainty or height access is held for review.</p><SelectField id={`${formId}-paint-era`} label="Property or existing coating age" value={draft.painting_property_era} onChange={(value) => set('painting_property_era', value)} error={error('painting_property_era')} options={[['','Choose one'],['pre_1970','Before 1970'],['1970_or_later','1970 or later'],['unknown','Unknown']]} /><SelectField id={`${formId}-paint-hazard`} label="Known lead or asbestos" value={draft.painting_surface_hazard} onChange={(value) => set('painting_surface_hazard', value)} error={error('painting_surface_hazard')} options={[['','Choose one'],['none_known','None known'],['lead_or_asbestos','Lead or asbestos known/suspected'],['unsure','Unsure']]} /><SelectField id={`${formId}-paint-height`} label="Access required" value={draft.painting_access_height} onChange={(value) => set('painting_access_height', value)} error={error('painting_access_height')} options={[['','Choose one'],['ground_level','Ground level only'],['ladder_or_height','Ladder or other height access'],['roof','Roof access or roof painting']]} /></fieldset>}

        {service.pathway === 'licensed_diagnostic' && <fieldset className="space-y-4"><legend className="text-lg font-semibold">Diagnostic questions</legend><div><label htmlFor={`${formId}-pest`} className="text-sm font-semibold">Reported pest</label><input id={`${formId}-pest`} value={draft.reported_pest} onChange={(event) => set('reported_pest', event.target.value)} placeholder="e.g. Not sure, ants, rodents" aria-invalid={Boolean(error('reported_pest'))} aria-describedby={error('reported_pest') ? `${formId}-pest-error` : undefined} className="inp mt-2" /><FieldError id={`${formId}-pest-error`}>{error('reported_pest')}</FieldError></div><div><label htmlFor={`${formId}-signs`} className="text-sm font-semibold">Signs observed</label><textarea id={`${formId}-signs`} value={draft.observed_signs} onChange={(event) => set('observed_signs', event.target.value)} rows={3} aria-invalid={Boolean(error('observed_signs'))} aria-describedby={error('observed_signs') ? `${formId}-signs-error` : undefined} className="inp mt-2" /><FieldError id={`${formId}-signs-error`}>{error('observed_signs')}</FieldError></div><div><label htmlFor={`${formId}-safety`} className="text-sm font-semibold">Are there safety considerations for the assessment?</label><select id={`${formId}-safety`} value={draft.safety_considerations} onChange={(event) => set('safety_considerations', event.target.value)} className="inp mt-2"><option value="none_declared">None declared</option><option value="considerations_present">Yes — discuss privately during review</option><option value="prefer_not_to_say">Prefer not to say here</option></select><p className="mt-1 text-xs text-muted-foreground">Do not enter health details here; discuss them privately during review if relevant.</p></div></fieldset>}

        <IntakeStatus state={visibleState} reason={assessment.scope?.reason} message={assessment.message} isAuthenticated={isAuthenticated} serviceKey={service.key} />

        <div className="flex flex-col gap-2 sm:flex-row"><button type="submit" disabled={submitting} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 disabled:opacity-60">{submitting ? <><Loader2 size={16} className="mr-2 animate-spin" />Sending request…</> : IS_DEV_PREVIEW ? 'Preview request — no record' : 'Send private request'}</button><button type="button" disabled={submitting} onClick={reset} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-white px-5 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 disabled:opacity-60"><RotateCcw size={16} />Clear draft</button></div>
      </form>
    </div>
  );
}

function SelectField({ id, label, value, onChange, error, options }) {
  const errorId = `${id}-error`;
  return <div><label htmlFor={id} className="text-sm font-semibold">{label}</label><select id={id} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} className="inp mt-2">{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select><FieldError id={errorId}>{error}</FieldError></div>;
}

function IntakeStatus({ state, reason, message, isAuthenticated, serviceKey }) {
  if (state === 'restricted' && reason === 'emergency_redirect') return <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm" role="alert"><p className="flex items-center gap-2 font-semibold text-destructive"><AlertCircle size={17} />Emergency help required</p><p className="mt-1 text-muted-foreground"><b>OneForAll is not an emergency service.</b> If someone is in immediate danger or life is at risk, call 000. Otherwise contact the appropriate utility or emergency authority for the hazard.</p></div>;
  if (state === 'restricted') return <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm" role="alert"><p className="flex items-center gap-2 font-semibold text-destructive"><LockKeyhole size={17} />Restricted scope</p><p className="mt-1 text-muted-foreground">This pathway cannot accept the described work. Review the blocked boundaries or choose an appropriate regulated provider outside OneForAll.</p></div>;
  if (state === 'manual_review') return <div className="rounded-2xl border border-sandstone-deep/40 bg-sandstone/25 p-4 text-sm" role="status"><p className="flex items-center gap-2 font-semibold"><Info size={17} />Manual review required</p><p className="mt-1 text-muted-foreground">You can submit this request. OneForAll will review it privately before any provider matching or booking.</p></div>;
  if (state === 'error') return <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-4 text-sm" role="alert"><p className="flex items-center gap-2 font-semibold text-destructive"><AlertCircle size={17} />Check the labelled fields above.</p></div>;
  if (state === 'preview_complete') return <div className="rounded-2xl border border-eucalyptus/25 bg-sage/30 p-4 text-sm" role="status"><p className="flex items-center gap-2 font-semibold text-eucalyptus-deep"><CheckCircle2 size={17} />Preview complete — no record created</p><p className="mt-1 text-muted-foreground">The request passed local validation. Local QA mode does not submit it.</p></div>;
  if (state === 'duplicate') return <div className="rounded-2xl border border-sandstone-deep/40 bg-sandstone/25 p-4 text-sm" role="status"><b>Duplicate preview ignored.</b><p className="mt-1 text-muted-foreground">No additional action or record was created.</p></div>;
  if (state === 'login_required') return <div className="rounded-2xl border border-eucalyptus/25 bg-sage/25 p-4 text-sm" role="status"><b>Log in to send this request.</b><p className="mt-2">Your answers are saved in this browser for 30 minutes. <Link to={`/login?returnTo=${encodeURIComponent(`/request/${serviceKey}`)}`} className="font-semibold text-eucalyptus-deep underline">Log in or create an account</Link>.</p></div>;
  if (state === 'submit_error') return <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-4 text-sm" role="alert"><b>Request not sent.</b><p className="mt-1 text-muted-foreground">{message || 'Please try again. No duplicate request will be created.'}</p></div>;
  return null;
}
