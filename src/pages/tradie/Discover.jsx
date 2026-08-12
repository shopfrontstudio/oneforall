import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { Compass, ArrowDownUp, Lock, Send, CheckCircle2 } from 'lucide-react';
import JobCard from '@/components/oneforall/JobCard';
import { EmptyState } from '@/components/oneforall/Bits';
import { matchScore, pseudoDistance } from '@/lib/oneforall';

const SORTS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'nearest', label: 'Nearest' },
  { value: 'budget_low', label: 'Budget ↑' },
  { value: 'budget_high', label: 'Budget ↓' },
];

export default function Discover() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [jobs, setJobs] = useState(null);
  const [profile, setProfile] = useState(null);
  const [sub, setSub] = useState(null);
  const [sort, setSort] = useState('recommended');
  const [respond, setRespond] = useState(null);
  const [sent, setSent] = useState({});
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      const [p, s, allJobs, requests] = await Promise.all([
        base44.entities.TradieProfile.filter({ user_id: user.id }),
        base44.entities.Subscription.filter({ tradie_id: user.id }),
        base44.entities.Job.filter({ status: 'published' }),
        base44.entities.InterestRequest.filter({ tradie_id: user.id }),
      ]);
      setProfile(p[0] || null);
      setSub(s[0] || null);
      setJobs(allJobs.filter(j => j.customer_id !== user.id));
      setSent(Object.fromEntries(requests.filter(request => request.status !== 'declined').map(request => [request.job_id, true])));
    })();
  }, [user.id]);

  const canRequest = (sub?.status === 'active' || sub?.status === 'trial') && sub?.plan && sub.plan !== 'free';

  const ranked = useMemo(() => {
    if (!jobs || !profile) return [];
    const items = jobs.map(j => ({ job: j, score: matchScore(j, profile) }));
    switch (sort) {
      case 'urgent': items.sort((a, b) => Number(b.job.urgency === 'urgent') - Number(a.job.urgency === 'urgent') || b.score - a.score); break;
      case 'nearest': items.sort((a, b) => pseudoDistance(a.job.suburb, profile.suburb) - pseudoDistance(b.job.suburb, profile.suburb)); break;
      case 'budget_low': items.sort((a, b) => (a.job.indicative_low || 0) - (b.job.indicative_low || 0)); break;
      case 'budget_high': items.sort((a, b) => (b.job.indicative_high || 0) - (a.job.indicative_high || 0)); break;
      default: items.sort((a, b) => b.score - a.score);
    }
    return items.slice(0, 6);
  }, [jobs, profile, sort]);

  const sendRequest = async (job, data) => {
    if (!canRequest) { toast({ title: 'Subscription required', description: 'Activate a plan to send interest requests.', variant: 'destructive' }); navigate('/membership'); return; }
    const low = Number(data.quote_low);
    const high = Number(data.quote_high);
    if (!data.availability || !Number.isFinite(low) || low <= 0 || !Number.isFinite(high) || high < low) {
      toast({ title: 'Check your quote', description: 'Add an availability date and a valid quote range.', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const existing = await base44.entities.InterestRequest.filter({ job_id: job.id, tradie_id: user.id });
      if (existing.some(request => request.status !== 'declined')) { setSent(s => ({ ...s, [job.id]: true })); setRespond(null); return; }
      const deadline = new Date(Date.now() + 12 * 3600e3).toISOString();
      await base44.entities.InterestRequest.create({
      job_id: job.id, job_title: job.title, tradie_id: user.id, tradie_name: profile.full_name, tradie_business: profile.business_name,
      customer_id: job.customer_id, quote_low: low, quote_high: high, earliest_availability: data.availability, message: data.message?.trim(),
      status: 'pending', response_deadline: deadline,
      });
      await base44.entities.Notification.create({ user_id: job.customer_id, type: 'interest', title: 'New interest request', body: `${profile.business_name || profile.full_name} is interested in "${job.title}"`, link: `/job/${job.id}`, read: false });
      setSent(s => ({ ...s, [job.id]: true }));
      setRespond(null);
      toast({ title: 'Interest sent', description: 'The customer has 12 hours to respond.' });
    } catch (error) {
      toast({ title: 'Could not send interest', description: error.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  if (jobs === null) return <div className="glass-soft rounded-2xl h-40 animate-pulse" />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Discover jobs</h1>
          <p className="text-sm text-muted-foreground">Recommended for you around {profile?.suburb || 'Ballarat'}</p>
        </div>
        <div className="relative">
          <select value={sort} onChange={e => setSort(e.target.value)} className="appearance-none bg-white/70 border border-border rounded-xl pl-9 pr-8 py-2 text-sm font-medium outline-none focus:ring-2 ring-primary">
            {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <ArrowDownUp size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {!canRequest && (
        <div className="glass-soft rounded-2xl p-4 flex items-center gap-3">
          <Lock size={18} className="text-terracotta" />
          <p className="text-sm text-foreground/80 flex-1">You're on the <b>Free</b> plan — browse freely, then subscribe to send interest requests.</p>
          <button onClick={() => navigate('/membership')} className="text-sm font-semibold text-eucalyptus-deep">View plans</button>
        </div>
      )}

      {ranked.length === 0 ? (
        <EmptyState icon={Compass} title="No matching jobs yet" body="New Ballarat jobs appear here as they're posted. We'll notify you when one matches your trades." />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {ranked.map(({ job, score }) => (
            <div key={job.id} className="space-y-2">
              <JobCard job={job} score={score} />
              {sent[job.id] ? (
                <div className="glass-soft rounded-xl px-3 py-2 text-xs text-eucalyptus-deep inline-flex items-center gap-1.5 w-full"><CheckCircle2 size={14} /> Interest sent — awaiting customer response</div>
              ) : respond?.job.id === job.id ? (
                <RespondForm job={job} busy={sending} onCancel={() => setRespond(null)} onSend={(d) => sendRequest(job, d)} />
              ) : (
                <button onClick={() => setRespond({ job })} className="w-full text-sm font-semibold px-3 py-2.5 rounded-xl bg-primary text-primary-foreground btn-tactile inline-flex items-center justify-center gap-1.5"><Send size={14} /> Send interest request</button>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground text-center pt-2">Showing top {ranked.length} matches · ranking never depends on subscription level.</p>
    </div>
  );
}

function RespondForm({ job, onSend, onCancel, busy = false }) {
  const [quoteLow, setQuoteLow] = useState(job.indicative_low || '');
  const [quoteHigh, setQuoteHigh] = useState(job.indicative_high || '');
  const [availability, setAvailability] = useState(() => new Date(Date.now() + 864e5).toISOString().slice(0, 10));
  const [message, setMessage] = useState('');
  return (
    <div className="glass rounded-2xl p-3.5 space-y-2">
      <p className="text-xs text-muted-foreground inline-flex items-center gap-1"><Lock size={12} /> Contact details stay private until the customer accepts.</p>
      <div className="grid grid-cols-2 gap-2">
        <input value={quoteLow} onChange={e => setQuoteLow(e.target.value)} type="number" placeholder="Quote from $" className="inp-mini" />
        <input value={quoteHigh} onChange={e => setQuoteHigh(e.target.value)} type="number" placeholder="to $" className="inp-mini" />
      </div>
      <input value={availability} onChange={e => setAvailability(e.target.value)} type="date" className="inp-mini" />
      <textarea value={message} onChange={e => setMessage(e.target.value)} rows={2} placeholder="Short message + link to your verified profile" className="inp-mini" />
      <div className="flex gap-2">
        <button disabled={busy} onClick={onCancel} className="flex-1 px-3 py-2 rounded-xl glass-soft text-sm font-medium btn-tactile">Cancel</button>
        <button disabled={busy} onClick={() => onSend({ quote_low: quoteLow, quote_high: quoteHigh, availability, message })} className="flex-1 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold btn-tactile disabled:opacity-50">{busy ? 'Sending…' : 'Send'}</button>
      </div>
    </div>
  );
}
