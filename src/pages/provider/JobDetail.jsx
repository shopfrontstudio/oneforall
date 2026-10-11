import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CalendarClock, CheckCircle2, Clock3, CreditCard, DollarSign, LockKeyhole, MapPin, MessageSquare, Play, Repeat2, UserRound } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { callFunction, formatAUDRange } from '@/lib/oneforall';
import { formatMelbourneDateTime, mergeProviderControls, providerServiceLabels } from '@/lib/provider';
import { loadDemoProviderState, recordDemoExternalPayment, sendDemoProviderMessage, transitionDemoBooking, updateDemoRecurringSchedule } from '@/lib/providerDemo';
import { DemoModeNotice, FlagsOffNotice, ProviderError, ProviderLoading, ProviderPageHeader } from '@/components/provider/ProviderShellBits';
import { externalPaymentSummary, recurrenceSummary } from '@/domain/marketplaceWorkflow';

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
  const [message, setMessage] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [repeatForm, setRepeatForm] = useState({ frequency: 'weekly', preferred_weekday: '1', preferred_time: '09:00' });
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState({ loading: true, error: '', booking: null, job: null, quote: null, service: null, conversation: null, messages: [], payments: [], series: [], controls: mergeProviderControls() });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      if (user.demo_mode) {
        const demo = loadDemoProviderState(user.id);
        const booking = demo.bookings.find((row) => row.id === bookingId) || null;
        if (!booking) { setState((current) => ({ ...current, loading: false, booking: null })); return; }
        setState({
          loading: false, error: '', booking,
          job: demo.jobs.find((row) => row.id === booking.job_id) || null,
          quote: demo.quotes.find((row) => row.id === booking.quote_id) || null,
          service: { booking_enabled: true }, conversation: { id: `demo-conversation-${booking.id}` },
          messages: demo.messages.filter((row) => row.booking_id === booking.id), payments: demo.payments?.filter((row) => row.booking_id === booking.id) || [], series: demo.recurringSeries?.filter((row) => row.source_booking_id === booking.id) || [],
          controls: mergeProviderControls({ provider_job_actions_enabled: true }),
        });
        return;
      }
      const booking = await base44.entities.Booking.get(bookingId);
      if (!booking || booking.provider_id !== user.id || booking.state === 'superseded') { setState((current) => ({ ...current, loading: false, booking: null })); return; }
      const [job, quote, service, conversations, controls, payments, series] = await Promise.all([
        safeRead(() => base44.entities.Job.get(booking.job_id)),
        safeRead(() => base44.entities.InterestRequest.get(booking.quote_id)),
        safeRead(() => base44.entities.ServiceDefinition.get(booking.service_key)),
        safeRead(() => base44.entities.Conversation.filter({ job_id: booking.job_id }), []),
        safeRead(() => base44.entities.ProviderFeatureControl.list('-updated_date', 1), []),
        safeRead(() => base44.entities.ExternalPaymentConfirmation.filter({ booking_id: booking.id }), []),
        safeRead(() => base44.entities.RecurringSeries.filter({ source_booking_id: booking.id }), []),
      ]);
      setState({ loading: false, error: '', booking, job, quote, service, conversation: conversations[0] || null, messages: [], payments, series, controls: mergeProviderControls(controls[0]) });
    } catch { setState((current) => ({ ...current, loading: false, error: 'The booking is unavailable.' })); }
  }, [bookingId, user.demo_mode, user.id]);
  useEffect(() => { load(); }, [load]);

  const transition = async () => {
    const action = NEXT_ACTION[state.booking?.state];
    if (!action) return;
    setBusy(true);
    try {
      if (action.state === 'scheduled' && !scheduledStart) throw new Error('Choose the confirmed date and time.');
      keys.current[action.state] ||= crypto.randomUUID();
      if (user.demo_mode) {
        transitionDemoBooking(user.id, state.booking.id, action.state, action.state === 'scheduled' ? scheduledStart : undefined);
      } else {
        await callFunction('transition-provider-booking', {
          booking_id: state.booking.id,
          to_state: action.state,
          expected_version: state.booking.version,
          scheduled_start: action.state === 'scheduled' ? new Date(scheduledStart).toISOString() : undefined,
          idempotency_key: keys.current[action.state],
        });
      }
      toast({ title: action.state === 'scheduled' ? 'Schedule confirmed' : action.state === 'in_progress' ? 'Job started' : 'Job completed' });
      await load();
    } catch (error) { toast({ title: 'Job not updated', description: error.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const sendMessage = async () => {
    setBusy(true);
    try {
      sendDemoProviderMessage(user.id, state.booking.id, message);
      setMessage('');
      toast({ title: 'Demo message added', description: 'It stays only in this browser.' });
      await load();
    } catch (error) { toast({ title: 'Message not added', description: error.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const recordPayment = async () => {
    setBusy(true);
    try {
      if (user.demo_mode) recordDemoExternalPayment(user.id, state.booking.id, Number(paymentAmount));
      else await callFunction('record-external-payment', { booking_id: state.booking.id, amount: Number(paymentAmount), payment_method: 'bank_transfer', paid_at: new Date().toISOString(), idempotency_key: crypto.randomUUID() });
      toast({ title: 'Payment statement recorded', description: 'This is your statement only; OneForAll has not verified it with a bank.' });
      await load();
    } catch (error) { toast({ title: 'Payment not recorded', description: error.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const updateRecurring = async () => {
    setBusy(true);
    try {
      const series = state.series.find((row) => row.state === 'proposed');
      if (user.demo_mode) updateDemoRecurringSchedule(user.id, state.booking.id, repeatForm);
      else if (series) await callFunction('confirm-recurring-schedule', { series_id: series.id, expected_version: series.version, idempotency_key: crypto.randomUUID() });
      else await callFunction('propose-recurring-schedule', { booking_id: state.booking.id, ...repeatForm, preferred_weekday: Number(repeatForm.preferred_weekday), idempotency_key: crypto.randomUUID() });
      toast({ title: series ? 'Recurring schedule confirmed' : 'Recurring schedule proposed' });
      await load();
    } catch (error) { toast({ title: 'Recurring schedule not updated', description: error.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  if (state.loading) return <ProviderLoading label="Loading booking" />;
  if (state.error) return <ProviderError message={state.error} onRetry={load} />;
  if (!state.booking) return <div className="space-y-4"><ProviderPageHeader title="Booking unavailable">This private booking is not assigned to your account.</ProviderPageHeader><Link to="/provider/jobs" className="font-semibold text-eucalyptus-deep">Back to Jobs</Link></div>;

  const labels = providerServiceLabels(state.booking.service_key, state.booking.selected_scope_ids);
  const action = NEXT_ACTION[state.booking.state];
  const actionOpen = Boolean(action && (user.demo_mode || (state.controls.provider_job_actions_enabled && state.service?.booking_enabled)));
  const address = state.booking.confirmed_service_address || state.job?.service_address || 'OneForAll will confirm it before the visit';
  const contact = state.booking.confirmed_customer_contact || 'Available through private booking messages';
  const paymentStatus = externalPaymentSummary(state.payments);
  const providerPaymentRecorded = state.payments.some((row) => row.participant_role === 'provider' && row.status === 'confirmed');
  const recurring = state.series.find((row) => row.state !== 'cancelled') || null;
  const recurrenceOpen = Boolean(state.controls.provider_job_actions_enabled && state.service?.recurrence_enabled && state.service?.public_release_enabled);
  return <div className="mx-auto max-w-3xl space-y-5">
    <Link to="/provider/jobs?section=upcoming" className="inline-flex items-center gap-1 text-sm font-semibold text-eucalyptus-deep"><ArrowLeft size={15} />Jobs</Link>
    <div className="flex flex-wrap items-start justify-between gap-3"><ProviderPageHeader title={labels.service}>{labels.scopes.join(', ') || 'Confirmed service scope'}</ProviderPageHeader><span className="rounded-full bg-sage/35 px-3 py-1.5 text-sm font-semibold capitalize">{state.booking.state.replaceAll('_', ' ')}</span></div>
    {user.demo_mode ? <DemoModeNotice>Use the controls below to try the full job lifecycle. Nothing here affects a real booking.</DemoModeNotice> : !state.controls.provider_job_actions_enabled && <FlagsOffNotice>Confirmed booking details remain private and visible, but schedule, start and completion actions stay switched off.</FlagsOffNotice>}
    <section className="glass rounded-3xl p-5 sm:p-6"><div className="grid gap-4 sm:grid-cols-2"><Info Icon={MapPin} label="Confirmed service address" value={address} /><Info Icon={UserRound} label="Customer contact" value={contact} /><Info Icon={CalendarClock} label="Schedule" value={state.booking.scheduled_start ? formatMelbourneDateTime(state.booking.scheduled_start) : 'Not confirmed'} /><Info Icon={DollarSign} label="Agreed range" value={formatAUDRange(state.quote?.quote_low, state.quote?.quote_high)} /><Info Icon={UserRound} label="Attending worker" value={state.booking.attending_worker_display_name} /><Info Icon={LockKeyhole} label="Booking privacy" value="Booking participants and OneForAll support only" /></div>{state.booking.confirmed_access_details && <div className="mt-5 border-t border-border/60 pt-5"><p className="text-xs text-muted-foreground">Access details</p><p className="mt-1 whitespace-pre-wrap text-sm font-semibold">{state.booking.confirmed_access_details}</p></div>}</section>
    {action && <section className="glass-soft rounded-2xl p-5"><h2 className="font-semibold">Next step</h2>{action.state === 'scheduled' && <label className="mt-3 block text-sm font-semibold">Confirmed date and time<input type="datetime-local" value={scheduledStart} onChange={(event) => setScheduledStart(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-white px-3 sm:max-w-sm" /></label>}<button type="button" disabled={!actionOpen || busy || (action.state === 'scheduled' && !scheduledStart)} onClick={transition} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-45"><action.Icon size={17} />{action.label}</button></section>}
    {state.booking.state === 'completed' && <section className="grid gap-3 sm:grid-cols-2"><div className="provider-reference-card p-5"><h2 className="flex items-center gap-2 font-semibold"><CreditCard size={18} />External payment</h2><p className="mt-2 text-sm text-muted-foreground">{paymentStatus.label}. This is participant-confirmed, not bank verified.</p>{!providerPaymentRecorded && <div className="mt-3 flex gap-2"><input type="number" min="1" max="1000000" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-white px-3" placeholder="Amount AUD" /><button disabled={busy || !Number(paymentAmount)} onClick={recordPayment} className="min-h-11 rounded-xl border border-primary px-4 text-sm font-semibold disabled:opacity-45">Record</button></div>}</div><div className="provider-reference-card p-5"><h2 className="flex items-center gap-2 font-semibold"><Repeat2 size={18} />Recurring schedule</h2><p className="mt-2 text-sm text-muted-foreground">{recurrenceSummary(recurring)}</p>{!recurring && <div className="mt-3 grid gap-2"><select value={repeatForm.frequency} onChange={(event) => setRepeatForm((current) => ({ ...current, frequency: event.target.value }))} className="min-h-11 rounded-xl border border-border bg-white px-3"><option value="weekly">Weekly</option><option value="fortnightly">Fortnightly</option><option value="monthly">Monthly</option></select><input type="time" value={repeatForm.preferred_time} onChange={(event) => setRepeatForm((current) => ({ ...current, preferred_time: event.target.value }))} className="min-h-11 rounded-xl border border-border bg-white px-3" /></div>}<button disabled={!recurrenceOpen || busy || recurring?.state === 'active'} onClick={updateRecurring} className="mt-3 min-h-11 rounded-xl border border-primary px-4 text-sm font-semibold disabled:opacity-45">{recurring?.state === 'proposed' ? 'Confirm proposal' : 'Propose schedule'}</button></div></section>}
    {user.demo_mode ? <section className="glass rounded-2xl p-5"><h2 className="flex items-center gap-2 font-semibold"><MessageSquare size={18} />Private job messages</h2><p className="mt-1 text-xs text-muted-foreground">Sample conversation · browser-only</p><div className="mt-4 space-y-2">{state.messages.length ? state.messages.map((item) => <div key={item.id} className={`max-w-[86%] rounded-2xl px-3 py-2 text-sm ${item.sender === 'provider' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-mist-soft'}`}><p className={`text-[11px] font-semibold ${item.sender === 'provider' ? 'text-white/70' : 'text-muted-foreground'}`}>{item.sender_name}</p><p className="mt-0.5">{item.body}</p></div>) : <p className="rounded-xl bg-mist-soft p-3 text-sm text-muted-foreground">No sample messages yet.</p>}</div><div className="mt-4 flex gap-2"><input value={message} maxLength={1000} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} placeholder="Write a demo message" className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-white px-3 text-sm" /><button type="button" disabled={busy || !message.trim()} onClick={sendMessage} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-45">Send</button></div></section> : <section className="grid gap-3 sm:grid-cols-2"><Link to="/provider/messages" className="glass-soft flex min-h-14 items-center gap-3 rounded-2xl p-4 text-sm font-semibold"><MessageSquare size={19} className="text-eucalyptus-deep" /><span>Private job messages<span className="block text-xs font-normal text-muted-foreground">Unlocked after confirmation</span></span></Link><div className="glass-soft flex min-h-14 items-center gap-3 rounded-2xl p-4 text-sm"><Clock3 size={19} className="text-eucalyptus-deep" /><span><b>Cancellation or dispute?</b><span className="block text-xs text-muted-foreground">Ask OneForAll support—these are not one-tap job actions.</span></span></div></section>}
    {user.demo_mode && <div className="glass-soft flex min-h-14 items-center gap-3 rounded-2xl p-4 text-sm"><Clock3 size={19} className="text-eucalyptus-deep" /><span><b>Cancellation or dispute?</b><span className="block text-xs text-muted-foreground">This remains a support pathway, even in the demo.</span></span></div>}
  </div>;
}

function Info({ Icon, label, value }) { return <div className="flex items-start gap-2"><Icon size={16} className="mt-0.5 shrink-0 text-eucalyptus-deep" /><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm font-semibold">{value || 'Not supplied'}</p></div></div>; }
