import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, BriefcaseBusiness, CalendarDays, Clock3, History as HistoryIcon, Inbox, MapPin, ShieldCheck } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { EmptyState } from '@/components/oneforall/Bits';
import { formatAUDRange } from '@/lib/oneforall';
import { formatMelbourneDateTime, invitationCountdown, mergeProviderControls, projectedInvitationStatus, providerBookingGroups, providerServiceLabels } from '@/lib/provider';
import { loadDemoProviderState } from '@/lib/providerDemo';
import ProviderTitleBar from '@/components/provider/ProviderTitleBar';
import { ProviderError, ProviderLoading } from '@/components/provider/ProviderShellBits';

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

  return <div className="provider-jobs-reference">
    <ProviderTitleBar title="Available jobs" subtitle="Private work that matches your approved services" />
    <div className="provider-jobs-tabs" role="tablist" aria-label="Provider jobs sections">
      {SECTIONS.map(({ key, label, Icon }) => <button key={key} type="button" role="tab" aria-selected={active === key} onClick={() => { setParams(key === 'matches' ? {} : { section: key }); setSelectedId(''); }} className={active === key ? 'active' : ''}><Icon size={20} />{label}<span>{groups[key].length}</span></button>)}
    </div>
    {state.loading ? <ProviderLoading label="Loading provider jobs" /> : state.error ? <ProviderError message={state.error} onRetry={load} /> : rows.length ? <div className="provider-jobs-grid">
      <section className="provider-job-list" aria-label={`${active} jobs`}><p>{rows.length} {rows.length === 1 ? 'job' : 'jobs'} found</p>{rows.map((row) => <JobListCard key={row.id} row={row} active={selected?.id === row.id} section={active} onSelect={() => setSelectedId(row.id)} />)}</section>
      <JobPreview row={selected} section={active} />
    </div> : <div className="mt-5"><EmptyState icon={active === 'matches' ? Inbox : BriefcaseBusiness} title={active === 'matches' ? 'No new matches' : active === 'history' ? 'No job history' : 'No upcoming jobs'} body={active === 'matches' ? 'Only eligible, privately routed requests will appear here.' : active === 'history' ? 'Completed and closed work will appear here.' : 'A job appears here only after a response is confirmed.'} /></div>}
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
    price: !booking ? formatAUDRange(row.indicative_price_low, row.indicative_price_high) : null,
    to: booking ? `/provider/jobs/${encodeURIComponent(row.id)}` : `/provider/jobs/matches/${encodeURIComponent(row.id)}`,
    action: section === 'matches' ? 'Review match' : section === 'history' ? 'View record' : row.state === 'accepted' ? 'Confirm schedule' : 'View job',
  };
}

function JobListCard({ row, active, section, onSelect }) {
  const info = detailsFor(row, section);
  return <button type="button" onClick={onSelect} className={`provider-reference-card provider-job-row ${active ? 'active' : ''}`}>
    <span className="provider-reference-icon provider-reference-icon-blue"><BriefcaseBusiness size={29} /></span>
    <span className="provider-job-row-main"><b>{info.title}</b><small><CalendarDays size={17} />{info.timing}</small><small><MapPin size={17} />{info.location}</small></span>
    <span className="provider-job-row-side">{section === 'matches' && <small>{invitationCountdown(row.expires_at)}</small>}<span>{info.price || info.status}</span><ArrowRight size={22} /></span>
  </button>;
}

function JobPreview({ row, section }) {
  if (!row) return null;
  const info = detailsFor(row, section);
  return <aside className="provider-reference-card provider-job-preview">
    <div className="provider-job-preview-heading"><span className="provider-reference-icon provider-reference-icon-blue"><BriefcaseBusiness size={30} /></span><h2>{info.title}</h2></div>
    <PreviewSection label="Request type" value={info.subtitle} />
    <PreviewSection label="Date and time" value={info.timing} Icon={CalendarDays} />
    <PreviewSection label="Service area" value={info.location} Icon={MapPin} />
    <div className="provider-job-preview-pair"><PreviewSection label="Status" value={info.status} Icon={ShieldCheck} />{info.price && <PreviewSection label="Indicative range" value={info.price} />}</div>
    <Link to={info.to} className="provider-job-primary">{info.action}<ArrowRight size={18} /></Link>
    {section === 'matches' && <Link to={`${info.to}?intent=decline`} className="provider-job-secondary">Not for me</Link>}
    {section === 'matches' && <p>Customer identity, contact details and exact address remain private until confirmation.</p>}
  </aside>;
}

function PreviewSection({ label, value, Icon = null }) {
  return <div className="provider-job-preview-section"><span>{label}</span><b>{Icon && <Icon size={20} />}{value}</b></div>;
}
