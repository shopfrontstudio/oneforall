import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { ownedProviderProjection } from '@/lib/provider';
import { FlagsOffNotice, ProviderError, ProviderLoading, ProviderPageHeader } from '@/components/provider/ProviderShellBits';

const COUNTERS = [
  ['Pending requests', 'pending_requests', '/provider/requests'], ['Needs scheduling', 'needs_scheduling', '/provider/jobs'],
  ['Scheduled today', 'scheduled_today', '/provider/calendar'], ['Review required', 'review_required', '/provider/more'],
  ['Evidence alerts', 'evidence_alerts', '/provider/more'],
];
export default function Today() {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const [invitations, bookings, offerings, evidence] = await Promise.all([
        base44.entities.Invitation.list(), base44.entities.Booking.filter({ provider_id: user.id }),
        base44.entities.ProviderOffering.filter({ provider_id: user.id }), base44.entities.ProviderEvidence.filter({ provider_id: user.id }),
      ]);
      setState({ loading: false, error: '', data: ownedProviderProjection({ userId: user.id, invitations, bookings, offerings, evidence }) });
    } catch { setState({ loading: false, error: 'Your private provider summary could not be loaded.', data: null }); }
  }, [user.id]);
  useEffect(() => { load(); }, [load]);
  const allClear = state.data && COUNTERS.every(([, key]) => state.data[key] === 0);
  return <div className="space-y-5"><ProviderPageHeader title="Today">Your participant-owned requests, bookings and readiness alerts.</ProviderPageHeader><FlagsOffNotice />{state.loading ? <ProviderLoading label="Loading provider summary" /> : state.error ? <ProviderError message={state.error} onRetry={load} /> : <>{allClear && <div className="glass-soft flex gap-3 rounded-2xl p-4" role="status"><CheckCircle2 className="text-eucalyptus-deep" /><div><b>All clear</b><p className="text-sm text-muted-foreground">No routed work or readiness alerts need attention.</p></div></div>}<div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{COUNTERS.map(([label, key, to]) => <Link key={key} to={to} className="glass-soft min-h-24 rounded-2xl p-4"><p className="text-2xl font-semibold">{state.data[key]}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></Link>)}</div></>}</div>;
}
