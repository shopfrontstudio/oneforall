import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { Plus, Briefcase, Sparkles, ChevronRight, MapPin } from 'lucide-react';
import CategoryGrid from '@/components/oneforall/CategoryGrid';
import TradieCard from '@/components/oneforall/TradieCard';
import JobCard from '@/components/oneforall/JobCard';
import { SectionTitle, EmptyState } from '@/components/oneforall/Bits';
import { pseudoDistance } from '@/lib/oneforall';

export default function CustomerHome() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState(null);
  const [tradies, setTradies] = useState(null);

  useEffect(() => {
    base44.entities.Job.filter({ customer_id: user.id }).then(setJobs).catch(() => setJobs([]));
    base44.entities.TradieProfile.filter({ verified: true }).then(setTradies).catch(() => setTradies([]));
  }, [user.id]);

  const active = (jobs || []).filter(j => ['published', 'matched', 'in_progress'].includes(j.status));
  const origin = 'Ballarat';
  const nearby = [...(tradies || [])].sort((a, b) => pseudoDistance(origin, a.suburb) - pseudoDistance(origin, b.suburb)).slice(0, 4);
  const topRated = [...(tradies || [])].sort((a, b) => (b.rating_avg || 0) - (a.rating_avg || 0)).slice(0, 4);

  return (
    <div className="space-y-6">
      <section className="glass rounded-3xl p-5 sm:p-6 relative overflow-hidden">
        <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-lime/30 blur-2xl" />
        <p className="text-xs font-semibold text-terracotta uppercase tracking-wider">G'day {user.full_name?.split(' ')[0] || 'there'} 👋</p>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground mt-1 text-balance">Need something fixed, built or transformed?</h1>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-md">Post a job in minutes — verified Ballarat tradies come to you. No commission, ever.</p>
        <Link to="/post-job" className="mt-4 inline-flex items-center gap-2 bg-eucalyptus text-white px-5 py-3 rounded-2xl font-semibold btn-tactile">
          <Plus size={18} /> Post a job — it's free
        </Link>
      </section>

      {active.length > 0 && (
        <section>
          <SectionTitle action={<Link to="/my-jobs" className="text-xs text-eucalyptus-deep font-medium inline-flex items-center">View all <ChevronRight size={14} /></Link>}>Active jobs</SectionTitle>
          <div className="grid sm:grid-cols-2 gap-3">
            {active.slice(0, 2).map(j => <JobCard key={j.id} job={j} to={`/job/${j.id}`} />)}
          </div>
        </section>
      )}

      <section>
        <SectionTitle>Browse services</SectionTitle>
        <CategoryGrid onSelect={(slug) => window.location.assign(`/post-job?category=${slug}`)} />
      </section>

      <section>
        <SectionTitle action={<span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Sparkles size={13} /> Available now</span>}>Recommended nearby tradies</SectionTitle>
        {tradies === null ? <SkeletonGrid /> : tradies.length === 0 ? <EmptyState title="Tradie profiles coming soon" body="Ballarat's founding tradies are being verified." /> : (
          <div className="grid sm:grid-cols-2 gap-3">{nearby.map(t => <TradieCard key={t.id} tradie={t} origin={origin} />)}</div>
        )}
      </section>

      {topRated.length > 0 && (
        <section>
          <SectionTitle>Top-rated in Ballarat</SectionTitle>
          <div className="grid sm:grid-cols-2 gap-3">{topRated.map(t => <TradieCard key={t.id} tradie={t} origin={origin} />)}</div>
        </section>
      )}

      <section>
        <SectionTitle>Closest to you</SectionTitle>
        {nearby.length ? (
          <div className="glass-soft rounded-2xl divide-y divide-border/60">
            {nearby.map(t => (
              <Link key={t.id} to={`/tradie/${t.id}`} className="flex items-center justify-between p-3.5 hover:bg-white/60">
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin size={15} className="text-terracotta shrink-0" />
                  <span className="font-medium text-sm truncate">{t.business_name || t.full_name}</span>
                </div>
                <span className="text-xs text-muted-foreground">{pseudoDistance(origin, t.suburb).toFixed(0)} km</span>
              </Link>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">No nearby tradies yet.</p>}
      </section>
    </div>
  );
}

function SkeletonGrid() {
  return <div className="grid sm:grid-cols-2 gap-3">{[0, 1, 2, 3].map(i => <div key={i} className="glass-soft rounded-2xl h-20 animate-pulse" />)}</div>;
}