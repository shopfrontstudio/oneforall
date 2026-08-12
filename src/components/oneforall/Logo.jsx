import React from 'react';

export default function Logo({ size = 40, className = '' }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={className} aria-label="OneForAll" role="img">
      <defs>
        <linearGradient id="ofa-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="hsl(var(--primary))" />
          <stop offset="1" stopColor="hsl(var(--terracotta))" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="14" fill="url(#ofa-g)" />
      <path d="M14 35 C 14 23, 30 23, 30 31" fill="none" stroke="hsl(var(--lime))" strokeWidth="3" strokeLinecap="round" opacity="0.95" />
      <path d="M19 12 L19 36" stroke="white" strokeWidth="4.2" strokeLinecap="round" />
      <path d="M15 16 L19 12 L23 16" fill="none" stroke="white" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="30" cy="31" r="3.4" fill="hsl(var(--lime))" />
      <circle cx="14" cy="35" r="3" fill="white" />
    </svg>
  );
}
