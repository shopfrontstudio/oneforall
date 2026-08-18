import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BriefcaseBusiness } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { EmptyState, StatusBadge } from '@/components/oneforall/Bits';
import { formatMelbourneDateTime, providerBookingGroups, providerServiceLabels } from '@/lib/provider';
import { FlagsOffNotice, ProviderError, ProviderLoading, ProviderPageHeader } from '@/components/provider/ProviderShellBits';

export default function Jobs() {
  const { user } = useAuth(); const [state, setState] = useState({ loading: true, error: '', rows: [] });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try { const rows = await base44.entities.Booking.filter({ provider_id: user.id }); setState({ loading: false, error: '', rows: rows.filter((row) => row.state !== 'superseded') }); }
    catch { setState({ loading: false, error: 'Private bookings could not be loaded.', rows: [] }); }
  }, [user.id]);
  useEffect(() => { load(); }, [load]);
  const groups = providerBookingGroups(state.rows);
  const sections = [{ title: 'Upcoming', rows: groups.upcoming }, { title: 'In progress', rows: groups.in_progress }, { title: 'History', rows: groups.history }];
  return <div className="space-y-5"><ProviderPageHeader title="Jobs">Canonical participant-owned bookings only.</ProviderPageHeader><FlagsOffNotice>Booking state operations remain closed while release controls are off.</FlagsOffNotice>{state.loading ? <ProviderLoading label="Loading provider jobs" /> : state.error ? <ProviderError message={state.error} onRetry={load} /> : state.rows.length ? sections.map(({ title, rows }) => <section key={title}><h2 className="mb-2 text-lg font-semibold">{title} ({rows.length})</h2>{rows.map((row) => <BookingCard key={row.id} row={row} />)}</section>) : <EmptyState icon={BriefcaseBusiness} title="No provider jobs" body="No canonical booking is assigned to this account." />}</div>;
}
function BookingCard({ row }) {
  const labels = providerServiceLabels(row.service_key, row.selected_scope_ids);
  return <Link to={`/provider/jobs/${encodeURIComponent(row.id)}`} className="glass-soft mb-2 block rounded-2xl p-4"><div className="flex justify-between gap-2"><div><b>{labels.service}</b><p className="text-xs text-muted-foreground">{labels.scopes.join(', ') || 'Scope withheld'}</p></div><StatusBadge label={row.state} tone={row.state === 'completed' ? 'sage' : 'mist'} /></div><p className="mt-2 text-sm text-muted-foreground">{row.scheduled_start ? formatMelbourneDateTime(row.scheduled_start) : 'Accepted · schedule not confirmed'}</p></Link>;
}
