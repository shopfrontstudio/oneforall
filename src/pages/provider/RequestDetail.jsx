import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { projectedInvitationStatus, providerServiceLabels } from '@/lib/provider';
import { FlagsOffNotice, ProviderError, ProviderLoading, ProviderPageHeader } from '@/components/provider/ProviderShellBits';

export default function RequestDetail() {
  const { invitationId } = useParams();
  const [state, setState] = useState({ loading: true, error: '', row: null });
  const load = React.useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try { setState({ loading: false, error: '', row: await base44.entities.Invitation.get(invitationId) }); }
    catch { setState({ loading: false, error: 'The request is unavailable.', row: null }); }
  }, [invitationId]);
  useEffect(() => { load(); }, [load]);
  if (state.loading) return <ProviderLoading label="Loading request" />;
  if (state.error) return <ProviderError message={state.error} onRetry={load} />;
  if (!state.row) return <div className="space-y-4"><ProviderPageHeader title="Request unavailable">It was not found or is not assigned to this provider account.</ProviderPageHeader><Link to="/provider/requests" className="font-semibold text-eucalyptus-deep">Back to Requests</Link></div>;
  const labels = providerServiceLabels(state.row.service_key, state.row.selected_scope_ids);
  return <div className="mx-auto max-w-2xl space-y-5"><ProviderPageHeader title={state.row.job_title || labels.service}>Safe invitation snapshot only.</ProviderPageHeader><FlagsOffNotice>Quote and decline operations are disabled; this screen performs no authoritative write.</FlagsOffNotice><section className="glass rounded-2xl p-4"><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted-foreground">Service</dt><dd>{labels.service}</dd></div><div><dt className="text-xs text-muted-foreground">Status</dt><dd>{projectedInvitationStatus(state.row)}</dd></div><div><dt className="text-xs text-muted-foreground">Preferred date</dt><dd>{state.row.preferred_date || 'Flexible'}</dd></div><div><dt className="text-xs text-muted-foreground">Service area</dt><dd>{state.row.service_area || 'Withheld'}</dd></div></dl><p className="mt-3 text-xs text-muted-foreground">Customer identity, exact address, access notes, raw safety details and evidence are not exposed here.</p></section></div>;
}
