import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { mergeProviderControls, providerNextActions } from '@/lib/provider';
import { FlagsOffNotice, ProviderError, ProviderLoading, ProviderPageHeader } from '@/components/provider/ProviderShellBits';

const safeRead = async (read, fallback = []) => { try { return await read(); } catch { return fallback; } };

export default function Today() {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, error: '', actions: [], controls: mergeProviderControls(), application: null });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const [invitations, bookings, offerings, evidence, applications, profiles, controlRows] = await Promise.all([
        base44.entities.Invitation.list(),
        base44.entities.Booking.filter({ provider_id: user.id }),
        base44.entities.ProviderOffering.filter({ provider_id: user.id }),
        base44.entities.ProviderEvidence.filter({ provider_id: user.id }),
        safeRead(() => base44.entities.ProviderApplication.filter({ provider_id: user.id })),
        base44.entities.TradieProfile.filter({ user_id: user.id }),
        safeRead(() => base44.entities.ProviderFeatureControl.list('-updated_date', 1)),
      ]);
      const legacyApproved = profiles[0]?.provider_standing === 'active' || offerings.some((row) => row.review_status === 'approved');
      const application = applications[0] || (legacyApproved ? { status: 'approved' } : null);
      setState({ loading: false, error: '', application, controls: mergeProviderControls(controlRows[0]), actions: providerNextActions({ application, invitations, bookings, evidence }) });
    } catch { setState((current) => ({ ...current, loading: false, error: 'Your private provider summary could not be loaded.' })); }
  }, [user.id]);
  useEffect(() => { load(); }, [load]);

  return <div className="space-y-5">
    <ProviderPageHeader title="Today">Only the next useful actions for your provider account.</ProviderPageHeader>
    {!state.controls.provider_job_actions_enabled && <FlagsOffNotice />}
    {state.loading ? <ProviderLoading label="Loading provider summary" /> : state.error ? <ProviderError message={state.error} onRetry={load} /> : state.actions.length ? <div className="grid gap-3 sm:grid-cols-2">{state.actions.map((action, index) => <Link key={action.key} to={action.to} className={`group rounded-2xl border p-5 ${index === 0 ? 'border-primary/25 bg-primary text-primary-foreground' : 'border-border bg-white/75'}`}><div className="flex items-start justify-between gap-3"><div><p className={`text-xs font-semibold uppercase tracking-[0.14em] ${index === 0 ? 'text-white/65' : 'text-terracotta'}`}>{index === 0 ? 'Next' : 'Also today'}</p><h2 className="mt-2 text-lg font-semibold">{action.title}</h2><p className={`mt-1 text-sm ${index === 0 ? 'text-white/75' : 'text-muted-foreground'}`}>{action.body}</p></div><ArrowRight size={18} className="mt-1 shrink-0 transition-transform group-hover:translate-x-1" /></div></Link>)}</div> : <div className="glass-soft flex items-start gap-3 rounded-2xl p-5" role="status"><CheckCircle2 className="shrink-0 text-eucalyptus-deep" /><div><h2 className="font-semibold">Nothing needs attention</h2><p className="mt-1 text-sm text-muted-foreground">New private matches, schedule changes and document reminders will appear here.</p></div></div>}
    {state.application?.status === 'submitted' && <div className="flex gap-3 rounded-2xl border border-border bg-white/70 p-4"><AlertCircle size={18} className="mt-0.5 shrink-0 text-eucalyptus-deep" /><p className="text-sm text-muted-foreground"><b className="text-foreground">Application under review.</b> Automatic checks may assess individual evidence, but service access still needs independent approval.</p></div>}
  </div>;
}
