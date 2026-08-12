import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Ban, CheckCircle2, Briefcase, Pencil } from 'lucide-react';
import JobCard from '@/components/oneforall/JobCard';
import { EmptyState } from '@/components/oneforall/Bits';
import { callFunction } from '@/lib/oneforall';

export default function MyJobs() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [jobs, setJobs] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [workingId, setWorkingId] = useState(null);

  const load = useCallback(async () => {
    const list = await base44.entities.Job.filter({ customer_id: user.id });
    setJobs(list.sort((a, b) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime()));
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (job, status) => {
    setWorkingId(job.id);
    try {
      if (status === 'completed') {
        await callFunction('transition-booking', { job_id: job.id, to_state: 'completed', idempotency_key: crypto.randomUUID() });
      } else {
        await callFunction('transition-request', { job_id: job.id, to_state: 'cancelled', idempotency_key: crypto.randomUUID() });
      }
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
  if (!jobs.length) return <EmptyState icon={Briefcase} title="No bookings yet" body="Explore the service catalogue. Public requests remain closed during the founding phase." action={<Link to="/services" className="bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold btn-tactile inline-flex items-center gap-2"><Plus size={16} /> Browse services</Link>} />;

  const open = jobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled');
  const closed = jobs.filter(j => j.status === 'completed' || j.status === 'cancelled');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Bookings</h1>
        <Link to="/services" className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold btn-tactile inline-flex items-center gap-1.5"><Plus size={16} /> Services</Link>
      </div>
      {open.length > 0 && <div className="grid sm:grid-cols-2 gap-3">{open.map(j => <JobActions key={j.id} job={j} onConfirm={setConfirmAction} working={workingId === j.id} />)}</div>}
      {closed.length > 0 && (<div><h2 className="text-sm font-semibold text-muted-foreground mb-2">Closed</h2><div className="grid sm:grid-cols-2 gap-3 opacity-70">{closed.map(j => <JobCard key={j.id} job={j} />)}</div></div>)}
      {confirmAction && (
        <ConfirmAction
          title={confirmAction.type === 'complete' ? 'Mark this job complete?' : confirmAction.type === 'discard' ? 'Discard this draft?' : 'Cancel this job?'}
          body={confirmAction.type === 'complete' ? 'This closes the job and enables the review step.' : confirmAction.type === 'discard' ? 'This closes the saved draft without deleting its audit history.' : 'Providers will no longer see this job. This cannot be reopened.'}
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

function JobActions({ job, onConfirm, working }) {
  return (
    <div className="space-y-2">
      <JobCard job={job} to={job.status === 'draft' ? '/services' : undefined} />
      <div className="flex gap-2">
        {job.status === 'draft' ? (
          <Link to="/services" className="flex-1 text-xs font-medium px-3 py-2 rounded-xl glass-soft card-lift inline-flex items-center justify-center gap-1"><Pencil size={13} /> Review services</Link>
        ) : <span className="flex-1" />}
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
