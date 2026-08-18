import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { formatMelbourneDateTime, providerServiceLabels } from '@/lib/provider';
import { FlagsOffNotice, ProviderError, ProviderLoading, ProviderPageHeader } from '@/components/provider/ProviderShellBits';

export default function JobDetail() {
  const { bookingId } = useParams(); const { user } = useAuth(); const [state, setState] = useState({ loading: true, error: '', row: null });
  const load = React.useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const row = await base44.entities.Booking.get(bookingId);
      setState({ loading: false, error: '', row: row?.provider_id === user.id && row.state !== 'superseded' ? row : null });
    } catch { setState({ loading: false, error: 'The booking is unavailable.', row: null }); }
  }, [bookingId, user.id]);
  useEffect(() => { load(); }, [load]);
  if (state.loading) return <ProviderLoading label="Loading booking" />;
  if (state.error) return <ProviderError message={state.error} onRetry={load} />;
  if (!state.row) return <Link to="/provider/jobs" className="font-semibold text-eucalyptus-deep">Back to Jobs</Link>;
  const labels = providerServiceLabels(state.row.service_key, state.row.selected_scope_ids);
  return <div className="mx-auto max-w-2xl space-y-5"><ProviderPageHeader title={labels.service}>Read-only canonical booking.</ProviderPageHeader><FlagsOffNotice>This screen performs no booking transition while the booking release control is off.</FlagsOffNotice><section className="glass rounded-2xl p-4"><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted-foreground">State</dt><dd>{state.row.state}</dd></div><div><dt className="text-xs text-muted-foreground">Schedule</dt><dd>{state.row.scheduled_start ? formatMelbourneDateTime(state.row.scheduled_start) : 'Not confirmed'}</dd></div><div><dt className="text-xs text-muted-foreground">Attending worker</dt><dd>{state.row.attending_worker_display_name || 'Withheld until confirmed'}</dd></div><div><dt className="text-xs text-muted-foreground">Scope</dt><dd>{labels.scopes.join(', ') || 'Withheld'}</dd></div></dl></section></div>;
}
