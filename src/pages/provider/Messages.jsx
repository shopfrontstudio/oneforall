import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Check, LockKeyhole, MessageSquare, Paperclip, Send } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { formatMelbourneDateTime, providerServiceLabels } from '@/lib/provider';
import { loadDemoProviderState, sendDemoProviderMessage } from '@/lib/providerDemo';
import ProviderTitleBar from '@/components/provider/ProviderTitleBar';
import { ProviderError, ProviderLoading } from '@/components/provider/ProviderShellBits';

function demoConversations(userId) {
  const demo = loadDemoProviderState(userId);
  return demo.bookings.filter((booking) => booking.state !== 'superseded').map((booking) => {
    const labels = providerServiceLabels(booking.service_key, booking.selected_scope_ids);
    const bookingMessages = demo.messages.filter((message) => message.booking_id === booking.id);
    const latest = bookingMessages.at(-1);
    return {
      id: `demo-conversation-${booking.id}`,
      booking_id: booking.id,
      job_id: booking.job_id,
      job_title: labels.service,
      customer_name: String(booking.confirmed_customer_contact || 'Demo customer').split('·')[0].trim(),
      scheduled_start: booking.scheduled_start,
      last_message_preview: latest?.body || 'Confirmed booking conversation',
      updated_date: latest?.created_date || booking.created_date,
      created_date: booking.created_date,
      demo: true,
    };
  });
}

export default function ProviderMessages() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const requestedBooking = params.get('booking');
  const [state, setState] = useState({ loading: true, error: '', conversations: [] });
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const openConversation = useCallback(async (conversation) => {
    setActive(conversation);
    const rows = user.demo_mode
      ? loadDemoProviderState(user.id).messages.filter((item) => item.booking_id === conversation.booking_id)
      : await base44.entities.Message.filter({ conversation_id: conversation.id });
    setMessages(rows.sort((left, right) => new Date(left.created_date).getTime() - new Date(right.created_date).getTime()));
  }, [user.demo_mode, user.id]);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      let rows;
      if (user.demo_mode) rows = demoConversations(user.id);
      else {
        const [conversations, bookings] = await Promise.all([
          base44.entities.Conversation.filter({ tradie_id: user.id }),
          base44.entities.Booking.filter({ provider_id: user.id }),
        ]);
        rows = conversations.map((conversation) => {
          const booking = bookings.find((item) => item.job_id === conversation.job_id || item.id === conversation.booking_id);
          return { ...conversation, booking_id: conversation.booking_id || booking?.id || null, scheduled_start: booking?.scheduled_start || null };
        });
      }
      const sorted = rows.sort((left, right) => new Date(right.updated_date || right.created_date).getTime() - new Date(left.updated_date || left.created_date).getTime());
      setState({ loading: false, error: '', conversations: sorted });
      const preferred = sorted.find((item) => item.booking_id === requestedBooking) || sorted[0];
      if (preferred) await openConversation(preferred);
    } catch {
      setState({ loading: false, error: 'Your private booking messages could not be loaded.', conversations: [] });
    }
  }, [openConversation, requestedBooking, user.demo_mode, user.id]);

  useEffect(() => { load(); }, [load]);

  const sendDemoMessage = async (event) => {
    event.preventDefault();
    if (!user.demo_mode || !active?.booking_id || !draft.trim() || busy) return;
    setBusy(true);
    try {
      sendDemoProviderMessage(user.id, active.booking_id, draft.trim());
      setDraft('');
      await openConversation(active);
      setState((current) => ({ ...current, conversations: demoConversations(user.id) }));
    } finally { setBusy(false); }
  };

  if (state.loading) return <ProviderLoading label="Loading provider messages" />;
  if (state.error) return <ProviderError message={state.error} onRetry={load} />;

  return <div className="provider-messages-reference">
    <ProviderTitleBar title="Messages" subtitle="Stay in touch inside confirmed bookings" />
    {!state.conversations.length ? <section className="provider-reference-card provider-messages-empty"><MessageSquare size={34} /><h2>No booking conversations yet</h2><p>A private conversation opens only after a booking is confirmed.</p></section> : <div className="provider-messages-grid">
      <section className={`provider-reference-card provider-conversation-list ${active ? 'mobile-hidden' : ''}`} aria-label="Booking conversations">
        {state.conversations.map((conversation) => <ConversationButton key={conversation.id} conversation={conversation} active={active?.id === conversation.id} onClick={() => openConversation(conversation)} />)}
      </section>
      {active ? <section className="provider-reference-card provider-message-panel">
        <div className="provider-message-person"><button type="button" onClick={() => setActive(null)} aria-label="Back to conversations"><ArrowLeft size={19} /></button><span>{initials(active.customer_name)}</span><div><h2>{active.customer_name || 'Customer'}</h2><p><LockKeyhole size={13} />Private confirmed-booking chat</p></div></div>
        <div className="provider-message-appointment"><CalendarDays size={24} /><b>{active.scheduled_start ? `${formatMelbourneDateTime(active.scheduled_start)} appointment` : active.job_title || 'Confirmed booking'}</b></div>
        <div className="provider-message-thread"><span className="provider-message-day">Today</span>{messages.length ? messages.map((message) => {
          const mine = user.demo_mode ? message.sender === 'provider' : message.sender_id === user.id;
          return <div key={message.id} className={`provider-message-line ${mine ? 'mine' : ''}`}><div><p>{message.body}</p><small>{formatMelbourneDateTime(message.created_date)}{mine && <Check size={14} />}</small></div></div>;
        }) : <div className="provider-message-no-content"><MessageSquare size={28} /><b>No messages in this booking yet</b><span>The secure chat remains attached to the confirmed job.</span></div>}</div>
        <form className="provider-message-composer" onSubmit={sendDemoMessage}><button type="button" disabled aria-label="Attachments are not available yet"><Paperclip size={22} /></button><input value={draft} onChange={(event) => setDraft(event.target.value)} disabled={!user.demo_mode} maxLength={1000} placeholder={user.demo_mode ? 'Write a message…' : 'Reply inside the confirmed job'} />{user.demo_mode ? <button type="submit" disabled={busy || !draft.trim()}><Send size={18} />Send</button> : <Link to={active.booking_id ? `/provider/jobs/${encodeURIComponent(active.booking_id)}` : '/provider/jobs'}>Open job <ArrowRight size={17} /></Link>}</form>
      </section> : <section className="provider-reference-card provider-message-panel provider-message-placeholder"><MessageSquare size={34} /><b>Choose a conversation</b></section>}
    </div>}
  </div>;
}

function initials(name) {
  return String(name || 'Customer').split(/\s+/).map((part) => part[0]).join('').slice(0, 2);
}

function ConversationButton({ conversation, active, onClick }) {
  return <button type="button" onClick={onClick} className={`provider-conversation-row ${active ? 'active' : ''}`}><span className="provider-conversation-avatar">{initials(conversation.customer_name)}</span><span className="min-w-0 flex-1"><b>{conversation.customer_name || 'Customer'}</b><small>{conversation.last_message_preview || conversation.job_title || 'Confirmed booking'}</small></span><span className="provider-conversation-meta"><small>{conversation.updated_date ? new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', day: 'numeric', month: 'short' }).format(new Date(conversation.updated_date)) : ''}</small><i /></span></button>;
}
