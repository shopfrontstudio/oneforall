import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Bell, BriefcaseBusiness, CalendarDays, ChevronLeft, ChevronRight, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { evidenceExpiryState } from '@/domain/eligibility';
import { melbourneDate, mergeProviderControls, projectedInvitationStatus, providerNextActions, providerServiceLabels } from '@/lib/provider';
import { loadDemoProviderState } from '@/lib/providerDemo';
import { DemoModeNotice, FlagsOffNotice, ProviderError, ProviderLoading } from '@/components/provider/ProviderShellBits';

const safeRead = async (read, fallback = []) => { try { return await read(); } catch { return fallback; } };
const pad = (value) => String(value).padStart(2, '0');
const dateKey = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`;

function monthCells(cursor) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const count = new Date(year, month + 1, 0).getDate();
  const firstMondayIndex = (new Date(year, month, 1).getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const day = index - firstMondayIndex + 1;
    return day > 0 && day <= count ? { day, key: dateKey(year, month, day) } : null;
  });
}

function firstName(user) {
  if (user?.demo_mode) return 'Alex';
  const source = user?.full_name || user?.name || user?.email?.split('@')[0] || 'there';
  return String(source).trim().split(/\s+/)[0];
}

export default function Today() {
  const { user } = useAuth();
  const [view, setView] = useState('upcoming');
  const [month, setMonth] = useState(() => new Date());
  const [state, setState] = useState({
    loading: true, error: '', actions: [], controls: mergeProviderControls(), application: null,
    invitations: [], bookings: [], evidence: [], messageCount: 0,
  });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      if (user.demo_mode) {
        const demo = loadDemoProviderState(user.id);
        const application = { status: 'approved', current_step: 4, completed_steps: [1, 2, 3, 4] };
        setState({
          loading: false, error: '', application, evidence: [], invitations: demo.invitations, bookings: demo.bookings,
          messageCount: demo.bookings.filter((booking) => booking.state !== 'superseded').length, controls: mergeProviderControls({ provider_job_actions_enabled: true }),
          actions: providerNextActions({ application, invitations: demo.invitations, bookings: demo.bookings, evidence: [] }),
        });
        return;
      }
      const [invitations, bookings, offerings, evidence, applications, profiles, controlRows, conversations] = await Promise.all([
        base44.entities.Invitation.list(),
        base44.entities.Booking.filter({ provider_id: user.id }),
        base44.entities.ProviderOffering.filter({ provider_id: user.id }),
        base44.entities.ProviderEvidence.filter({ provider_id: user.id }),
        safeRead(() => base44.entities.ProviderApplication.filter({ provider_id: user.id })),
        base44.entities.TradieProfile.filter({ user_id: user.id }),
        safeRead(() => base44.entities.ProviderFeatureControl.list('-updated_date', 1)),
        safeRead(() => base44.entities.Conversation.filter({ tradie_id: user.id })),
      ]);
      const legacyApproved = profiles[0]?.provider_standing === 'active' || offerings.some((row) => row.review_status === 'approved');
      const application = applications[0] || (legacyApproved ? { status: 'approved' } : null);
      const visibleBookings = bookings.filter((row) => row.state !== 'superseded');
      setState({
        loading: false, error: '', application, invitations, bookings: visibleBookings, evidence,
        messageCount: conversations.length, controls: mergeProviderControls(controlRows[0]),
        actions: providerNextActions({ application, invitations, bookings: visibleBookings, evidence }),
      });
    } catch {
      setState((current) => ({ ...current, loading: false, error: 'Your private provider home could not be loaded.' }));
    }
  }, [user.demo_mode, user.id]);

  useEffect(() => { load(); }, [load]);

  const today = melbourneDate(new Date());
  const jobsByDate = useMemo(() => state.bookings.reduce((groups, booking) => {
    if (!booking.scheduled_start || ['superseded', 'cancelled', 'disputed'].includes(booking.state)) return groups;
    const key = melbourneDate(booking.scheduled_start);
    const visible = view === 'upcoming' ? key >= today : key < today;
    if (!key || !visible) return groups;
    return { ...groups, [key]: [...(groups[key] || []), booking] };
  }, {}), [state.bookings, today, view]);

  const cells = monthCells(month);
  const pendingMatches = state.invitations.filter((row) => projectedInvitationStatus(row) === 'pending').length;
  const evidenceAlerts = state.evidence.filter((row) => ['expired', 'expires_within_7_days', 'expires_within_30_days'].includes(evidenceExpiryState(row.expires_date))).length;
  const unscheduled = state.bookings.filter((row) => row.state === 'accepted' && !row.scheduled_start).length;
  const attentionCount = pendingMatches + evidenceAlerts + unscheduled;
  const monthLabel = new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric' }).format(month);

  if (state.loading) return <ProviderLoading label="Loading provider home" />;
  if (state.error) return <ProviderError message={state.error} onRetry={load} />;

  return <div className="space-y-6">
    <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Provider home</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Welcome back, {firstName(user)}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Your schedule, private matches and account updates—without the clutter.</p>
      </div>
      {state.actions[0] && <Link to={state.actions[0].to} className="provider-glass provider-action-card inline-flex min-h-12 items-center gap-3 self-start rounded-2xl px-4 py-3 sm:max-w-sm sm:self-auto">
        <span className="provider-icon-orb h-9 w-9 shrink-0 rounded-xl text-eucalyptus-deep"><ArrowRight size={17} /></span>
        <span className="min-w-0"><span className="block text-[10px] font-semibold uppercase tracking-[0.15em] text-terracotta">Next action</span><span className="block truncate text-sm font-semibold">{state.actions[0].title}</span></span>
      </Link>}
    </section>

    {user.demo_mode ? <DemoModeNotice /> : !state.controls.provider_job_actions_enabled && <FlagsOffNotice />}

    <div className="provider-segmented grid max-w-md grid-cols-2 gap-1 rounded-2xl p-1.5" role="tablist" aria-label="Calendar job view">
      <button type="button" role="tab" aria-selected={view === 'upcoming'} onClick={() => setView('upcoming')} className={`provider-pill-tab ${view === 'upcoming' ? 'provider-pill-tab-active' : ''}`}>Upcoming jobs</button>
      <button type="button" role="tab" aria-selected={view === 'past'} onClick={() => setView('past')} className={`provider-pill-tab ${view === 'past' ? 'provider-pill-tab-active' : ''}`}>Past jobs</button>
    </div>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(310px,.72fr)]">
      <section className="provider-glass rounded-[28px] p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-terracotta">Monthly overview</p>
            <h2 className="mt-1 text-2xl font-semibold">{monthLabel}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} className="provider-icon-orb flex h-11 w-11 rounded-xl transition hover:-translate-y-0.5" aria-label="Previous month"><ChevronLeft size={19} /></button>
            <button type="button" onClick={() => setMonth(new Date())} className="min-h-11 rounded-xl border border-white/75 bg-white/60 px-4 text-sm font-semibold shadow-sm transition hover:bg-white/90">Today</button>
            <button type="button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} className="provider-icon-orb flex h-11 w-11 rounded-xl transition hover:-translate-y-0.5" aria-label="Next month"><ChevronRight size={19} /></button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-7 overflow-hidden rounded-2xl border border-white/75 bg-white/[0.42] shadow-inner">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <div key={day} className="border-b border-r border-border/[0.55] px-1 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground last:border-r-0 sm:text-xs">{day}</div>)}
          {cells.map((cell, index) => {
            if (!cell) return <div key={`blank-${index}`} className="min-h-16 border-b border-r border-border/[0.45] bg-white/20 sm:min-h-24" />;
            const jobs = jobsByDate[cell.key] || [];
            const isToday = cell.key === today;
            return <div key={cell.key} className="min-h-16 border-b border-r border-border/[0.45] bg-white/[0.28] p-1.5 transition hover:bg-white/60 sm:min-h-24 sm:p-2">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${isToday ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground/75'}`}>{cell.day}</span>
              {jobs.slice(0, 1).map((job) => {
                const label = providerServiceLabels(job.service_key, job.selected_scope_ids).service;
                return <Link key={job.id} to={`/provider/jobs/${encodeURIComponent(job.id)}`} className="mt-1 hidden truncate rounded-lg bg-sage/80 px-2 py-1 text-[10px] font-semibold text-eucalyptus-deep transition hover:bg-sage sm:block">{label}</Link>;
              })}
              {jobs.length > 0 && <span className="mt-1 block h-1.5 w-1.5 rounded-full bg-primary sm:hidden" aria-label={`${jobs.length} scheduled job${jobs.length === 1 ? '' : 's'}`} />}
              {jobs.length > 1 && <span className="mt-1 hidden text-[10px] text-muted-foreground sm:block">+{jobs.length - 1} more</span>}
            </div>;
          })}
        </div>
        <Link to="/provider/calendar" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-eucalyptus-deep hover:underline">Open detailed calendar <ArrowRight size={16} /></Link>
      </section>

      <aside className="grid content-start gap-4">
        <HomeActionCard to="/provider/notifications" Icon={Bell} tone="amber" title="Notifications" value={attentionCount ? `${attentionCount} need attention` : 'All caught up'} />
        <HomeActionCard to="/provider/messages" Icon={MessageSquare} tone="blue" title="Messages" value={state.messageCount ? `${state.messageCount} booking ${state.messageCount === 1 ? 'chat' : 'chats'}` : 'No booking chats yet'} />
        <HomeActionCard to="/provider/jobs?section=matches" Icon={BriefcaseBusiness} tone="green" title="Available jobs" value={pendingMatches ? `${pendingMatches} private ${pendingMatches === 1 ? 'match' : 'matches'}` : 'No new matches'} />
        <Link to="/provider/account#availability" className="group flex min-h-16 items-center justify-between rounded-2xl bg-primary px-5 py-4 text-primary-foreground shadow-[0_18px_36px_-24px_hsl(var(--primary-deep))] transition hover:-translate-y-0.5 hover:bg-eucalyptus-deep">
          <span className="flex items-center gap-3 font-semibold"><CalendarDays size={20} />Set my availability</span><ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
        </Link>
      </aside>
    </div>
  </div>;
}

function HomeActionCard({ to, Icon, tone, title, value }) {
  const tones = {
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-sky-100 text-sky-800',
    green: 'bg-emerald-100 text-emerald-800',
  };
  return <Link to={to} className="provider-glass provider-action-card group flex min-h-28 items-center gap-4 rounded-3xl p-5">
    <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${tones[tone]}`}><Icon size={25} /></span>
    <span className="min-w-0 flex-1"><span className="block text-lg font-semibold">{title}</span><span className="mt-0.5 block text-sm text-muted-foreground">{value}</span></span>
    <ArrowRight size={19} className="shrink-0 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-eucalyptus-deep" />
  </Link>;
}
