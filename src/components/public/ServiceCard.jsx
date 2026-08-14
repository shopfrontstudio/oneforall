import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bug, Building2, CircleHelp, Droplets, Hammer, Paintbrush, Scissors, Sparkles, Trees, Trash2, Zap } from 'lucide-react';
import { CATEGORY_META_MAP, PATHWAY_LABELS, serviceAvailability } from '@/lib/catalogue';
import { PUBLIC_PATHS } from '@/lib/routes';

const ICONS = { cleaning: Sparkles, gardening: Trees, beauty: Scissors, handyman: Hammer, 'rubbish-removal': Trash2, 'pest-control': Bug, electrical: Zap, plumbing: Droplets, carpentry: Hammer, 'building-renovation': Building2, painting: Paintbrush, 'not-sure': CircleHelp };

export function CategoryIcon({ category, size = 22 }) {
  const Icon = ICONS[category] || Sparkles;
  return <Icon size={size} aria-hidden="true" />;
}

export default function ServiceCard({ service }) {
  const availability = serviceAvailability(service);
  return (
    <article className="glass-soft flex h-full min-w-0 flex-col rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sage/55 text-eucalyptus-deep"><CategoryIcon category={service.category} /></span>
        <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-terracotta">{CATEGORY_META_MAP[service.category]?.name}</p><h3 className="mt-0.5 text-base font-semibold">{service.name}</h3></div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{PATHWAY_LABELS[service.pathway]}</p>
      <div className="mt-3" role="status"><span className="inline-flex rounded-full bg-sandstone/60 px-2.5 py-1 text-xs font-semibold text-foreground/75">{availability === 'available' ? 'Accepting requests' : 'Not accepting public requests'}</span></div>
      <Link to={PUBLIC_PATHS.service(service.key)} className="mt-auto inline-flex items-center gap-1 pt-5 text-sm font-semibold text-eucalyptus-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25">View service boundaries <ArrowRight size={15} /></Link>
    </article>
  );
}
