import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { Mail, Phone, Clock, CheckCircle2, Repeat, LogOut } from 'lucide-react';
import { setAccountType, ensureProfile, PROVIDER_ONBOARDING_OPEN } from '@/lib/oneforall';

export default function Profile() {
  const { user, logout, checkUserAuth } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profile, setProfile] = useState(null);
  const [establishedProvider, setEstablishedProvider] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (user?.account_type !== 'customer') return;
    Promise.all([
      base44.entities.CustomerProfile.filter({ user_id: user.id }),
      base44.entities.TradieProfile.filter({ user_id: user.id }).catch(() => []),
      base44.entities.ProviderOffering.filter({ provider_id: user.id, review_status: 'approved' }).catch(() => []),
    ]).then(([customerProfiles, providerProfiles, approvedOfferings]) => {
      setProfile(customerProfiles[0] || null);
      // This only controls whether to show a switch-back attempt. The backend
      // independently proves ownership/approval and remains authoritative.
      setEstablishedProvider(providerProfiles.length > 0 || approvedOfferings.length > 0);
    });
  }, [user]);

  const switchType = async () => {
    const next = user.account_type === 'tradie' ? 'customer' : 'tradie';
    if (next === 'tradie' && !PROVIDER_ONBOARDING_OPEN && !establishedProvider) {
      toast({ title: 'Provider onboarding is closed', description: 'Only previously established provider accounts can switch back right now. Your customer account has not changed.', variant: 'destructive' });
      return;
    }
    setSwitching(true);
    try {
      await setAccountType(next);
      if (next === 'customer' || PROVIDER_ONBOARDING_OPEN) await ensureProfile(next, user);
      await checkUserAuth();
      toast({
        title: next === 'tradie' ? 'Provider experience restored' : 'Switched to customer',
        description: next === 'tradie' ? 'Your existing provider account is active again.' : 'You can switch back to your established provider account from this page.',
      });
      navigate('/');
    } catch (error) {
      toast({ title: 'Account switch was not completed', description: error.message, variant: 'destructive' });
    } finally { setSwitching(false); }
  };

  const isTradie = user.account_type === 'tradie';

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div className="glass rounded-3xl p-5 flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-semibold text-2xl">{(user.full_name || user.email || '?')[0].toUpperCase()}</div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold tracking-tight truncate">{user.full_name || 'Member'}</h1>
          <p className="text-sm text-muted-foreground truncate">{user.email}</p>
          <span className="text-xs px-2 py-0.5 rounded-full bg-eucalyptus/10 text-eucalyptus-deep font-medium capitalize mt-1 inline-block">{isTradie ? 'Service provider' : 'Customer'}</span>
        </div>
      </div>

      {!isTradie && profile && (
        <div className="glass rounded-2xl p-5">
          <h2 className="text-sm font-semibold mb-3">Your reliability signals</h2>
          <div className="grid grid-cols-2 gap-3">
            <Signal icon={Phone} label="Mobile verified" ok={profile.mobile_verified} />
            <Signal icon={Mail} label="Email verified" ok={profile.email_verified} />
            <Signal icon={Clock} label="Response rate" val={`${profile.response_rate ?? 100}%`} />
            <Signal icon={Clock} label="Avg response" val={`${profile.avg_response_minutes ?? 60} min`} />
            <Signal icon={CheckCircle2} label="Completed bookings" val={profile.completed_jobs ?? 0} />
            <Signal icon={CheckCircle2} label="Closed requests" val={profile.abandoned_posts ?? 0} />
          </div>
          <p className="text-xs text-muted-foreground mt-3">Reliable responses help managed bookings run smoothly. Accounts with unresolved older requests may be paused while support reviews them.</p>
        </div>
      )}

      {!isTradie && profile && (
        <div className="glass rounded-2xl p-5">
          <h2 className="text-sm font-semibold mb-3">Your suburb</h2>
          <input defaultValue={profile.suburb} onBlur={async (e) => { await base44.entities.CustomerProfile.update(profile.id, { suburb: e.target.value }); toast({ title: 'Suburb updated' }); }} className="inp" placeholder="Suburb" />
        </div>
      )}

      <div className="glass rounded-2xl p-5 space-y-2">
        <h2 className="text-sm font-semibold mb-1">Account</h2>
        <button disabled={switching || (!isTradie && !PROVIDER_ONBOARDING_OPEN && !establishedProvider)} onClick={switchType} className="w-full flex items-center gap-2 p-3 rounded-xl glass-soft btn-tactile text-sm font-medium disabled:cursor-not-allowed disabled:opacity-55"><Repeat size={16} className="text-eucalyptus-deep" /> {switching ? 'Switching…' : isTradie ? 'Switch to customer account' : PROVIDER_ONBOARDING_OPEN ? 'Switch to service provider account' : establishedProvider ? 'Return to my provider account' : 'Provider onboarding unavailable'}</button>
        {!isTradie && !PROVIDER_ONBOARDING_OPEN && <p className="px-3 pb-1 text-xs text-muted-foreground">{establishedProvider ? 'This restores your existing provider experience. It does not create a new provider account.' : 'New provider onboarding remains closed.'}</p>}
        <button onClick={() => logout()} className="w-full flex items-center gap-2 p-3 rounded-xl glass-soft btn-tactile text-sm font-medium text-terracotta"><LogOut size={16} /> Log out</button>
      </div>
    </div>
  );
}

const Signal = ({ icon: Icon, label, ok = false, val = null }) => (
  <div className="glass-soft rounded-xl p-3">
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon size={13} /> {label}</div>
    <div className="font-semibold text-sm mt-0.5">{val != null ? val : ok ? 'Verified' : 'Pending'}</div>
  </div>
);
