import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, Check, FileCheck2, LockKeyhole, MapPin, Save, ShieldCheck, UserRound, UsersRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/AuthContext';
import { PHASE1_SERVICES, callFunction } from '@/lib/oneforall';
import {
  PROVIDER_APPLICATION_STEPS,
  evidenceRequirementLabel,
  mergeProviderControls,
  providerApplicationStatusLabel,
  providerEvidenceRequirements,
  providerStatusLabel,
} from '@/lib/provider';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const EMPTY_FORM = {
  provider_type: 'solo', full_name: '', business_name: '', abn: '', mobile: '', business_email: '', suburb: 'Ballarat',
  service_keys: [], coverage_suburbs: 'Ballarat', availability_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  privacy_declaration: false, accuracy_declaration: false, eligibility_declaration: false, notification_email_enabled: true,
};
const inputClass = 'mt-1 min-h-11 w-full rounded-xl border border-border bg-white/85 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/35 disabled:cursor-not-allowed disabled:opacity-60';

const safeRead = async (read, fallback) => {
  try { return await read(); } catch { return fallback; }
};

export default function ProviderApplication() {
  const { user, checkUserAuth } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [application, setApplication] = useState(null);
  const [profile, setProfile] = useState(null);
  const [offerings, setOfferings] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const [serviceDefinitions, setServiceDefinitions] = useState([]);
  const [controls, setControls] = useState(() => mergeProviderControls());
  const [form, setForm] = useState(EMPTY_FORM);
  const [step, setStep] = useState(1);
  const [saveState, setSaveState] = useState('');
  const [teamMember, setTeamMember] = useState({ display_name: '', relationship_type: 'employee' });
  const hydrated = useRef(false);
  const lastDraft = useRef('');

  const load = useCallback(async () => {
    setLoading(true);
    const [controlRows, applications, profiles, offeringRows, workerRows, evidenceRows, definitions] = await Promise.all([
      safeRead(() => base44.entities.ProviderFeatureControl.list('-updated_date', 1), []),
      safeRead(() => base44.entities.ProviderApplication.filter({ provider_id: user.id }), []),
      safeRead(() => base44.entities.TradieProfile.filter({ user_id: user.id }), []),
      safeRead(() => base44.entities.ProviderOffering.filter({ provider_id: user.id }), []),
      safeRead(() => base44.entities.ProviderWorker.filter({ provider_id: user.id }), []),
      safeRead(() => base44.entities.ProviderEvidence.filter({ provider_id: user.id }), []),
      safeRead(() => base44.entities.ServiceDefinition.list('name'), []),
    ]);
    const nextApplication = applications[0] || null;
    const nextProfile = profiles[0] || null;
    const selectedServices = offeringRows.filter((row) => row.requested_selected !== false).map((row) => row.service_key);
    setControls(mergeProviderControls(controlRows[0]));
    setApplication(nextApplication);
    setProfile(nextProfile);
    setOfferings(offeringRows);
    setWorkers(workerRows);
    setEvidence(evidenceRows);
    setServiceDefinitions(definitions);
    setStep(nextApplication?.current_step || 1);
    setForm({
      ...EMPTY_FORM,
      provider_type: nextApplication?.provider_type || nextProfile?.provider_type || 'solo',
      full_name: nextProfile?.full_name || user.full_name || '',
      business_name: nextProfile?.business_name || '',
      abn: nextProfile?.abn || '',
      mobile: nextProfile?.contact_phone || '',
      business_email: nextProfile?.business_email || user.email || '',
      suburb: nextProfile?.suburb || 'Ballarat',
      service_keys: selectedServices,
      coverage_suburbs: [...new Set(offeringRows.flatMap((row) => row.requested_coverage_suburbs || row.coverage_suburbs || []))].join(', ') || 'Ballarat',
      availability_days: [...new Set(offeringRows.flatMap((row) => row.requested_availability_days || row.availability_days || []))].map((day) => day.toLowerCase()),
      privacy_declaration: Boolean(nextApplication?.privacy_declaration_at),
      accuracy_declaration: Boolean(nextApplication?.accuracy_declaration_at),
      eligibility_declaration: Boolean(nextApplication?.eligibility_declaration_at),
      notification_email_enabled: nextApplication?.notification_email_enabled !== false,
    });
    setLoading(false);
    hydrated.current = true;
  }, [user.email, user.full_name, user.id]);

  useEffect(() => { load(); }, [load]);

  const enabledServices = useMemo(() => {
    const databaseMap = new Map(serviceDefinitions.map((service) => [service.service_key, service]));
    return PHASE1_SERVICES.map((service) => ({
      ...service,
      onboarding_open: Boolean(databaseMap.get(service.key)?.provider_onboarding_enabled && databaseMap.get(service.key)?.public_release_enabled),
    }));
  }, [serviceDefinitions]);
  const requirements = useMemo(() => providerEvidenceRequirements(form.service_keys), [form.service_keys]);
  const applicationOpen = controls.application_writes_enabled && enabledServices.some((service) => service.onboarding_open);
  const editable = applicationOpen && ['draft', 'action_required'].includes(application?.status || 'draft');

  const payloadForStep = useCallback((completeStep = false) => {
    const common = { step, complete_step: completeStep };
    if (step === 1) return { ...common, provider_type: form.provider_type, full_name: form.full_name, business_name: form.business_name, abn: form.abn, mobile: form.mobile, business_email: form.business_email, suburb: form.suburb };
    if (step === 2) return { ...common, service_keys: form.service_keys, coverage_suburbs: form.coverage_suburbs.split(',').map((value) => value.trim()).filter(Boolean), availability_days: form.availability_days };
    if (step === 4) return { ...common, privacy_declaration: form.privacy_declaration, accuracy_declaration: form.accuracy_declaration, eligibility_declaration: form.eligibility_declaration, notification_email_enabled: form.notification_email_enabled };
    return common;
  }, [form, step]);

  useEffect(() => {
    if (!hydrated.current || !application || !editable || step === 3) return undefined;
    const payload = payloadForStep(false);
    const fingerprint = JSON.stringify(payload);
    if (lastDraft.current === fingerprint) return undefined;
    const timer = window.setTimeout(async () => {
      setSaveState('Saving…');
      try {
        await callFunction('provider-save-application', payload);
        lastDraft.current = fingerprint;
        setSaveState('Saved');
      } catch { setSaveState('Not saved'); }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [application, editable, payloadForStep, step]);

  const startApplication = async () => {
    setBusy(true);
    try {
      const result = await callFunction('provider-start-application', { provider_type: form.provider_type });
      await checkUserAuth();
      setApplication(result.application || result);
      await load();
      toast({ title: 'Provider application started', description: 'Your progress will save as you move through the steps.' });
    } catch (error) { toast({ title: 'Application not started', description: error.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const completeStep = async () => {
    setBusy(true);
    try {
      const result = await callFunction('provider-save-application', payloadForStep(true));
      setApplication(result.application || application);
      if (step < 4) setStep(step + 1);
      setSaveState('Saved');
      await load();
    } catch (error) { toast({ title: 'This step needs attention', description: error.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const addTeamMember = async () => {
    if (!teamMember.display_name.trim()) return;
    setBusy(true);
    try {
      await callFunction('provider-save-worker', teamMember);
      setTeamMember({ display_name: '', relationship_type: 'employee' });
      await load();
    } catch (error) { toast({ title: 'Team member not saved', description: error.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const uploadEvidence = async (row, file) => {
    if (!row || !file) return;
    setBusy(true);
    try {
      await base44.integrations.ProviderEvidence.upload({ evidenceId: row.id, file, serviceKeys: row.submitted_service_keys || [row.submitted_service_key].filter(Boolean) });
      await load();
      toast({ title: 'Document received', description: 'It remains private while checks are completed.' });
    } catch (error) { toast({ title: 'Document not uploaded', description: error.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const submitApplication = async () => {
    setBusy(true);
    try {
      const result = await callFunction('provider-submit-application', { idempotency_key: crypto.randomUUID() });
      setApplication(result.application || { ...application, status: 'submitted' });
      await load();
      toast({ title: 'Application submitted', description: 'You can track its status here.' });
    } catch (error) { toast({ title: 'Application not submitted', description: error.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="glass-soft h-64 animate-pulse rounded-3xl" role="status" aria-label="Loading provider application" />;

  if (!application) return <ApplicationIntroduction controls={controls} applicationOpen={applicationOpen} providerType={form.provider_type} setProviderType={(provider_type) => setForm((current) => ({ ...current, provider_type }))} busy={busy} onStart={startApplication} />;

  if (application.status === 'approved') return <div className="mx-auto max-w-2xl space-y-5"><Link to="/account" className="inline-flex items-center gap-1 text-sm font-semibold text-eucalyptus-deep"><ArrowLeft size={15} />Account</Link><section className="glass rounded-3xl p-7 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sage/40"><Check className="text-eucalyptus-deep" /></div><h1 className="mt-4 text-2xl font-semibold">Provider application approved</h1><p className="mt-2 text-sm text-muted-foreground">Your approved services will appear in the provider workspace when their job controls are released.</p><button onClick={() => navigate('/provider/today')} className="mt-5 min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">Open provider workspace</button></section></div>;

  return <div className="mx-auto max-w-4xl space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><Link to={user.account_type === 'tradie' ? '/provider/account' : '/account'} className="inline-flex items-center gap-1 text-sm font-semibold text-eucalyptus-deep"><ArrowLeft size={15} />Account</Link><h1 className="mt-3 text-2xl font-semibold tracking-tight">Provider application</h1><p className="mt-1 text-sm text-muted-foreground">One account, one resumable application.</p></div><span className="rounded-full bg-sage/35 px-3 py-1.5 text-sm font-semibold">{providerApplicationStatusLabel(application.status)}</span></div>
    {!editable && <div className="flex gap-3 rounded-2xl border border-terracotta/20 bg-terracotta/[0.06] p-4"><LockKeyhole size={18} className="mt-0.5 shrink-0 text-terracotta" /><p className="text-sm text-muted-foreground">Your saved application is view-only while provider application controls are closed.</p></div>}
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Application progress">{PROVIDER_APPLICATION_STEPS.map((item) => { const done = (application.completed_steps || []).includes(item.id); const active = item.id === step; return <li key={item.id}><button type="button" onClick={() => setStep(item.id)} className={`min-h-20 w-full rounded-2xl border p-3 text-left ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-white/70'}`}><span className="text-xs font-semibold">{done ? <Check size={15} className="inline" /> : `0${item.id}`}</span><span className="mt-1 block text-sm font-semibold">{item.label}</span></button></li>; })}</ol>
    <section className="glass rounded-3xl p-5 sm:p-7">
      <div className="mb-5 flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-terracotta">Step {step} of 4</p><h2 className="mt-1 text-xl font-semibold">{PROVIDER_APPLICATION_STEPS[step - 1].label}</h2><p className="mt-1 text-sm text-muted-foreground">{PROVIDER_APPLICATION_STEPS[step - 1].description}</p></div><span className="text-xs text-muted-foreground" aria-live="polite">{saveState}</span></div>
      {step === 1 && <AboutStep form={form} setForm={setForm} disabled={!editable} />}
      {step === 2 && <ServicesStep form={form} setForm={setForm} services={enabledServices} disabled={!editable} />}
      {step === 3 && <VerificationStep controls={controls} requirements={requirements} evidence={evidence} workers={workers} providerType={form.provider_type} teamMember={teamMember} setTeamMember={setTeamMember} disabled={!editable || busy} onAddTeamMember={addTeamMember} onUpload={uploadEvidence} />}
      {step === 4 && <ReviewStep form={form} setForm={setForm} offerings={offerings} evidence={evidence} application={application} disabled={!editable} />}
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-5"><button type="button" disabled={step === 1} onClick={() => setStep(step - 1)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-semibold disabled:opacity-40"><ArrowLeft size={16} />Back</button><div className="flex gap-2">{step < 4 ? <button type="button" disabled={!editable || busy} onClick={completeStep} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-45">Save and continue<ArrowRight size={16} /></button> : <><button type="button" disabled={!editable || busy} onClick={completeStep} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary px-4 text-sm font-semibold text-primary disabled:opacity-45"><Save size={16} />Save review</button><button type="button" disabled={!editable || busy || !controls.sensitive_uploads_enabled} onClick={submitApplication} className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-45">Submit application</button></>}</div></div>
    </section>
  </div>;
}

function ApplicationIntroduction({ controls, applicationOpen, providerType, setProviderType, busy, onStart }) {
  return <div className="mx-auto max-w-4xl space-y-5"><Link to="/account" className="inline-flex items-center gap-1 text-sm font-semibold text-eucalyptus-deep"><ArrowLeft size={15} />Account</Link><section className="glass overflow-hidden rounded-3xl"><div className="grid gap-0 md:grid-cols-[1.15fr_.85fr]"><div className="p-6 sm:p-8"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-terracotta">Become a provider</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Set up once. See only the work that fits.</h1><p className="mt-3 max-w-xl text-sm text-muted-foreground">Tell us what you do, where you work and who attends. OneForAll privately matches approved providers—there is no public bidding feed.</p><div className="mt-6 grid gap-3 sm:grid-cols-2">{PROVIDER_APPLICATION_STEPS.map((item) => <div key={item.id} className="rounded-2xl border border-border/70 bg-white/65 p-4"><span className="text-xs font-semibold text-terracotta">0{item.id}</span><h2 className="mt-1 font-semibold">{item.label}</h2><p className="mt-1 text-xs text-muted-foreground">{item.description}</p></div>)}</div></div><aside className="bg-eucalyptus-deep p-6 text-white sm:p-8"><ShieldCheck size={28} /><h2 className="mt-4 text-xl font-semibold">Private by design</h2><p className="mt-2 text-sm text-white/75">Documents are never customer-visible. Automated checks can assess individual evidence, but only an independent review can activate a service.</p><div className="mt-6 space-y-2"><Choice active={providerType === 'solo'} onClick={() => setProviderType('solo')} Icon={UserRound} title="Solo provider" body="You are added as the attending worker." /><Choice active={providerType === 'team'} onClick={() => setProviderType('team')} Icon={UsersRound} title="Team" body="Add eligible workers separately." /></div><button type="button" disabled={!applicationOpen || busy} onClick={onStart} className="mt-6 min-h-11 w-full rounded-xl bg-white px-4 text-sm font-semibold text-eucalyptus-deep disabled:cursor-not-allowed disabled:opacity-45">{applicationOpen ? 'Start application' : 'Applications opening later'}</button>{!applicationOpen && <p className="mt-3 text-xs text-white/65">The workspace is ready, but applications and document collection stay off until the provider, privacy, retention and vendor settings are approved.</p>}{!controls.transactional_email_enabled && <p className="mt-3 text-xs text-white/65">No application emails are being sent.</p>}</aside></div></section></div>;
}

function Choice({ active, onClick, Icon, title, body }) {
  return <button type="button" onClick={onClick} className={`flex w-full gap-3 rounded-2xl border p-3 text-left ${active ? 'border-white bg-white/15' : 'border-white/20 bg-white/5'}`}><Icon className="mt-0.5 shrink-0" size={18} /><span><b className="block text-sm">{title}</b><span className="text-xs text-white/65">{body}</span></span></button>;
}

function AboutStep({ form, setForm, disabled }) {
  const field = (key) => ({ value: form[key], disabled, onChange: (event) => setForm((current) => ({ ...current, [key]: event.target.value })) });
  return <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Provider type<select {...field('provider_type')} className={inputClass}><option value="solo">Solo provider</option><option value="team">Team</option></select></label><label className="text-sm font-semibold">Your full name<input {...field('full_name')} className={inputClass} autoComplete="name" /></label><label className="text-sm font-semibold">Business name <span className="font-normal text-muted-foreground">(optional)</span><input {...field('business_name')} className={inputClass} /></label><label className="text-sm font-semibold">ABN<input {...field('abn')} inputMode="numeric" className={inputClass} placeholder="11 digits" /></label><label className="text-sm font-semibold">Business email<input {...field('business_email')} type="email" autoComplete="email" className={inputClass} /></label><label className="text-sm font-semibold">Mobile<input {...field('mobile')} type="tel" autoComplete="tel" className={inputClass} /></label><label className="text-sm font-semibold sm:col-span-2">Home suburb<input {...field('suburb')} className={inputClass} /><span className="mt-1 inline-flex items-center gap-1 text-xs font-normal text-muted-foreground"><MapPin size={12} />Initial matching remains focused on Ballarat.</span></label></div>;
}

function ServicesStep({ form, setForm, services, disabled }) {
  const toggleService = (key) => setForm((current) => ({ ...current, service_keys: current.service_keys.includes(key) ? current.service_keys.filter((item) => item !== key) : [...current.service_keys, key] }));
  const toggleDay = (day) => setForm((current) => ({ ...current, availability_days: current.availability_days.includes(day) ? current.availability_days.filter((item) => item !== day) : [...current.availability_days, day] }));
  return <div className="space-y-6"><fieldset><legend className="text-sm font-semibold">Exact services</legend><p className="mt-1 text-xs text-muted-foreground">Choose only services you can support with the required evidence.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{services.map((service) => <label key={service.key} className={`flex gap-3 rounded-2xl border p-3 ${form.service_keys.includes(service.key) ? 'border-primary bg-sage/20' : 'border-border bg-white/65'} ${!service.onboarding_open ? 'opacity-60' : ''}`}><input type="checkbox" checked={form.service_keys.includes(service.key)} disabled={disabled || !service.onboarding_open} onChange={() => toggleService(service.key)} className="mt-1 accent-current" /><span><b className="block text-sm">{service.name}</b><span className="text-xs text-muted-foreground">{service.onboarding_open ? service.pathway.replaceAll('_', ' ') : 'Not accepting applications yet'}</span></span></label>)}</div></fieldset><label className="block text-sm font-semibold">Coverage suburbs<input value={form.coverage_suburbs} disabled={disabled} onChange={(event) => setForm((current) => ({ ...current, coverage_suburbs: event.target.value }))} className={inputClass} placeholder="Ballarat, Alfredton, Wendouree" /><span className="mt-1 block text-xs font-normal text-muted-foreground">Separate suburbs with commas.</span></label><fieldset><legend className="text-sm font-semibold">Regular availability</legend><div className="mt-3 flex flex-wrap gap-2">{DAYS.map((day) => <button key={day} type="button" disabled={disabled} onClick={() => toggleDay(day)} className={`min-h-10 rounded-xl px-3 text-sm font-semibold capitalize ${form.availability_days.includes(day) ? 'bg-primary text-primary-foreground' : 'border border-border bg-white'}`}>{day.slice(0, 3)}</button>)}</div></fieldset></div>;
}

function VerificationStep({ controls, requirements, evidence, workers, providerType, teamMember, setTeamMember, disabled, onAddTeamMember, onUpload }) {
  const expandedRequirements = requirements.flatMap((requirement) => {
    if (requirement.subject === 'provider') return [{ requirement, worker: null }];
    return workers.map((worker) => ({ requirement, worker }));
  });
  return <div className="space-y-6">{providerType === 'team' && <section className="rounded-2xl border border-border bg-white/65 p-4"><div className="flex items-center gap-2"><UsersRound size={18} /><h3 className="font-semibold">Team workers</h3></div><p className="mt-1 text-xs text-muted-foreground">The account owner is already added. Each additional attending worker is reviewed separately.</p>{workers.map((worker) => <div key={worker.id} className="mt-2 flex items-center justify-between rounded-xl bg-mist-soft px-3 py-2 text-sm"><span>{worker.display_name}</span><span className="text-xs capitalize text-muted-foreground">{worker.relationship_type} · {providerStatusLabel(worker)}</span></div>)}<div className="mt-3 grid gap-2 sm:grid-cols-[1fr_10rem_auto]"><input value={teamMember.display_name} disabled={disabled} onChange={(event) => setTeamMember((current) => ({ ...current, display_name: event.target.value }))} className={inputClass.replace('mt-1 ', '')} placeholder="Worker name" /><select value={teamMember.relationship_type} disabled={disabled} onChange={(event) => setTeamMember((current) => ({ ...current, relationship_type: event.target.value }))} className={inputClass.replace('mt-1 ', '')}><option value="employee">Employee</option><option value="director">Director</option><option value="subcontractor">Subcontractor</option></select><button type="button" disabled={disabled || !teamMember.display_name.trim()} onClick={onAddTeamMember} className="min-h-11 rounded-xl border border-primary px-4 text-sm font-semibold">Add</button></div></section>}{!requirements.length ? <div className="rounded-2xl bg-mist-soft p-4 text-sm text-muted-foreground">Choose services first to generate the exact verification checklist.</div> : <div className="space-y-2">{expandedRequirements.map(({ requirement, worker }) => { const row = evidence.find((item) => item.evidence_type === requirement.evidence_type && item.subject_type === requirement.subject && item.worker_id === (worker?.id || null)); const ready = row?.document_path || row?.review_status === 'verified'; return <div key={`${requirement.key}:${worker?.id || 'business'}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-white/65 p-4"><div className="flex gap-3"><FileCheck2 size={18} className="mt-0.5 shrink-0 text-eucalyptus-deep" /><div><p className="text-sm font-semibold">{evidenceRequirementLabel(requirement.evidence_type)}</p><p className="text-xs text-muted-foreground">{worker ? worker.display_name : 'Business'}{requirement.expiry_required ? ' · expiry required' : ''}</p></div></div><div className="flex items-center gap-2"><span className="text-xs font-semibold text-muted-foreground">{ready ? providerStatusLabel(row) : 'Not started'}</span>{controls.sensitive_uploads_enabled && row ? <label className="cursor-pointer rounded-xl border border-primary px-3 py-2 text-xs font-semibold">Upload<input type="file" accept="image/jpeg,image/png,application/pdf" disabled={disabled} onChange={(event) => onUpload(row, event.target.files?.[0])} className="sr-only" /></label> : <LockKeyhole size={16} className="text-muted-foreground" />}</div></div>; })}</div>} {!controls.sensitive_uploads_enabled && <div className="rounded-2xl border border-terracotta/20 bg-terracotta/[0.06] p-4 text-sm text-muted-foreground"><b className="text-foreground">Document collection is off.</b> Nothing can be uploaded until privacy, retention and verification-vendor settings are approved.</div>}</div>;
}

function ReviewStep({ form, setForm, offerings, evidence, application, disabled }) {
  const declaration = (key, text) => <label className="flex gap-3 rounded-2xl border border-border bg-white/65 p-4 text-sm"><input type="checkbox" checked={form[key]} disabled={disabled} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.checked }))} className="mt-1 accent-current" /><span>{text}</span></label>;
  return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-3"><Summary Icon={Building2} label="Provider type" value={form.provider_type === 'team' ? 'Team' : 'Solo provider'} /><Summary Icon={MapPin} label="Coverage" value={form.coverage_suburbs || 'Not added'} /><Summary Icon={FileCheck2} label="Documents" value={`${evidence.filter((item) => item.document_path || item.review_status === 'verified').length} of ${evidence.length} ready`} /></div><section className="rounded-2xl border border-border bg-white/65 p-4"><h3 className="font-semibold">Selected services</h3><p className="mt-2 text-sm text-muted-foreground">{offerings.filter((item) => item.requested_selected !== false).map((item) => PHASE1_SERVICES.find((service) => service.key === item.service_key)?.name).filter(Boolean).join(', ') || 'No services selected'}</p></section><div className="space-y-2">{declaration('accuracy_declaration', 'I confirm the details and documents supplied are accurate and current.')}{declaration('eligibility_declaration', 'I will only accept work within the services and credentials approved for me or my team.')}{declaration('privacy_declaration', 'I consent to OneForAll reviewing this information under the provider privacy and retention terms.')}</div><label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={form.notification_email_enabled} disabled={disabled} onChange={(event) => setForm((current) => ({ ...current, notification_email_enabled: event.target.checked }))} />Email me about application actions and private matches when email is enabled.</label><p className="text-xs text-muted-foreground">Submitting changes the application to Under review. It does not approve a provider, activate a service or promise access to jobs. Application status: {providerApplicationStatusLabel(application.status)}.</p></div>;
}

function Summary({ Icon, label, value }) {
  return <div className="rounded-2xl bg-mist-soft p-4"><Icon size={18} className="text-eucalyptus-deep" /><p className="mt-3 text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>;
}
