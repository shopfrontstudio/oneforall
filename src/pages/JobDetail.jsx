import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { MapPin, Clock, DollarSign, CheckCircle2, ShieldCheck, Lock, Star, MessageSquare, Send } from 'lucide-react';
import { formatAUDRange, URGENCY_LABEL, JOB_STATUS_LABEL, estimateRange, callFunction, MARKETPLACE_RELEASE_OPEN, PHASE1_SERVICE_MAP } from '@/lib/oneforall';
import { StatusBadge, EmptyState } from '@/components/oneforall/Bits';

export default function JobDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [job, setJob] = useState(null);
  const [requests, setRequests] = useState([]);
  const [profile, setProfile] = useState(null);
  const [myRequest, setMyRequest] = useState(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [reviewed, setReviewed] = useState(false);

  const load = async () => {
    const j = await base44.entities.Job.get(id);
    setJob(j);
    const reqs = await base44.entities.InterestRequest.filter({ job_id: id });
    setRequests(reqs.sort((a, b) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime()));
    const mine = await base44.entities.Review.filter({ job_id: id, reviewer_id: user.id });
    setReviewed(mine.length > 0);
    if (user?.account_type === 'tradie') {
      const tp = await base44.entities.TradieProfile.filter({ user_id: user.id });
      setProfile(tp[0] || null);
      setMyRequest(reqs.find(r => r.tradie_id === user.id) || null);
    }
  };
  useEffect(() => { load(); }, [id, user?.id]);

  if (!job) return <div className="glass-soft rounded-2xl h-60 animate-pulse" />;

  const isCustomer = job.customer_id === user.id;
  const isTradie = user.account_type === 'tradie';

  // accept-interest owns the whole transition: it declines the other requests, sets
  // assigned_tradie_id (which is what releases the private job fields) and opens the
  // conversation — all after proving this account posted the job.
  const accept = async (req) => {
    setWorking(true);
    try {
      await callFunction('accept-interest', { request_id: req.id, action: 'accept', idempotency_key: crypto.randomUUID() });
      toast({ title: 'Request accepted', description: 'Contact details unlocked — you can message now.' });
      navigate('/messages');
    } catch (error) { toast({ title: 'Could not accept request', description: error.message, variant: 'destructive' }); }
    finally { setWorking(false); }
  };
  const decline = async (req) => {
    try {
      await callFunction('accept-interest', { request_id: req.id, action: 'decline', idempotency_key: crypto.randomUUID() });
      toast({ title: 'Declined' });
      load();
    } catch (error) { toast({ title: 'Could not decline request', description: error.message, variant: 'destructive' }); }
  };
  const startWork = async () => { await callFunction('transition-booking', { job_id: job.id, to_state: 'in_progress', idempotency_key: crypto.randomUUID() }); toast({ title: 'Marked in progress' }); load(); };
  const complete = async () => { await callFunction('transition-booking', { job_id: job.id, to_state: 'completed', idempotency_key: crypto.randomUUID() }); toast({ title: 'Job completed' }); load(); };

  // submit-review verifies the job is completed and that this account posted it,
  // then recomputes the tradie's aggregate rating server-side.
  const submitReview = async (rating, body) => {
    if (reviewed) { toast({ title: 'Review already submitted', variant: 'destructive' }); return; }
    try {
      await callFunction('submit-review', { job_id: job.id, rating, body });
      setReviewOpen(false); toast({ title: 'Review submitted — thank you!' }); load();
    } catch (error) { toast({ title: 'Could not submit review', description: error.message, variant: 'destructive' }); }
  };

  const sendInterest = async (data) => {
    const low = Number(data.quote_low); const high = Number(data.quote_high);
    if (!MARKETPLACE_RELEASE_OPEN) { toast({ title: 'Marketplace requests are not open yet', variant: 'destructive' }); return; }
    if (!data.availability || !Number.isFinite(low) || low <= 0 || !Number.isFinite(high) || high < low) { toast({ title: 'Add a valid quote and availability', variant: 'destructive' }); return; }
    setWorking(true);
    try {
      await callFunction('send-interest', { job_id: job.id, quote_low: low, quote_high: high, earliest_availability: data.availability, message: data.message, idempotency_key: crypto.randomUUID() });
      toast({ title: 'Interest sent' }); await load();
    } catch (error) { toast({ title: 'Could not send interest', description: error.message, variant: 'destructive' }); }
    finally { setWorking(false); }
  };

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div className="glass rounded-3xl p-5">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="text-xs px-2 py-0.5 rounded-full bg-eucalyptus/10 text-eucalyptus-deep font-medium">{job.category_name}</span>
          <StatusBadge label={JOB_STATUS_LABEL[job.status]} tone={job.status === 'completed' ? 'sage' : job.status === 'matched' || job.status === 'in_progress' ? 'lime' : 'mist'} />
          {job.boosted && <span className="text-xs px-2 py-0.5 rounded-full bg-lime/25 text-eucalyptus-deep font-semibold">Boosted</span>}
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{job.title}</h1>
        <p className="text-sm text-foreground/80 mt-2 whitespace-pre-wrap">{job.description}</p>
        <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
          <Info icon={MapPin} label="Location" value={`${job.suburb}, VIC`} />
          <Info icon={Clock} label="Timing" value={`${URGENCY_LABEL[job.urgency]}${job.preferred_date ? ` · ${job.preferred_date}` : ''}`} />
          <Info icon={DollarSign} label="Indicative range" value={formatAUDRange(job.indicative_low, job.indicative_high)} />
          {/* customer_name is withheld by field-level RLS until this tradie is the accepted one. */}
          <Info icon={ShieldCheck} label="Customer" value={isCustomer ? 'You' : job.customer_name || 'Shared once accepted'} />
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Parking: {job.parking}
          {job.access_notes
            ? ` · Access: ${job.access_notes}`
            : !isCustomer && ' · Access details are shared once the customer accepts you'}
        </p>
        {job.photos?.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-4">{job.photos.map((u, i) => <div key={i} className="aspect-square rounded-xl overflow-hidden"><img src={u} alt={`Job attachment ${i + 1}`} className="w-full h-full object-cover" /></div>)}</div>
        )}
      </div>

      {isCustomer && (
        <section>
          <h2 className="text-sm font-semibold mb-2">Interest requests ({requests.filter(r => r.status === 'pending').length} pending)</h2>
          {requests.length === 0 ? <EmptyState icon={MessageSquare} title="No requests yet" body="We've notified nearby verified tradies. You'll see interest requests here." /> : (
            <div className="space-y-2">
              {requests.map(r => (
                <div key={r.id} className="glass-soft rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-sm flex items-center gap-1.5">{r.tradie_business || r.tradie_name}</div>
                      <div className="text-xs text-muted-foreground">{r.tradie_name}</div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${r.status === 'accepted' ? 'bg-sage/40 text-eucalyptus-deep' : r.status === 'declined' ? 'bg-terracotta/15 text-terracotta' : 'bg-mist-soft text-eucalyptus-deep'}`}>{r.status}</span>
                  </div>
                  {r.message && <p className="text-sm text-foreground/80 mt-2">"{r.message}"</p>}
                  <div className="text-xs text-muted-foreground mt-2">Indicative quote: {formatAUDRange(r.quote_low, r.quote_high)} · Available {r.earliest_availability || 'flexible'}</div>
                  {r.status === 'pending' && (
                    <div className="flex gap-2 mt-3">
                      <button disabled={working || !PHASE1_SERVICE_MAP[job.service_key]?.flags.booking_enabled} onClick={() => accept(r)} className="flex-1 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold btn-tactile disabled:opacity-50">{working ? 'Working…' : 'Accept & unlock'}</button>
                      <button onClick={() => decline(r)} className="px-4 py-2 rounded-xl glass-soft text-sm font-medium btn-tactile">Decline</button>
                    </div>
                  )}
                  {r.status === 'accepted' && <button onClick={() => navigate('/messages')} className="mt-3 text-sm font-semibold text-eucalyptus-deep inline-flex items-center gap-1"><MessageSquare size={14} /> Open conversation</button>}
                </div>
              ))}
            </div>
          )}
          {(job.status === 'matched' || job.status === 'in_progress') && (
            <div className="flex gap-2 mt-3">
              {job.status === 'matched' && <button onClick={startWork} className="flex-1 px-4 py-2.5 rounded-xl glass-soft text-sm font-semibold btn-tactile">Mark in progress</button>}
              {job.status !== 'completed' && <button onClick={complete} className="flex-1 px-4 py-2.5 rounded-xl bg-sage/40 text-sm font-semibold btn-tactile">Mark complete</button>}
            </div>
          )}
          {job.status === 'completed' && !reviewOpen && !reviewed && (
            <button onClick={() => setReviewOpen(true)} className="mt-3 w-full px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold btn-tactile inline-flex items-center justify-center gap-2"><Star size={16} /> Leave a review</button>
          )}
          {reviewOpen && <ReviewForm onSubmit={submitReview} onCancel={() => setReviewOpen(false)} />}
        </section>
      )}

      {isTradie && !isCustomer && (
        <section className="glass rounded-2xl p-4">
          {myRequest ? (
            <div>
              <div className="flex items-center gap-2 text-eucalyptus-deep text-sm font-medium"><CheckCircle2 size={16} /> Your interest has been sent</div>
              <p className="text-xs text-muted-foreground mt-1">Quote: {formatAUDRange(myRequest.quote_low, myRequest.quote_high)} · Available {myRequest.earliest_availability || 'flexible'}</p>
              {myRequest.message && <p className="text-sm mt-2 text-foreground/80">"{myRequest.message}"</p>}
              <div className="glass-soft rounded-xl p-2.5 mt-2 text-xs text-muted-foreground inline-flex items-center gap-1"><Lock size={12} /> Contact details unlock when the customer accepts.</div>
            </div>
          ) : (
            <TradieRespond job={job} profile={profile} busy={working} marketplaceOpen={MARKETPLACE_RELEASE_OPEN} onSend={sendInterest} />
          )}
        </section>
      )}
    </div>
  );
}

function Info({ icon: Icon, label, value }) {
  return <div className="flex items-start gap-2"><Icon size={15} className="text-eucalyptus-deep mt-0.5 shrink-0" /><div><div className="text-xs text-muted-foreground">{label}</div><div className="font-medium text-sm">{value}</div></div></div>;
}

function TradieRespond({ job, profile, onSend, marketplaceOpen, busy = false }) {
  const range = estimateRange(job.category_slug, job.urgency);
  const [qL, setQL] = useState(String(range.low)); const [qH, setQH] = useState(String(range.high)); const [avail, setAvail] = useState(() => new Date(Date.now() + 864e5).toISOString().slice(0, 10)); const [msg, setMsg] = useState('');
  if (!profile) return <p className="text-sm text-muted-foreground">Complete your tradie profile first.</p>;
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground inline-flex items-center gap-1"><Lock size={12} /> Contact stays private until the customer accepts.</div>
      <div className="grid grid-cols-2 gap-2">
        <input type="number" value={qL} onChange={e => setQL(e.target.value)} placeholder="Quote from $" className="inp-mini" />
        <input type="number" value={qH} onChange={e => setQH(e.target.value)} placeholder="to $" className="inp-mini" />
      </div>
      <input type="date" value={avail} onChange={e => setAvail(e.target.value)} className="inp-mini" />
      <textarea rows={2} value={msg} onChange={e => setMsg(e.target.value)} placeholder="Short message + link to your verified profile" className="inp-mini" />
      <button disabled={busy || !marketplaceOpen} onClick={() => onSend({ quote_low: qL, quote_high: qH, availability: avail, message: msg })} className="w-full px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold btn-tactile inline-flex items-center justify-center gap-1.5 disabled:opacity-50"><Send size={15} /> {busy ? 'Sending…' : marketplaceOpen ? 'Send interest request' : 'Requests not open'}</button>
    </div>
  );
}

function ReviewForm({ onSubmit, onCancel }) {
  const [rating, setRating] = useState(5); const [body, setBody] = useState('');
  return (
    <div className="glass-soft rounded-2xl p-4 space-y-3">
      <h3 className="font-semibold text-sm">Rate your tradie</h3>
      <div className="flex gap-1">{[1, 2, 3, 4, 5].map(i => <button key={i} onClick={() => setRating(i)}><Star size={26} className={i <= rating ? 'fill-terracotta text-terracotta' : 'text-muted-foreground/40'} /></button>)}</div>
      <textarea rows={3} value={body} onChange={e => setBody(e.target.value)} placeholder="How was the work? Punctual, tidy, good value?" className="inp" />
      <div className="flex gap-2"><button onClick={onCancel} className="flex-1 px-3 py-2 rounded-xl glass-soft text-sm font-medium btn-tactile">Cancel</button><button onClick={() => onSubmit(rating, body)} className="flex-1 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold btn-tactile">Submit review</button></div>
    </div>
  );
}
