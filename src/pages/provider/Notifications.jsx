import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Bell, BriefcaseBusiness, CalendarDays, FileWarning, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { evidenceExpiryState } from '@/domain/eligibility';
import { formatMelbourneDateTime, projectedInvitationStatus, providerServiceLabels } from '@/lib/provider';
import { loadDemoProviderState } from '@/lib/providerDemo';
import ProviderTitleBar from '@/components/provider/ProviderTitleBar';
import { ProviderError, ProviderLoading } from '@/components/provider/ProviderShellBits';

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
        setState({
          loading: false,
          error: '',
          invitations: demo.invitations,
          bookings: demo.bookings,
          evidence: [],
          conversations: demo.bookings
            .filter((booking) => booking.state !== 'superseded')
            .map((booking) => ({ id: `demo-conversation-${booking.id}`, created_date: booking.created_date })),
        });
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

  const attentionItems = items.filter((item) => item.attention);
  const earlierItems = items.filter((item) => !item.attention);
  const groups = filter === 'attention'
    ? [{ label: 'Needs action', items: attentionItems }]
    : [{ label: 'Today', items: attentionItems }, { label: 'Earlier', items: earlierItems }];
  const visibleGroups = groups.filter((group) => group.items.length);
  const firstPriority = attentionItems[0];

  if (state.loading) return <ProviderLoading label="Loading notifications" />;
  if (state.error) return <ProviderError message={state.error} onRetry={load} />;

  return <div className="provider-notifications-reference">
    <ProviderTitleBar title="Notifications" subtitle="Important matches, schedule changes and account reminders" />
    <div className="provider-notification-toolbar">
      <div className="provider-notification-tabs" role="tablist" aria-label="Notification filters">
        <button type="button" role="tab" aria-selected={filter === 'all'} onClick={() => setFilter('all')} className={filter === 'all' ? 'active' : ''}>All <span>{items.length}</span></button>
        <button type="button" role="tab" aria-selected={filter === 'attention'} onClick={() => setFilter('attention')} className={filter === 'attention' ? 'active' : ''}>Needs action <span>{attentionItems.length}</span></button>
      </div>
      {firstPriority ? <Link to={firstPriority.to} className="provider-notification-priority">Review priority <ArrowRight size={18} /></Link> : <span className="provider-notification-priority disabled">All caught up</span>}
    </div>
    {visibleGroups.length ? <div className="provider-notification-groups">{visibleGroups.map((group) => <section key={group.label} className="provider-notification-group"><h2>{group.label}</h2><div className="provider-reference-card provider-notification-list">{group.items.map((item) => <NotificationRow key={item.id} item={item} />)}</div></section>)}</div> : <section className="provider-reference-card provider-notification-empty"><Bell size={36} /><h2>All caught up</h2><p>{filter === 'attention' ? 'Nothing needs your attention right now.' : 'New private matches and schedule updates will appear here.'}</p></section>}
  </div>;
}

function NotificationRow({ item }) {
  const Icon = item.Icon;
  return <Link to={item.to} className="provider-notification-row">
    <span className={`provider-reference-icon provider-reference-icon-${item.tone}`}><Icon size={25} /></span>
    <span className="min-w-0 flex-1"><b>{item.title}</b><small>{item.body}</small></span>
    <span className="provider-notification-meta"><small>{item.meta}</small>{item.attention && <i aria-label="Needs attention" />}<ArrowRight size={19} /></span>
  </Link>;
}
