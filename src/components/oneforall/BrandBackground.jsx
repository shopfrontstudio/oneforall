import React from 'react';

export default function BrandBackground() {
  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-background" />
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(48% 34% at 98% 2%, rgba(245,106,69,0.055), transparent 76%), radial-gradient(42% 30% at 0% 74%, rgba(24,79,64,0.035), transparent 78%)' }}
      />
    </div>
  );
}
