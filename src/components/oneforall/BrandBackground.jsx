import React from 'react';

// Grainy off-white plaster wall, dimmed and vignetted as if lit at night.
// No heavy image — pure CSS gradient + SVG noise so it stays crisp and fast.
const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export default function BrandBackground() {
  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden">
      {/* base greige wall, dimming downward */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, #e8e3da 0%, #d6d0c4 52%, #bcb5a8 100%)' }}
      />
      {/* soft off-white light spilling from above */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(120% 75% at 50% -12%, rgba(255,253,247,0.55), transparent 60%)' }}
      />
      {/* gritty grain */}
      <div
        className="absolute inset-0"
        style={{ backgroundImage: NOISE, backgroundSize: '180px 180px', opacity: 0.05, mixBlendMode: 'overlay' }}
      />
      {/* night vignette */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(100% 100% at 50% 45%, transparent 55%, rgba(38,34,28,0.20) 100%)' }}
      />
    </div>
  );
}