import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CalendarClock, CheckCircle2, Clock3, DollarSign, LockKeyhole, MapPin, MessageSquare, Play, UserRound } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { callFunction, formatAUDRange } from '@/lib/oneforall';
import { formatMelbourneDateTime, mergeProviderControls, providerServiceLabels } from '@/lib/provider';
import { FlagsOffNotice, ProviderError, ProviderLoading, ProviderPageHeader } from '@/components/provider/ProviderShellBits';

const safeRead = async (read, fallback = null) => { try { return await read(); } catch { return fallback; } };
const NEXT_ACTION = {
  accepted: { state: 'scheduled', label: 'Confirm schedule', Icon: CalendarClock },
  scheduled: { state: 'in_progress', label: 'Start job', Icon: Play },
  in_progress: { state: 'completed', label: 'Complete job', Icon: CheckCircle2 },
};

export default function JobDetail() {
  const { bookingId } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const keys = useRef({});
  const [scheduledStart, setScheduledStart] = useState('');
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState({ loading: true, error: '', booking: null, job: null, quote: null, service: null, conversation: null, controls: mergeProviderControls() });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const booking = await base44.entities.Booking.get(bookingId);
      if (!booking || booking.provider_id !== user.id || booking.state === 'superseded') { setState((current) => ({ ...current, loading: false, booking: null })); return; }
      const [job, quote, service, conversations, controls] = await Promise.all([
        safeRead(() => base44.entities.Job.get(booking.job_id)),
        safeRead(() => base44.entities.InterestRequest.get(booking.quote_id)),
        safeRead(() => base44.entities.ServiceDefinition.get(booking.service_key)),
        safeRead(() => base44.entities.Conversation.filter({ job_id: booking.job_id }), []),
        safeRead(() => base44.entities.ProviderFeatureControl.list('-updated_date', 1), []),
      ]);
      setState({ loading: false, error: '', booking, job, quote, service, conversation: conversations[0] || null, controls: mergeProviderControls(controls[0]) });
    } catch { setState((current) => ({ ...current, loading: false, error: 'The booking is unavailable.' })); }
  }, [bookingId, user.id]);
  useEffect(() => { load(); }, [load]);

  const transition = async () => {
    const action = NEXT_ACTION[state.booking?.state];
    if (!action) return;
    setBusy(true);
    try {
      if (action.state === 'scheduled' && !scheduledStart) throw new Error('Choose the confirmed date and time.');
      keys.current[action.state] ||= crypto.randomUUID();
      await callFunction('transition-provider-booking', {
        booking_id: state.booking.id,
        to_state: action.state,
        expected_version: state.booking.version,
        scheduled_start: action.state === 'scheduled' ? new Date(scheduledStart).toISOString() : undefined,
        idempotency_key: keys.current[action.state],
      });
      toast({ title: action.state === 'scheduled' ? 'Schedule confirmed' : action.state === 'in_progress' ? 'Job started' : 'Job completed' });
      await load();
    } catch (error) { toast({ title: 'Job not updated', description: error.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  if (state.loading) return <ProviderLoading label="Loading booking" />;
  if (state.error) return <ProviderError message={state.error} onRetry={load} />;
  if (!state.booking) return <div className="space-y-4"><ProviderPageHeader title="Booking unavailable">This private booking is not assigned to your account.</ProviderPageHeader><Link to="/provider/jobs" className="font-semibold text-eucalyptus-deep">Back to Jobs</Link></div>;

  const labels = providerServiceLabels(state.booking.service_key, state.booking.selected_scope_ids);
  const action = NEXT_ACTION[state.booking.state];
  const actionOpen = Boolean(action && state.controls.provider_job_actions_enabled && state.service?.booking_enabled);
  const address = state.booking.confirmed_service_address || state.job?.service_address || 'OneForAll will confirm it before the visit';
  const contact = state.booking.confirmed_customer_contact || 'Available through private booking messages';
  return <div className="mx-auto max-w-3xl space-y-5">
    <Link to="/provider/jobs?section=upcoming" className="inline-flex items-center gap-1 text-sm font-semibold text-eucalyptus-deep"><ArrowLeft size={15} />Jobs</Link>
    <div className="flex flex-wrap items-start justify-between gap-3"><ProviderPageHeader title={labels.service}>{labels.scopes.join(', ') || 'Confirmed service scope'}</ProviderPageHeader><span className="rounded-full bg-sage/35 px-3 py-1.5 text-sm font-semibold capitalize">{state.booking.state.replaceAll('_', ' ')}</span></div>
    {!state.controls.provider_job_actions_enabled && <FlagsOffNotice>Confirmed booking details remain private and visible, but schedule, start and completion actions stay switched off.</FlagsOffNotice>}
    <section className="glass rounded-3xl p-5 sm:p-6"><div className="grid gap-4 sm:grid-cols-2"><Info Icon={MapPin} label="Confirmed service address" value={address} /><Info Icon={UserRound} label="Customer contact" value={contact} /><Info Icon={CalendarClock} label="Schedule" value={state.booking.scheduled_start ? formatMelbourneDateTime(state.booking.scheduled_start) : 'Not confirmed'} /><Info Icon={DollarSign} label="Agreed range" value={formatAUDRange(state.quote?.quote_low, state.quote?.quote_high)} /><Info Icon={UserRound} label="Attending worker" value={state.booking.attending_worker_display_name} /><Info Icon={LockKeyhole} label="Booking privacy" value="Booking participants and OneForAll support only" /></div>{state.booking.confirmed_access_details && <div className="mt-5 border-t border-border/60 pt-5"><p className="text-xs text-muted-foreground">Access details</p><p className="mt-1 whitespace-pre-wrap text-sm font-semibold">{state.booking.confirmed_access_details}</p></div>}</section>
    {action && <section className="glass-soft rounded-2xl p-5"><h2 className="font-semibold">Next step</h2>{action.state === 'scheduled' && <label className="mt-3 block text-sm font-semibold">Confirmed date and time<input type="datetime-local" value={scheduledStart} onChange={(event) => setScheduledStart(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-white px-3 sm:max-w-sm" /></label>}<button type="button" disabled={!actionOpen || busy || (action.state === 'scheduled' && !scheduledStart)} onClick={transition} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-45"><action.Icon size={17} />{action.label}</button></section>}
    <section className="grid gap-3 sm:grid-cols-2"><Link to="/messages" className="glass-soft flex min-h-14 items-center gap-3 rounded-2xl p-4 text-sm font-semibold"><MessageSquare size={19} className="text-eucalyptus-deep" /><span>Private job messages<span className="block text-xs font-normal text-muted-foreground">Unlocked after confirmation</span></span></Link><div className="glass-soft flex min-h-14 items-center gap-3 rounded-2xl p-4 text-sm"><Clock3 size={19} className="text-eucalyptus-deep" /><span><b>Cancellation or dispute?</b><span className="block text-xs text-muted-foreground">Ask OneForAll support—these are not one-tap job actions.</span></span></div></section>
  </div>;
}

function Info({ Icon, label, value }) { return <div className="flex items-start gap-2"><Icon size={16} className="mt-0.5 shrink-0 text-eucalyptus-deep" /><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm font-semibold">{value || 'Not supplied'}</p></div></div>; }
