import React from 'react';
import { Zap, Droplets, Hammer, HardHat, PaintRoller, Trees, Sparkles, Wrench, HelpCircle } from 'lucide-react';

// Distinct but brand-cohesive category accents keep the grid easy to scan.
const ICONS = { Zap, Droplets, Hammer, HardHat, PaintRoller, Trees, Sparkles, Wrench, HelpCircle };

const TRADE_STYLE = {
  electrical: { bg: 'linear-gradient(155deg,#fff1ad,#f7d447)', ink: '#594700', motif: Zap },
  plumbing: { bg: 'linear-gradient(155deg,#d8efff,#8bc9f2)', ink: '#184b70', motif: Droplets },
  carpentry: { bg: 'linear-gradient(155deg,#ffe2cc,#f0ae78)', ink: '#683417', motif: Hammer },
  building: { bg: 'linear-gradient(155deg,#e7e5ff,#bdb8f4)', ink: '#373078', motif: HardHat },
  painting: { bg: 'linear-gradient(155deg,#ffd9e8,#f49fc1)', ink: '#71304c', motif: PaintRoller },
  gardening: { bg: 'linear-gradient(155deg,#d6f5df,#86d5a1)', ink: '#1f6038', motif: Trees },
  cleaning: { bg: 'linear-gradient(155deg,#d6f8f1,#83ddca)', ink: '#155f53', motif: Sparkles },
  maintenance: { bg: 'linear-gradient(155deg,#e5e8f2,#bbc2d5)', ink: '#343b53', motif: Wrench },
  unsure: { bg: 'linear-gradient(155deg,#eee6ff,#cbb9f5)', ink: '#49347c', motif: HelpCircle },
};

export default function CategoryTile({ category, active, onClick }) {
  const style = TRADE_STYLE[category.slug] || TRADE_STYLE.unsure;
  const Icon = style.motif || ICONS[category.icon] || HelpCircle;
  return (
    <button
      type="button"
      onClick={() => onClick?.(category.slug)}
      className={`cat-tile ${active ? 'cat-tile-active' : ''}`}
    >
      <span className="cat-stage" style={{ backgroundImage: style.bg, color: style.ink }}>
        <Icon size={22} strokeWidth={2.1} />
      </span>
      <span className="cat-label">{category.name}</span>
    </button>
  );
}
