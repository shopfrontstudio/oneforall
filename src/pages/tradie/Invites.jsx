import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { Ticket, MapPin, Clock, DollarSign, CheckCircle2, Lock } from 'lucide-react';
import { EmptyState } from '@/components/oneforall/Bits';
import { formatAUDRange, URGENCY_LABEL } from '@/lib/oneforall';

export default function Invites() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [invites, setInvites] = useState(null);
  const [respondId, setRespondId] = useState(null);
  const [form, setForm] = useState({});

  const load = async () => {
    const list = await base44.entities.Invitation.filter({ tradie_id: user.id });
    setInvites(list.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
  };
  useEffect(() => { load(); }, [user.id]);

  const respond = async (inv) => {
    const f = form[inv.id] || {};
    await base44.entities.Invitation.update(inv.id, { status: 'responded', quote_low: Number(f.quote_low) || null, quote_high: Number(f.quote_high) || null, earliest_availability: f.availability, message: f.message });
    await base44.entities.InterestRequest.create({ job_id: inv.job_id, job_title: inv.job_title, tradie_id: user.id, tradie_name: inv.tradie_name, quote_low: Number(f.quote_low) || null, quote_high: Number(f.quote_high) || null, earliest_availability: f.availability, message: f.message, status: 'pending', response_deadline: new Date(Date.now() + 12 * 3600e3).toISOString() });
    await base44.entities.Notification.create({ user_id: inv.customer_id, type: 'invite_response', title: 'Invitation response', body: `${inv.tradie_name} responded to your invitation`, link: `/job/${inv.job_id}`, read: false });
    toast({ title: 'Response sent' });
    load();
  };
  const decline = async (inv) => { await base44.entities.Invitation.update(inv.id, { status: 'declined' }); toast({ title: 'Invitation declined' }); load(); };

  if (invites === null) return <div className="glass-soft rounded-2xl h-40 animate-pulse" />;
  if (!invites.length) return <EmptyState icon={Ticket} title="No direct invitations" body="Customers can invite you directly from your profile. Invitations will appear here." />;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Direct invitations</h1>
      <div className="space-y-3">
        {invites.map(inv => (
          <div key={inv.id} className="glass rounded-2xl p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-sm">{inv.job_title}</h3>
                <p className="text-xs text-muted-foreground">Invited by {inv.customer_name}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${inv.status === 'responded' ? 'bg-sage/40 text-eucalyptus-deep' : inv.status === 'declined' ? 'bg-terracotta/15 text-terracotta' : 'bg-mist-soft text-eucalyptus-deep'}`}>{inv.status}</span>
            </div>
            <Link to={`/job/${inv.job_id}`} className="text-xs text-eucalyptus-deep font-medium inline-block mt-1">View full job & photos →</Link>
            <div className="text-xs text-muted-foreground mt-2 inline-flex items-center gap-1"><Lock size={12} /> Contact details stay private until the customer accepts.</div>
            {inv.status === 'pending' && (
              respondId === inv.id ? (
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input placeholder="Quote from $" type="number" className="inp-mini" value={form[inv.id]?.quote_low || ''} onChange={e => setForm(f => ({ ...f, [inv.id]: { ...f[inv.id], quote_low: e.target.value } }))} />
                    <input placeholder="to $" type="number" className="inp-mini" value={form[inv.id]?.quote_high || ''} onChange={e => setForm(f => ({ ...f, [inv.id]: { ...f[inv.id], quote_high: e.target.value } }))} />
                  </div>
                  <input type="date" className="inp-mini" value={form[inv.id]?.availability || ''} onChange={e => setForm(f => ({ ...f, [inv.id]: { ...f[inv.id], availability: e.target.value } }))} />
                  <textarea rows={2} placeholder="Message" className="inp-mini" value={form[inv.id]?.message || ''} onChange={e => setForm(f => ({ ...f, [inv.id]: { ...f[inv.id], message: e.target.value } }))} />
                  <div className="flex gap-2">
                    <button onClick={() => decline(inv)} className="flex-1 px-3 py-2 rounded-xl glass-soft text-sm font-medium btn-tactile">Decline</button>
                    <button onClick={() => respond(inv)} className="flex-1 px-3 py-2 rounded-xl bg-eucalyptus text-white text-sm font-semibold btn-tactile">Send response</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setRespondId(inv.id)} className="mt-3 w-full px-3 py-2.5 rounded-xl bg-eucalyptus text-white text-sm font-semibold btn-tactile">Respond with quote</button>
              )
            )}
            {inv.status === 'responded' && (
              <div className="mt-3 glass-soft rounded-xl p-3 text-xs">
                <p className="font-medium text-eucalyptus-deep inline-flex items-center gap-1"><CheckCircle2 size={13} /> Response sent</p>
                <p className="text-muted-foreground mt-1">Quote: {formatAUDRange(inv.quote_low, inv.quote_high)} · {inv.earliest_availability || '—'}</p>
                {inv.message && <p className="text-muted-foreground mt-1">"{inv.message}"</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}