import React from 'react';
import { useLocation } from 'react-router-dom';
import { CircleHelp } from 'lucide-react';
import { contextualHelp } from '@/lib/intelligentExperience';

export default function ContextHelp() {
  const { pathname } = useLocation();
  const help = contextualHelp(pathname);
  return <details className="rounded-2xl border border-primary/10 bg-white/60 p-4 text-sm">
    <summary className="flex min-h-7 cursor-pointer items-center gap-2 font-semibold text-eucalyptus-deep"><CircleHelp size={18} aria-hidden="true" />{help.title}</summary>
    <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">{help.text}</p>
  </details>;
}
