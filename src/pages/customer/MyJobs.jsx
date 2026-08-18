import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Ban, Briefcase, Pencil } from 'lucide-react';
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

  const cancelRequest = async (job, reason, idempotencyKey) => {
    setWorkingId(job.id);
    try {
      await callFunction('transition-request', { job_id: job.id, to_state: 'cancelled', reason: reason.trim(), idempotency_key: idempotencyKey });
      toast({ title: job.status === 'draft' ? 'Draft closed' : 'Request cancelled' });
      await load();
      setConfirmAction(null);
    } catch (error) {
      toast({ title: 'Could not update request', description: error.message, variant: 'destructive' });
    } finally {
      setWorkingId(null);
    }
  };

  if (jobs === null) return <div className="glass-soft h-40 rounded-2xl" role="status" aria-label="Loading requests and bookings" />;
  if (!jobs.length) return <EmptyState icon={Briefcase} title="No requests yet" body="Choose any service and send the details for a private availability and scope check." action={<Link to="/services" className="bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold btn-tactile inline-flex items-center gap-2"><Plus size={16} /> Request a service</Link>} />;

  const open = jobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled');
  const closed = jobs.filter(j => j.status === 'completed' || j.status === 'cancelled');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Bookings</h1>
        <Link to="/services" className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold btn-tactile inline-flex items-center gap-1.5"><Plus size={16} /> Services</Link>
      </div>
      <p className="rounded-xl border border-border bg-white/65 p-3 text-sm text-muted-foreground" role="status">This page keeps service requests and their resulting bookings together. Booking progress is recorded by the attending provider; contact support through Messages if something is wrong.</p>
      {open.length > 0 && <section aria-labelledby="current-bookings"><h2 id="current-bookings" className="mb-2 text-sm font-semibold">Current requests and bookings</h2><div className="grid gap-3 sm:grid-cols-2">{open.map(j => <JobActions key={j.id} job={j} onConfirm={setConfirmAction} working={workingId === j.id} />)}</div></section>}
      {closed.length > 0 && (<section aria-labelledby="booking-history"><h2 id="booking-history" className="mb-2 text-sm font-semibold text-muted-foreground">Booking history</h2><div className="grid gap-3 opacity-70 sm:grid-cols-2">{closed.map(j => <JobCard key={j.id} job={j} />)}</div></section>)}
      {confirmAction && (
        <ConfirmAction
          title={confirmAction.type === 'discard' ? 'Close this draft?' : 'Cancel this request?'}
          body={confirmAction.type === 'discard' ? 'This closes the saved draft without deleting its audit history.' : 'This closes the unbooked request. Confirmed bookings must be handled from their booking and support pathway.'}
          confirmLabel={confirmAction.type === 'discard' ? 'Close draft' : 'Cancel request'}
          destructive
          busy={workingId === confirmAction.job.id}
          reason={confirmAction.reason}
          onReasonChange={(reason) => setConfirmAction((current) => ({ ...current, reason }))}
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => cancelRequest(confirmAction.job, confirmAction.reason, confirmAction.idempotencyKey)}
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
        {['draft', 'manual_review', 'submitted', 'published'].includes(job.status) ? (
          <button disabled={working} onClick={() => onConfirm({ type: job.status === 'draft' ? 'discard' : 'cancel', job, reason: '', idempotencyKey: crypto.randomUUID() })} className="flex-1 text-xs font-medium px-3 py-2 rounded-xl glass-soft card-lift inline-flex items-center justify-center gap-1 text-terracotta disabled:opacity-50"><Ban size={13} /> {job.status === 'draft' ? 'Discard draft' : 'Cancel'}</button>
        ) : <Link to={`/booking/${job.id}`} className="flex-1 rounded-xl bg-sage/40 px-3 py-2 text-center text-xs font-medium">View booking</Link>}
      </div>
    </div>
  );
}

function ConfirmAction({ title, body, confirmLabel, destructive, busy, reason, onReasonChange, onCancel, onConfirm }) {
  const reasonValid = reason.trim().length >= 10;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div className="glass w-full max-w-sm rounded-3xl p-5" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title" className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        <label htmlFor="request-cancellation-reason" className="mt-4 block text-sm font-semibold">Reason (required)</label>
        <textarea id="request-cancellation-reason" value={reason} onChange={(event) => onReasonChange(event.target.value)} minLength={10} maxLength={1000} required autoFocus rows={3} className="inp mt-2" placeholder="Briefly explain why you are closing this request." />
        <p className="mt-1 text-xs text-muted-foreground">At least 10 characters. This is kept in the request audit history.</p>
        <div className="mt-5 flex gap-2">
          <button disabled={busy} onClick={onCancel} className="flex-1 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold">Keep request</button>
          <button disabled={busy || !reasonValid} onClick={onConfirm} className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${destructive ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'}`}>{busy ? 'Updating…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
