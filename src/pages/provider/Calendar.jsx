import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { EmptyState } from '@/components/oneforall/Bits';
import { formatMelbourneDateTime, providerCalendarGroups, providerServiceLabels } from '@/lib/provider';
import { FlagsOffNotice, ProviderError, ProviderLoading, ProviderPageHeader } from '@/components/provider/ProviderShellBits';

export default function Calendar() {
  const { user } = useAuth(); const [state, setState] = useState({ loading: true, error: '', rows: [] });
  const load = useCallback(async () => { try { setState({ loading: false, error: '', rows: await base44.entities.Booking.filter({ provider_id: user.id }) }); } catch { setState({ loading: false, error: 'Calendar could not be loaded.', rows: [] }); } }, [user.id]);
  useEffect(() => { load(); }, [load]);
  const groups = providerCalendarGroups(state.rows);
  return <div className="space-y-5"><ProviderPageHeader title="Calendar">Confirmed participant-owned schedules in Melbourne time.</ProviderPageHeader><FlagsOffNotice>Recurring creation is disabled.</FlagsOffNotice>{state.loading ? <ProviderLoading label="Loading calendar" /> : state.error ? <ProviderError message={state.error} onRetry={load} /> : Object.keys(groups).length ? Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => <section key={date} className="glass-soft rounded-2xl p-4"><h2 className="font-semibold">{date}</h2>{rows.map((row) => <p key={row.id} className="mt-2 text-sm">{formatMelbourneDateTime(row.scheduled_start)} · {providerServiceLabels(row.service_key).service}</p>)}</section>) : <EmptyState icon={CalendarDays} title="No confirmed schedules" body="Accepted work without a confirmed time remains in Jobs." />}</div>;
}
