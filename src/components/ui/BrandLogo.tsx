import React from 'react';

export const BrandLogo: React.FC = () => (
  <div data-hud-overlay="brand" className="inline-flex items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-950/80 px-2.5 py-1.5 shadow-xl backdrop-blur-xl">
    <img
      src="/brand/icon.svg"
      alt=""
      aria-hidden="true"
      width="28"
      height="28"
      className="h-7 w-7 shrink-0"
    />
    <span className="text-xs font-black tracking-tight text-white">DrivePrep 3D</span>
  </div>
);
