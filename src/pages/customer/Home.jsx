import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { ArrowRight, ChevronRight, Search } from 'lucide-react';
import CategoryGrid from '@/components/oneforall/CategoryGrid';
import TradieCard from '@/components/oneforall/TradieCard';
import JobCard from '@/components/oneforall/JobCard';
import { SectionTitle, EmptyState } from '@/components/oneforall/Bits';
import { pseudoDistance } from '@/lib/oneforall';

export default function CustomerHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState(null);
  const [tradies, setTradies] = useState(null);
  const [quickProblem, setQuickProblem] = useState('');
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let activeRequest = true;
    Promise.all([
      base44.entities.Job.filter({ customer_id: user.id }),
      base44.entities.TradieProfile.filter({ verified: true }),
    ]).then(([jobList, tradieList]) => {
      if (!activeRequest) return;
      setJobs(jobList);
      setTradies(tradieList);
      setLoadError(false);
    }).catch(() => {
      if (!activeRequest) return;
      setJobs([]);
      setTradies([]);
      setLoadError(true);
    });
    return () => { activeRequest = false; };
  }, [user.id]);

  const startQuickPost = (event) => {
    event.preventDefault();
    const problem = quickProblem.trim();
    navigate(problem ? `/post-job?problem=${encodeURIComponent(problem)}` : '/post-job');
  };

  const active = (jobs || []).filter(j => ['published', 'matched', 'in_progress'].includes(j.status));
  const origin = 'Ballarat';
  const nearby = [...(tradies || [])]
    .sort((a, b) => pseudoDistance(origin, a.suburb) - pseudoDistance(origin, b.suburb))
    .slice(0, 4);

  return (
    <div className="space-y-7">
      <section className="home-hero">
        <span className="home-hero-glow" />
        <p className="text-[11px] font-semibold text-terracotta uppercase tracking-[0.18em]">
          G'day {user.full_name?.split(' ')[0] || 'there'}
        </p>
        <h1 className="text-[26px] sm:text-[32px] font-semibold tracking-tight text-foreground mt-1 text-balance">
          Need something fixed, built or transformed?
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-md">Tell us what you need. We’ll guide the details and notify suitable verified tradies.</p>
        <form onSubmit={startQuickPost} className="quick-post mt-5" aria-label="Start a job post">
          <Search size={18} className="quick-post-icon" aria-hidden="true" />
          <input
            value={quickProblem}
            onChange={(event) => setQuickProblem(event.target.value)}
            placeholder="e.g. My kitchen tap is leaking"
            aria-label="What needs doing?"
          />
          <button type="submit" aria-label="Continue to post job"><ArrowRight size={19} /></button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">Free to post · no commission · usually under a minute</p>
      </section>

      {loadError && (
        <div className="rounded-2xl border border-terracotta/20 bg-white/80 px-4 py-3 text-sm text-foreground/75" role="status">
          Some live results could not be loaded. You can still post a job.
        </div>
      )}

      {active.length > 0 && (
        <section>
          <SectionTitle action={<Link to="/my-jobs" className="text-xs text-eucalyptus-deep font-medium inline-flex items-center">View all <ChevronRight size={14} /></Link>}>
            Active jobs
          </SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {active.slice(0, 2).map(j => <JobCard key={j.id} job={j} to={`/job/${j.id}`} />)}
          </div>
        </section>
      )}

      <section>
        <SectionTitle>Browse services</SectionTitle>
        <CategoryGrid onSelect={(slug) => navigate(`/post-job?category=${slug}`)} />
      </section>

      <section>
        <SectionTitle action={<span className="inline-flex items-center gap-1 text-xs text-muted-foreground">Fastest to you</span>}>
          Nearby tradies
        </SectionTitle>
        {tradies === null ? (
          <SkeletonGrid />
        ) : tradies.length === 0 ? (
          <EmptyState title="Tradie profiles coming soon" body="Ballarat's founding tradies are being verified." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {nearby.map(t => <TradieCard key={t.id} tradie={t} origin={origin} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {[0, 1, 2, 3].map(i => <div key={i} className="glass-soft rounded-2xl h-20 animate-pulse" />)}
    </div>
  );
}
