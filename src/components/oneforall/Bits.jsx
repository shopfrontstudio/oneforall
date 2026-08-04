import React from 'react';
import { Star } from 'lucide-react';

export function StarRating({ value = 0, count, size = 14 }) {
  return (
    <div className="inline-flex items-center gap-1">
      <div className="flex">
        {[1, 2, 3, 4, 5].map(i => (
          <Star key={i} size={size} className={i <= Math.round(value) ? 'fill-terracotta text-terracotta' : 'text-muted-foreground/40'} />
        ))}
      </div>
      {count != null && <span className="text-xs text-muted-foreground">({count})</span>}
    </div>
  );
}

export function MatchBadge({ score }) {
  const tone = score >= 85 ? 'bg-lime/20 text-eucalyptus-deep' : score >= 72 ? 'bg-sage/40 text-eucalyptus-deep' : 'bg-mist-soft text-mist';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${tone}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" /> {score}% match
    </span>
  );
}

export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="glass-soft rounded-3xl p-10 text-center flex flex-col items-center">
      {Icon && <div className="w-14 h-14 rounded-2xl bg-sage/30 flex items-center justify-center mb-4"><Icon className="text-eucalyptus-deep" size={26} /></div>}
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      {body && <p className="text-sm text-muted-foreground mt-1 max-w-sm">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SectionTitle({ children, action }) {
  return (
    <div className="flex items-center justify-between mb-3 mt-1">
      <h2 className="text-base font-semibold tracking-tight text-foreground">{children}</h2>
      {action}
    </div>
  );
}

export function StatusBadge({ status, label, tone = 'mist' }) {
  const tones = {
    mist: 'bg-mist-soft text-eucalyptus-deep',
    lime: 'bg-lime/20 text-eucalyptus-deep',
    sage: 'bg-sage/40 text-eucalyptus-deep',
    terracotta: 'bg-terracotta/15 text-terracotta',
  };
  return <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${tones[tone] || tones.mist}`}>{label}</span>;
}