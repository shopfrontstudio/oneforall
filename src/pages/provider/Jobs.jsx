import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, Clock3, History as HistoryIcon, Inbox } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { EmptyState, StatusBadge } from '@/components/oneforall/Bits';
import { formatAUDRange } from '@/lib/oneforall';
import { formatMelbourneDateTime, invitationCountdown, mergeProviderControls, projectedInvitationStatus, providerBookingGroups, providerServiceLabels } from '@/lib/provider';
import { FlagsOffNotice, ProviderError, ProviderLoading, ProviderPageHeader } from '@/components/provider/ProviderShellBits';

const SECTIONS = [
  { key: 'matches', label: 'New matches', Icon: Inbox },
  { key: 'upcoming', label: 'Upcoming', Icon: Clock3 },
  { key: 'history', label: 'History', Icon: HistoryIcon },
];
const safeRead = async (read, fallback = []) => { try { return await read(); } catch { return fallback; } };

export default function Jobs() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const active = SECTIONS.some((item) => item.key === params.get('section')) ? params.get('section') : 'matches';
  const [state, setState] = useState({ loading: true, error: '', invitations: [], bookings: [], controls: mergeProviderControls() });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const [invitations, bookings, controls] = await Promise.all([
        base44.entities.Invitation.list(),
        base44.entities.Booking.filter({ provider_id: user.id }),
        safeRead(() => base44.entities.ProviderFeatureControl.list('-updated_date', 1)),
      ]);
      setState({ loading: false, error: '', invitations, bookings: bookings.filter((row) => row.state !== 'superseded'), controls: mergeProviderControls(controls[0]) });
    } catch { setState((current) => ({ ...current, loading: false, error: 'Your private jobs could not be loaded.' })); }
  }, [user.id]);
  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    const bookingGroups = providerBookingGroups(state.bookings);
    return {
      matches: state.invitations.filter((row) => projectedInvitationStatus(row) === 'pending'),
      upcoming: [...bookingGroups.in_progress, ...bookingGroups.upcoming],
      history: [...bookingGroups.history, ...state.invitations.filter((row) => projectedInvitationStatus(row) !== 'pending')],
    };
  }, [state.bookings, state.invitations]);

  return <div className="space-y-5">
    <ProviderPageHeader title="Jobs">Private matches and confirmed work—never a public bidding feed.</ProviderPageHeader>
    {!state.controls.provider_job_actions_enabled && <FlagsOffNotice>Matches and bookings can be reviewed, but provider responses and job-state changes remain switched off.</FlagsOffNotice>}
    <div className="grid grid-cols-3 gap-2 rounded-2xl border border-border bg-white/65 p-1.5" role="tablist" aria-label="Provider jobs sections">{SECTIONS.map(({ key, label, Icon }) => <button key={key} type="button" role="tab" aria-selected={active === key} onClick={() => setParams(key === 'matches' ? {} : { section: key })} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-2 text-xs font-semibold sm:text-sm ${active === key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-white'}`}><Icon size={16} /><span>{label}</span>{!state.loading && <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active === key ? 'bg-white/15' : 'bg-mist-soft'}`}>{groups[key].length}</span>}</button>)}</div>
    {state.loading ? <ProviderLoading label="Loading provider jobs" /> : state.error ? <ProviderError message={state.error} onRetry={load} /> : active === 'matches' ? <Matches rows={groups.matches} /> : <Bookings rows={groups[active]} history={active === 'history'} />}
  </div>;
}

function Matches({ rows }) {
  if (!rows.length) return <EmptyState icon={Inbox} title="No new matches" body="Only eligible, privately routed requests will appear here." />;
  return <div className="space-y-3">{rows.map((row) => { const labels = providerServiceLabels(row.service_key, row.selected_scope_ids); return <Link key={row.id} to={`/provider/jobs/matches/${encodeURIComponent(row.id)}`} className="glass-soft block rounded-2xl p-4 transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-terracotta">{labels.service}</p><h2 className="mt-1 font-semibold">{row.job_title || labels.scopes.join(', ') || 'Managed service request'}</h2></div><span className="rounded-full bg-terracotta/10 px-2.5 py-1 text-xs font-semibold text-terracotta">{invitationCountdown(row.expires_at)}</span></div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground"><span>{row.service_area || 'Ballarat area'}</span><span>{row.preferred_date || 'Flexible timing'}</span><span>{formatAUDRange(row.indicative_price_low, row.indicative_price_high)}</span></div></Link>; })}</div>;
}

function Bookings({ rows, history }) {
  if (!rows.length) return <EmptyState icon={BriefcaseBusiness} title={history ? 'No job history' : 'No upcoming jobs'} body={history ? 'Completed and closed work will appear here.' : 'A job appears here only after a response is confirmed.'} />;
  return <div className="space-y-3">{rows.map((row) => row.quote_id ? <BookingCard key={`booking-${row.id}`} row={row} /> : <ClosedMatchCard key={`match-${row.id}`} row={row} />)}</div>;
}

function BookingCard({ row }) {
  const labels = providerServiceLabels(row.service_key, row.selected_scope_ids);
  return <Link to={`/provider/jobs/${encodeURIComponent(row.id)}`} className="glass-soft block rounded-2xl p-4"><div className="flex justify-between gap-2"><div><b>{labels.service}</b><p className="mt-1 text-xs text-muted-foreground">{labels.scopes.join(', ') || 'Confirmed scope'}</p></div><StatusBadge label={String(row.state || '').replaceAll('_', ' ')} tone={row.state === 'completed' ? 'sage' : 'mist'} /></div><p className="mt-3 text-sm text-muted-foreground">{row.scheduled_start ? formatMelbourneDateTime(row.scheduled_start) : 'Accepted · schedule not confirmed'}</p></Link>;
}

function ClosedMatchCard({ row }) {
  const labels = providerServiceLabels(row.service_key, row.selected_scope_ids);
  return <article className="rounded-2xl border border-border bg-white/60 p-4"><div className="flex justify-between gap-2"><div><b>{row.job_title || labels.service}</b><p className="mt-1 text-xs text-muted-foreground">{row.service_area || 'Ballarat area'}</p></div><StatusBadge label={projectedInvitationStatus(row)} /></div></article>;
}
