import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { Check, ChevronLeft, ChevronRight, Info, Save, Sparkles, Upload, X } from 'lucide-react';
import { CATEGORY_MAP, PRIMARY_SERVICE_BY_CATEGORY, URGENCY_OPTIONS, callFunction, estimateRange, formatAUDRange } from '@/lib/oneforall';
import CategoryGrid from '@/components/oneforall/CategoryGrid';

const PHOTO_GUIDE = {
  gardening: 'Show the whole yard, then specific areas (lawn, beds, fences). Note sun direction if possible.',
  cleaning: 'Photograph each room/space needing cleaning and any specific problem areas.',
  beauty: 'Only photograph the requested style or non-sensitive area. Do not upload health records.',
  handyman: 'Photograph the item, fixing surface and surrounding area from multiple angles.',
  'rubbish-removal': 'Show the complete load and close-ups of any item that may need special disposal.',
  'pest-control': 'Show signs of activity and accessible affected areas without approaching the pest.',
};

export default function PostJob() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params] = useSearchParams();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [draftId, setDraftId] = useState(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const invitedTradieProfileId = params.get('tradie');
  const [form, setForm] = useState({
    category_slug: '', freeText: '', title: '', description: '',
    suburb: 'Ballarat', preferred_date: '', urgency: 'flexible',
    access_notes: '', parking: 'on_street', safety_info: '',
    photos: [], budget: '',
  });

  useEffect(() => {
    const category = params.get('category');
    const problem = params.get('problem');
    const requestedDraft = params.get('draft');
    if (category && CATEGORY_MAP[category]) setForm(f => ({ ...f, category_slug: category }));
    if (problem) setForm(f => ({ ...f, freeText: problem, title: f.title || problem.slice(0, 80), description: f.description || problem }));
    if (!requestedDraft) return;

    let activeRequest = true;
    setLoadingDraft(true);
    base44.entities.Job.get(requestedDraft).then((job) => {
      if (!activeRequest || job.customer_id !== user.id || job.status !== 'draft') return;
      setDraftId(job.id);
      setForm({
        category_slug: job.category_slug || '', freeText: '', title: job.title || '', description: job.description || '',
        suburb: job.suburb || 'Ballarat', preferred_date: job.preferred_date || '', urgency: job.urgency || 'flexible',
        access_notes: job.access_notes || '', parking: job.parking || 'on_street', safety_info: job.safety_info || '',
        photos: job.photos || [], budget: job.budget || '',
      });
    }).catch(() => toast({ title: 'Draft unavailable', description: 'It may have been removed or published.', variant: 'destructive' }))
      .finally(() => activeRequest && setLoadingDraft(false));
    return () => { activeRequest = false; };
  }, [params, user.id, toast]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const suggestCategory = (text = form.freeText) => {
    const t = (text || '').toLowerCase();
    const map = { clean: 'cleaning', vacuum: 'cleaning', garden: 'gardening', lawn: 'gardening', weed: 'gardening', hair: 'beauty', makeup: 'beauty', nail: 'beauty', rubbish: 'rubbish-removal', junk: 'rubbish-removal', waste: 'rubbish-removal', pest: 'pest-control', termite: 'pest-control', ant: 'pest-control', rodent: 'pest-control' };
    for (const k in map) if (t.includes(k)) return map[k];
    return 'handyman';
  };

  const buildPayload = (status) => {
    const categorySlug = form.category_slug || suggestCategory();
    const range = estimateRange(categorySlug, form.urgency);
    const cat = CATEGORY_MAP[categorySlug];
    const payload = {
      customer_suburb: form.suburb.trim() || 'Ballarat',
      title: form.title.trim() || form.freeText.trim().slice(0, 80) || `${cat?.name || 'Local'} job`,
      description: form.description.trim() || form.freeText.trim(),
      category_slug: categorySlug,
      category_name: cat?.name,
      service_key: PRIMARY_SERVICE_BY_CATEGORY[categorySlug],
      suburb: form.suburb.trim() || 'Ballarat',
      urgency: form.urgency,
      access_notes: form.access_notes.trim(),
      parking: form.parking,
      safety_info: form.safety_info.trim(),
      indicative_low: range.low,
      indicative_high: range.high,
      photos: form.photos,
      status,
      job_id: draftId || undefined,
      idempotency_key: crypto.randomUUID(),
    };
    if (form.preferred_date) payload.preferred_date = form.preferred_date;
    if (form.budget !== '' && Number.isFinite(Number(form.budget))) payload.budget = Number(form.budget);
    return payload;
  };

  const goNext = () => {
    if (step === 1) {
      const problem = form.freeText.trim();
      if (!form.category_slug && !problem) {
        toast({ title: 'Tell us what needs doing', description: 'Choose a service or describe the problem.', variant: 'destructive' });
        return;
      }
      const category = form.category_slug || suggestCategory(problem);
      setForm(f => ({
        ...f,
        category_slug: category,
        title: f.title || problem.slice(0, 80),
        description: f.description || problem,
      }));
    }
    if (step === 2) {
      if (form.title.trim().length < 5 || form.description.trim().length < 10 || !form.suburb.trim()) {
        toast({ title: 'Add the key job details', description: 'Enter a clear title, a short description, and the suburb.', variant: 'destructive' });
        return;
      }
    }
    setStep(current => Math.min(5, current + 1));
  };

  const saveDraft = async () => {
    if (!form.category_slug && !form.freeText.trim() && !form.title.trim()) {
      toast({ title: 'Nothing to save yet', description: 'Choose a service or describe the job first.' });
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload('draft');
      const { job: draft } = await callFunction('submit-request', payload);
      setDraftId(draft?.id || draftId);
      toast({ title: 'Draft saved', description: 'You can continue it from My Jobs.' });
      navigate('/my-jobs');
    } catch (error) {
      toast({ title: 'Could not save draft', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
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
    if (!form.category_slug || form.title.trim().length < 5 || form.description.trim().length < 10 || !form.suburb.trim()) {
      toast({ title: 'Job is not ready', description: 'Check the category, title, description, and suburb.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload('published');
      const { job } = await callFunction('submit-request', payload);

      // The request, notification fan-out and direct invite are all authorised
      // server-side. Release flags currently keep public publishing fail-closed.
      if (invitedTradieProfileId) {
        await callFunction('invite-tradie', { job_id: job.id, tradie_profile_id: invitedTradieProfileId })
          .catch(() => toast({ title: 'Job published, but the invite could not be sent', variant: 'destructive' }));
      }

      await callFunction('announce-job', { job_id: job.id }).catch(() => {});
      toast({ title: 'Job published!', description: 'Nearby verified tradies have been notified.' });
      navigate(`/job/${job.id}`);
    } catch (e) { toast({ title: 'Could not publish', description: e.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  const steps = [1, 2, 3, 4, 5];
  const range = estimateRange(form.category_slug, form.urgency);
  const canContinue = step === 1
    ? Boolean(form.category_slug || form.freeText.trim())
    : step === 2
      ? form.title.trim().length >= 5 && form.description.trim().length >= 10 && Boolean(form.suburb.trim())
      : true;

  if (loadingDraft) return <div className="glass-soft rounded-3xl h-72 animate-pulse" aria-label="Loading draft" />;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        {step > 1 && <button onClick={() => setStep(step - 1)} className="w-9 h-9 rounded-xl glass-soft flex items-center justify-center btn-tactile"><ChevronLeft size={18} /></button>}
        <h1 className="text-xl font-semibold tracking-tight">Post a job</h1>
        <div className="flex-1 flex gap-1.5 ml-2">
          {steps.map(s => <span key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-primary' : 'bg-border'}`} />)}
        </div>
        <span className="text-xs text-muted-foreground">Step {step}/5</span>
      </div>

      <div className="glass rounded-3xl p-5 sm:p-6">
        {step === 1 && (
          <Step title="Describe the problem" sub="Pick a category or describe it in your own words — we'll suggest the right trade.">
            <div className="mb-4">
              <CategoryGrid activeSlug={form.category_slug} onSelect={(slug) => set('category_slug', slug)} />
            </div>
            <label className="text-xs font-medium text-muted-foreground">Or describe it in your words</label>
            <textarea value={form.freeText} onChange={e => set('freeText', e.target.value)} rows={3} placeholder="My kitchen tap is leaking…" className="mt-1 w-full rounded-xl bg-white/70 border border-border p-3 text-sm focus:ring-2 ring-primary outline-none" />
            {form.freeText && !form.category_slug && (
            <button type="button" onClick={() => set('category_slug', suggestCategory())} className="mt-3 inline-flex items-center gap-2 text-sm text-eucalyptus-deep font-medium"><Sparkles size={15} /> Suggest a trade for me</button>
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
              <div className="flex gap-2">{URGENCY_OPTIONS.map(u => <button type="button" key={u.value} onClick={() => set('urgency', u.value)} className={`px-3 py-2 rounded-xl text-sm btn-tactile ${form.urgency === u.value ? 'bg-primary text-primary-foreground' : 'glass-soft'}`}>{u.label}</button>)}</div>
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
                    <img src={url} alt={`Job attachment ${i + 1}`} className="w-full h-full object-cover" />
                    <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => set('photos', form.photos.filter((_, idx) => idx !== i))} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center"><X size={13} /></button>
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
            <button type="button" onClick={goNext} disabled={!canContinue} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold btn-tactile disabled:opacity-45 disabled:cursor-not-allowed">Continue <ChevronRight size={16} className="inline" /></button>
          ) : (
            <button onClick={publish} disabled={saving || !form.title || !form.category_slug} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold btn-tactile disabled:opacity-50">{saving ? 'Publishing…' : 'Publish job'}</button>
          )}
        </div>
      </div>
      <button type="button" onClick={saveDraft} disabled={saving} className="mx-auto mt-4 flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50">
        <Save size={13} /> {saving ? 'Saving…' : 'Save draft and exit'}
      </button>
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
