import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { MessageSquare, Send, ShieldCheck, ArrowLeft, Lock } from 'lucide-react';
import { EmptyState } from '@/components/oneforall/Bits';

export default function Messages() {
  const { user } = useAuth();
  const [convos, setConvos] = useState(null);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const endRef = useRef(null);

  const loadConvos = useCallback(async () => {
    const [asC, asT] = await Promise.all([
      base44.entities.Conversation.filter({ customer_id: user.id }),
      base44.entities.Conversation.filter({ tradie_id: user.id }),
    ]);
    const all = [...asC, ...asT].filter((v, i, a) => a.findIndex(x => x.id === v.id) === i);
    setConvos(all.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
  }, [user.id]);

  useEffect(() => { loadConvos(); }, [loadConvos]);

  const openConvo = async (c) => {
    setActive(c);
    const msgs = await base44.entities.Message.filter({ conversation_id: c.id });
    setMessages(msgs.sort((a, b) => new Date(a.created_date) - new Date(b.created_date)));
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const send = async () => {
    if (!text.trim() || !active) return;
    const isCustomer = active.customer_id === user.id;
    const msg = await base44.entities.Message.create({ conversation_id: active.id, sender_id: user.id, sender_name: user.full_name || user.email, body: text.trim() });
    setMessages(m => [...m, msg]); setText('');
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    // simulate tradie auto-acknowledge for demo liveliness
    if (isCustomer) {
      setTimeout(async () => {
        const reply = await base44.entities.Message.create({ conversation_id: active.id, sender_id: active.tradie_id, sender_name: active.tradie_id === user.id ? 'You' : 'Tradie', body: 'Thanks for the message — I\'ll take a look and get back to you shortly.' });
        setMessages(m => [...m, reply]);
        setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
      }, 1400);
    }
  };

  if (convos === null) return <div className="glass-soft rounded-2xl h-40 animate-pulse" />;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-4">Messages</h1>
      {convos.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No conversations yet" body="Once you accept a tradie's interest request, your private chat opens here." />
      ) : (
        <div className="grid md:grid-cols-[300px_1fr] gap-3">
          <div className={`glass-soft rounded-2xl divide-y divide-border/50 ${active ? 'hidden md:block' : ''}`}>
            {convos.map(c => {
              const other = c.customer_id === user.id ? 'Tradie' : c.customer_name || 'Customer';
              return (
                <button key={c.id} onClick={() => openConvo(c)} className={`w-full text-left p-3.5 hover:bg-white/60 ${active?.id === c.id ? 'bg-white/70' : ''}`}>
                  <div className="font-medium text-sm truncate">{c.job_title}</div>
                  <div className="text-xs text-muted-foreground">{other} {c.contact_unlocked ? '' : '· contact locked'}</div>
                </button>
              );
            })}
          </div>

          {active ? (
            <div className={`glass rounded-2xl flex flex-col h-[60vh] ${active ? '' : 'hidden md:flex'}`}>
              <div className="p-3.5 border-b border-border/50 flex items-center gap-2">
                <button onClick={() => setActive(null)} className="md:hidden w-8 h-8 rounded-lg glass-soft flex items-center justify-center"><ArrowLeft size={16} /></button>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{active.job_title}</div>
                  <div className="text-xs text-muted-foreground">{active.contact_unlocked ? <span className="inline-flex items-center gap-1 text-eucalyptus-deep"><ShieldCheck size={12} /> Contact unlocked</span> : <span className="inline-flex items-center gap-1"><Lock size={12} /> Contact details private</span>}</div>
                </div>
                <Link to={`/job/${active.job_id}`} className="text-xs text-eucalyptus-deep font-medium">View job</Link>
              </div>
              <div className="flex-1 overflow-y-auto p-3.5 space-y-2">
                {messages.map(m => {
                  const mine = m.sender_id === user.id;
                  return <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[78%] px-3.5 py-2 rounded-2xl text-sm ${mine ? 'bg-eucalyptus text-white rounded-br-md' : 'bg-white/80 text-foreground rounded-bl-md'}`}>{m.body}</div></div>;
                })}
                <div ref={endRef} />
              </div>
              <div className="p-3 border-t border-border/50 flex gap-2">
                <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Type a message…" className="flex-1 bg-white/70 border border-border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 ring-eucalyptus" />
                <button onClick={send} className="w-11 h-11 rounded-xl bg-eucalyptus text-white flex items-center justify-center btn-tactile"><Send size={18} /></button>
              </div>
            </div>
          ) : (
            <div className="hidden md:flex glass rounded-2xl items-center justify-center h-[60vh] text-sm text-muted-foreground">Select a conversation</div>
          )}
        </div>
      )}
    </div>
  );
}