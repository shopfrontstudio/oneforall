import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Bell, BriefcaseBusiness, CalendarDays, FileWarning, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { evidenceExpiryState } from '@/domain/eligibility';
import { formatMelbourneDateTime, projectedInvitationStatus, providerServiceLabels } from '@/lib/provider';
import { loadDemoProviderState } from '@/lib/providerDemo';
import { DemoModeNotice, ProviderError, ProviderLoading } from '@/components/provider/ProviderShellBits';

const safeRead = async (read, fallback = []) => { try { return await read(); } catch { return fallback; } };

export default function Notifications() {
  const { user } = useAuth();
  const [filter, setFilter] = useState('all');
  const [state, setState] = useState({ loading: true, error: '', invitations: [], bookings: [], evidence: [], conversations: [] });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      if (user.demo_mode) {
        const demo = loadDemoProviderState(user.id);
        setState({ loading: false, error: '', invitations: demo.invitations, bookings: demo.bookings, evidence: [], conversations: demo.bookings.filter((booking) => booking.state !== 'superseded').map((booking) => ({ id: `demo-conversation-${booking.id}`, created_date: booking.created_date })) });
        return;
      }
      const [invitations, bookings, evidence, conversations] = await Promise.all([
        base44.entities.Invitation.list(),
        base44.entities.Booking.filter({ provider_id: user.id }),
        base44.entities.ProviderEvidence.filter({ provider_id: user.id }),
        safeRead(() => base44.entities.Conversation.filter({ tradie_id: user.id })),
      ]);
      setState({ loading: false, error: '', invitations, bookings, evidence, conversations });
    } catch {
      setState({ loading: false, error: 'Your provider updates could not be loaded.', invitations: [], bookings: [], evidence: [], conversations: [] });
    }
  }, [user.demo_mode, user.id]);

  useEffect(() => { load(); }, [load]);

  const items = useMemo(() => {
    const notifications = [];
    state.invitations.filter((row) => projectedInvitationStatus(row) === 'pending').forEach((row) => {
      const labels = providerServiceLabels(row.service_key, row.selected_scope_ids);
      notifications.push({ id: `match-${row.id}`, attention: true, Icon: BriefcaseBusiness, tone: 'green', title: 'New private match', body: `${row.job_title || labels.service} · ${row.service_area || 'Ballarat area'}`, meta: row.preferred_date || 'Flexible timing', to: `/provider/jobs/matches/${encodeURIComponent(row.id)}` });
    });
    state.bookings.filter((row) => row.state === 'accepted' && !row.scheduled_start).forEach((row) => {
      const labels = providerServiceLabels(row.service_key, row.selected_scope_ids);
      notifications.push({ id: `schedule-${row.id}`, attention: true, Icon: CalendarDays, tone: 'amber', title: 'Schedule needed', body: `${labels.service} is confirmed and waiting for a time.`, meta: 'Action needed', to: `/provider/jobs/${encodeURIComponent(row.id)}` });
    });
    state.bookings.filter((row) => row.state === 'scheduled' && row.scheduled_start).slice(0, 3).forEach((row) => {
      const labels = providerServiceLabels(row.service_key, row.selected_scope_ids);
      notifications.push({ id: `confirmed-${row.id}`, attention: false, Icon: CalendarDays, tone: 'blue', title: 'Schedule confirmed', body: `${labels.service} · ${formatMelbourneDateTime(row.scheduled_start)}`, meta: 'Confirmed', to: `/provider/jobs/${encodeURIComponent(row.id)}` });
    });
    state.evidence.filter((row) => ['expired', 'expires_within_7_days', 'expires_within_30_days'].includes(evidenceExpiryState(row.expires_date))).forEach((row) => {
      notifications.push({ id: `evidence-${row.id}`, attention: true, Icon: FileWarning, tone: 'amber', title: 'Verification needs attention', body: 'A provider document is expired or approaching expiry.', meta: 'Review account', to: '/provider/account#verification' });
    });
    if (state.conversations.length) notifications.push({ id: 'messages', attention: false, Icon: MessageSquare, tone: 'blue', title: 'Booking messages available', body: `${state.conversations.length} confirmed ${state.conversations.length === 1 ? 'conversation is' : 'conversations are'} ready to review.`, meta: 'Private chat', to: '/provider/messages' });
    return notifications;
  }, [state.bookings, state.conversations.length, state.evidence, state.invitations]);

  const visible = filter === 'attention' ? items.filter((item) => item.attention) : items;
  const attention = items.filter((item) => item.attention).length;

  if (state.loading) return <ProviderLoading label="Loading notifications" />;
  if (state.error) return <ProviderError message={state.error} onRetry={load} />;

  return <div className="space-y-6">
    <header><p className="text-sm font-medium text-muted-foreground">Provider activity</p><h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Notifications</h1><p className="mt-2 text-sm text-muted-foreground">Important matches, schedule changes and verification reminders in one place.</p></header>
    {user.demo_mode && <DemoModeNotice>These updates reflect the browser-only demo journey.</DemoModeNotice>}
    <div className="provider-segmented grid max-w-md grid-cols-2 gap-1 rounded-2xl p-1.5" role="tablist" aria-label="Notification filters">
      <button type="button" role="tab" aria-selected={filter === 'all'} onClick={() => setFilter('all')} className={`provider-pill-tab ${filter === 'all' ? 'provider-pill-tab-active' : ''}`}>All updates <span className="ml-1 text-xs">{items.length}</span></button>
      <button type="button" role="tab" aria-selected={filter === 'attention'} onClick={() => setFilter('attention')} className={`provider-pill-tab ${filter === 'attention' ? 'provider-pill-tab-active' : ''}`}>Needs action <span className="ml-1 text-xs">{attention}</span></button>
    </div>
    {visible.length ? <section className="space-y-3">{visible.map((item) => <NotificationCard key={item.id} item={item} />)}</section> : <section className="provider-glass rounded-[28px] p-10 text-center"><Bell className="mx-auto text-eucalyptus-deep" /><h2 className="mt-3 text-lg font-semibold">All caught up</h2><p className="mt-1 text-sm text-muted-foreground">New private matches and schedule updates will appear here.</p></section>}
  </div>;
}

function NotificationCard({ item }) {
  const tones = { green: 'bg-emerald-100 text-emerald-800', blue: 'bg-sky-100 text-sky-800', amber: 'bg-amber-100 text-amber-700' };
  const Icon = item.Icon;
  return <Link to={item.to} className={`provider-glass provider-action-card group flex items-start gap-4 rounded-3xl p-4 sm:items-center sm:p-5 ${item.attention ? 'ring-1 ring-terracotta/20' : ''}`}><span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tones[item.tone]}`}><Icon size={22} /></span><span className="min-w-0 flex-1"><span className="block text-lg font-semibold">{item.title}</span><span className="mt-0.5 block text-sm text-muted-foreground">{item.body}</span></span><span className="flex shrink-0 items-center gap-2 text-xs font-semibold text-muted-foreground"><span className="hidden sm:inline">{item.meta}</span><ArrowRight size={17} className="transition group-hover:translate-x-1 group-hover:text-eucalyptus-deep" /></span></Link>;
}
