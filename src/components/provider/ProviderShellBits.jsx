import React from 'react';
import { Lock } from 'lucide-react';

export function ProviderPageHeader({ title, children }) {
  return <header><h1 className="text-2xl font-semibold">{title}</h1>{children && <p className="mt-1 text-sm text-muted-foreground">{children}</p>}</header>;
}
export function FlagsOffNotice({ children = 'This action is unavailable while all seven Phase 1 release controls remain off.' }) {
  return <div className="glass-soft flex items-start gap-3 rounded-2xl p-4" role="status"><Lock size={18} className="mt-0.5 shrink-0 text-terracotta" /><div><p className="text-sm font-semibold">Provider actions are closed.</p><p className="mt-1 text-sm text-muted-foreground">{children}</p></div></div>;
}
export const ProviderLoading = ({ label }) => <div className="glass-soft h-28 animate-pulse rounded-2xl" role="status" aria-label={label} />;
export function ProviderError({ message, onRetry = null }) {
  return <div className="rounded-2xl border border-terracotta/40 bg-white/70 p-4 text-sm" role="alert"><p>{message}</p>{onRetry && <button type="button" onClick={onRetry} className="mt-3 min-h-11 rounded-xl border border-border bg-white px-4 font-semibold">Retry</button>}</div>;
}
