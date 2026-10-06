import React from 'react';
import { FlaskConical, Lock } from 'lucide-react';

export function ProviderPageHeader({ title, children }) {
  return <header><h1 className="text-3xl font-semibold tracking-tight">{title}</h1>{children && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{children}</p>}</header>;
}
export function FlagsOffNotice({ children = 'You can review this workspace now. Applications, document uploads, job responses and booking actions remain safely switched off.' }) {
  return <div className="flex items-start gap-3 rounded-2xl border border-terracotta/20 bg-terracotta/[0.06] p-4" role="status"><Lock size={18} className="mt-0.5 shrink-0 text-terracotta" /><div><p className="text-sm font-semibold">Preview mode</p><p className="mt-1 text-sm text-muted-foreground">{children}</p></div></div>;
}
export function DemoModeNotice({ children = 'Explore the complete provider journey with sample work. Every action stays in this browser and never contacts a real customer.' }) {
  return <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-sage/45 p-4" role="status"><FlaskConical size={18} className="mt-0.5 shrink-0 text-eucalyptus-deep" /><div><p className="text-sm font-semibold">Demo sandbox</p><p className="mt-1 text-sm text-muted-foreground">{children}</p></div></div>;
}
export const ProviderLoading = ({ label }) => <div className="provider-glass h-32 animate-pulse rounded-3xl" role="status" aria-label={label} />;
export function ProviderError({ message, onRetry = null }) {
  return <div className="provider-glass rounded-3xl border-terracotta/40 p-5 text-sm" role="alert"><p>{message}</p>{onRetry && <button type="button" onClick={onRetry} className="mt-3 min-h-11 rounded-xl border border-border bg-white/75 px-4 font-semibold transition hover:bg-white">Retry</button>}</div>;
}
