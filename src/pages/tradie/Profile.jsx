import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { FileClock, LogOut, Repeat, Save } from 'lucide-react';
import { CATEGORIES, ensureProfile, PROVIDER_ONBOARDING_OPEN, setAccountType } from '@/lib/oneforall';
import { EmptyState } from '@/components/oneforall/Bits';

export default function TradieProfile() {
  const { user, logout, checkUserAuth } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [p, setP] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const profiles = await base44.entities.TradieProfile.filter({ user_id: user.id });
      setP(profiles[0] || null);
    } catch {
      setP(null);
    } finally {
      setLoaded(true);
    }
  };
  useEffect(() => { load(); }, [user.id]);

  const upd = (k, v) => setP(prev => ({ ...prev, [k]: v }));
  const toggleCat = (slug) => upd('trade_categories', (p.trade_categories || []).includes(slug) ? (p.trade_categories || []).filter(c => c !== slug) : [...(p.trade_categories || []), slug]);

  const save = async () => {
    const abn = (p.abn || '').replace(/\s/g, '');
    const maxRadius = 80;
    if (abn && !/^\d{11}$/.test(abn)) { toast({ title: 'ABN must contain 11 digits', variant: 'destructive' }); return; }
    if (!(p.trade_categories || []).length) { toast({ title: 'Choose at least one trade category', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const editable = { full_name: p.full_name?.trim(), business_name: p.business_name?.trim(), abn, suburb: p.suburb?.trim(), licence_number: p.licence_number?.trim(), licence_type: p.licence_type?.trim(), insurance_provider: p.insurance_provider?.trim(), insurance_policy_number: p.insurance_policy_number?.trim(), public_liability: !!p.public_liability, trade_categories: p.trade_categories, experience_years: Math.max(0, Number(p.experience_years) || 0), service_radius_km: Math.min(maxRadius, Math.max(1, Number(p.service_radius_km) || 20)), service_areas: p.service_areas, bio: p.bio?.trim(), open_to_work: !!p.open_to_work };
      await base44.entities.TradieProfile.update(p.id, editable);
      setP(prev => ({ ...prev, ...editable }));
      toast({ title: 'Draft profile saved', description: 'These entries are not approved evidence and are not published to customers.' });
    } catch (error) { toast({ title: 'Could not save profile', description: error.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  const switchToCustomer = async () => {
    await setAccountType('customer');
    await ensureProfile('customer', user);
    await checkUserAuth();
    toast({ title: 'Switched to customer' });
    navigate('/');
  };

  if (!loaded) return <div className="glass-soft h-40 rounded-2xl" role="status" aria-label="Loading provider account" />;
  if (!p) return <EmptyState title="Provider profile unavailable" body={PROVIDER_ONBOARDING_OPEN ? 'Your provider draft could not be loaded. Contact OneForAll support before entering service details.' : 'Provider onboarding is closed. Existing approved provider records remain available through managed bookings, but a new draft cannot be created here.'} />;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-semibold text-lg">{(p.full_name || '?')[0]}</div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Provider account draft</h1>
          <p className="text-sm text-muted-foreground">{p.business_name || 'Add your business name'}</p>
        </div>
        <Link to={`/provider/${user.id}`} className="ml-auto text-xs font-semibold text-eucalyptus-deep">View published assertion</Link>
      </div>

      <div className="glass rounded-2xl p-4">
        <h2 className="text-sm font-semibold flex items-center gap-1.5"><FileClock size={15} className="text-eucalyptus-deep" /> Draft readiness only</h2>
        <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
          <CheckRow label="ABN provided" ok={!!p.abn} />
          <CheckRow label="Licence draft" ok={!!p.licence_number} />
          <CheckRow label="Insurance draft" ok={!!p.insurance_provider} />
          <CheckRow label="Public-liability draft" ok={p.public_liability} />
          <CheckRow label="Trade categories" ok={(p.trade_categories || []).length > 0} />
        </div>
        <p className="text-xs text-muted-foreground mt-2">Provided here means entered by you, not checked or approved. Only service-specific evidence review can grant access, and only a separate ProviderPublicAssertion can appear to customers.</p>
      </div>

      <div className="glass rounded-2xl p-4 space-y-3">
        <h2 className="text-sm font-semibold">Draft business details · not approved</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Inp label="Full name" v={p.full_name} on={v => upd('full_name', v)} />
          <Inp label="Business name" v={p.business_name} on={v => upd('business_name', v)} />
          <Inp label="Draft ABN" v={p.abn} on={v => upd('abn', v)} placeholder="11 digits" />
          <Inp label="Suburb" v={p.suburb} on={v => upd('suburb', v)} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Inp label="Draft licence number" v={p.licence_number} on={v => upd('licence_number', v)} />
          <Inp label="Draft licence type" v={p.licence_type} on={v => upd('licence_type', v)} />
          <Inp label="Draft insurance provider" v={p.insurance_provider} on={v => upd('insurance_provider', v)} />
          <Inp label="Draft policy number" v={p.insurance_policy_number} on={v => upd('insurance_policy_number', v)} />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.public_liability} onChange={e => upd('public_liability', e.target.checked)} /> I have entered a draft public-liability declaration (not reviewed)</label>
      </div>

      <div className="glass rounded-2xl p-4 space-y-3">
        <h2 className="text-sm font-semibold">Draft service categories</h2>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.filter(c => c.slug !== 'unsure').map(c => (
            <button key={c.slug} onClick={() => toggleCat(c.slug)} className={`px-3 py-1.5 rounded-full text-xs font-medium btn-tactile ${(p.trade_categories || []).includes(c.slug) ? 'bg-primary text-primary-foreground' : 'glass-soft'}`}>{c.name}</button>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Inp label="Experience (years)" v={p.experience_years} on={v => upd('experience_years', Number(v))} type="number" />
          <Inp label="Service radius (km)" v={p.service_radius_km} on={v => upd('service_radius_km', Number(v))} type="number" />
        </div>
        <Inp label="Service areas (comma separated)" v={(p.service_areas || []).join(', ')} on={v => upd('service_areas', v.split(',').map(s => s.trim()).filter(Boolean))} />
        <div>
          <label className="text-xs font-medium text-muted-foreground">Profile description</label>
          <textarea rows={3} value={p.bio || ''} onChange={e => upd('bio', e.target.value)} placeholder="Internal draft only — not published to customers" className="inp mt-1" />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.open_to_work} onChange={e => upd('open_to_work', e.target.checked)} /> Open to work</label>
      </div>

      <button disabled={saving} onClick={save} className="w-full px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold btn-tactile inline-flex items-center justify-center gap-2 disabled:opacity-50"><Save size={16} /> {saving ? 'Saving…' : 'Save draft profile'}</button>

      <div className="glass rounded-2xl p-4 space-y-2">
        <h2 className="text-sm font-semibold">Account</h2>
        <button onClick={switchToCustomer} className="w-full flex items-center gap-2 p-3 rounded-xl glass-soft btn-tactile text-sm font-medium"><Repeat size={16} className="text-eucalyptus-deep" /> Switch to customer account</button>
        <button onClick={() => logout()} className="w-full flex items-center gap-2 p-3 rounded-xl glass-soft btn-tactile text-sm font-medium text-terracotta"><LogOut size={16} /> Log out</button>
      </div>
    </div>
  );
}

const CheckRow = ({ label, ok }) => (
  <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-muted-foreground/30" />{label}: <span className="text-muted-foreground text-[10px]">{ok ? 'entered · not reviewed' : 'not entered'}</span></div>
);
const Inp = ({ label, v, on, type = 'text', placeholder = '' }) => (
  <div><label className="text-xs font-medium text-muted-foreground">{label}</label><input type={type} value={v ?? ''} placeholder={placeholder} onChange={e => on(e.target.value)} className="inp mt-1" /></div>
);
