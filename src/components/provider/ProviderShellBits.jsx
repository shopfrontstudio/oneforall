import React from 'react';
import { Lock } from 'lucide-react';

export function ProviderPageHeader({ title, children }) {
  return <header><h1 className="text-2xl font-semibold tracking-tight">{title}</h1>{children && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{children}</p>}</header>;
}
export function FlagsOffNotice({ children = 'You can review this workspace now. Applications, document uploads, job responses and booking actions remain safely switched off.' }) {
  return <div className="flex items-start gap-3 rounded-2xl border border-terracotta/20 bg-terracotta/[0.06] p-4" role="status"><Lock size={18} className="mt-0.5 shrink-0 text-terracotta" /><div><p className="text-sm font-semibold">Preview mode</p><p className="mt-1 text-sm text-muted-foreground">{children}</p></div></div>;
}
export const ProviderLoading = ({ label }) => <div className="glass-soft h-28 animate-pulse rounded-2xl" role="status" aria-label={label} />;
export function ProviderError({ message, onRetry = null }) {
  return <div className="rounded-2xl border border-terracotta/40 bg-white/70 p-4 text-sm" role="alert"><p>{message}</p>{onRetry && <button type="button" onClick={onRetry} className="mt-3 min-h-11 rounded-xl border border-border bg-white px-4 font-semibold">Retry</button>}</div>;
}
