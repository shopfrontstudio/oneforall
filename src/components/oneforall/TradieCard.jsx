import React from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, MapPin } from 'lucide-react';
import { pseudoDistance } from '@/lib/oneforall';
import { StarRating } from './Bits';

export default function TradieCard({ tradie, origin = 'Ballarat' }) {
  const dist = pseudoDistance(origin, tradie.suburb);
  const initials = (tradie.full_name || '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
  return (
    <Link to={`/tradie/${tradie.id}`} className="glass-soft rounded-2xl p-4 flex gap-3 card-lift hover:bg-white/80 block">
      <div className="w-12 h-12 rounded-xl bg-eucalyptus text-white flex items-center justify-center font-semibold text-sm shrink-0">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <h3 className="font-semibold text-sm text-foreground truncate">{tradie.business_name || tradie.full_name}</h3>
          {tradie.verified && <BadgeCheck size={15} className="text-eucalyptus shrink-0" />}
          {tradie.founding_badge && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-lime/25 text-eucalyptus-deep font-semibold">Founding</span>}
        </div>
        <p className="text-xs text-muted-foreground truncate">{(tradie.trade_categories || []).join(' · ') || 'Multi-trade'}</p>
        <div className="flex items-center gap-3 mt-1.5">
          <StarRating value={tradie.rating_avg} count={tradie.rating_count} />
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><MapPin size={12} />{dist.toFixed(0)} km</span>
        </div>
      </div>
    </Link>
  );
}
