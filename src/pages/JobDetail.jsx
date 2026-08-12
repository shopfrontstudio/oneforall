import React, { useEffect, useId, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { CheckCircle2, Clock, DollarSign, Lock, MapPin, MessageSquare, ShieldCheck, Star } from 'lucide-react';
import { callFunction, formatAUDRange, JOB_STATUS_LABEL, PHASE1_SERVICE_MAP, URGENCY_LABEL } from '@/lib/oneforall';
import { EmptyState, StatusBadge } from '@/components/oneforall/Bits';
import { chooseCanonicalBooking } from '../../base44/shared/marketplace.js';
import { latestPublicAssertionForServicePeriod, providerAssertionLabels } from '../../base44/shared/public-assertions.js';
import { latestServiceDate, melbourneDateTimeLocalValue, melbourneLocalDateTimeToISO } from '../../base44/shared/guards.js';

export default function BookingDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [job, setJob] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [booking, setBooking] = useState(null);
  const [myQuote, setMyQuote] = useState(null);
  const [publicAssertions, setPublicAssertions] = useState({});
  const [workerAcknowledgements, setWorkerAcknowledgements] = useState({});
  const [working, setWorking] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [scheduledStart, setScheduledStart] = useState('');
  const scheduleInputId = useId();

  const load = async () => {
    const [nextJob, quoteRows, bookingRows, myReviews] = await Promise.all([
      base44.entities.Job.get(id),
      base44.entities.InterestRequest.filter({ job_id: id }),
      base44.entities.Booking.filter({ job_id: id }),
      base44.entities.Review.filter({ job_id: id, reviewer_id: user.id }),
    ]);
    const orderedQuotes = quoteRows.sort((a, b) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime());
    setJob(nextJob);
    setQuotes(orderedQuotes);
    setBooking(chooseCanonicalBooking(bookingRows));
    setReviewed(myReviews.length > 0);
    if (user?.account_type === 'tradie') setMyQuote(orderedQuotes.find((quote) => quote.tradie_id === user.id) || null);
    else {
      const providerIds = [...new Set(orderedQuotes.map((quote) => quote.tradie_id).filter(Boolean))];
      const assertionRows = await Promise.all(providerIds.map(async (providerId) => {
        try {
          return await base44.entities.ProviderPublicAssertion.filter({ provider_id: providerId });
        } catch { return []; }
      }));
      const byProvider = Object.fromEntries(providerIds.map((providerId, index) => [providerId, assertionRows[index]]));
      setPublicAssertions(Object.fromEntries(orderedQuotes.map((quote) => [
        quote.id,
        latestPublicAssertionForServicePeriod(
          byProvider[quote.tradie_id] || [],
          nextJob.service_key,
          latestServiceDate(nextJob.preferred_date, quote.earliest_availability),
        ),
      ])));
    }
  };

  useEffect(() => { load(); }, [id, user?.id]);

  if (!job) return <div className="glass-soft h-60 rounded-2xl" role="status" aria-label="Loading booking details" />;

  const isCustomer = job.customer_id === user.id;
  const isProvider = user.account_type === 'tradie' && !isCustomer;

  const accept = async (quote) => {
    setWorking(true);
    try {
      await callFunction('accept-interest', {
        request_id: quote.id,
        action: 'accept',
        worker_acknowledged: workerAcknowledgements[quote.id] === true,
        idempotency_key: crypto.randomUUID(),
      });
      toast({ title: 'Quote accepted', description: 'The managed booking and private conversation are connected.' });
      navigate('/messages');
    } catch (error) {
      toast({ title: 'Could not accept quote', description: error.message, variant: 'destructive' });
    } finally { setWorking(false); }
  };

  const decline = async (quote) => {
    try {
      await callFunction('accept-interest', { request_id: quote.id, action: 'decline', idempotency_key: crypto.randomUUID() });
      toast({ title: 'Quote declined' });
      await load();
    } catch (error) { toast({ title: 'Could not decline quote', description: error.message, variant: 'destructive' }); }
  };

  const transition = async (toState) => {
    if (!booking) return;
    let scheduledStartISO;
    if (toState === 'scheduled') {
      scheduledStartISO = melbourneLocalDateTimeToISO(scheduledStart);
      if (!scheduledStartISO || new Date(scheduledStartISO).getTime() <= Date.now()) {
        toast({ title: 'Choose a valid future Ballarat time', description: 'The time must exist unambiguously in Australia/Melbourne.', variant: 'destructive' });
        return;
      }
    }
    setWorking(true);
    try {
      await callFunction('transition-booking', {
        booking_id: booking.id,
        to_state: toState,
        expected_version: Number(booking.version || 1),
        idempotency_key: crypto.randomUUID(),
        ...(scheduledStartISO ? { scheduled_start: scheduledStartISO } : {}),
      });
      const transitionLabels = { scheduled: 'Booking schedule confirmed', in_progress: 'Booking marked in progress', completed: 'Booking completed' };
      toast({ title: transitionLabels[toState] || 'Booking updated' });
      if (toState === 'scheduled') setScheduledStart('');
      await load();
    } catch (error) {
      toast({ title: 'Could not update booking', description: error.message, variant: 'destructive' });
    } finally { setWorking(false); }
  };

  const submitReview = async (rating, body) => {
    if (reviewed) return;
    try {
      await callFunction('submit-review', { job_id: job.id, rating, body });
      setReviewOpen(false);
      toast({ title: 'Review submitted — thank you!' });
      await load();
    } catch (error) { toast({ title: 'Could not submit review', description: error.message, variant: 'destructive' }); }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <section className="glass rounded-3xl p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-eucalyptus/10 px-2 py-0.5 text-xs font-medium text-eucalyptus-deep">{job.category_name}</span>
          <StatusBadge label={JOB_STATUS_LABEL[job.status] || job.status} tone={job.status === 'completed' ? 'sage' : job.status === 'matched' || job.status === 'in_progress' ? 'lime' : 'mist'} />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{job.title}</h1>
        <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/80">{job.description}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <Info icon={MapPin} label="Service area" value={`${job.suburb}, VIC`} />
          <Info icon={Clock} label="Requested timing" value={`${URGENCY_LABEL[job.urgency] || 'Flexible'}${job.preferred_date ? ` · preferred ${job.preferred_date}` : ' · no preferred date'} (not confirmed)`} />
          {booking?.scheduled_start && <Info icon={Clock} label="Confirmed schedule" value={formatScheduledStart(booking.scheduled_start)} />}
          <Info icon={DollarSign} label="Indicative range" value={formatAUDRange(job.indicative_low, job.indicative_high)} />
          <Info icon={ShieldCheck} label="Customer" value={isCustomer ? 'You' : job.customer_name || 'Shared after confirmation'} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Access and safety details remain limited to booking participants and OneForAll support.</p>
      </section>

      {isCustomer && <CustomerQuotes job={job} quotes={quotes} assertions={publicAssertions} working={working} acknowledgements={workerAcknowledgements} setAcknowledgements={setWorkerAcknowledgements} onAccept={accept} onDecline={decline} />}

      {isCustomer && booking && ['accepted', 'scheduled', 'in_progress'].includes(booking.state) && <p className="rounded-xl border border-border bg-white/65 p-3 text-sm text-muted-foreground" role="status">Booking state: {booking.state === 'accepted' ? 'Accepted — scheduling pending' : booking.state === 'scheduled' ? `Scheduled for ${formatScheduledStart(booking.scheduled_start)}` : 'In progress'}. The attending provider records work progress; use Messages if support is needed.</p>}

      {isCustomer && job.status === 'completed' && !reviewOpen && !reviewed && <button onClick={() => setReviewOpen(true)} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"><Star size={16} className="mr-2 inline" />Leave a review</button>}
      {reviewOpen && <ReviewForm onSubmit={submitReview} onCancel={() => setReviewOpen(false)} />}

      {isProvider && <section className="glass rounded-2xl p-4">
        {myQuote ? <><p className="flex items-center gap-2 text-sm font-medium text-eucalyptus-deep"><CheckCircle2 size={16} />Your managed quote: {myQuote.status}</p><p className="mt-1 text-xs text-muted-foreground">{formatAUDRange(myQuote.quote_low, myQuote.quote_high)} · availability {myQuote.earliest_availability || 'flexible'}</p><div className="mt-2 inline-flex items-center gap-1 rounded-xl bg-white/65 p-2.5 text-xs text-muted-foreground"><Lock size={12} />Contact details stay private until booking confirmation.</div></> : <p className="text-sm text-muted-foreground">This request is not routed to your approved offering. Provider quote access remains closed while release flags are off.</p>}
        {booking?.scheduled_start && <p className="mt-3 rounded-xl border border-border bg-white/70 p-3 text-sm"><b>Confirmed schedule:</b> {formatScheduledStart(booking.scheduled_start)}</p>}
        {booking?.state === 'accepted' && <div className="mt-3 space-y-2"><label htmlFor={scheduleInputId} className="text-sm font-semibold">Confirmed service date and time (Ballarat time)</label><input id={scheduleInputId} type="datetime-local" value={scheduledStart} min={melbourneDateTimeLocalValue(new Date())} onChange={(event) => setScheduledStart(event.target.value)} aria-describedby={`${scheduleInputId}-help`} className="inp" /><p id={`${scheduleInputId}-help`} className="text-xs text-muted-foreground">Australia/Melbourne timezone. Enter the time agreed with the customer; their preferred date above is not a confirmed booking.</p><button disabled={working || !scheduledStart} onClick={() => transition('scheduled')} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">Confirm booking schedule</button></div>}
        {booking?.state === 'scheduled' && <button disabled={working} onClick={() => transition('in_progress')} className="mt-3 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">Mark booking in progress</button>}
        {booking?.state === 'in_progress' && <button disabled={working} onClick={() => transition('completed')} className="mt-3 w-full rounded-xl bg-sage/40 px-4 py-2.5 text-sm font-semibold disabled:opacity-50">Mark booking complete</button>}
      </section>}
    </div>
  );
}

function CustomerQuotes({ job, quotes, assertions, working, acknowledgements, setAcknowledgements, onAccept, onDecline }) {
  return <section><h2 className="mb-2 text-sm font-semibold">Managed quotes ({quotes.filter((quote) => quote.status === 'pending').length} pending)</h2>{quotes.length === 0 ? <EmptyState icon={MessageSquare} title="No quotes yet" body="Eligible provider routing is not active while the service release gates remain off." /> : <div className="space-y-2">{quotes.map((quote) => {
    const assertion = assertions[quote.id] || null;
    const labels = providerAssertionLabels(assertion, job.service_key);
    return <article key={quote.id} className="glass-soft rounded-2xl p-4"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold">{assertion?.display_name || 'Provider details pending OneForAll review'}</p><p className="text-xs text-muted-foreground">{assertion ? `Approved service: ${labels.serviceLabels.join(', ') || 'not published'}` : 'No current service-covering public assertion is available through this quote’s service date; draft provider claims are hidden.'}</p></div><span className="rounded-full bg-mist-soft px-2 py-1 text-xs font-medium text-eucalyptus-deep">{quote.status}</span></div><p className="mt-2 text-xs text-muted-foreground">Indicative quote: {formatAUDRange(quote.quote_low, quote.quote_high)} · Available {quote.earliest_availability || 'flexible'}</p>{assertion && <Link to={`/provider/${encodeURIComponent(quote.tradie_id)}?service=${encodeURIComponent(job.service_key)}`} className="mt-2 inline-block text-xs font-semibold text-eucalyptus-deep">View published provider assertion</Link>}{quote.attending_worker_display_name && <div className="mt-2 rounded-xl border border-border bg-white/70 p-3 text-xs"><b>Disclosed attending worker:</b> {quote.attending_worker_display_name}<span className="text-muted-foreground"> · {quote.worker_relationship_label || 'Provider team'}</span><label className="mt-2 flex items-start gap-2"><input type="checkbox" checked={acknowledgements[quote.id] === true} onChange={(event) => setAcknowledgements((current) => ({ ...current, [quote.id]: event.target.checked }))} /><span>I understand this is the disclosed attending worker and any substitution must be separately disclosed and eligible.</span></label></div>}{quote.status === 'pending' && <div className="mt-3 flex gap-2"><button disabled={working || !assertion || !quote.attending_worker_display_name || acknowledgements[quote.id] !== true || !PHASE1_SERVICE_MAP[job.service_key]?.flags.booking_enabled} onClick={() => onAccept(quote)} className="flex-1 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{working ? 'Working…' : 'Accept quote & book'}</button><button onClick={() => onDecline(quote)} className="rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium">Decline</button></div>}</article>;
  })}</div>}</section>;
}

function formatScheduledStart(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Schedule unavailable';
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function Info({ icon: Icon, label, value }) {
  return <div className="flex items-start gap-2"><Icon size={15} className="mt-0.5 shrink-0 text-eucalyptus-deep" /><div><div className="text-xs text-muted-foreground">{label}</div><div className="text-sm font-medium">{value}</div></div></div>;
}

function ReviewForm({ onSubmit, onCancel }) {
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  return <div className="glass-soft space-y-3 rounded-2xl p-4"><h3 className="text-sm font-semibold">Rate your service provider</h3><div className="flex gap-1">{[1, 2, 3, 4, 5].map((value) => <button key={value} onClick={() => setRating(value)} aria-label={`${value} stars`}><Star size={26} className={value <= rating ? 'fill-terracotta text-terracotta' : 'text-muted-foreground/40'} /></button>)}</div><textarea rows={3} value={body} onChange={(event) => setBody(event.target.value)} placeholder="How was the service?" className="inp" /><div className="flex gap-2"><button onClick={onCancel} className="flex-1 rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium">Cancel</button><button onClick={() => onSubmit(rating, body)} className="flex-1 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">Submit review</button></div></div>;
}
