import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { MapPin, Clock, DollarSign, CheckCircle2, ShieldCheck, Lock, Star, MessageSquare, Send } from 'lucide-react';
import { formatAUDRange, URGENCY_LABEL, JOB_STATUS_LABEL, estimateRange, notify } from '@/lib/oneforall';
import { StatusBadge, StarRating, EmptyState } from '@/components/oneforall/Bits';
import { Image as UIImage } from '@/components/ui/image';

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

  const load = async () => {
    const j = await base44.entities.Job.get(id);
    setJob(j);
    const reqs = await base44.entities.InterestRequest.filter({ job_id: id });
    setRequests(reqs.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
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

  const accept = async (req) => {
    await base44.entities.InterestRequest.update(req.id, { status: 'accepted' });
    await base44.entities.Job.update(job.id, { status: 'matched', assigned_tradie_id: req.tradie_id });
    const convo = await base44.entities.Conversation.create({ job_id: job.id, job_title: job.title, customer_id: user.id, tradie_id: req.tradie_id, contact_unlocked: true });
    await notify(req.tradie_id, 'accepted', 'Request accepted', `Your interest in "${job.title}" was accepted.`, `/messages`);
    toast({ title: 'Request accepted', description: 'Contact details unlocked — you can message now.' });
    navigate('/messages');
  };
  const decline = async (req) => { await base44.entities.InterestRequest.update(req.id, { status: 'declined' }); toast({ title: 'Declined' }); load(); };
  const startWork = async () => { await base44.entities.Job.update(job.id, { status: 'in_progress' }); toast({ title: 'Marked in progress' }); load(); };
  const complete = async () => { await base44.entities.Job.update(job.id, { status: 'completed' }); toast({ title: 'Job completed' }); load(); };

  const submitReview = async (rating, body) => {
    const tradieId = job.assigned_tradie_id || requests.find(r => r.status === 'accepted')?.tradie_id;
    await base44.entities.Review.create({ job_id: job.id, reviewer_id: user.id, reviewer_name: user.full_name || user.email, reviewee_id: tradieId, rating, body, role: 'customer_to_tradie' });
    const revs = await base44.entities.Review.filter({ reviewee_id: tradieId });
    const avg = revs.reduce((s, r) => s + r.rating, 0) / revs.length;
    const tp = await base44.entities.TradieProfile.filter({ user_id: tradieId });
    if (tp[0]) await base44.entities.TradieProfile.update(tp[0].id, { rating_avg: Math.round(avg * 10) / 10, rating_count: revs.length });
    setReviewOpen(false); toast({ title: 'Review submitted — thank you!' }); load();
  };

  const sendInterest = async (data) => {
    await base44.entities.InterestRequest.create({ job_id: job.id, job_title: job.title, tradie_id: user.id, tradie_name: profile.full_name, tradie_business: profile.business_name, quote_low: Number(data.quote_low) || null, quote_high: Number(data.quote_high) || null, earliest_availability: data.availability, message: data.message, status: 'pending', response_deadline: new Date(Date.now() + 12 * 3600e3).toISOString() });
    await notify(job.customer_id, 'interest', 'New interest request', `${profile.business_name || profile.full_name} is interested in "${job.title}"`, `/job/${job.id}`);
    toast({ title: 'Interest sent' }); load();
  };

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div className="glass rounded-3xl p-5">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="text-xs px-2 py-0.5 rounded-full bg-eucalyptus/10 text-eucalyptus-deep font-medium">{job.category_name}</span>
          <StatusBadge status={job.status} label={JOB_STATUS_LABEL[job.status]} tone={job.status === 'completed' ? 'sage' : job.status === 'matched' || job.status === 'in_progress' ? 'lime' : 'mist'} />
          {job.boosted && <span className="text-xs px-2 py-0.5 rounded-full bg-lime/25 text-eucalyptus-deep font-semibold">Boosted</span>}
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{job.title}</h1>
        <p className="text-sm text-foreground/80 mt-2 whitespace-pre-wrap">{job.description}</p>
        <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
          <Info icon={MapPin} label="Location" value={`${job.suburb}, VIC`} />
          <Info icon={Clock} label="Timing" value={`${URGENCY_LABEL[job.urgency]}${job.preferred_date ? ` · ${job.preferred_date}` : ''}`} />
          <Info icon={DollarSign} label="Indicative range" value={formatAUDRange(job.indicative_low, job.indicative_high)} />
          <Info icon={ShieldCheck} label="Customer" value={isTradie ? `${job.customer_name}` : 'You'} />
        </div>
        {job.access_notes && <p className="text-xs text-muted-foreground mt-3">Access: {job.access_notes} · Parking: {job.parking}</p>}
        {job.photos?.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-4">{job.photos.map((u, i) => <div key={i} className="aspect-square rounded-xl overflow-hidden"><UIImage src={u} className="w-full h-full" fittingType="fill" /></div>)}</div>
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
                      <button onClick={() => accept(r)} className="flex-1 px-3 py-2 rounded-xl bg-eucalyptus text-white text-sm font-semibold btn-tactile">Accept & unlock</button>
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
          {job.status === 'completed' && !reviewOpen && (
            <button onClick={() => setReviewOpen(true)} className="mt-3 w-full px-4 py-2.5 rounded-xl bg-eucalyptus text-white text-sm font-semibold btn-tactile inline-flex items-center justify-center gap-2"><Star size={16} /> Leave a review</button>
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
            <TradieRespond job={job} profile={profile} onSend={sendInterest} />
          )}
        </section>
      )}
    </div>
  );
}

function Info({ icon: Icon, label, value }) {
  return <div className="flex items-start gap-2"><Icon size={15} className="text-eucalyptus-deep mt-0.5 shrink-0" /><div><div className="text-xs text-muted-foreground">{label}</div><div className="font-medium text-sm">{value}</div></div></div>;
}

function TradieRespond({ job, profile, onSend }) {
  const range = estimateRange(job.category_slug, job.urgency);
  const [qL, setQL] = useState(range.low); const [qH, setQH] = useState(range.high); const [avail, setAvail] = useState(''); const [msg, setMsg] = useState('');
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
      <button onClick={() => onSend({ quote_low: qL, quote_high: qH, availability: avail, message: msg })} className="w-full px-4 py-2.5 rounded-xl bg-eucalyptus text-white text-sm font-semibold btn-tactile inline-flex items-center justify-center gap-1.5"><Send size={15} /> Send interest request</button>
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
      <div className="flex gap-2"><button onClick={onCancel} className="flex-1 px-3 py-2 rounded-xl glass-soft text-sm font-medium btn-tactile">Cancel</button><button onClick={() => onSubmit(rating, body)} className="flex-1 px-3 py-2 rounded-xl bg-eucalyptus text-white text-sm font-semibold btn-tactile">Submit review</button></div>
    </div>
  );
}