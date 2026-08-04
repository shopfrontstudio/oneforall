import React from 'react';
import { Zap, Droplets, Hammer, HardHat, PaintRoller, Trees, Sparkles, Wrench, HelpCircle } from 'lucide-react';
import { CATEGORIES } from '@/lib/oneforall';

const ICONS = { Zap, Droplets, Hammer, HardHat, PaintRoller, Trees, Sparkles, Wrench, HelpCircle };
const TINTS = {
  terracotta: 'from-terracotta/25 to-terracotta/5 text-terracotta',
  mist: 'from-mist/30 to-mist/5 text-eucalyptus-deep',
  sandstone: 'from-sandstone-deep/30 to-sandstone/5 text-eucalyptus-deep',
  eucalyptus: 'from-eucalyptus/25 to-eucalyptus/5 text-eucalyptus-deep',
  sage: 'from-sage/40 to-sage/10 text-eucalyptus-deep',
  lime: 'from-lime/25 to-lime/5 text-eucalyptus-deep',
};

export default function CategoryGrid({ onSelect }) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {CATEGORIES.map(c => {
        const Icon = ICONS[c.icon] || HelpCircle;
        return (
          <button
            key={c.slug}
            onClick={() => onSelect?.(c.slug)}
            className="glass-soft rounded-2xl p-3 flex flex-col items-center gap-2 btn-tactile hover:bg-white/80"
          >
            <span className={`w-11 h-11 rounded-xl bg-gradient-to-b ${TINTS[c.tint]} flex items-center justify-center`}>
              <Icon size={20} />
            </span>
            <span className="text-[11px] font-medium text-center leading-tight text-foreground/80">{c.name}</span>
          </button>
        );
      })}
    </div>
  );
}