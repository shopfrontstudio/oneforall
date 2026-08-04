import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Zap, Ban, CheckCircle2, Briefcase } from 'lucide-react';
import JobCard from '@/components/oneforall/JobCard';
import { EmptyState } from '@/components/oneforall/Bits';

export default function MyJobs() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [jobs, setJobs] = useState(null);
  const [boosts, setBoosts] = useState(0);

  const load = useCallback(async () => {
    const list = await base44.entities.Job.filter({ customer_id: user.id });
    setJobs(list.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const allBoosts = await base44.entities.Boost.filter({ customer_id: user.id });
    setBoosts(allBoosts.filter(b => new Date(b.created_date) >= monthStart).length);
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  const freeLeft = Math.max(0, 5 - boosts);

  const boost = async (job) => {
    if (freeLeft <= 0) { toast({ title: 'No free boosts left', description: 'Extra boosts are $4.99 — demo billing only.', variant: 'destructive' }); return; }
    const last = await base44.entities.Boost.filter({ job_id: job.id });
    if (last.length) { const latest = last.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0]; if (Date.now() - new Date(latest.created_date) < 12 * 3600e3) { toast({ title: 'Boosted recently', description: 'One boost per job every 12 hours.', variant: 'destructive' }); return; } }
    await base44.entities.Boost.create({ job_id: job.id, customer_id: user.id, type: 'free' });
    await base44.entities.Job.update(job.id, { boosted: true });
    toast({ title: 'Job boosted', description: `${freeLeft - 1} free boosts left this month.` });
    load();
  };

  const cancel = async (job) => { await base44.entities.Job.update(job.id, { status: 'cancelled' }); toast({ title: 'Job cancelled' }); load(); };
  const complete = async (job) => { await base44.entities.Job.update(job.id, { status: 'completed' }); toast({ title: 'Marked complete' }); load(); };

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
      {open.length > 0 && <div className="grid sm:grid-cols-2 gap-3">{open.map(j => <JobActions key={j.id} job={j} onBoost={boost} onCancel={cancel} onComplete={complete} canBoost={freeLeft > 0} />)}</div>}
      {closed.length > 0 && (<div><h2 className="text-sm font-semibold text-muted-foreground mb-2">Closed</h2><div className="grid sm:grid-cols-2 gap-3 opacity-70">{closed.map(j => <JobCard key={j.id} job={j} />)}</div></div>)}
    </div>
  );
}

function JobActions({ job, onBoost, onCancel, onComplete, canBoost }) {
  return (
    <div className="space-y-2">
      <JobCard job={job} />
      <div className="flex gap-2">
        <button onClick={() => onBoost(job)} className="flex-1 text-xs font-medium px-3 py-2 rounded-xl glass-soft btn-tactile inline-flex items-center justify-center gap-1"><Zap size={13} /> Boost</button>
        {job.status === 'matched' || job.status === 'in_progress' ? (
          <button onClick={() => onComplete(job)} className="flex-1 text-xs font-medium px-3 py-2 rounded-xl bg-sage/40 btn-tactile inline-flex items-center justify-center gap-1"><CheckCircle2 size={13} /> Complete</button>
        ) : (
          <button onClick={() => onCancel(job)} className="flex-1 text-xs font-medium px-3 py-2 rounded-xl glass-soft btn-tactile inline-flex items-center justify-center gap-1 text-terracotta"><Ban size={13} /> Cancel</button>
        )}
      </div>
    </div>
  );
}