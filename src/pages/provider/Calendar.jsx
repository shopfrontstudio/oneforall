import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Bell, BriefcaseBusiness, CalendarDays, Clock3, MapPin, MessageSquare, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { melbourneDate, projectedInvitationStatus, providerCalendarGroups, providerServiceLabels } from '@/lib/provider';
import { loadDemoProviderState } from '@/lib/providerDemo';
import { ProviderError, ProviderLoading } from '@/components/provider/ProviderShellBits';

const safeRead = async (read, fallback = []) => { try { return await read(); } catch { return fallback; } };

function friendlyDate(value) {
  return new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${value}T12:00:00+10:00`));
}

function timeOnly(value) {
  return new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function timeRange(row) {
  if (!row.scheduled_start) return 'Time to confirm';
  const start = new Date(row.scheduled_start);
  if (!row.scheduled_end) return timeOnly(start);
  return `${timeOnly(start)} – ${timeOnly(new Date(row.scheduled_end))}`;
}

function firstName(user) {
  if (user?.demo_mode) return 'Alex';
  return String(user?.full_name || user?.email?.split('@')[0] || 'there').trim().split(/\s+/)[0];
}

function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

function customerName(booking) {
  return String(booking.confirmed_customer_contact || 'Confirmed customer').split('·')[0].trim();
}

export default function Calendar() {
  const { user } = useAuth();
  const selectedDate = melbourneDate(new Date());
  const [state, setState] = useState({ loading: true, error: '', rows: [], invitations: [], messageCount: 0 });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      if (user.demo_mode) {
        const demo = loadDemoProviderState(user.id);
        setState({ loading: false, error: '', rows: demo.bookings, invitations: demo.invitations, messageCount: demo.bookings.filter((booking) => booking.state !== 'superseded').length });
        return;
      }
      const [rows, invitations, conversations] = await Promise.all([
        base44.entities.Booking.filter({ provider_id: user.id }),
        base44.entities.Invitation.list(),
        safeRead(() => base44.entities.Conversation.filter({ tradie_id: user.id })),
      ]);
      setState({ loading: false, error: '', rows, invitations, messageCount: conversations.length });
    } catch {
      setState({ loading: false, error: 'Your confirmed schedule could not be loaded.', rows: [], invitations: [], messageCount: 0 });
    }
  }, [user.demo_mode, user.id]);

  useEffect(() => { load(); }, [load]);

  const groups = providerCalendarGroups(state.rows);
  const dayRows = (groups[selectedDate] || []).slice().sort((left, right) => new Date(left.scheduled_start).getTime() - new Date(right.scheduled_start).getTime());
  const nextBooking = useMemo(() => state.rows
    .filter((row) => ['scheduled', 'in_progress'].includes(row.state) && row.scheduled_start && new Date(row.scheduled_start).getTime() >= Date.now() - 4 * 60 * 60 * 1000)
    .sort((left, right) => new Date(left.scheduled_start).getTime() - new Date(right.scheduled_start).getTime())[0] || null, [state.rows]);
  const pendingMatches = state.invitations.filter((row) => projectedInvitationStatus(row) === 'pending').length;
  const unscheduled = state.rows.filter((row) => row.state === 'accepted' && !row.scheduled_start).length;

  if (state.loading) return <ProviderLoading label="Loading calendar" />;
  if (state.error) return <ProviderError message={state.error} onRetry={load} />;

  return <div className="provider-calendar-reference">
    <header className="provider-calendar-greeting"><h1>{greeting()}, {firstName(user)}</h1><p>{friendlyDate(selectedDate)}</p></header>
    <div className="provider-calendar-grid">
      <div className="space-y-5">
        {nextBooking ? <NextAppointment booking={nextBooking} /> : <section className="provider-reference-card provider-next-appointment"><div><h2>Next appointment</h2><p className="mt-5 text-muted-foreground">No confirmed appointment is waiting.</p></div></section>}
        <section className="provider-reference-card provider-day-schedule">
          <h2>Today’s schedule</h2>
          {dayRows.length ? <div className="provider-schedule-list">{dayRows.map((row) => <ScheduleRow key={row.id} row={row} />)}</div> : <div className="provider-schedule-empty"><CalendarDays size={28} /><b>No confirmed work today</b><span>Accepted work without a time remains in Jobs.</span></div>}
        </section>
      </div>
      <aside className="provider-calendar-rail">
        <SummaryCard to="/provider/messages" Icon={MessageSquare} tone="blue" title="Messages" value={state.messageCount ? `${state.messageCount} booking ${state.messageCount === 1 ? 'chat' : 'chats'}` : 'No booking chats'} />
        <section className="provider-reference-card provider-calendar-summary provider-new-jobs-card"><div className="provider-calendar-summary-row"><span className="provider-reference-icon provider-reference-icon-green"><BriefcaseBusiness size={26} /></span><span><b>New jobs</b><small>{pendingMatches ? `${pendingMatches} private ${pendingMatches === 1 ? 'match' : 'matches'}` : 'No new matches'}</small></span><ArrowRight size={20} /></div><Link to="/provider/jobs?section=matches">View jobs</Link></section>
        <section className="provider-reference-card provider-calendar-summary provider-alert-card"><div className="provider-calendar-summary-row"><span className="provider-reference-icon provider-reference-icon-amber"><Bell size={26} /></span><span><b>Alerts</b><small>{unscheduled ? `${unscheduled} needs action` : 'Nothing urgent'}</small></span><ArrowRight size={20} /></div>{unscheduled > 0 && <Link to="/provider/jobs?section=upcoming" className="provider-alert-detail"><b>Schedule needed</b><span>A confirmed job is waiting for a time.</span></Link>}</section>
        <Link to="/provider/account#availability" className="provider-calendar-availability"><CalendarDays size={24} />Set my availability</Link>
      </aside>
    </div>
  </div>;
}

function NextAppointment({ booking }) {
  const labels = providerServiceLabels(booking.service_key, booking.selected_scope_ids);
  const action = booking.state === 'scheduled' ? 'Start job' : 'Open job';
  return <section className="provider-reference-card provider-next-appointment">
    <h2>Next appointment</h2>
    <div className="provider-next-details"><div className="provider-next-time">{timeOnly(booking.scheduled_start)}</div><div className="provider-next-person"><p><UserRound size={21} /><b>{customerName(booking)}</b></p><p><BriefcaseBusiness size={21} />{labels.service}</p><p><MapPin size={21} />{String(booking.confirmed_service_address || 'Ballarat').split(',').slice(1).join(',').trim() || 'Ballarat'}</p></div></div>
    <div className="provider-next-actions"><Link to={`/provider/jobs/${encodeURIComponent(booking.id)}`}>View details</Link><Link to={`/provider/messages?booking=${encodeURIComponent(booking.id)}`}><MessageSquare size={18} />Messages</Link><Link to={`/provider/jobs/${encodeURIComponent(booking.id)}`} className="primary"><Clock3 size={18} />{action}</Link></div>
  </section>;
}

function ScheduleRow({ row }) {
  const labels = providerServiceLabels(row.service_key, row.selected_scope_ids);
  const area = String(row.confirmed_service_address || 'Ballarat').split(',')[1]?.trim() || 'Ballarat';
  return <Link to={`/provider/jobs/${encodeURIComponent(row.id)}`} className="provider-schedule-row"><span className="provider-schedule-time">{timeRange(row)}</span><span className="min-w-0 flex-1"><b>{customerName(row)}</b><small>{labels.service}</small></span><span className="provider-schedule-place"><MapPin size={17} />{area}</span><ArrowRight size={17} /></Link>;
}

function SummaryCard({ to, Icon, tone, title, value }) {
  return <Link to={to} className="provider-reference-card provider-calendar-summary provider-calendar-summary-row"><span className={`provider-reference-icon provider-reference-icon-${tone}`}><Icon size={26} /></span><span className="min-w-0 flex-1"><b>{title}</b><small>{value}</small></span><ArrowRight size={20} /></Link>;
}
