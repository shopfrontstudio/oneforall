import React from 'react';

// Trades / service workbench photo with a light cream scrim so frosted-glass
// content and dark text stay readable. Used across the app, onboarding and auth.
const BG_IMAGE =
  'https://media.base44.com/images/public/6a7223fae756a363fe19f87d/e5d551908_generated_image.png';

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
            'linear-gradient(180deg, rgba(255,249,240,0.90) 0%, rgba(255,241,224,0.84) 55%, rgba(255,232,208,0.88) 100%)',
        }}
      />
      <div className="absolute inset-0 backdrop-blur-[2px]" />
    </div>
  );
}