import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, CreditCard, LockKeyhole, MapPin, MessageSquare, RefreshCcw, Repeat2, ShieldCheck } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { JOB_STATUS_LABEL, PHASE1_SERVICE_MAP, callFunction, formatAUDRange } from '@/lib/oneforall';
import { chooseCanonicalBooking } from '@/domain/eligibility';
import { externalPaymentSummary, latestCustomerQuote, quoteDisplayStatus, recurrenceSummary } from '@/domain/marketplaceWorkflow';
import { useToast } from '@/components/ui/use-toast';

const formatDateTime = (value) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Not scheduled';
  return new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', dateStyle: 'medium', timeStyle: 'short' }).format(date);
};
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(new Date());

export default function BookingDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const [state, setState] = useState({ loading: true, error: '', job: null, booking: null, quotes: [], payments: [], series: [], serviceRow: null });
  const [busy, setBusy] = useState('');
  const [acceptance, setAcceptance] = useState({ address: '', contact: user?.email || '', access: '', workerAcknowledged: false });
  const [payment, setPayment] = useState({ amount: '', payment_method: 'bank_transfer', paid_at: new Date().toISOString().slice(0, 16) });
  const [repeatForm, setRepeatForm] = useState({ frequency: 'weekly', preferred_weekday: '1', preferred_time: '09:00' });
  const [rebookDate, setRebookDate] = useState('');

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const job = await base44.entities.Job.get(id);
      if (!job || job.customer_id !== user.id) throw new Error('This private record is unavailable to this account.');
      const [bookings, quotes, services] = await Promise.all([
        base44.entities.Booking.filter({ job_id: id }),
        base44.entities.InterestRequest.filter({ job_id: id }),
        base44.entities.ServiceDefinition.filter({ service_key: job.service_key }),
      ]);
      const booking = chooseCanonicalBooking(bookings);
      const [payments, series] = booking ? await Promise.all([
        base44.entities.ExternalPaymentConfirmation.filter({ booking_id: booking.id }),
        base44.entities.RecurringSeries.filter({ source_booking_id: booking.id }),
      ]) : [[], []];
      setState({ loading: false, error: '', job, booking, quotes, payments, series, serviceRow: services[0] || null });
    } catch (error) {
      setState({ loading: false, error: error.message || 'This booking could not be loaded.', job: null, booking: null, quotes: [], payments: [], series: [], serviceRow: null });
    }
  }, [id, user.id]);
  useEffect(() => { load(); }, [load]);

  const latestQuote = useMemo(() => latestCustomerQuote(state.quotes), [state.quotes]);
  const paymentStatus = useMemo(() => externalPaymentSummary(state.payments), [state.payments]);
  const series = state.series.find((item) => item.state !== 'cancelled') || state.series[0] || null;
  const run = async (key, action, success) => {
    setBusy(key);
    try { await action(); toast({ title: success }); await load(); }
    catch (error) { toast({ title: 'Could not update booking', description: error.message, variant: 'destructive' }); }
    finally { setBusy(''); }
  };

  if (state.loading) return <div className="glass-soft h-56 rounded-2xl" role="status" aria-label="Loading booking details" />;
  if (!state.job) return <section className="glass mx-auto max-w-xl rounded-3xl p-6"><h1 className="text-xl font-semibold">Booking unavailable</h1><p className="mt-2 text-sm text-muted-foreground">{state.error}</p><Link to="/bookings" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-eucalyptus-deep"><ArrowLeft size={15} />Back to bookings</Link></section>;

  const { job, booking } = state;
  const service = PHASE1_SERVICE_MAP[job.service_key];
  const bookingOpen = Boolean(state.serviceRow?.booking_enabled && state.serviceRow?.public_release_enabled);
  const recurrenceOpen = Boolean(state.serviceRow?.recurrence_enabled && state.serviceRow?.public_release_enabled);
  const alreadyRecorded = state.payments.some((row) => row.participant_role === 'customer' && row.status === 'confirmed');

  return <div className="mx-auto max-w-3xl space-y-4">
    <Link to="/bookings" className="inline-flex items-center gap-1 text-sm font-semibold text-eucalyptus-deep"><ArrowLeft size={15} />Bookings</Link>
    <section className="glass rounded-3xl p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-eucalyptus/10 px-2.5 py-1 text-xs font-semibold text-eucalyptus-deep">{service?.category_name || job.category_name || 'Service request'}</span><span className="rounded-full bg-mist-soft px-2.5 py-1 text-xs font-semibold">{JOB_STATUS_LABEL[job.status] || job.status}</span></div>
      <h1 className="mt-3 text-2xl font-semibold">{job.title || service?.title || 'Service request'}</h1>
      {job.description && <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/80">{job.description}</p>}
      <div className="mt-5 grid gap-3 sm:grid-cols-2"><Info icon={MapPin} label="Service area" value={job.suburb ? `${job.suburb}, VIC` : 'Private until confirmed'} /><Info icon={CalendarClock} label="Confirmed schedule" value={booking?.scheduled_start ? formatDateTime(booking.scheduled_start) : 'Not scheduled'} /><Info icon={ShieldCheck} label="Safety review" value={job.hazard_screen_status === 'passed' ? 'Passed for recorded scope' : 'Pending private review'} /><Info icon={LockKeyhole} label="Privacy" value="Booking participants and OneForAll support only" /></div>
    </section>

    {!booking && latestQuote && <section className="glass rounded-3xl p-5 sm:p-6" aria-labelledby="quote-heading"><p className="text-xs font-bold uppercase tracking-[.12em] text-terracotta">Provider quote</p><h2 id="quote-heading" className="mt-1 text-xl font-semibold">{formatAUDRange(latestQuote.quote_low, latestQuote.quote_high)}</h2><p className="mt-1 text-sm text-muted-foreground">{quoteDisplayStatus(latestQuote)} · available from {latestQuote.earliest_availability || 'a date to confirm'}</p>{latestQuote.quote_terms && <p className="mt-3 rounded-xl bg-white/65 p-3 text-sm">{latestQuote.quote_terms}</p>}<p className="mt-3 text-sm">Attending worker: <b>{latestQuote.attending_worker_display_name || 'Shown before approval'}</b></p><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Service address<input value={acceptance.address} onChange={(event) => setAcceptance((current) => ({ ...current, address: event.target.value }))} className="inp mt-1" autoComplete="street-address" /></label><label className="text-sm font-semibold">Best contact detail<input value={acceptance.contact} onChange={(event) => setAcceptance((current) => ({ ...current, contact: event.target.value }))} className="inp mt-1" /></label></div><label className="mt-3 block text-sm font-semibold">Private access notes<textarea value={acceptance.access} onChange={(event) => setAcceptance((current) => ({ ...current, access: event.target.value }))} className="inp mt-1" rows={3} /></label><label className="mt-3 flex items-start gap-2 text-sm font-semibold"><input type="checkbox" checked={acceptance.workerAcknowledged} onChange={(event) => setAcceptance((current) => ({ ...current, workerAcknowledged: event.target.checked }))} /><span>I understand who is attending and approve this exact quote revision.</span></label><button type="button" disabled={!bookingOpen || Boolean(busy) || !acceptance.workerAcknowledged || !acceptance.address.trim() || !acceptance.contact.trim()} onClick={() => run('quote', () => callFunction('confirm-provider-response', { job_id: job.id, quote_id: latestQuote.id, worker_acknowledged: true, confirmed_service_address: acceptance.address, confirmed_customer_contact: acceptance.contact, confirmed_access_details: acceptance.access, idempotency_key: crypto.randomUUID() }), 'Quote approved and booking created')} className="mt-4 min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-45">Approve this quote</button>{!bookingOpen && <p className="mt-2 text-xs text-muted-foreground">Quote approval remains unavailable until this service’s booking controls are released.</p>}</section>}

    {booking && <><section className="glass-soft rounded-2xl p-4"><p className="text-sm text-muted-foreground">Authoritative changes use bounded server operations. Quote changes always require a fresh customer approval.</p><p className="mt-2 text-sm font-semibold">Booking state: {booking.state.replaceAll('_', ' ')}</p></section><Link to="/messages" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"><MessageSquare size={16} />Private messages</Link></>}

    {booking?.state === 'completed' && <section className="grid gap-4 lg:grid-cols-2">
      <div className="glass rounded-2xl p-5"><h2 className="flex items-center gap-2 font-semibold"><CreditCard size={18} />External payment record</h2><p className="mt-2 text-sm text-muted-foreground">{paymentStatus.label}. OneForAll does not process or verify this payment with a bank.</p>{!alreadyRecorded && <div className="mt-4 space-y-3"><label className="text-sm font-semibold">Amount (AUD)<input type="number" min="1" max="1000000" value={payment.amount} onChange={(event) => setPayment((current) => ({ ...current, amount: event.target.value }))} className="inp mt-1" /></label><label className="text-sm font-semibold">Paid directly by<select value={payment.payment_method} onChange={(event) => setPayment((current) => ({ ...current, payment_method: event.target.value }))} className="inp mt-1"><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="card_external">External card payment</option><option value="other_external">Other external method</option></select></label><button disabled={Boolean(busy) || !Number(payment.amount)} onClick={() => run('payment', () => callFunction('record-external-payment', { booking_id: booking.id, amount: Number(payment.amount), payment_method: payment.payment_method, paid_at: new Date(payment.paid_at).toISOString(), idempotency_key: crypto.randomUUID() }), 'Your payment statement was recorded')} className="min-h-11 w-full rounded-xl border border-primary px-4 text-sm font-semibold disabled:opacity-45">Record my confirmation</button></div>}</div>
      <div className="glass rounded-2xl p-5"><h2 className="flex items-center gap-2 font-semibold"><RefreshCcw size={18} />Book this service again</h2><p className="mt-2 text-sm text-muted-foreground">Creates a new private request using the same approved service scope.</p><input type="date" min={today()} value={rebookDate} onChange={(event) => setRebookDate(event.target.value)} className="inp mt-4" /><button disabled={Boolean(busy) || !rebookDate} onClick={() => run('rebook', () => callFunction('rebook', { booking_id: booking.id, preferred_date: rebookDate, urgency: 'flexible', idempotency_key: crypto.randomUUID() }), 'New private request created')} className="mt-3 min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-45">Request again</button></div>
    </section>}

    {booking && service?.pathway === 'scheduled_or_recurring' && <section className="glass rounded-2xl p-5"><h2 className="flex items-center gap-2 font-semibold"><Repeat2 size={18} />Recurring schedule</h2><p className="mt-2 text-sm text-muted-foreground">{recurrenceSummary(series)}. A schedule becomes active only after both customer and provider confirm the same proposal.</p>{!series && <div className="mt-4 grid gap-3 sm:grid-cols-3"><select value={repeatForm.frequency} onChange={(event) => setRepeatForm((current) => ({ ...current, frequency: event.target.value }))} className="inp"><option value="weekly">Weekly</option><option value="fortnightly">Fortnightly</option><option value="monthly">Monthly</option></select><select value={repeatForm.preferred_weekday} onChange={(event) => setRepeatForm((current) => ({ ...current, preferred_weekday: event.target.value }))} className="inp">{['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((day,index) => <option key={day} value={index+1}>{day}</option>)}</select><input type="time" value={repeatForm.preferred_time} onChange={(event) => setRepeatForm((current) => ({ ...current, preferred_time: event.target.value }))} className="inp" /></div>}{!series && <button disabled={!recurrenceOpen || Boolean(busy)} onClick={() => run('recurrence', () => callFunction('propose-recurring-schedule', { booking_id: booking.id, ...repeatForm, preferred_weekday: Number(repeatForm.preferred_weekday), idempotency_key: crypto.randomUUID() }), 'Recurring proposal saved')} className="mt-3 min-h-11 rounded-xl border border-primary px-4 text-sm font-semibold disabled:opacity-45">Propose schedule</button>}{series?.state === 'proposed' && !series.customer_confirmed_at && <button disabled={!recurrenceOpen || Boolean(busy)} onClick={() => run('recurrence-confirm', () => callFunction('confirm-recurring-schedule', { series_id: series.id, expected_version: series.version, idempotency_key: crypto.randomUUID() }), 'Recurring proposal confirmed')} className="mt-3 min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-45">Confirm this schedule</button>}{!recurrenceOpen && <p className="mt-2 text-xs text-muted-foreground">Recurring activation stays off until this service is separately released.</p>}</section>}
  </div>;
}

function Info({ icon: Icon, label, value }) {
  return <div className="flex items-start gap-2"><Icon size={16} className="mt-0.5 shrink-0 text-eucalyptus-deep" /><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm font-medium">{value}</p></div></div>;
}
