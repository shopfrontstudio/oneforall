import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { Crown, LogOut, Repeat, Save, ShieldCheck } from 'lucide-react';
import { CATEGORIES, ensureProfile, setAccountType } from '@/lib/oneforall';

export default function TradieProfile() {
  const { user, logout, checkUserAuth } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [p, setP] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const profiles = await base44.entities.TradieProfile.filter({ user_id: user.id });
    setP(profiles[0] || null);
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
      toast({ title: 'Profile saved', description: editable.service_radius_km < p.service_radius_km ? `Radius capped at ${maxRadius} km pending coverage verification.` : undefined });
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

  if (!p) return <div className="glass-soft rounded-2xl h-40 animate-pulse" />;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-semibold text-lg">{(p.full_name || '?')[0]}</div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-1.5">{p.full_name}{p.founding_badge && <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-lime/25 text-eucalyptus-deep font-semibold"><Crown size={11} />Founding</span>}</h1>
          <p className="text-sm text-muted-foreground">{p.business_name || 'Add your business name'}</p>
        </div>
        <Link to={`/provider/${p.id}`} className="ml-auto text-xs font-semibold text-eucalyptus-deep">View provider profile</Link>
      </div>

      <div className="glass rounded-2xl p-4">
        <h2 className="text-sm font-semibold flex items-center gap-1.5"><ShieldCheck size={15} className="text-eucalyptus-deep" /> Verification checklist</h2>
        <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
          <CheckRow label="ABN provided" ok={!!p.abn} />
          <CheckRow label="Licence" ok={!!p.licence_number} />
          <CheckRow label="Insurance" ok={!!p.insurance_provider} />
          <CheckRow label="Public liability" ok={p.public_liability} />
          <CheckRow label="Trade categories" ok={(p.trade_categories || []).length > 0} />
        </div>
        <p className="text-xs text-muted-foreground mt-2">Public approval will come only from service-specific evidence review; this legacy profile checklist does not grant access.</p>
      </div>

      <div className="glass rounded-2xl p-4 space-y-3">
        <h2 className="text-sm font-semibold">Business details</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Inp label="Full name" v={p.full_name} on={v => upd('full_name', v)} />
          <Inp label="Business name" v={p.business_name} on={v => upd('business_name', v)} />
          <Inp label="ABN" v={p.abn} on={v => upd('abn', v)} placeholder="11 digits" />
          <Inp label="Suburb" v={p.suburb} on={v => upd('suburb', v)} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Inp label="Licence number" v={p.licence_number} on={v => upd('licence_number', v)} />
          <Inp label="Licence type" v={p.licence_type} on={v => upd('licence_type', v)} />
          <Inp label="Insurance provider" v={p.insurance_provider} on={v => upd('insurance_provider', v)} />
          <Inp label="Policy number" v={p.insurance_policy_number} on={v => upd('insurance_policy_number', v)} />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.public_liability} onChange={e => upd('public_liability', e.target.checked)} /> Public liability insurance current</label>
      </div>

      <div className="glass rounded-2xl p-4 space-y-3">
        <h2 className="text-sm font-semibold">Trade categories</h2>
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
          <textarea rows={3} value={p.bio || ''} onChange={e => upd('bio', e.target.value)} placeholder="Tell customers about your work, approach and guarantees…" className="inp mt-1" />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.open_to_work} onChange={e => upd('open_to_work', e.target.checked)} /> Open to work</label>
      </div>

      <button disabled={saving} onClick={save} className="w-full px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold btn-tactile inline-flex items-center justify-center gap-2 disabled:opacity-50"><Save size={16} /> {saving ? 'Saving…' : 'Save profile'}</button>

      <div className="glass rounded-2xl p-4 space-y-2">
        <h2 className="text-sm font-semibold">Account</h2>
        <button onClick={switchToCustomer} className="w-full flex items-center gap-2 p-3 rounded-xl glass-soft btn-tactile text-sm font-medium"><Repeat size={16} className="text-eucalyptus-deep" /> Switch to customer account</button>
        <button onClick={() => logout()} className="w-full flex items-center gap-2 p-3 rounded-xl glass-soft btn-tactile text-sm font-medium text-terracotta"><LogOut size={16} /> Log out</button>
      </div>
    </div>
  );
}

const CheckRow = ({ label, ok }) => (
  <div className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${ok ? 'bg-eucalyptus' : 'bg-muted-foreground/30'}`} />{label} {ok ? <span className="text-eucalyptus-deep text-[10px]">✓</span> : <span className="text-muted-foreground text-[10px]">pending</span>}</div>
);
const Inp = ({ label, v, on, type = 'text', placeholder = '' }) => (
  <div><label className="text-xs font-medium text-muted-foreground">{label}</label><input type={type} value={v ?? ''} placeholder={placeholder} onChange={e => on(e.target.value)} className="inp mt-1" /></div>
);
