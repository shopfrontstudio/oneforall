import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, LockKeyhole, MessageSquare, ShieldCheck } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { EmptyState } from '@/components/oneforall/Bits';
import { formatMelbourneDateTime, providerServiceLabels } from '@/lib/provider';
import { loadDemoProviderState } from '@/lib/providerDemo';
import { DemoModeNotice, ProviderError, ProviderLoading } from '@/components/provider/ProviderShellBits';

function demoConversations(userId) {
  const demo = loadDemoProviderState(userId);
  return demo.bookings.filter((booking) => booking.state !== 'superseded').map((booking) => {
    const labels = providerServiceLabels(booking.service_key, booking.selected_scope_ids);
    return {
      id: `demo-conversation-${booking.id}`,
      booking_id: booking.id,
      job_id: booking.job_id,
      job_title: labels.service,
      customer_name: String(booking.confirmed_customer_contact || 'Demo customer').split('·')[0].trim(),
      contact_unlocked: true,
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
        rows = conversations.map((conversation) => ({
          ...conversation,
          booking_id: conversation.booking_id || bookings.find((booking) => booking.job_id === conversation.job_id)?.id || null,
        }));
      }
      const sorted = rows.sort((left, right) => new Date(right.created_date).getTime() - new Date(left.created_date).getTime());
      setState({ loading: false, error: '', conversations: sorted });
      const preferred = sorted.find((item) => item.booking_id === requestedBooking) || sorted[0];
      if (preferred) await openConversation(preferred);
    } catch {
      setState({ loading: false, error: 'Your private booking messages could not be loaded.', conversations: [] });
    }
  }, [openConversation, requestedBooking, user.demo_mode, user.id]);

  useEffect(() => { load(); }, [load]);

  if (state.loading) return <ProviderLoading label="Loading provider messages" />;
  if (state.error) return <ProviderError message={state.error} onRetry={load} />;

  return <div className="space-y-6">
    <header><p className="text-sm font-medium text-muted-foreground">Confirmed bookings only</p><h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Messages</h1><p className="mt-2 text-sm text-muted-foreground">See each booking conversation in one calm, private inbox.</p></header>
    {user.demo_mode && <DemoModeNotice>These sample conversations stay only in this browser. Open the job to try sending a demo message.</DemoModeNotice>}
    {!state.conversations.length ? <EmptyState icon={MessageSquare} title="No booking conversations yet" body="A private conversation opens only after a customer or OneForAll confirms the booking." /> : <div className="grid min-h-[620px] gap-4 lg:grid-cols-[340px_1fr]">
      <section className={`provider-glass overflow-hidden rounded-[28px] ${active ? 'hidden lg:block' : ''}`} aria-label="Booking conversations">
        <div className="border-b border-border/[0.55] p-4"><p className="text-sm font-semibold">Booking conversations</p><p className="mt-0.5 text-xs text-muted-foreground">{state.conversations.length} confirmed {state.conversations.length === 1 ? 'chat' : 'chats'}</p></div>
        <div className="divide-y divide-border/50">{state.conversations.map((conversation) => <ConversationButton key={conversation.id} conversation={conversation} active={active?.id === conversation.id} onClick={() => openConversation(conversation)} />)}</div>
      </section>

      {active ? <section className="provider-glass flex min-h-[620px] flex-col overflow-hidden rounded-[28px]">
        <div className="flex items-center gap-3 border-b border-border/[0.55] bg-white/[0.36] p-4 sm:p-5">
          <button type="button" onClick={() => setActive(null)} className="provider-icon-orb flex h-10 w-10 rounded-xl lg:hidden" aria-label="Back to conversations"><ArrowLeft size={17} /></button>
          <span className="provider-icon-orb h-11 w-11 shrink-0 rounded-full text-sm font-semibold text-eucalyptus-deep">{initials(active.customer_name)}</span>
          <div className="min-w-0 flex-1"><h2 className="truncate text-lg font-semibold">{active.customer_name || 'Customer'}</h2><p className="flex items-center gap-1.5 text-xs text-eucalyptus-deep"><ShieldCheck size={13} />Private confirmed-booking chat</p></div>
        </div>
        <div className="border-b border-border/[0.45] bg-sage/[0.36] px-5 py-3"><p className="flex items-center gap-2 text-sm font-semibold"><LockKeyhole size={15} />{active.job_title || 'Confirmed service booking'}</p></div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">
          {messages.length ? messages.map((message) => {
            const mine = user.demo_mode ? message.sender === 'provider' : message.sender_id === user.id;
            return <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[84%] rounded-2xl px-4 py-3 text-sm shadow-sm ${mine ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md border border-white/70 bg-white/[0.76]'}`}><p>{message.body}</p><p className={`mt-1 text-[10px] ${mine ? 'text-white/[0.65]' : 'text-muted-foreground'}`}>{formatMelbourneDateTime(message.created_date)}</p></div></div>;
          }) : <div className="flex h-full items-center justify-center text-center"><div><MessageSquare className="mx-auto text-eucalyptus-deep" /><p className="mt-2 text-sm font-semibold">No messages in this booking yet</p><p className="mt-1 text-xs text-muted-foreground">The secure chat remains attached to the confirmed job.</p></div></div>}
        </div>
        <div className="border-t border-border/[0.55] bg-white/[0.38] p-4">
          {active.booking_id ? <Link to={`/provider/jobs/${encodeURIComponent(active.booking_id)}`} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-eucalyptus-deep">Open secure job chat <ArrowRight size={17} /></Link> : <Link to="/messages" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-eucalyptus-deep">Open booking messages <ArrowRight size={17} /></Link>}
        </div>
      </section> : <section className="provider-glass hidden min-h-[620px] items-center justify-center rounded-[28px] lg:flex"><div className="text-center"><MessageSquare className="mx-auto text-eucalyptus-deep" /><p className="mt-3 font-semibold">Choose a conversation</p><p className="mt-1 text-sm text-muted-foreground">Messages stay attached to confirmed jobs.</p></div></section>}
    </div>}
  </div>;
}

function initials(name) {
  return String(name || 'Customer').split(/\s+/).map((part) => part[0]).join('').slice(0, 2);
}

function ConversationButton({ conversation, active, onClick }) {
  return <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 p-4 text-left transition hover:bg-white/[0.62] ${active ? 'provider-conversation-active bg-sage/[0.55]' : ''}`}><span className="provider-icon-orb h-11 w-11 shrink-0 rounded-full text-sm font-semibold text-eucalyptus-deep">{initials(conversation.customer_name)}</span><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{conversation.customer_name || 'Customer'}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{conversation.job_title || 'Confirmed booking'}</span></span><ArrowRight size={15} className="shrink-0 text-muted-foreground" /></button>;
}
