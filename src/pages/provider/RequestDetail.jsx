import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CalendarClock, Clock3, DollarSign, Image as ImageIcon, LockKeyhole, MapPin, ShieldAlert } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { callFunction, formatAUDRange } from '@/lib/oneforall';
import { invitationCountdown, mergeProviderControls, projectedInvitationStatus, providerServiceLabels, validProviderPriceRange } from '@/lib/provider';
import { FlagsOffNotice, ProviderError, ProviderLoading, ProviderPageHeader } from '@/components/provider/ProviderShellBits';

const safeRead = async (read, fallback = []) => { try { return await read(); } catch { return fallback; } };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export default function RequestDetail() {
  const { invitationId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const responseKey = useRef(crypto.randomUUID());
  const declineKey = useRef(crypto.randomUUID());
  const [state, setState] = useState({ loading: true, error: '', row: null, profile: null, workers: [], service: null, controls: mergeProviderControls(), photos: [] });
  const [form, setForm] = useState({ pricing_mode: 'indicative', quote_low: '', quote_high: '', earliest_availability: '', attending_worker_id: '', message: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const row = await base44.entities.Invitation.get(invitationId);
      if (!row) { setState((current) => ({ ...current, loading: false, row: null })); return; }
      const [profiles, workers, service, controlRows] = await Promise.all([
        base44.entities.TradieProfile.filter({ user_id: user.id }),
        base44.entities.ProviderWorker.filter({ provider_id: user.id }),
        base44.entities.ServiceDefinition.get(row.service_key),
        safeRead(() => base44.entities.ProviderFeatureControl.list('-updated_date', 1)),
      ]);
      const eligibleWorkers = workers.filter((worker) => worker.review_status === 'verified' && worker.active);
      const profile = profiles[0] || null;
      const automaticWorker = profile?.provider_type !== 'team' ? eligibleWorkers.find((worker) => ['owner', 'director'].includes(worker.relationship_type)) : null;
      setForm((current) => ({ ...current, earliest_availability: current.earliest_availability || row.preferred_date || '', attending_worker_id: current.attending_worker_id || automaticWorker?.id || '' }));
      let photos = [];
      if (row.safe_photo_paths?.length) photos = await safeRead(() => base44.integrations.ProviderRequestMedia.createSignedUrls(row.safe_photo_paths), []);
      setState({ loading: false, error: '', row, profile, workers: eligibleWorkers, service, controls: mergeProviderControls(controlRows[0]), photos });
    } catch { setState((current) => ({ ...current, loading: false, error: 'The private match is unavailable.' })); }
  }, [invitationId, user.id]);
  useEffect(() => { load(); }, [load]);

  const labels = useMemo(() => providerServiceLabels(state.row?.service_key, state.row?.selected_scope_ids), [state.row]);
  const pending = projectedInvitationStatus(state.row) === 'pending';
  const indicativeValid = validProviderPriceRange(state.row?.indicative_price_low, state.row?.indicative_price_high);
  const actionOpen = Boolean(state.controls.provider_job_actions_enabled && state.service?.quote_enabled && pending);
  const chosenWorker = state.workers.find((worker) => worker.id === form.attending_worker_id);

  const respond = async (action) => {
    setBusy(true);
    try {
      if (action === 'available' && !chosenWorker) throw new Error(state.profile?.provider_type === 'team' ? 'Choose the exact attending worker.' : 'An approved owner worker is required.');
      if (action === 'available' && form.pricing_mode === 'custom' && !validProviderPriceRange(form.quote_low, form.quote_high)) throw new Error('Enter a positive minimum and a maximum that is not lower.');
      const payload = action === 'decline' ? { invitation_id: invitationId, action, idempotency_key: declineKey.current } : {
        invitation_id: invitationId,
        action,
        pricing_mode: form.pricing_mode,
        quote_low: form.pricing_mode === 'custom' ? Number(form.quote_low) : undefined,
        quote_high: form.pricing_mode === 'custom' ? Number(form.quote_high) : undefined,
        earliest_availability: form.earliest_availability,
        attending_worker_id: chosenWorker.id,
        substitution_disclosed: true,
        message: form.message.trim(),
        idempotency_key: responseKey.current,
      };
      await callFunction('respond-provider-invitation', payload);
      toast({ title: action === 'decline' ? 'Match declined' : 'Availability sent', description: action === 'decline' ? 'This match has been closed for your account.' : 'The customer or OneForAll can now confirm it.' });
      navigate('/provider/jobs?section=history');
    } catch (error) { toast({ title: 'Response not sent', description: error.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  if (state.loading) return <ProviderLoading label="Loading private match" />;
  if (state.error) return <ProviderError message={state.error} onRetry={load} />;
  if (!state.row) return <div className="space-y-4"><ProviderPageHeader title="Match unavailable">It was not found, expired, or is not assigned to this provider account.</ProviderPageHeader><Link to="/provider/jobs" className="font-semibold text-eucalyptus-deep">Back to Jobs</Link></div>;

  return <div className="mx-auto max-w-3xl space-y-5">
    <Link to="/provider/jobs" className="inline-flex items-center gap-1 text-sm font-semibold text-eucalyptus-deep"><ArrowLeft size={15} />Jobs</Link>
    <div className="flex flex-wrap items-start justify-between gap-3"><ProviderPageHeader title={state.row.job_title || labels.service}>A private match based on your approved services and coverage.</ProviderPageHeader><span className="rounded-full bg-terracotta/10 px-3 py-1.5 text-sm font-semibold text-terracotta"><Clock3 size={14} className="mr-1 inline" />{invitationCountdown(state.row.expires_at)}</span></div>
    {!actionOpen && <FlagsOffNotice>Match responses remain unavailable until both the service and provider job-action controls are approved.</FlagsOffNotice>}
    <section className="glass rounded-3xl p-5 sm:p-6"><div className="grid gap-4 sm:grid-cols-2"><Info Icon={MapPin} label="Area" value={state.row.service_area || 'Ballarat area'} /><Info Icon={CalendarClock} label="Requested timing" value={state.row.preferred_date || 'Flexible'} /><Info Icon={DollarSign} label="Indicative range" value={formatAUDRange(state.row.indicative_price_low, state.row.indicative_price_high)} /><Info Icon={ShieldAlert} label="Safety and access" value={(state.row.safe_access_factors || []).join(', ') || state.row.safe_safety_summary || 'No reviewed factors supplied'} /></div><div className="mt-5 border-t border-border/60 pt-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-terracotta">Scope</p><p className="mt-2 text-sm font-semibold">{labels.scopes.join(', ') || 'Scope supplied in the managed request'}</p>{state.row.scope_summary && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{state.row.scope_summary}</p>}</div>{state.photos.length > 0 && <div className="mt-5"><p className="mb-2 flex items-center gap-2 text-sm font-semibold"><ImageIcon size={16} />Reviewed photos</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{state.photos.map((photo) => <img key={photo.path} src={photo.signed_url} alt="Customer-supplied service scope" className="aspect-square w-full rounded-xl object-cover" />)}</div></div>}<p className="mt-5 flex items-start gap-2 text-xs text-muted-foreground"><LockKeyhole size={14} className="mt-0.5 shrink-0" />Customer identity, contact details and exact address remain hidden until a booking is confirmed.</p></section>
    <section className="glass rounded-3xl p-5 sm:p-6"><h2 className="text-lg font-semibold">Can you take this job?</h2><p className="mt-1 text-sm text-muted-foreground">The displayed range is the default. You may instead enter your own honest range.</p><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => setForm((current) => ({ ...current, pricing_mode: 'indicative' }))} className={`min-h-12 rounded-xl border px-3 text-sm font-semibold ${form.pricing_mode === 'indicative' ? 'border-primary bg-sage/25' : 'border-border bg-white'}`}>Use displayed range</button><button type="button" onClick={() => setForm((current) => ({ ...current, pricing_mode: 'custom' }))} className={`min-h-12 rounded-xl border px-3 text-sm font-semibold ${form.pricing_mode === 'custom' ? 'border-primary bg-sage/25' : 'border-border bg-white'}`}>Use my price</button></div>{form.pricing_mode === 'custom' && <div className="mt-4 grid grid-cols-2 gap-3"><label className="text-sm font-semibold">Minimum (AUD)<input type="number" min="1" step="1" value={form.quote_low} onChange={(event) => setForm((current) => ({ ...current, quote_low: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-white px-3" /></label><label className="text-sm font-semibold">Maximum (AUD)<input type="number" min="1" step="1" value={form.quote_high} onChange={(event) => setForm((current) => ({ ...current, quote_high: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-white px-3" /></label></div>}<div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Earliest availability<input type="date" min={today()} value={form.earliest_availability} onChange={(event) => setForm((current) => ({ ...current, earliest_availability: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-white px-3" /></label><label className="text-sm font-semibold">Attending worker<select value={form.attending_worker_id} disabled={state.profile?.provider_type !== 'team'} onChange={(event) => setForm((current) => ({ ...current, attending_worker_id: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-white px-3"><option value="">Choose approved worker</option>{state.workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.display_name}</option>)}</select></label></div><label className="mt-4 block text-sm font-semibold">Short note <span className="font-normal text-muted-foreground">(optional)</span><textarea maxLength={1000} value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} className="mt-1 min-h-24 w-full rounded-xl border border-border bg-white px-3 py-2" /></label><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"><button type="button" disabled={!actionOpen || busy} onClick={() => respond('decline')} className="min-h-11 rounded-xl border border-border bg-white px-4 text-sm font-semibold disabled:opacity-45">Decline</button><button type="button" disabled={!actionOpen || busy || !form.earliest_availability || !chosenWorker || (form.pricing_mode === 'indicative' && !indicativeValid)} onClick={() => respond('available')} className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-45">I’m available · {form.pricing_mode === 'indicative' ? formatAUDRange(state.row.indicative_price_low, state.row.indicative_price_high) : formatAUDRange(form.quote_low, form.quote_high)}</button></div><p className="mt-3 text-xs text-muted-foreground">This sends availability only. The booking, address and private messages open after the customer or OneForAll confirms.</p></section>
  </div>;
}

function Info({ Icon, label, value }) { return <div className="flex items-start gap-2"><Icon size={16} className="mt-0.5 shrink-0 text-eucalyptus-deep" /><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm font-semibold">{value}</p></div></div>; }
