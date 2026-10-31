import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { formatMelbourneDateTime } from '@/lib/provider';

export default function JobProofManager({ booking, user, enabled, readOnly = false }) {
  const [rows, setRows] = useState([]);
  const [urls, setUrls] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState('before');
  const [note, setNote] = useState('');
  const [file, setFile] = useState(null);
  const fileInput = useRef(null);
  const previewUrls = useRef([]);
  const pending = useRef(null);
  const load = useCallback(async () => {
    if (user.demo_mode) { setLoading(false); return; }
    try {
      const proofs = await base44.entities.JobProof.filter({ booking_id: booking.id }, 'created_date');
      const links = await base44.integrations.JobProof.createSignedUrls(proofs.map((row) => row.photo_path));
      setRows(proofs);
      setUrls(Object.fromEntries(links.map((item) => [item.path, item.signed_url])));
      setError('');
    } catch { setError('Job photos could not be loaded. Try again before uploading.'); }
    finally { setLoading(false); }
  }, [booking.id, user.demo_mode]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { previewUrls.current.forEach((url) => URL.revokeObjectURL(url)); }, []);

  const upload = async (event) => {
    event.preventDefault();
    if (busy || !enabled || !file) return;
    setBusy(true);
    setError('');
    try {
      if (!['image/jpeg', 'image/png'].includes(file.type) || file.size <= 0 || file.size > 8 * 1024 * 1024) throw new Error('Choose a JPG or PNG photo smaller than 8 MB.');
      if (user.demo_mode) {
        const url = URL.createObjectURL(file);
        previewUrls.current.push(url);
        const id = crypto.randomUUID();
        setRows((current) => [...current, { id, phase, note, photo_path: id, created_date: new Date().toISOString() }]);
        setUrls((current) => ({ ...current, [id]: url }));
      } else {
        if (!pending.current || pending.current.file !== file || pending.current.phase !== phase || pending.current.note !== note.trim()) pending.current = { file, phase, note: note.trim(), id: crypto.randomUUID() };
        await base44.integrations.JobProof.upload({ bookingId: booking.id, ...pending.current });
        await load();
      }
      pending.current = null;
      setFile(null);
      setNote('');
      if (fileInput.current) fileInput.current.value = '';
    } catch (issue) { setError(issue.message || 'Photo upload was not confirmed. Refresh the photos before retrying.'); }
    finally { setBusy(false); }
  };
  return <section className="glass rounded-2xl p-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-semibold"><Camera size={18} />Before & after photos</h2><button type="button" onClick={load} disabled={busy} className="min-h-11 rounded-xl border border-border px-3 text-xs font-semibold">Refresh photos</button></div>
    <p className="mt-1 text-xs text-muted-foreground">{user.demo_mode ? 'Demo previews stay on this page only; no photos are uploaded.' : 'Private to this booking. Ask permission before photographing people or personal belongings. Photos document work; they do not independently verify quality.'}</p>
    {error && <p role="alert" className="mt-3 rounded-xl border border-destructive/25 p-3 text-sm text-destructive">{error}</p>}
    {loading ? <p role="status" className="mt-3 text-sm">Loading job photos…</p> : <div className="mt-4 grid gap-4 sm:grid-cols-2">{['before', 'after'].map((kind) => <div key={kind}><h3 className="mb-2 text-sm font-semibold capitalize">{kind}</h3>{!rows.some((row) => row.phase === kind) && <p className="rounded-xl bg-mist-soft p-3 text-xs text-muted-foreground">No {kind} photos yet.</p>}<div className="space-y-3">{rows.filter((row) => row.phase === kind).map((row) => <figure key={row.id} className="overflow-hidden rounded-xl border border-border/50 bg-white/45">{urls[row.photo_path] ? <img src={urls[row.photo_path]} alt={`${kind === 'before' ? 'Before work' : 'After work'}${row.note ? `: ${row.note}` : ''}`} className="aspect-[4/3] w-full object-cover" loading="lazy" /> : <p className="p-3 text-xs">Photo link unavailable. Refresh photos to retry.</p>}<figcaption className="p-3"><p className="whitespace-pre-wrap text-sm">{row.note || 'No note added'}</p><p className="mt-1 text-xs text-muted-foreground">{formatMelbourneDateTime(row.created_date)}</p></figcaption></figure>)}</div></div>)}</div>}
    {!readOnly && <form onSubmit={upload} className="mt-5 grid gap-3 border-t border-border/50 pt-4 sm:grid-cols-2">
      <label className="text-xs font-semibold">Photo type<select disabled={!enabled || busy} value={phase} onChange={(event) => setPhase(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"><option value="before">Before work</option><option value="after">After work</option></select></label>
      <label className="text-xs font-semibold">Photo · JPG or PNG, up to 8 MB<input ref={fileInput} type="file" accept="image/jpeg,image/png" required disabled={!enabled || busy} onChange={(event) => setFile(event.target.files?.[0] || null)} className="mt-1 block min-h-11 w-full rounded-xl border border-border bg-white p-2 text-xs" /></label>
      <label className="text-xs font-semibold sm:col-span-2">Work notes<textarea value={note} maxLength={1000} disabled={!enabled || busy} onChange={(event) => setNote(event.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-border bg-white p-3 text-sm" placeholder="What changed, and anything the customer should know" /></label>
      <button disabled={!enabled || busy || !file || loading} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-45">{busy ? 'Uploading…' : user.demo_mode ? 'Add demo preview' : 'Save private job photo'}</button>
    </form>}
  </section>;
}
