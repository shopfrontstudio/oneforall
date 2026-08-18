import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Home, LockKeyhole, MapPin, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import BrandBackground from '@/components/oneforall/BrandBackground';
import Logo from '@/components/oneforall/Logo';
import { ensureProfile, PROVIDER_ONBOARDING_OPEN, setAccountType } from '@/lib/oneforall';
import { useToast } from '@/components/ui/use-toast';

export default function Onboarding() {
  const { user, checkUserAuth } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  if (user?.account_type) return <Navigate to={user.account_type === 'tradie' ? '/provider/today' : '/'} replace />;

  const continueAsCustomer = async () => {
    setBusy(true);
    try {
      await setAccountType('customer');
      await ensureProfile('customer');
      await checkUserAuth();
      navigate('/');
    } catch (error) {
      toast({ title: 'Account setup was not completed', description: error.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return <div className="relative flex min-h-screen flex-col"><BrandBackground /><header className="flex items-center gap-2 px-5 pt-8"><Logo size={36} /><div><div className="font-semibold">OneForAll</div><div className="text-[11px] text-muted-foreground">Ballarat, Victoria</div></div></header><main className="flex flex-1 items-center px-5 py-10"><div className="mx-auto w-full max-w-md text-center"><p className="text-xs font-semibold uppercase tracking-widest text-terracotta">Managed marketplace foundation</p><h1 className="mt-2 text-3xl font-semibold">Choose your experience</h1><button disabled={busy} onClick={continueAsCustomer} className="glass btn-tactile mt-7 flex w-full items-center gap-4 rounded-3xl p-5 text-left disabled:opacity-60"><span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-terracotta text-white"><Home /></span><span><b className="block">I need a service</b><span className="text-xs text-muted-foreground">Explore every service pathway and manage future bookings.</span></span></button><div className="glass-soft mt-3 flex gap-3 rounded-3xl p-5 text-left opacity-75" role="status"><span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-sage"><LockKeyhole /></span><span><b className="block">I provide services</b><span className="text-xs text-muted-foreground">{PROVIDER_ONBOARDING_OPEN ? 'Provider setup is available.' : 'New provider onboarding is closed until the evidence and release gates are approved.'}</span></span></div><div className="mt-7 flex justify-center gap-4 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><ShieldCheck size={14} />Private by default</span><span className="inline-flex items-center gap-1"><MapPin size={14} />Ballarat</span></div><p className="mt-4 text-[11px] text-muted-foreground">Signed in as {user?.email}. <Link to="/login" className="underline">Use another account</Link></p></div></main></div>;
}
