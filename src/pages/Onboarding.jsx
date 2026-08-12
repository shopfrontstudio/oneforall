import React, { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { HardHat, Home as HomeIcon, ArrowRight, ShieldCheck, MapPin } from 'lucide-react';
import Logo from '@/components/oneforall/Logo';
import BrandBackground from '@/components/oneforall/BrandBackground';
import { setAccountType, ensureProfile, PROVIDER_ONBOARDING_OPEN } from '@/lib/oneforall';
import { useToast } from '@/components/ui/use-toast';

export default function Onboarding() {
  const { user, checkUserAuth } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  if (user?.account_type) return <Navigate to="/" replace />;

  const choose = async (type) => {
    if (type === 'tradie' && !PROVIDER_ONBOARDING_OPEN) return;
    setBusy(true);
    try {
      await setAccountType(type);
      await ensureProfile(type, user);
      await checkUserAuth();
      toast({ title: type === 'tradie' ? 'Welcome, service provider!' : 'Welcome to OneForAll!' });
      navigate('/');
    } catch (e) {
      toast({ title: 'Something went wrong', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen relative flex flex-col">
      <BrandBackground />
      <header className="px-5 pt-8 flex items-center gap-2">
        <Logo size={36} />
        <div>
          <div className="font-semibold tracking-tight text-foreground">OneForAll</div>
          <div className="text-[11px] text-muted-foreground -mt-0.5">Ballarat · expanding across Australia</div>
        </div>
      </header>

      <div className="flex-1 flex flex-col justify-center px-5 py-10">
        <div className="max-w-md w-full mx-auto text-center">
          <p className="text-xs font-semibold tracking-widest text-terracotta uppercase">One trusted place</p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground mt-2 text-balance">How will you use OneForAll?</h1>
          <p className="text-sm text-muted-foreground mt-2">One account, your way — you can switch later from your profile.</p>

          <div className="grid gap-3 mt-7">
            <button disabled={busy || !PROVIDER_ONBOARDING_OPEN} onClick={() => choose('tradie')} className="glass rounded-3xl p-5 text-left flex items-center gap-4 btn-tactile hover:bg-white/80 disabled:opacity-60">
              <span className="w-14 h-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shrink-0"><HardHat size={26} /></span>
              <span className="flex-1">
                <span className="block font-semibold text-foreground">I provide services</span>
                <span className="block text-xs text-muted-foreground">{PROVIDER_ONBOARDING_OPEN ? 'Prepare a draft provider profile. Service approval and request access are reviewed separately.' : 'Provider onboarding is not currently available. Existing provider accounts remain accessible.'}</span>
              </span>
              <ArrowRight className="text-eucalyptus-deep" size={20} />
            </button>

            <button disabled={busy} onClick={() => choose('customer')} className="glass rounded-3xl p-5 text-left flex items-center gap-4 btn-tactile hover:bg-white/80 disabled:opacity-60">
              <span className="w-14 h-14 rounded-2xl bg-terracotta text-white flex items-center justify-center shrink-0"><HomeIcon size={26} /></span>
              <span className="flex-1">
                <span className="block font-semibold text-foreground">I need a service</span>
                <span className="block text-xs text-muted-foreground">Choose a structured pathway and manage quotes or bookings in one place.</span>
              </span>
              <ArrowRight className="text-eucalyptus-deep" size={20} />
            </button>
          </div>

          <div className="flex items-center justify-center gap-4 mt-7 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><ShieldCheck size={14} /> Secure session</span>
            <span className="inline-flex items-center gap-1"><MapPin size={14} /> Ballarat, VIC</span>
          </div>
          <p className="text-[11px] text-muted-foreground/70 mt-4">Signed in as {user?.email}. <Link to="/login" className="underline">Use another account</Link></p>
        </div>
      </div>
    </div>
  );
}
