import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, BriefcaseBusiness, CalendarDays, Clock3, History as HistoryIcon, Inbox, MapPin, ShieldCheck } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { EmptyState, StatusBadge } from '@/components/oneforall/Bits';
import { formatAUDRange } from '@/lib/oneforall';
import { formatMelbourneDateTime, invitationCountdown, mergeProviderControls, projectedInvitationStatus, providerBookingGroups, providerServiceLabels } from '@/lib/provider';
import { loadDemoProviderState } from '@/lib/providerDemo';
import { DemoModeNotice, FlagsOffNotice, ProviderError, ProviderLoading } from '@/components/provider/ProviderShellBits';

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
  const [selectedId, setSelectedId] = useState('');
  const [state, setState] = useState({ loading: true, error: '', invitations: [], bookings: [], controls: mergeProviderControls() });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      if (user.demo_mode) {
        const demo = loadDemoProviderState(user.id);
        setState({ loading: false, error: '', invitations: demo.invitations, bookings: demo.bookings, controls: mergeProviderControls({ provider_job_actions_enabled: true }) });
        return;
      }
      const [invitations, bookings, controls] = await Promise.all([
        base44.entities.Invitation.list(),
        base44.entities.Booking.filter({ provider_id: user.id }),
        safeRead(() => base44.entities.ProviderFeatureControl.list('-updated_date', 1)),
      ]);
      setState({ loading: false, error: '', invitations, bookings: bookings.filter((row) => row.state !== 'superseded'), controls: mergeProviderControls(controls[0]) });
    } catch {
      setState((current) => ({ ...current, loading: false, error: 'Your private jobs could not be loaded.' }));
    }
  }, [user.demo_mode, user.id]);

  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    const bookingGroups = providerBookingGroups(state.bookings);
    return {
      matches: state.invitations.filter((row) => projectedInvitationStatus(row) === 'pending'),
      upcoming: [...bookingGroups.in_progress, ...bookingGroups.upcoming],
      history: [...bookingGroups.history, ...state.invitations.filter((row) => projectedInvitationStatus(row) !== 'pending')],
    };
  }, [state.bookings, state.invitations]);

  const rows = groups[active];
  const selected = rows.find((row) => row.id === selectedId) || rows[0] || null;

  return <div className="space-y-6">
    <header><p className="text-sm font-medium text-muted-foreground">Private provider workspace</p><h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Jobs</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Private matches and confirmed work—never a public bidding feed.</p></header>
    {user.demo_mode ? <DemoModeNotice>Try responding to a match, scheduling work, starting a job and completing it. Changes stay only in this browser.</DemoModeNotice> : !state.controls.provider_job_actions_enabled && <FlagsOffNotice>Matches and bookings can be reviewed, but provider responses and job-state changes remain switched off.</FlagsOffNotice>}

    <div className="provider-segmented grid grid-cols-3 gap-1 rounded-2xl p-1.5" role="tablist" aria-label="Provider jobs sections">
      {SECTIONS.map(({ key, label, Icon }) => <button key={key} type="button" role="tab" aria-selected={active === key} onClick={() => { setParams(key === 'matches' ? {} : { section: key }); setSelectedId(''); }} className={`provider-pill-tab flex items-center justify-center gap-2 px-2 ${active === key ? 'provider-pill-tab-active' : ''}`}><Icon size={16} /><span className="hidden sm:inline">{label}</span><span className="sm:hidden">{key === 'matches' ? 'New' : label}</span>{!state.loading && <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active === key ? 'bg-white/[0.18]' : 'bg-white/[0.65]'}`}>{groups[key].length}</span>}</button>)}
    </div>

    {state.loading ? <ProviderLoading label="Loading provider jobs" /> : state.error ? <ProviderError message={state.error} onRetry={load} /> : rows.length ? <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(330px,.85fr)]">
      <section className="space-y-3" aria-label={`${active} jobs`}>
        <p className="px-1 text-sm font-semibold text-muted-foreground">{rows.length} {rows.length === 1 ? 'item' : 'items'}</p>
        {rows.map((row) => <JobListCard key={row.id} row={row} active={selected?.id === row.id} section={active} onSelect={() => setSelectedId(row.id)} />)}
      </section>
      <JobPreview row={selected} section={active} />
    </div> : <EmptyState icon={active === 'matches' ? Inbox : BriefcaseBusiness} title={active === 'matches' ? 'No new matches' : active === 'history' ? 'No job history' : 'No upcoming jobs'} body={active === 'matches' ? 'Only eligible, privately routed requests will appear here.' : active === 'history' ? 'Completed and closed work will appear here.' : 'A job appears here only after a response is confirmed.'} />}
  </div>;
}

function detailsFor(row, section) {
  const booking = Boolean(row.quote_id);
  const labels = providerServiceLabels(row.service_key, row.selected_scope_ids);
  const status = booking ? String(row.state || 'accepted').replaceAll('_', ' ') : projectedInvitationStatus(row);
  return {
    booking,
    labels,
    title: row.job_title || labels.service,
    subtitle: labels.scopes.join(', ') || (booking ? 'Confirmed service scope' : 'Managed service request'),
    location: row.service_area || (row.confirmed_service_address ? String(row.confirmed_service_address).split(',').slice(1).join(',').trim() : 'Ballarat area'),
    timing: booking ? (row.scheduled_start ? formatMelbourneDateTime(row.scheduled_start) : 'Schedule to be confirmed') : (row.preferred_date || 'Flexible timing'),
    status,
    to: booking ? `/provider/jobs/${encodeURIComponent(row.id)}` : `/provider/jobs/matches/${encodeURIComponent(row.id)}`,
    action: section === 'matches' ? 'Review match' : section === 'history' ? 'View record' : row.state === 'accepted' ? 'Confirm schedule' : 'View job',
  };
}

function JobListCard({ row, active, section, onSelect }) {
  const info = detailsFor(row, section);
  return <button type="button" onClick={onSelect} className={`provider-glass provider-action-card w-full rounded-3xl p-4 text-left sm:p-5 ${active ? 'ring-2 ring-primary/[0.55]' : ''}`}>
    <div className="flex items-start gap-3">
      <span className="provider-icon-orb h-12 w-12 shrink-0 rounded-2xl text-eucalyptus-deep"><BriefcaseBusiness size={21} /></span>
      <span className="min-w-0 flex-1"><span className="flex flex-wrap items-start justify-between gap-2"><span><span className="block text-lg font-semibold">{info.title}</span><span className="mt-0.5 block text-sm text-muted-foreground">{info.subtitle}</span></span>{section === 'matches' && <span className="rounded-full bg-terracotta/10 px-2.5 py-1 text-xs font-semibold text-terracotta">{invitationCountdown(row.expires_at)}</span>}</span>
        <span className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2"><span className="flex items-center gap-2"><CalendarDays size={15} />{info.timing}</span><span className="flex items-center gap-2"><MapPin size={15} />{info.location}</span></span>
      </span>
      <ArrowRight size={18} className="mt-3 shrink-0 text-muted-foreground" />
    </div>
  </button>;
}

function JobPreview({ row, section }) {
  if (!row) return null;
  const info = detailsFor(row, section);
  const price = !info.booking ? formatAUDRange(row.indicative_price_low, row.indicative_price_high) : null;
  return <aside className="provider-glass provider-glass-warm h-fit rounded-[28px] p-5 lg:sticky lg:top-24 sm:p-6">
    <div className="flex items-start justify-between gap-3"><span className="provider-icon-orb h-14 w-14 rounded-2xl text-eucalyptus-deep"><BriefcaseBusiness size={25} /></span><StatusBadge label={info.status} tone={row.state === 'completed' ? 'sage' : 'mist'} /></div>
    <h2 className="mt-5 text-2xl font-semibold">{info.title}</h2><p className="mt-1 text-sm text-muted-foreground">{info.subtitle}</p>
    <div className="mt-5 space-y-4 border-y border-border/[0.55] py-5">
      <PreviewLine Icon={CalendarDays} label="Timing" value={info.timing} />
      <PreviewLine Icon={MapPin} label="Service area" value={info.location} />
      {price && <PreviewLine Icon={ShieldCheck} label="Indicative range" value={price} />}
      {row.safe_safety_summary && <PreviewLine Icon={ShieldCheck} label="Safety summary" value={row.safe_safety_summary} />}
    </div>
    <Link to={info.to} className="mt-5 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:-translate-y-0.5 hover:bg-eucalyptus-deep">{info.action}<ArrowRight size={17} /></Link>
    {section === 'matches' && <p className="mt-3 text-xs text-muted-foreground">Customer identity, contact details and exact address remain private until a booking is confirmed.</p>}
  </aside>;
}

function PreviewLine({ Icon, label, value }) {
  return <div className="flex items-start gap-3"><span className="provider-icon-orb h-9 w-9 shrink-0 rounded-xl text-eucalyptus-deep"><Icon size={17} /></span><span><span className="block text-xs text-muted-foreground">{label}</span><span className="mt-0.5 block text-sm font-semibold">{value}</span></span></div>;
}
