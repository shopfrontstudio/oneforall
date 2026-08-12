import React from 'react';
import { Bug, Hammer, Scissors, Sparkles, Trees, Trash2 } from 'lucide-react';

// Distinct but brand-cohesive category accents keep the grid easy to scan.
const TRADE_STYLE = {
  gardening: { bg: 'linear-gradient(155deg,#d6f5df,#86d5a1)', ink: '#1f6038', motif: Trees },
  cleaning: { bg: 'linear-gradient(155deg,#d6f8f1,#83ddca)', ink: '#155f53', motif: Sparkles },
  beauty: { bg: 'linear-gradient(155deg,#ffd9e8,#f49fc1)', ink: '#71304c', motif: Scissors },
  handyman: { bg: 'linear-gradient(155deg,#ffe2cc,#f0ae78)', ink: '#683417', motif: Hammer },
  'rubbish-removal': { bg: 'linear-gradient(155deg,#e5e8f2,#bbc2d5)', ink: '#343b53', motif: Trash2 },
  'pest-control': { bg: 'linear-gradient(155deg,#fff1ad,#f7d447)', ink: '#594700', motif: Bug },
};

export default function CategoryTile({ category, active, onClick }) {
  const style = TRADE_STYLE[category.slug] || TRADE_STYLE.handyman;
  const Icon = style.motif;
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
