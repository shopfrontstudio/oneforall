import React from 'react';

// Warm Australian sunrise photo with a light cream scrim so frosted-glass
// content and dark text stay readable. Used across the app, onboarding and auth.
const BG_IMAGE =
  'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=2000&q=80';

export default function BrandBackground() {
  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url('${BG_IMAGE}')` }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,249,240,0.84) 0%, rgba(255,241,224,0.74) 55%, rgba(255,232,208,0.80) 100%)',
        }}
      />
      <div className="absolute inset-0 backdrop-blur-[1px]" />
    </div>
  );
}