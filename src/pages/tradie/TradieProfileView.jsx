import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { BadgeCheck, Crown, MapPin, ShieldCheck, Lock, Send } from 'lucide-react';
import { StarRating, EmptyState } from '@/components/oneforall/Bits';
import { notify, pseudoDistance } from '@/lib/oneforall';
import { useToast } from '@/components/ui/use-toast';

export default function TradieProfileView() {
  const { id } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const [t, setT] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState('');
  const [sending, setSending] = useState(false);
  useEffect(() => {
    base44.entities.TradieProfile.get(id).then(profile => {
      setT(profile);
      base44.entities.Review.filter({ reviewee_id: profile.user_id }).then(setReviews).catch(() => setReviews([]));
    }).catch(() => setT(false));
    if (user?.account_type === 'customer') {
      base44.entities.Job.filter({ customer_id: user.id, status: 'published' }).then(list => {
        setJobs(list);
        setSelectedJob(current => current || list[0]?.id || '');
      }).catch(() => setJobs([]));
    }
  }, [id, user?.id, user?.account_type]);

  const invite = async () => {
    const job = jobs.find(item => item.id === selectedJob);
    if (!job || !t?.user_id) return;
    setSending(true);
    try {
      const existing = await base44.entities.Invitation.filter({ job_id: job.id, tradie_id: t.user_id });
      if (existing.some(item => item.status !== 'declined')) {
        toast({ title: 'Already invited', description: 'This tradie already has an invitation for that job.' });
        return;
      }
      await base44.entities.Invitation.create({ job_id: job.id, job_title: job.title, customer_id: user.id, customer_name: user.full_name || user.email, tradie_id: t.user_id, tradie_name: t.business_name || t.full_name, status: 'pending' });
      await notify(t.user_id, 'invitation', 'Direct job invitation', `${user.full_name || user.email} invited you to "${job.title}"`, '/invites');
      setInviteOpen(false);
      toast({ title: 'Invitation sent', description: 'The tradie can respond with a quote from their Invites page.' });
    } catch (error) {
      toast({ title: 'Could not send invitation', description: error.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };
  if (t === null) return <div className="glass-soft rounded-2xl h-40 animate-pulse" />;
  if (t === false) return <EmptyState title="Tradie not found" />;
  const displayedRating = reviews.length ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length : t.rating_avg;
  const displayedRatingCount = reviews.length || t.rating_count;
  return (
    <div className="space-y-5">
      <div className="glass rounded-3xl p-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-semibold text-2xl">{(t.full_name || '?')[0]}</div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-1.5">{t.business_name || t.full_name}{t.verified && <BadgeCheck size={18} className="text-eucalyptus" />}{t.founding_badge && <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-lime/25 text-eucalyptus-deep font-semibold"><Crown size={11} />Founding</span>}</h1>
            <p className="text-sm text-muted-foreground">{(t.trade_categories || []).join(' · ')}</p>
            <div className="flex items-center gap-3 mt-1.5"><StarRating value={displayedRating} count={displayedRatingCount} /><span className="text-xs text-muted-foreground inline-flex items-center gap-1"><MapPin size={12} />{t.suburb} · {pseudoDistance('Ballarat', t.suburb).toFixed(0)} km</span></div>
          </div>
        </div>
        {t.bio && <p className="text-sm text-foreground/80 mt-4">{t.bio}</p>}
        <div className="glass-soft rounded-xl p-3 mt-4 flex items-center gap-2 text-xs text-muted-foreground"><Lock size={13} /> Contact details are shared only after you accept an interest request from this tradie.</div>
      </div>

      <div className="glass-soft rounded-2xl p-4">
        <h2 className="text-sm font-semibold flex items-center gap-1.5"><ShieldCheck size={15} className="text-eucalyptus-deep" /> Verification</h2>
        <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
          <V k="ABN" ok={!!t.abn} />
          <V k="Licence" ok={!!t.licence_number} />
          <V k="Insurance" ok={!!t.insurance_provider} />
          <V k="Public liability" ok={t.public_liability} />
          <V k="Experience" ok={t.experience_years > 0} val={`${t.experience_years} yrs`} />
          <V k="Open to work" ok={t.open_to_work} />
        </div>
      </div>

      {t.portfolio_photos?.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2">Portfolio</h2>
          <div className="grid grid-cols-3 gap-2">{t.portfolio_photos.map((u, i) => <div key={i} className="aspect-square rounded-xl overflow-hidden"><img src={u} alt={`Portfolio item ${i + 1}`} className="w-full h-full object-cover" /></div>)}</div>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold mb-2">Reviews</h2>
        {reviews.length === 0 ? <p className="text-sm text-muted-foreground">No reviews yet.</p> : (
          <div className="space-y-2">{reviews.map(r => <div key={r.id} className="glass-soft rounded-xl p-3"><div className="flex items-center justify-between"><StarRating value={r.rating} /><span className="text-xs text-muted-foreground">{r.reviewer_name}</span></div>{r.body && <p className="text-sm mt-1.5 text-foreground/80">{r.body}</p>}</div>)}</div>
        )}
      </div>
      {user?.account_type === 'customer' && t.user_id !== user.id && (
        <div className="glass rounded-2xl p-4">
          <h2 className="text-sm font-semibold">Work with this tradie</h2>
          {jobs.length > 0 && !inviteOpen && <button onClick={() => setInviteOpen(true)} className="mt-3 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground btn-tactile inline-flex items-center justify-center gap-2"><Send size={15} /> Invite to an open job</button>}
          {inviteOpen && (
            <div className="mt-3 space-y-2">
              <select value={selectedJob} onChange={event => setSelectedJob(event.target.value)} className="inp">
                {jobs.map(job => <option key={job.id} value={job.id}>{job.title}</option>)}
              </select>
              <div className="flex gap-2"><button onClick={() => setInviteOpen(false)} className="flex-1 rounded-xl glass-soft px-3 py-2 text-sm font-medium">Cancel</button><button disabled={sending || !selectedJob} onClick={invite} className="flex-1 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{sending ? 'Sending…' : 'Send invite'}</button></div>
            </div>
          )}
          <Link to={`/post-job?tradie=${encodeURIComponent(t.id)}`} className="mt-3 block text-center text-sm text-eucalyptus-deep font-medium">Post a new job for this tradie →</Link>
        </div>
      )}
    </div>
  );
}
const V = ({ k, ok, val = null }) => <div className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${ok ? 'bg-eucalyptus' : 'bg-muted-foreground/30'}`} />{k}: <span className="font-medium">{val || (ok ? 'Yes' : '—')}</span></div>;
