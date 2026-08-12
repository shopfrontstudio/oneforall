import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { Check, Crown, Sparkles, X } from 'lucide-react';
import { PLAN_INFO } from '@/lib/oneforall';

export default function Membership() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sub, setSub] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = async () => {
    const s = await base44.entities.Subscription.filter({ tradie_id: user.id });
    setSub(s[0] || null);
  };
  useEffect(() => { load(); }, [user.id]);

  const subscribe = async (plan) => {
    // Demo billing only — abstracted for future Apple/Google subscription handoff.
    const expires = new Date(Date.now() + 30 * 864e5).toISOString();
    if (sub) {
      await base44.entities.Subscription.update(sub.id, { plan, status: 'active', started_date: new Date().toISOString(), expires_date: expires, founding_trial: false, cancel_at_period_end: false });
    } else {
      await base44.entities.Subscription.create({ tradie_id: user.id, plan, status: 'active', started_date: new Date().toISOString(), expires_date: expires });
    }
    setConfirm(null);
    toast({ title: `${PLAN_INFO[plan].name} plan active`, description: 'Demo billing — no payment taken.' });
    load();
  };

  const cancel = async () => {
    if (!sub) return;
    await base44.entities.Subscription.update(sub.id, { cancel_at_period_end: true });
    setConfirmCancel(false);
    toast({ title: 'Renewal cancelled', description: 'Access remains until the paid period ends.' });
    load();
  };

  const isFounding = sub?.founding_trial;
  const isActive = sub && (sub.status === 'active' || sub.status === 'trial');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Membership</h1>
        <p className="text-sm text-muted-foreground">No commission. No lead fees. Cancel anytime.</p>
      </div>

      {sub && (
        <div className="glass rounded-2xl p-4 flex items-center gap-3">
          <Crown size={20} className="text-eucalyptus-deep" />
          <div className="flex-1">
            <div className="font-semibold text-sm">{PLAN_INFO[sub.plan]?.name} plan {isFounding && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-lime/25 text-eucalyptus-deep font-semibold">Founding</span>}</div>
            <div className="text-xs text-muted-foreground">
              {sub.cancel_at_period_end ? `Active · ends ${new Date(sub.expires_date).toLocaleDateString('en-AU')}` : sub.status === 'cancelled' ? 'Expired' : isFounding ? `Founding access · expires ${new Date(sub.expires_date).toLocaleDateString('en-AU')}` : `Active · renews ${new Date(sub.expires_date).toLocaleDateString('en-AU')}`}
            </div>
          </div>
          {isActive && !isFounding && !sub.cancel_at_period_end && <button onClick={() => setConfirmCancel(true)} className="text-xs font-medium text-terracotta">Cancel renewal</button>}
        </div>
      )}

      {isFounding && (
        <div className="glass-soft rounded-2xl p-4 text-sm flex items-start gap-2">
          <Sparkles size={16} className="text-terracotta mt-0.5" />
          <p className="text-foreground/80">You're a <b>Founding Tradie</b> — free Pro access for 30 days from launch. No payment details required, and it won't auto-convert to a paid plan.</p>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-3">
        {['free', 'local', 'pro'].map(plan => {
          const info = PLAN_INFO[plan];
          const current = sub?.plan === plan;
          return (
            <div key={plan} className={`glass rounded-2xl p-5 flex flex-col ${plan === 'pro' ? 'ring-2 ring-primary' : ''}`}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{info.name}</h3>
                {plan === 'pro' && <span className="text-[10px] px-2 py-0.5 rounded-full bg-lime/25 text-eucalyptus-deep font-semibold">Popular</span>}
              </div>
              <div className="mt-2"><span className="text-3xl font-semibold">${info.price}</span><span className="text-sm text-muted-foreground">/month</span></div>
              <ul className="mt-4 space-y-1.5 flex-1">
                {info.perks.map(p => <li key={p} className="text-xs text-foreground/80 flex items-start gap-1.5"><Check size={13} className="text-eucalyptus mt-0.5 shrink-0" />{p}</li>)}
              </ul>
              {plan === 'free' ? (
                <div className="mt-4 text-xs text-muted-foreground text-center py-2.5">Always free to browse</div>
              ) : current || (isFounding && plan === 'local') ? (
                <div className="mt-4 text-center text-sm font-semibold text-eucalyptus-deep py-2.5">{current ? 'Current plan' : 'Included with Pro'}</div>
              ) : (
                <button onClick={() => setConfirm(plan)} className="mt-4 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold btn-tactile">{plan === 'local' ? 'Subscribe' : 'Go Pro'}</button>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">All prices in AUD, recurring monthly. Upgrades apply immediately with prorated billing; downgrades apply at next renewal. Existing conversations and accepted jobs remain available after expiry. This is a clearly-labelled demo billing flow — no real payment is processed.</p>

      {confirm && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-5" onClick={() => setConfirm(null)}>
          <div className="glass rounded-3xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start"><h3 className="font-semibold text-lg">Confirm {PLAN_INFO[confirm].name}</h3><button onClick={() => setConfirm(null)}><X size={18} /></button></div>
            <p className="text-sm text-muted-foreground mt-2">{PLAN_INFO[confirm].price === 0 ? '' : `$${PLAN_INFO[confirm].price}/month, `}recurring AUD. Cancel anytime — access stays until period end.</p>
            <div className="glass-soft rounded-xl p-3 mt-3 text-xs text-foreground/70">Demo billing — no payment details taken. Entitlement recorded on your account.</div>
            <button onClick={() => subscribe(confirm)} className="mt-4 w-full px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold btn-tactile">Start {PLAN_INFO[confirm].name}</button>
          </div>
        </div>
      )}
      {confirmCancel && <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-5" onClick={() => setConfirmCancel(false)}><div className="glass rounded-3xl p-6 max-w-sm w-full" onClick={event => event.stopPropagation()}><h3 className="font-semibold text-lg">Cancel renewal?</h3><p className="text-sm text-muted-foreground mt-2">Your paid features stay active until {new Date(sub.expires_date).toLocaleDateString('en-AU')}. You can subscribe again later.</p><div className="mt-5 flex gap-2"><button onClick={() => setConfirmCancel(false)} className="flex-1 rounded-xl glass-soft px-4 py-2.5 text-sm font-semibold">Keep plan</button><button onClick={cancel} className="flex-1 rounded-xl bg-terracotta px-4 py-2.5 text-sm font-semibold text-white">Cancel renewal</button></div></div></div>}
    </div>
  );
}
