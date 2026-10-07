import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Bell, BriefcaseBusiness, ChevronLeft, ChevronRight, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { evidenceExpiryState } from '@/domain/eligibility';
import { melbourneDate, projectedInvitationStatus, providerServiceLabels } from '@/lib/provider';
import { loadDemoProviderState } from '@/lib/providerDemo';
import { ProviderError, ProviderLoading } from '@/components/provider/ProviderShellBits';

const safeRead = async (read, fallback = []) => { try { return await read(); } catch { return fallback; } };
const pad = (value) => String(value).padStart(2, '0');
const dateKey = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`;

function monthCells(cursor) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const count = new Date(year, month + 1, 0).getDate();
  const firstMondayIndex = (new Date(year, month, 1).getDay() + 6) % 7;
  const visibleCellCount = Math.ceil((firstMondayIndex + count) / 7) * 7;
  return Array.from({ length: visibleCellCount }, (_, index) => {
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
  const [state, setState] = useState({ loading: true, error: '', invitations: [], bookings: [], evidence: [], messageCount: 0 });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      if (user.demo_mode) {
        const demo = loadDemoProviderState(user.id);
        setState({ loading: false, error: '', invitations: demo.invitations, bookings: demo.bookings, evidence: [], messageCount: demo.bookings.filter((booking) => booking.state !== 'superseded').length });
        return;
      }
      const [invitations, bookings, evidence, conversations] = await Promise.all([
        base44.entities.Invitation.list(),
        base44.entities.Booking.filter({ provider_id: user.id }),
        base44.entities.ProviderEvidence.filter({ provider_id: user.id }),
        safeRead(() => base44.entities.Conversation.filter({ tradie_id: user.id })),
      ]);
      setState({ loading: false, error: '', invitations, bookings: bookings.filter((row) => row.state !== 'superseded'), evidence, messageCount: conversations.length });
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

  return <div className="provider-home-reference">
    <header className="provider-home-heading"><p>Home</p><h1>Welcome back, {firstName(user)}</h1></header>
    <div className="provider-home-tabs" role="tablist" aria-label="Calendar job view">
      <button type="button" role="tab" aria-selected={view === 'upcoming'} onClick={() => setView('upcoming')} className={view === 'upcoming' ? 'active' : ''}>Upcoming jobs</button>
      <button type="button" role="tab" aria-selected={view === 'past'} onClick={() => setView('past')} className={view === 'past' ? 'active' : ''}>Past jobs</button>
    </div>
    <div className="provider-home-grid">
      <section className="provider-reference-card provider-month-card">
        <div className="provider-month-heading"><h2>{monthLabel}</h2><div>
          <button type="button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} aria-label="Previous month"><ChevronLeft size={22} /></button>
          <button type="button" onClick={() => setMonth(new Date())}>Today</button>
          <button type="button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} aria-label="Next month"><ChevronRight size={22} /></button>
        </div></div>
        <div className="provider-month-grid">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <div key={day} className="provider-month-weekday">{day}</div>)}
          {cells.map((cell, index) => {
            if (!cell) return <div key={`blank-${index}`} className="provider-month-day provider-month-empty" />;
            const jobs = jobsByDate[cell.key] || [];
            const isToday = cell.key === today;
            return <div key={cell.key} className="provider-month-day"><span className={isToday ? 'provider-month-today' : ''}>{cell.day}</span>
              {jobs.slice(0, 1).map((job) => <Link key={job.id} to={`/provider/jobs/${encodeURIComponent(job.id)}`} className="provider-month-job">{providerServiceLabels(job.service_key, job.selected_scope_ids).service}</Link>)}
              {jobs.length > 0 && <span className="provider-month-dot" aria-label={`${jobs.length} scheduled job${jobs.length === 1 ? '' : 's'}`} />}
            </div>;
          })}
        </div>
        <Link to="/provider/calendar" className="provider-open-calendar">Open calendar <ArrowRight size={17} /></Link>
      </section>
      <aside className="provider-home-actions">
        <HomeActionCard to="/provider/notifications" Icon={Bell} tone="amber" title="Notifications" value={attentionCount ? `${attentionCount} new` : 'All caught up'} />
        <HomeActionCard to="/provider/messages" Icon={MessageSquare} tone="blue" title="Messages" value={state.messageCount ? `${state.messageCount} booking ${state.messageCount === 1 ? 'chat' : 'chats'}` : 'No new messages'} />
        <HomeActionCard to="/provider/jobs?section=matches" Icon={BriefcaseBusiness} tone="green" title="Available jobs" value={pendingMatches ? `${pendingMatches} private ${pendingMatches === 1 ? 'match' : 'matches'}` : 'No new matches'} />
      </aside>
    </div>
  </div>;
}

function HomeActionCard({ to, Icon, tone, title, value }) {
  return <Link to={to} className="provider-reference-card provider-home-action"><span className={`provider-reference-icon provider-reference-icon-${tone}`}><Icon size={34} /></span><span className="min-w-0 flex-1"><b>{title}</b><span>{value}</span></span><ArrowRight size={24} /></Link>;
}
