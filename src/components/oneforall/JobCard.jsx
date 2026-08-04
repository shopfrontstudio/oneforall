import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Clock, DollarSign, Zap, BadgeCheck, ShieldCheck } from 'lucide-react';
import { formatAUDRange, JOB_STATUS_LABEL, URGENCY_LABEL } from '@/lib/oneforall';
import { MatchBadge, StatusBadge } from './Bits';

export default function JobCard({ job, tradie, score, to }) {
  const dist = tradie ? null : null;
  return (
    <Link to={to || `/job/${job.id}`} className="glass-soft rounded-2xl p-4 block btn-tactile hover:bg-white/80">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-eucalyptus/10 text-eucalyptus-deep font-medium">{job.category_name || job.category_slug}</span>
            {job.boosted && <span className="text-[11px] px-2 py-0.5 rounded-full bg-lime/25 text-eucalyptus-deep font-semibold">Boosted</span>}
            <StatusBadge status={job.status} label={JOB_STATUS_LABEL[job.status] || job.status} tone={job.status === 'completed' ? 'sage' : job.status === 'matched' || job.status === 'in_progress' ? 'lime' : 'mist'} />
          </div>
          <h3 className="font-semibold text-sm text-foreground mt-1.5 line-clamp-1">{job.title}</h3>
        </div>
        {score != null && <MatchBadge score={score} />}
      </div>
      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{job.description}</p>
      <div className="flex items-center gap-3 mt-2.5 text-xs text-muted-foreground flex-wrap">
        <span className="inline-flex items-center gap-1"><MapPin size={12} />{job.suburb}</span>
        <span className="inline-flex items-center gap-1"><Clock size={12} />{URGENCY_LABEL[job.urgency] || 'Flexible'}</span>
        <span className="inline-flex items-center gap-1 font-semibold text-eucalyptus-deep"><DollarSign size={12} />{formatAUDRange(job.indicative_low, job.indicative_high)}</span>
      </div>
    </Link>
  );
}