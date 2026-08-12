import React from 'react';
import { CalendarClock, Lock } from 'lucide-react';
import { EmptyState } from '@/components/oneforall/Bits';

export default function ProviderJobs() {
  return <div className="space-y-5"><header><h1 className="text-2xl font-semibold tracking-tight">Provider jobs</h1><p className="mt-1 text-sm text-muted-foreground">Confirmed and scheduled managed bookings will be organised here.</p></header><div className="glass-soft flex items-start gap-3 rounded-2xl p-4" role="status"><Lock size={18} className="mt-0.5 shrink-0 text-terracotta" /><p className="text-sm text-muted-foreground">Unreviewed direct routing is disabled. All service release gates remain off.</p></div><EmptyState icon={CalendarClock} title="No provider jobs" body="There are no confirmed managed bookings for this account." /></div>;
}
