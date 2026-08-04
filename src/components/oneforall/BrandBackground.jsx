import React from 'react';

// Faded Australian suburban scene — houses, route lines, location pins and tool silhouettes.
// Kept low-opacity so frosted-glass content stays readable.
export default function BrandBackground() {
  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-sage/25 via-mist-soft/30 to-sandstone/35" />
      <svg className="absolute inset-0 w-full h-full opacity-[0.13]" preserveAspectRatio="xMidYMid slice" viewBox="0 0 1440 900">
        <g fill="hsl(var(--eucalyptus-deep))">
          {/* distant hills */}
          <path d="M0 640 C 240 560, 480 600, 720 600 C 960 600, 1200 560, 1440 620 L1440 900 L0 900 Z" opacity="0.6" />
        </g>
        {/* map route */}
        <path d="M120 760 C 360 620, 520 700, 760 560 C 1000 420, 1180 520, 1360 380" fill="none" stroke="hsl(var(--terracotta))" strokeWidth="6" strokeLinecap="round" strokeDasharray="2 16" opacity="0.7" />
        {/* houses */}
        {[[180, 700], [520, 690], [880, 660], [1200, 700]].map(([x, y], i) => (
          <g key={i} fill="hsl(var(--eucalyptus-deep))" opacity="0.55">
            <path d={`M${x} ${y} L${x + 50} ${y - 40} L${x + 100} ${y} Z`} />
            <rect x={x + 8} y={y} width="84" height="58" rx="4" />
          </g>
        ))}
        {/* location pins */}
        {[[320, 560], [700, 600], [1040, 480], [380, 720]].map(([cx, cy], i) => (
          <g key={'p' + i} fill="hsl(var(--terracotta))" opacity="0.6">
            <path d={`M${cx} ${cy} c -14 -22 -6 -42 14 -42 c 20 0 28 20 14 42 c -6 10 -10 16 -14 22 c -4 -6 -8 -12 -14 -22 Z`} />
            <circle cx={cx} cy={cy - 28} r="6" fill="hsl(var(--sandstone))" />
          </g>
        ))}
        {/* faint tools */}
        <g stroke="hsl(var(--eucalyptus-deep))" strokeWidth="5" strokeLinecap="round" opacity="0.4" fill="none">
          <path d="M180 220 l40 -40" /><path d="M180 180 l40 40" />
          <path d="M1200 240 l34 34" />
          <path d="M980 180 l26 0 M993 167 l0 26" />
        </g>
      </svg>
      <div className="absolute inset-0 backdrop-blur-[2px]" />
    </div>
  );
}