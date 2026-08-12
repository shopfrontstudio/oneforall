import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Zap, Ban, CheckCircle2, Briefcase, Pencil, Loader2 } from 'lucide-react';
import JobCard from '@/components/oneforall/JobCard';
import { EmptyState } from '@/components/oneforall/Bits';
import { callFunction } from '@/lib/oneforall';

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
      // boost-job enforces the monthly allowance, the 12-hour per-job cooldown and
      // job ownership server-side, and refuses to spend a boost that reaches nobody.
      const result = await callFunction('boost-job', { job_id: job.id });
      toast({ title: 'Job boosted', description: `${result.notified} matching tradie${result.notified === 1 ? '' : 's'} notified · ${result.remaining} free boosts left.` });
      await load();
    } catch (error) {
      toast({ title: 'Could not boost job', description: error.message, variant: 'destructive' });
    } finally {
      setWorkingId(null);
    }
  };

  const updateStatus = async (job, status) => {
    setWorkingId(job.id);
    try {
      if (status === 'discarded') await base44.entities.Job.delete(job.id);
      else await base44.entities.Job.update(job.id, { status });
      toast({ title: status === 'completed' ? 'Job marked complete' : status === 'discarded' ? 'Draft discarded' : 'Job cancelled' });
      await load();
    } catch (error) {
      toast({ title: 'Could not update job', description: error.message, variant: 'destructive' });
    } finally {
      setWorkingId(null);
      setConfirmAction(null);
    }
  };

  if (jobs === null) return <div className="glass-soft rounded-2xl h-40 animate-pulse" />;
  if (!jobs.length) return <EmptyState icon={Briefcase} title="No jobs yet" body="Post your first job and verified Ballarat tradies will come to you." action={<Link to="/post-job" className="bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold btn-tactile inline-flex items-center gap-2"><Plus size={16} /> Post a job</Link>} />;

  const open = jobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled');
  const closed = jobs.filter(j => j.status === 'completed' || j.status === 'cancelled');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">My jobs</h1>
        <Link to="/post-job" className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold btn-tactile inline-flex items-center gap-1.5"><Plus size={16} /> New</Link>
      </div>
      <div className="glass-soft rounded-2xl p-3 flex items-center gap-2 text-sm">
        <Zap size={16} className="text-terracotta" />
        <span className="text-foreground/80"><b className="text-eucalyptus-deep">{freeLeft}</b> free boosts left this month</span>
      </div>
      {open.length > 0 && <div className="grid sm:grid-cols-2 gap-3">{open.map(j => <JobActions key={j.id} job={j} onBoost={boost} onConfirm={setConfirmAction} working={workingId === j.id} canBoost={freeLeft > 0} />)}</div>}
      {closed.length > 0 && (<div><h2 className="text-sm font-semibold text-muted-foreground mb-2">Closed</h2><div className="grid sm:grid-cols-2 gap-3 opacity-70">{closed.map(j => <JobCard key={j.id} job={j} />)}</div></div>)}
      {confirmAction && (
        <ConfirmAction
          title={confirmAction.type === 'complete' ? 'Mark this job complete?' : confirmAction.type === 'discard' ? 'Discard this draft?' : 'Cancel this job?'}
          body={confirmAction.type === 'complete' ? 'This closes the job and enables the review step.' : confirmAction.type === 'discard' ? 'This permanently removes the saved draft.' : 'Tradies will no longer see this job. This cannot be reopened.'}
          confirmLabel={confirmAction.type === 'complete' ? 'Mark complete' : confirmAction.type === 'discard' ? 'Discard draft' : 'Cancel job'}
          destructive={confirmAction.type !== 'complete'}
          busy={workingId === confirmAction.job.id}
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => updateStatus(confirmAction.job, confirmAction.type === 'complete' ? 'completed' : confirmAction.type === 'discard' ? 'discarded' : 'cancelled')}
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
          <button disabled={working} onClick={() => onConfirm({ type: job.status === 'draft' ? 'discard' : 'cancel', job })} className="flex-1 text-xs font-medium px-3 py-2 rounded-xl glass-soft card-lift inline-flex items-center justify-center gap-1 text-terracotta disabled:opacity-50"><Ban size={13} /> {job.status === 'draft' ? 'Discard draft' : 'Cancel'}</button>
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
          <button disabled={busy} onClick={onConfirm} className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold ${destructive ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'}`}>{busy ? 'Updating…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
