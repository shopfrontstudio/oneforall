import React from 'react';

// Layered brand atmosphere built from lightweight CSS gradients and SVG grain.
const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export default function BrandBackground() {
  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(145deg, #fbfaff 0%, #f1effb 48%, #e7e5f5 100%)' }}
      />
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(70% 55% at 8% 4%, rgba(245,106,81,0.18), transparent 66%), radial-gradient(65% 55% at 92% 8%, rgba(98,76,220,0.24), transparent 68%), radial-gradient(55% 50% at 52% 100%, rgba(67,199,168,0.13), transparent 70%)' }}
      />
      <div
        className="absolute inset-0"
        style={{ backgroundImage: NOISE, backgroundSize: '180px 180px', opacity: 0.035, mixBlendMode: 'multiply' }}
      />
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(110% 95% at 50% 42%, transparent 58%, rgba(29,27,69,0.10) 100%)' }}
      />
    </div>
  );
}
