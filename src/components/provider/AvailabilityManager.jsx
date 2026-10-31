import React, { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { formatMelbourneDateTime, providerServiceLabels } from '@/lib/provider';
import { validateAvailabilityWindow } from './providerDateTime';

export default function AvailabilityManager({ user, offerings, workers, enabled }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ service: '', worker: '', start: '', end: '' });
  const pending = useRef(null);
  const eligibleOfferings = offerings.filter((row) => row.review_status === 'approved' && row.active && !row.reverification_required);
  const eligibleWorkers = workers.filter((row) => row.review_status === 'verified' && row.active);
  const load = useCallback(async () => {
    if (user.demo_mode) { setLoading(false); return; }
    try {
      setRows(await base44.entities.ProviderAvailability.filter({ provider_id: user.id }, 'starts_at'));
      setError('');
    } catch { setError('Availability could not be loaded. No changes have been made.'); }
    finally { setLoading(false); }
  }, [user.demo_mode, user.id]);
  useEffect(() => { load(); }, [load]);
  const save = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (!enabled) throw new Error('Availability changes are not enabled for your account yet.');
      if (!form.service || !form.worker) throw new Error('Choose a service and an approved attending worker.');
      const window = validateAvailabilityWindow(form.start, form.end);
      const intent = JSON.stringify({ ...window, service_key: form.service, worker_id: form.worker });
      if (pending.current?.intent !== intent) pending.current = { intent, id: crypto.randomUUID() };
      if (user.demo_mode) {
        setRows((current) => [...current, { ...window, id: pending.current.id, service_key: form.service, worker_id: form.worker, version: 1 }]);
      } else {
        await base44.functions.invoke('save-provider-availability', { ...window, id: pending.current.id, service_key: form.service, worker_id: form.worker });
        await load();
      }
      pending.current = null;
      setForm((current) => ({ ...current, start: '', end: '' }));
    } catch (issue) { setError(issue.message || 'Availability was not saved.'); }
    finally { setBusy(false); }
  };
  const remove = async (row) => {
    if (busy) return;
    setBusy(true);
    try {
      if (user.demo_mode) setRows((current) => current.filter((item) => item.id !== row.id));
      else {
        await base44.functions.invoke('save-provider-availability', { id: row.id, version: row.version, delete: true });
        await load();
      }
    } catch (issue) { setError(issue.message || 'Availability was not removed.'); }
    finally { setBusy(false); }
  };
  return <div className="mt-4 space-y-3 border-t border-border/50 pt-4">
    <h3 className="text-sm font-semibold">Available appointment windows</h3>
    <p className="text-xs text-muted-foreground">All times are Ballarat time. These are possible appointments, not confirmed bookings. {user.demo_mode ? 'Demo changes last only while this page is open.' : 'A quote and customer confirmation are still required.'}</p>
    {error && <div role="alert" className="rounded-xl border border-destructive/25 p-3 text-sm text-destructive">{error}<button type="button" onClick={load} className="ml-2 underline">Retry loading</button></div>}
    {loading ? <p role="status" className="text-sm">Loading availability…</p> : <ul className="space-y-2">{rows.filter((row) => Date.parse(row.ends_at) > Date.now()).map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-mist-soft p-3"><div><p className="text-sm font-semibold">{providerServiceLabels(row.service_key, []).service}</p><p className="text-xs text-muted-foreground">{formatMelbourneDateTime(row.starts_at)} – {formatMelbourneDateTime(row.ends_at)}</p></div><button type="button" disabled={busy || !enabled} onClick={() => remove(row)} className="min-h-11 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-45">Remove</button></li>)}</ul>}
    {!loading && !rows.some((row) => Date.parse(row.ends_at) > Date.now()) && <p className="text-sm text-muted-foreground">No appointment windows added yet.</p>}
    <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-semibold">Service<select required disabled={!enabled || busy} value={form.service} onChange={(event) => setForm((current) => ({ ...current, service: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"><option value="">Choose service</option>{eligibleOfferings.map((item) => <option key={item.id} value={item.service_key}>{providerServiceLabels(item.service_key, []).service}</option>)}</select></label>
      <label className="text-xs font-semibold">Attending worker<select required disabled={!enabled || busy} value={form.worker} onChange={(event) => setForm((current) => ({ ...current, worker: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"><option value="">Choose worker</option>{eligibleWorkers.map((worker) => <option key={worker.id} value={worker.id}>{worker.display_name}</option>)}</select></label>
      <label className="text-xs font-semibold">From · Ballarat time<input type="datetime-local" required disabled={!enabled || busy} value={form.start} onChange={(event) => setForm((current) => ({ ...current, start: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm" /></label>
      <label className="text-xs font-semibold">Until · Ballarat time<input type="datetime-local" required disabled={!enabled || busy} value={form.end} onChange={(event) => setForm((current) => ({ ...current, end: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm" /></label>
      <button disabled={!enabled || busy || loading} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-45">{busy ? 'Saving…' : 'Add availability'}</button>
    </form>
  </div>;
}
