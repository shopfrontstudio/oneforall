import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Zap, Ban, CheckCircle2, Briefcase, Pencil, Loader2 } from 'lucide-react';
import JobCard from '@/components/oneforall/JobCard';
import { EmptyState } from '@/components/oneforall/Bits';
import { pseudoDistance } from '@/lib/oneforall';

export default function MyJobs() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [jobs, setJobs] = useState(null);
  const [boosts, setBoosts] = useState(0);
  const [confirmAction, setConfirmAction] = useState(null);
  const [workingId, setWorkingId] = useState(null);

  const load = useCallback(async () => {
    const list = await base44.entities.Job.filter({ customer_id: user.id });
    setJobs(list.sort((a, b) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime()));
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const allBoosts = await base44.entities.Boost.filter({ customer_id: user.id });
    setBoosts(allBoosts.filter(b => new Date(b.created_date) >= monthStart).length);
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  const freeLeft = Math.max(0, 5 - boosts);

  const boost = async (job) => {
    if (freeLeft <= 0) { toast({ title: 'No free boosts left', description: 'Extra boosts are $4.99 — demo billing only.', variant: 'destructive' }); return; }
    if (job.status !== 'published') { toast({ title: 'Only open jobs can be boosted', variant: 'destructive' }); return; }
    setWorkingId(job.id);
    try {
    const last = await base44.entities.Boost.filter({ job_id: job.id });
    if (last.length) { const latest = last.sort((a, b) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime())[0]; if (Date.now() - new Date(latest.created_date).getTime() < 12 * 3600e3) { toast({ title: 'Boosted recently', description: 'One boost per job every 12 hours.', variant: 'destructive' }); return; } }

    const tradies = await base44.entities.TradieProfile.filter({ verified: true, open_to_work: true });
    const eligible = tradies.filter(tradie =>
      (tradie.trade_categories || []).includes(job.category_slug) &&
      pseudoDistance(job.suburb, tradie.suburb) <= (tradie.service_radius_km || 20)
    );
    if (!eligible.length) {
      toast({ title: 'No eligible tradies reached', description: 'Your boost was not used. Try again later.', variant: 'destructive' });
      return;
    }

    await base44.entities.Boost.create({ job_id: job.id, customer_id: user.id, type: 'free' });
    await base44.entities.Job.update(job.id, { boosted: true });
    await Promise.allSettled(eligible.map(tradie => base44.entities.Notification.create({
      user_id: tradie.user_id,
      type: 'boosted_job',
      title: 'Boosted job near you',
      body: `${job.title} · ${job.suburb}`,
      link: `/job/${job.id}`,
      read: false,
    })));
    toast({ title: 'Job boosted', description: `${eligible.length} matching tradie${eligible.length === 1 ? '' : 's'} notified · ${freeLeft - 1} free boosts left.` });
    load();
    } catch (error) {
      toast({ title: 'Could not boost job', description: error.message, variant: 'destructive' });
    } finally {
      setWorkingId(null);
    }
  };

  const updateStatus = async (job, status) => {
    setWorkingId(job.id);
    try {
      await base44.entities.Job.update(job.id, { status });
      toast({ title: status === 'completed' ? 'Job marked complete' : 'Job cancelled' });
      await load();
    } catch (error) {
      toast({ title: 'Could not update job', description: error.message, variant: 'destructive' });
    } finally {
      setWorkingId(null);
      setConfirmAction(null);
    }
  };

  if (jobs === null) return <div className="glass-soft rounded-2xl h-40 animate-pulse" />;
  if (!jobs.length) return <EmptyState icon={Briefcase} title="No jobs yet" body="Post your first job and verified Ballarat tradies will come to you." action={<Link to="/post-job" className="bg-eucalyptus text-white px-4 py-2.5 rounded-xl text-sm font-semibold btn-tactile inline-flex items-center gap-2"><Plus size={16} /> Post a job</Link>} />;

  const open = jobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled');
  const closed = jobs.filter(j => j.status === 'completed' || j.status === 'cancelled');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">My jobs</h1>
        <Link to="/post-job" className="bg-eucalyptus text-white px-4 py-2 rounded-xl text-sm font-semibold btn-tactile inline-flex items-center gap-1.5"><Plus size={16} /> New</Link>
      </div>
      <div className="glass-soft rounded-2xl p-3 flex items-center gap-2 text-sm">
        <Zap size={16} className="text-lime" />
        <span className="text-foreground/80"><b className="text-eucalyptus-deep">{freeLeft}</b> free boosts left this month</span>
      </div>
      {open.length > 0 && <div className="grid sm:grid-cols-2 gap-3">{open.map(j => <JobActions key={j.id} job={j} onBoost={boost} onConfirm={setConfirmAction} working={workingId === j.id} canBoost={freeLeft > 0} />)}</div>}
      {closed.length > 0 && (<div><h2 className="text-sm font-semibold text-muted-foreground mb-2">Closed</h2><div className="grid sm:grid-cols-2 gap-3 opacity-70">{closed.map(j => <JobCard key={j.id} job={j} />)}</div></div>)}
      {confirmAction && (
        <ConfirmAction
          title={confirmAction.type === 'complete' ? 'Mark this job complete?' : 'Cancel this job?'}
          body={confirmAction.type === 'complete' ? 'This closes the job and enables the review step.' : 'Tradies will no longer see this job. This cannot be reopened.'}
          confirmLabel={confirmAction.type === 'complete' ? 'Mark complete' : 'Cancel job'}
          destructive={confirmAction.type === 'cancel'}
          busy={workingId === confirmAction.job.id}
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => updateStatus(confirmAction.job, confirmAction.type === 'complete' ? 'completed' : 'cancelled')}
        />
      )}
    </div>
  );
}

function JobActions({ job, onBoost, onConfirm, working, canBoost }) {
  return (
    <div className="space-y-2">
      <JobCard job={job} to={job.status === 'draft' ? `/post-job?draft=${job.id}` : undefined} />
      <div className="flex gap-2">
        {job.status === 'draft' ? (
          <Link to={`/post-job?draft=${job.id}`} className="flex-1 text-xs font-medium px-3 py-2 rounded-xl glass-soft card-lift inline-flex items-center justify-center gap-1"><Pencil size={13} /> Continue draft</Link>
        ) : (
          <button disabled={!canBoost || working || job.status !== 'published'} onClick={() => onBoost(job)} className="flex-1 text-xs font-medium px-3 py-2 rounded-xl glass-soft card-lift inline-flex items-center justify-center gap-1 disabled:opacity-45 disabled:cursor-not-allowed">{working ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />} Boost</button>
        )}
        {job.status === 'matched' || job.status === 'in_progress' ? (
          <button disabled={working} onClick={() => onConfirm({ type: 'complete', job })} className="flex-1 text-xs font-medium px-3 py-2 rounded-xl bg-sage/40 card-lift inline-flex items-center justify-center gap-1 disabled:opacity-50"><CheckCircle2 size={13} /> Complete</button>
        ) : (
          <button disabled={working} onClick={() => onConfirm({ type: 'cancel', job })} className="flex-1 text-xs font-medium px-3 py-2 rounded-xl glass-soft card-lift inline-flex items-center justify-center gap-1 text-terracotta disabled:opacity-50"><Ban size={13} /> {job.status === 'draft' ? 'Discard draft' : 'Cancel'}</button>
        )}
      </div>
    </div>
  );
}

function ConfirmAction({ title, body, confirmLabel, destructive, busy, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div className="glass w-full max-w-sm rounded-3xl p-5" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title" className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        <div className="mt-5 flex gap-2">
          <button disabled={busy} onClick={onCancel} className="flex-1 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold">Keep job</button>
          <button disabled={busy} onClick={onConfirm} className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white ${destructive ? 'bg-destructive' : 'bg-eucalyptus'}`}>{busy ? 'Updating…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
