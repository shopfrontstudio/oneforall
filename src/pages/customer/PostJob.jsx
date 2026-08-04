import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { Camera, Check, ChevronLeft, ChevronRight, Info, Sparkles, Upload, X } from 'lucide-react';
import { CATEGORIES, CATEGORY_MAP, URGENCY_OPTIONS, estimateRange, formatAUDRange, simulateInterest } from '@/lib/oneforall';
import { Image as UIImage } from '@/components/ui/image';

const PHOTO_GUIDE = {
  electrical: 'Photograph the switchboard, the affected outlet/fitting, and any visible wiring. Include the whole room for context.',
  plumbing: 'Show the leak/source, the fixture, and where the pipes run. A wide shot of under-sink or behind-toilet helps.',
  carpentry: 'Include the area to repair/build from multiple angles, plus any existing structure or damage.',
  building: 'Wide shots of the room/space, plus walls, floor and ceiling. Include plans or sketches if you have them.',
  painting: 'Photograph each wall, close-ups of existing paint condition, and any patches or damage.',
  gardening: 'Show the whole yard, then specific areas (lawn, beds, fences). Note sun direction if possible.',
  cleaning: 'Photograph each room/space needing cleaning and any specific problem areas.',
  maintenance: 'Photograph the issue from a couple of angles and include the surrounding area for context.',
  unsure: 'Take a few wide shots of the area and a close-up of the main concern — the tradie will advise.',
};

export default function PostJob() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params] = useSearchParams();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    category_slug: '', freeText: '', title: '', description: '',
    suburb: 'Ballarat', preferred_date: '', urgency: 'flexible',
    access_notes: '', parking: 'on_street', safety_info: '',
    photos: [], budget: '',
  });

  useEffect(() => { const c = params.get('category'); if (c) setForm(f => ({ ...f, category_slug: c })); }, [params]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const suggestCategory = () => {
    const t = (form.freeText || '').toLowerCase();
    const map = { tap: 'plumbing', leak: 'plumbing', pipe: 'plumbing', drain: 'plumbing', power: 'electrical', light: 'electrical', switch: 'electrical', wire: 'electrical', fence: 'carpentry', deck: 'carpentry', wood: 'carpentry', wall: 'building', renovat: 'building', kitchen: 'building', bathroom: 'building', paint: 'painting', garden: 'gardening', lawn: 'gardening', tree: 'gardening', clean: 'cleaning' };
    for (const k in map) if (t.includes(k)) return map[k];
    return 'maintenance';
  };

  const onUpload = async (files) => {
    if (!files?.length) return;
    try {
      const urls = [];
      for (const file of Array.from(files)) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        urls.push(file_url);
      }
      set('photos', [...form.photos, ...urls]);
      toast({ title: `${urls.length} photo(s) added` });
    } catch (e) { toast({ title: 'Upload failed', description: e.message, variant: 'destructive' }); }
  };

  const publish = async () => {
    setSaving(true);
    try {
      const range = estimateRange(form.category_slug, form.urgency);
      const cat = CATEGORY_MAP[form.category_slug];
      const job = await base44.entities.Job.create({
        customer_id: user.id, customer_name: user.full_name || user.email, customer_suburb: form.suburb,
        title: form.title, description: form.description, category_slug: form.category_slug, category_name: cat?.name,
        suburb: form.suburb, preferred_date: form.preferred_date, urgency: form.urgency,
        access_notes: form.access_notes, parking: form.parking, safety_info: form.safety_info,
        budget: Number(form.budget) || null, indicative_low: range.low, indicative_high: range.high,
        photos: form.photos, status: 'published', boosted: false,
      });
      await simulateInterest(job);
      toast({ title: 'Job published!', description: 'Nearby verified tradies have been notified.' });
      navigate(`/job/${job.id}`);
    } catch (e) { toast({ title: 'Could not publish', description: e.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  const steps = [1, 2, 3, 4, 5];
  const range = estimateRange(form.category_slug, form.urgency);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        {step > 1 && <button onClick={() => setStep(step - 1)} className="w-9 h-9 rounded-xl glass-soft flex items-center justify-center btn-tactile"><ChevronLeft size={18} /></button>}
        <h1 className="text-xl font-semibold tracking-tight">Post a job</h1>
        <div className="flex-1 flex gap-1.5 ml-2">
          {steps.map(s => <span key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-eucalyptus' : 'bg-border'}`} />)}
        </div>
        <span className="text-xs text-muted-foreground">Step {step}/5</span>
      </div>

      <div className="glass rounded-3xl p-5 sm:p-6">
        {step === 1 && (
          <Step title="Describe the problem" sub="Pick a category or describe it in your own words — we'll suggest the right trade.">
            <div className="grid grid-cols-3 gap-2 mb-4">
              {CATEGORIES.map(c => (
                <button key={c.slug} onClick={() => set('category_slug', c.slug)} className={`p-2.5 rounded-xl text-xs font-medium btn-tactile ${form.category_slug === c.slug ? 'bg-eucalyptus text-white' : 'glass-soft text-foreground/80'}`}>{c.name}</button>
              ))}
            </div>
            <label className="text-xs font-medium text-muted-foreground">Or describe it in your words</label>
            <textarea value={form.freeText} onChange={e => set('freeText', e.target.value)} rows={3} placeholder="My kitchen tap is leaking…" className="mt-1 w-full rounded-xl bg-white/70 border border-border p-3 text-sm focus:ring-2 ring-eucalyptus outline-none" />
            {form.freeText && !form.category_slug && (
              <button onClick={() => set('category_slug', suggestCategory())} className="mt-3 inline-flex items-center gap-2 text-sm text-eucalyptus-deep font-medium"><Sparkles size={15} /> Suggest a trade for me</button>
            )}
            {form.category_slug && <p className="mt-3 text-xs text-eucalyptus-deep inline-flex items-center gap-1"><Check size={13} /> Suggested trade: {CATEGORY_MAP[form.category_slug]?.name}</p>}
          </Step>
        )}

        {step === 2 && (
          <Step title="Job details" sub="The more detail you give, the better your quotes will be.">
            <Field label="Job title"><input value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Replace leaking kitchen tap" className="inp" /></Field>
            <Field label="Description"><textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} placeholder="Describe the issue, materials, scope…" className="inp" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Suburb"><input value={form.suburb} onChange={e => set('suburb', e.target.value)} className="inp" /></Field>
              <Field label="Preferred date"><input type="date" value={form.preferred_date} onChange={e => set('preferred_date', e.target.value)} className="inp" /></Field>
            </div>
            <Field label="Urgency">
              <div className="flex gap-2">{URGENCY_OPTIONS.map(u => <button key={u.value} onClick={() => set('urgency', u.value)} className={`px-3 py-2 rounded-xl text-sm btn-tactile ${form.urgency === u.value ? 'bg-eucalyptus text-white' : 'glass-soft'}`}>{u.label}</button>)}</div>
            </Field>
            <Field label="Property access notes"><input value={form.access_notes} onChange={e => set('access_notes', e.target.value)} placeholder="e.g. Side gate, dog in yard" className="inp" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Parking">
                <select value={form.parking} onChange={e => set('parking', e.target.value)} className="inp">
                  <option value="on_street">On-street</option><option value="driveway">Driveway</option><option value="none">None / permit</option>
                </select>
              </Field>
              <Field label="Safety / site info"><input value={form.safety_info} onChange={e => set('safety_info', e.target.value)} placeholder="Asbestos? Heights?" className="inp" /></Field>
            </div>
          </Step>
        )}

        {step === 3 && (
          <Step title="Photos" sub={form.category_slug ? PHOTO_GUIDE[form.category_slug] : 'Add photos so tradies can assess the job accurately.'}>
            <label className="block">
              <input type="file" accept="image/*" multiple className="hidden" onChange={e => onUpload(e.target.files)} />
              <span className="glass-soft rounded-2xl p-8 flex flex-col items-center gap-2 cursor-pointer btn-tactile hover:bg-white/80 border-2 border-dashed border-border">
                <Upload className="text-eucalyptus-deep" /><span className="text-sm font-medium">Tap to upload photos</span><span className="text-xs text-muted-foreground">Multiple allowed · JPG/PNG</span>
              </span>
            </label>
            {form.photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-4">
                {form.photos.map((url, i) => (
                  <div key={i} className="relative aspect-square rounded-xl overflow-hidden">
                    <UIImage src={url} className="w-full h-full" fittingType="fill" />
                    <button onClick={() => set('photos', form.photos.filter((_, idx) => idx !== i))} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center"><X size={13} /></button>
                  </div>
                ))}
              </div>
            )}
          </Step>
        )}

        {step === 4 && (
          <Step title="Budget" sub="Optional. We'll show an indicative range based on the job — guidance only, not a quote.">
            <Field label="Your budget (AUD, optional)"><input type="number" value={form.budget} onChange={e => set('budget', e.target.value)} placeholder="e.g. 250" className="inp" /></Field>
            <div className="glass-soft rounded-2xl p-4 mt-2">
              <div className="flex items-center gap-2 text-eucalyptus-deep"><Info size={15} /><span className="text-sm font-semibold">Indicative range</span></div>
              <p className="text-2xl font-semibold text-foreground mt-1">{formatAUDRange(range.low, range.high)}</p>
              <p className="text-xs text-muted-foreground mt-1">Based on {CATEGORY_MAP[form.category_slug]?.name || 'this trade'}, urgency and Ballarat rates. The final price is agreed between you and the tradie — this is guidance only.</p>
            </div>
          </Step>
        )}

        {step === 5 && (
          <Step title="Review & publish" sub="Check everything looks right, then publish to verified tradies.">
            <Review form={form} range={range} />
          </Step>
        )}

        <div className="flex justify-between mt-6">
          {step > 1 ? <button onClick={() => setStep(step - 1)} className="px-4 py-2.5 rounded-xl glass-soft text-sm font-medium btn-tactile">Back</button> : <span />}
          {step < 5 ? (
            <button onClick={() => setStep(step + 1)} disabled={step === 2 && !form.title} className="px-5 py-2.5 rounded-xl bg-eucalyptus text-white text-sm font-semibold btn-tactile disabled:opacity-50">Continue <ChevronRight size={16} className="inline" /></button>
          ) : (
            <button onClick={publish} disabled={saving || !form.title || !form.category_slug} className="px-5 py-2.5 rounded-xl bg-eucalyptus text-white text-sm font-semibold btn-tactile disabled:opacity-50">{saving ? 'Publishing…' : 'Publish job'}</button>
          )}
        </div>
      </div>
      <p className="text-center mt-4"><Link to="/my-jobs" className="text-xs text-muted-foreground">Save as draft and exit</Link></p>
    </div>
  );
}

function Step({ title, sub, children }) {
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground mb-4">{sub}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
function Field({ label, children }) { return <div><label className="text-xs font-medium text-muted-foreground">{label}</label><div className="mt-1">{children}</div></div>; }

function Review({ form, range }) {
  const cat = CATEGORY_MAP[form.category_slug];
  return (
    <div className="space-y-2 text-sm">
      <Row k="Category" v={cat?.name} />
      <Row k="Title" v={form.title} />
      <Row k="Description" v={form.description || '—'} />
      <Row k="Suburb" v={form.suburb} />
      <Row k="Preferred date" v={form.preferred_date || 'Flexible'} />
      <Row k="Urgency" v={URGENCY_OPTIONS.find(u => u.value === form.urgency)?.label} />
      <Row k="Access" v={form.access_notes || '—'} />
      <Row k="Parking" v={form.parking} />
      <Row k="Budget" v={form.budget ? `$${form.budget}` : 'Not specified'} />
      <Row k="Indicative range" v={formatAUDRange(range.low, range.high)} />
      <Row k="Photos" v={`${form.photos.length} attached`} />
    </div>
  );
}
function Row({ k, v }) { return <div className="flex justify-between gap-4 py-1.5 border-b border-border/50"><span className="text-muted-foreground">{k}</span><span className="font-medium text-right">{v}</span></div>; }