import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, Clock3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { EmptyState } from '@/components/oneforall/Bits';
import { formatMelbourneDateTime, providerCalendarGroups, providerServiceLabels } from '@/lib/provider';
import { ProviderError, ProviderLoading, ProviderPageHeader } from '@/components/provider/ProviderShellBits';

export default function Calendar() {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, error: '', rows: [] });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try { setState({ loading: false, error: '', rows: await base44.entities.Booking.filter({ provider_id: user.id }) }); }
    catch { setState({ loading: false, error: 'Your confirmed schedule could not be loaded.', rows: [] }); }
  }, [user.id]);
  useEffect(() => { load(); }, [load]);
  const groups = providerCalendarGroups(state.rows);
  const dates = Object.entries(groups).sort(([left], [right]) => left.localeCompare(right));

  return <div className="space-y-5"><ProviderPageHeader title="Calendar">Confirmed jobs in Ballarat time. Regular weekly availability stays in Account.</ProviderPageHeader>{state.loading ? <ProviderLoading label="Loading calendar" /> : state.error ? <ProviderError message={state.error} onRetry={load} /> : dates.length ? <div className="space-y-4">{dates.map(([date, rows]) => <section key={date} className="glass overflow-hidden rounded-2xl"><div className="border-b border-border/60 bg-sage/20 px-4 py-3"><h2 className="font-semibold">{new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', dateStyle: 'full' }).format(new Date(`${date}T12:00:00+10:00`))}</h2></div><div className="divide-y divide-border/60">{rows.map((row) => { const labels = providerServiceLabels(row.service_key, row.selected_scope_ids); return <Link key={row.id} to={`/provider/jobs/${encodeURIComponent(row.id)}`} className="flex items-center gap-3 p-4 hover:bg-white/60"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mist-soft"><Clock3 size={17} /></span><span className="min-w-0 flex-1"><b className="block truncate text-sm">{labels.service}</b><span className="block text-xs text-muted-foreground">{formatMelbourneDateTime(row.scheduled_start)} · {row.attending_worker_display_name}</span></span><ArrowRight size={16} /></Link>; })}</div></section>)}</div> : <EmptyState icon={CalendarDays} title="No confirmed schedules" body="Accepted work without a confirmed time remains in Jobs." />}</div>;
}
