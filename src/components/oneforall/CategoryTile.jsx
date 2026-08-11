import React from 'react';
import { Zap, Droplets, Hammer, HardHat, PaintRoller, Trees, Sparkles, Wrench, HelpCircle } from 'lucide-react';

// 3D, designer category tiles. White raised base, sharp black label, and a
// tinted "stage" whose colour + motif resemble each trade (amber spark for
// electrical, steel-blue water for plumbing, wood-tone for carpentry…).
const ICONS = { Zap, Droplets, Hammer, HardHat, PaintRoller, Trees, Sparkles, Wrench, HelpCircle };

const TRADE_STYLE = {
  electrical: { bg: 'linear-gradient(160deg,#fbe7b6,#f3c969)', ink: '#7a4d00', motif: Zap },
  plumbing: { bg: 'linear-gradient(160deg,#d7e8f5,#a9cde4)', ink: '#1d4e6b', motif: Droplets },
  carpentry: { bg: 'linear-gradient(160deg,#ecd9bf,#d8b48f)', ink: '#5a3a17', motif: Hammer },
  building: { bg: 'linear-gradient(160deg,#e4e2df,#c5c2bc)', ink: '#3a3733', motif: HardHat },
  painting: { bg: 'linear-gradient(160deg,#f6d9c9,#eaa888)', ink: '#7a3a1c', motif: PaintRoller },
  gardening: { bg: 'linear-gradient(160deg,#dceccb,#b6d79a)', ink: '#345a1c', motif: Trees },
  cleaning: { bg: 'linear-gradient(160deg,#d9eef0,#a9d7da)', ink: '#1d4f54', motif: Sparkles },
  maintenance: { bg: 'linear-gradient(160deg,#e7e3dd,#c7c1b6)', ink: '#44403a', motif: Wrench },
  unsure: { bg: 'linear-gradient(160deg,#efe9da,#d8cfa9)', ink: '#5a5117', motif: HelpCircle },
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