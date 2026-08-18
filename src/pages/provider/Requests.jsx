import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { EmptyState } from '@/components/oneforall/Bits';
import { projectedInvitationStatus } from '@/lib/provider';
import { FlagsOffNotice, ProviderError, ProviderLoading, ProviderPageHeader } from '@/components/provider/ProviderShellBits';

export default function Requests() {
  const [state, setState] = useState({ loading: true, error: '', rows: [] });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try { setState({ loading: false, error: '', rows: await base44.entities.Invitation.list() }); }
    catch { setState({ loading: false, error: 'Private routed requests could not be loaded.', rows: [] }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  return <div className="space-y-5"><ProviderPageHeader title="Requests">Private invitation snapshots only. There is no open request feed or bidding board.</ProviderPageHeader><FlagsOffNotice />{state.loading ? <ProviderLoading label="Loading requests" /> : state.error ? <ProviderError message={state.error} onRetry={load} /> : state.rows.length ? <div className="space-y-3">{state.rows.map((row) => <Link key={row.id} to={`/provider/requests/${encodeURIComponent(row.id)}`} className="glass-soft block rounded-2xl p-4"><div className="flex justify-between gap-2"><b>{row.job_title || 'Managed service request'}</b><span className="rounded-full bg-white/70 px-2 py-1 text-xs font-semibold">{projectedInvitationStatus(row)}</span></div><p className="mt-1 text-sm text-muted-foreground">{(row.selected_scope_labels || []).join(', ') || 'Scope held for review'} · {row.service_area || 'Area withheld'}</p></Link>)}</div> : <EmptyState icon={ClipboardCheck} title="No routed requests" body="Only a participant-scoped, unexpired invitation can appear here." />}</div>;
}
