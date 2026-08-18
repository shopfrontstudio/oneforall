import React, { useEffect, useState } from 'react';
import { LogOut, Repeat, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { PROVIDER_ONBOARDING_OPEN, setAccountType } from '@/lib/oneforall';
import { useToast } from '@/components/ui/use-toast';

export default function Account() {
  const { user, logout, checkUserAuth } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [establishedProvider, setEstablishedProvider] = useState(user.account_type === 'tradie');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (user.account_type !== 'customer') return;
    Promise.all([
      base44.entities.TradieProfile.filter({ user_id: user.id }).catch(() => []),
      base44.entities.ProviderOffering.filter({ provider_id: user.id, review_status: 'approved' }).catch(() => []),
    ]).then(([profiles, offerings]) => setEstablishedProvider(profiles.length > 0 || offerings.length > 0));
  }, [user.account_type, user.id]);

  const switchExperience = async () => {
    const next = user.account_type === 'tradie' ? 'customer' : 'tradie';
    if (next === 'tradie' && !PROVIDER_ONBOARDING_OPEN && !establishedProvider) return;
    setBusy(true);
    try {
      await setAccountType(next);
      await checkUserAuth();
      navigate(next === 'tradie' ? '/provider/today' : '/');
    } catch (error) {
      toast({ title: 'Account switch was not completed', description: error.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };
  const canSwitch = user.account_type === 'tradie' || PROVIDER_ONBOARDING_OPEN || establishedProvider;
  return <div className="mx-auto max-w-2xl space-y-5">
    <section className="glass flex items-center gap-4 rounded-3xl p-5"><div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-2xl font-semibold text-primary-foreground">{(user.full_name || user.email || '?')[0].toUpperCase()}</div><div className="min-w-0"><h1 className="truncate text-xl font-semibold">{user.full_name || 'Member'}</h1><p className="truncate text-sm text-muted-foreground">{user.email}</p><p className="mt-1 text-xs font-semibold capitalize">{user.account_type === 'tradie' ? 'Service provider' : 'Customer'}</p></div></section>
    <section className="glass-soft rounded-2xl p-5"><h2 className="flex items-center gap-2 font-semibold"><ShieldCheck size={17} />Private account boundary</h2><p className="mt-2 text-sm text-muted-foreground">Raw provider identity, licence and insurance evidence is never shown to customers. Customer-facing trust details require a separate bounded approval record.</p></section>
    <section className="glass rounded-2xl p-5"><button disabled={busy || !canSwitch} onClick={switchExperience} className="glass-soft flex min-h-11 w-full items-center gap-2 rounded-xl p-3 text-sm font-semibold disabled:opacity-50"><Repeat size={16} />{user.account_type === 'tradie' ? 'Switch to customer' : establishedProvider ? 'Return to my established provider account' : 'Provider onboarding unavailable'}</button><button onClick={() => logout()} className="glass-soft mt-2 flex min-h-11 w-full items-center gap-2 rounded-xl p-3 text-sm font-semibold text-terracotta"><LogOut size={16} />Log out</button></section>
  </div>;
}
