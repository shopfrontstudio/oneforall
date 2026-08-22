import React from 'react';

// Porcelain Grove: a clean neutral canvas with restrained eucalyptus and coral atmosphere.
const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.78' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E\")";

const CONTOURS =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='420' viewBox='0 0 640 420'%3E%3Cg fill='none' stroke='%23184f40' stroke-opacity='.10' stroke-width='1'%3E%3Cpath d='M-80 76C56 8 111 145 249 84S469 21 721 91'/%3E%3Cpath d='M-63 111C71 42 121 176 258 119S469 55 701 124'/%3E%3Cpath d='M-41 146C83 79 137 207 270 154S481 94 682 158'/%3E%3C/g%3E%3C/svg%3E\")";

export default function BrandBackground() {
  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(145deg, #ffffff 0%, #f5f8f7 50%, #eef5f2 100%)' }}
      />
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(72% 60% at 2% 2%, rgba(24,79,64,0.12), transparent 64%), radial-gradient(68% 58% at 98% 96%, rgba(245,106,69,0.13), transparent 66%), radial-gradient(48% 42% at 70% -2%, rgba(252,226,161,0.18), transparent 72%)' }}
      />
      <div
        className="absolute inset-0"
        style={{ backgroundImage: CONTOURS, backgroundRepeat: 'repeat-x', backgroundPosition: 'center top', backgroundSize: 'min(840px, 86vw) auto', opacity: 0.42 }}
      />
      <div
        className="absolute inset-0"
        style={{ backgroundImage: NOISE, backgroundSize: '180px 180px', opacity: 0.04, mixBlendMode: 'multiply' }}
      />
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(112% 98% at 50% 42%, transparent 60%, rgba(19,40,32,0.055) 100%)' }}
      />
    </div>
  );
}
