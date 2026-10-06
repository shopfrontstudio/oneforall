import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Bell, BriefcaseBusiness, CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { EmptyState } from '@/components/oneforall/Bits';
import { formatMelbourneDateTime, melbourneDate, projectedInvitationStatus, providerCalendarGroups, providerServiceLabels } from '@/lib/provider';
import { loadDemoProviderState } from '@/lib/providerDemo';
import { DemoModeNotice, ProviderError, ProviderLoading } from '@/components/provider/ProviderShellBits';

const safeRead = async (read, fallback = []) => { try { return await read(); } catch { return fallback; } };

function shiftDate(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function friendlyDate(value) {
  return new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${value}T12:00:00+10:00`));
}

function timeOnly(value) {
  return new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

export default function Calendar() {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(() => melbourneDate(new Date()));
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

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-sm font-medium text-muted-foreground">Your workday</p><h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Calendar</h1><p className="mt-2 text-sm text-muted-foreground">Confirmed work in Ballarat time. Availability is managed from Account.</p></div>
      <Link to="/provider/account#availability" className="inline-flex min-h-11 items-center gap-2 self-start rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:-translate-y-0.5 hover:bg-eucalyptus-deep sm:self-auto"><CalendarDays size={17} />Set availability</Link>
    </header>
    {user.demo_mode && <DemoModeNotice>Sample appointments and schedules are stored only in this browser.</DemoModeNotice>}

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(310px,.72fr)]">
      <div className="space-y-5">
        {nextBooking && <NextAppointment booking={nextBooking} />}

        <section className="provider-glass rounded-[28px] p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-terracotta">Day schedule</p><h2 className="mt-1 text-2xl font-semibold">{friendlyDate(selectedDate)}</h2></div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setSelectedDate((current) => shiftDate(current, -1))} className="provider-icon-orb flex h-11 w-11 rounded-xl transition hover:-translate-y-0.5" aria-label="Previous day"><ChevronLeft size={19} /></button>
              <button type="button" onClick={() => setSelectedDate(melbourneDate(new Date()))} className="min-h-11 rounded-xl border border-white/75 bg-white/[0.65] px-4 text-sm font-semibold transition hover:bg-white">Today</button>
              <button type="button" onClick={() => setSelectedDate((current) => shiftDate(current, 1))} className="provider-icon-orb flex h-11 w-11 rounded-xl transition hover:-translate-y-0.5" aria-label="Next day"><ChevronRight size={19} /></button>
            </div>
          </div>

          {dayRows.length ? <div className="relative mt-6 space-y-3 pl-5 before:absolute before:bottom-4 before:left-[7px] before:top-4 before:w-px before:bg-primary/[0.18]">
            {dayRows.map((row) => {
              const labels = providerServiceLabels(row.service_key, row.selected_scope_ids);
              return <Link key={row.id} to={`/provider/jobs/${encodeURIComponent(row.id)}`} className="provider-action-card relative flex flex-col gap-3 rounded-2xl border border-white/75 bg-white/[0.62] p-4 shadow-sm before:absolute before:-left-[22px] before:top-6 before:h-3 before:w-3 before:rounded-full before:border-[3px] before:border-white before:bg-primary sm:flex-row sm:items-center">
                <span className="min-w-28 text-sm font-semibold text-eucalyptus-deep">{timeOnly(row.scheduled_start)}</span>
                <span className="min-w-0 flex-1"><b className="block truncate">{labels.service}</b><span className="mt-0.5 block truncate text-sm text-muted-foreground">{labels.scopes.join(', ') || 'Confirmed service scope'}</span></span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin size={14} />{String(row.confirmed_service_address || 'Ballarat').split(',')[1]?.trim() || 'Ballarat'}</span>
                <ArrowRight size={17} className="shrink-0" />
              </Link>;
            })}
          </div> : <div className="mt-6"><EmptyState icon={CalendarDays} title="No confirmed work this day" body="Use the arrows to check another day. Accepted work without a time remains in Jobs." /></div>}
        </section>
      </div>

      <aside className="grid content-start gap-4">
        <SideLink to="/provider/messages" Icon={MessageSquare} title="Messages" value={state.messageCount ? `${state.messageCount} booking ${state.messageCount === 1 ? 'chat' : 'chats'}` : 'No booking chats'} tone="blue" />
        <SideLink to="/provider/jobs?section=matches" Icon={BriefcaseBusiness} title="New jobs" value={pendingMatches ? `${pendingMatches} private ${pendingMatches === 1 ? 'match' : 'matches'}` : 'No new matches'} tone="green" />
        <SideLink to="/provider/notifications" Icon={Bell} title="Alerts" value={unscheduled ? `${unscheduled} ${unscheduled === 1 ? 'job needs' : 'jobs need'} scheduling` : 'Nothing urgent'} tone="amber" />
        <Link to="/provider/account#availability" className="group flex min-h-16 items-center justify-between rounded-2xl bg-primary px-5 py-4 text-primary-foreground shadow-lg transition hover:-translate-y-0.5 hover:bg-eucalyptus-deep"><span className="flex items-center gap-3 font-semibold"><CalendarDays size={20} />Set my availability</span><ArrowRight size={18} className="transition-transform group-hover:translate-x-1" /></Link>
      </aside>
    </div>
  </div>;
}

function NextAppointment({ booking }) {
  const labels = providerServiceLabels(booking.service_key, booking.selected_scope_ids);
  const action = booking.state === 'scheduled' ? 'Start job' : 'Open job';
  return <section className="provider-glass provider-glass-warm rounded-[28px] p-5 sm:p-6">
    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-terracotta">Next appointment</p>
    <div className="mt-3 grid gap-5 md:grid-cols-[minmax(0,.7fr)_minmax(0,1.3fr)] md:items-center">
      <div><p className="text-3xl font-semibold tracking-tight">{timeOnly(booking.scheduled_start)}</p><p className="mt-1 text-sm text-muted-foreground">{formatMelbourneDateTime(booking.scheduled_start)}</p></div>
      <div><h2 className="text-xl font-semibold">{labels.service}</h2><p className="mt-1 text-sm text-muted-foreground">{labels.scopes.join(', ') || 'Confirmed scope'} · {booking.attending_worker_display_name}</p><p className="mt-2 flex items-center gap-2 text-sm font-medium"><MapPin size={16} className="text-eucalyptus-deep" />{booking.confirmed_service_address || 'Confirmed details available in the job'}</p></div>
    </div>
    <div className="mt-5 grid gap-2 sm:grid-cols-3">
      <Link to={`/provider/jobs/${encodeURIComponent(booking.id)}`} className="flex min-h-12 items-center justify-center rounded-xl border border-primary/25 bg-white/[0.65] px-4 text-sm font-semibold text-eucalyptus-deep transition hover:bg-white">View details</Link>
      <Link to={`/provider/messages?booking=${encodeURIComponent(booking.id)}`} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-sage/75 px-4 text-sm font-semibold text-eucalyptus-deep transition hover:bg-sage"><MessageSquare size={17} />Messages</Link>
      <Link to={`/provider/jobs/${encodeURIComponent(booking.id)}`} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-eucalyptus-deep"><Clock3 size={17} />{action}</Link>
    </div>
  </section>;
}

function SideLink({ to, Icon, title, value, tone }) {
  const tones = { blue: 'bg-sky-100 text-sky-800', green: 'bg-emerald-100 text-emerald-800', amber: 'bg-amber-100 text-amber-700' };
  return <Link to={to} className="provider-glass provider-action-card group flex min-h-28 items-center gap-4 rounded-3xl p-5"><span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${tones[tone]}`}><Icon size={24} /></span><span className="min-w-0 flex-1"><b className="block text-lg">{title}</b><span className="mt-0.5 block text-sm text-muted-foreground">{value}</span></span><ArrowRight size={18} className="shrink-0 transition group-hover:translate-x-1" /></Link>;
}
