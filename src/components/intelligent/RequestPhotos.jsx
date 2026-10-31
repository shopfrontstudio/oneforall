import React, { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { callFunction } from '@/lib/oneforall';
import PhotoAnnotator from './PhotoAnnotator';

export default function RequestPhotos({ job, readOnly = false }) {
  const [paths, setPaths] = useState(job.request_photo_paths || []);
  const [urls, setUrls] = useState({});
  const [annotations, setAnnotations] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const editable = !readOnly && ['manual_review','submitted','published'].includes(job.status);
  const load = useCallback(async () => {
    try {
      const current = await base44.entities.Job.get(job.id);
      if (!current) throw new Error('Request unavailable.');
      const next = current.request_photo_paths || [];
      const [signed, rows] = await Promise.all([
        base44.integrations.ProviderRequestMedia.createSignedUrls(next),
        base44.entities.PhotoAnnotation.filter({ job_id: job.id }),
      ]);
      setPaths(next); setUrls(Object.fromEntries(signed.map((item) => [item.path, item.signed_url])));
      setAnnotations(Object.fromEntries(rows.map((row) => [row.photo_path, row]))); setError('');
    } catch { setError('Private photos or notes could not be loaded. Try refreshing them.'); }
  }, [job.id]);
  useEffect(() => { load(); }, [load]);
  const upload = async (files) => {
    if (busy || !files.length) return;
    setBusy(true); setError('');
    try { await base44.integrations.CustomerRequestMedia.upload({ jobId: job.id, files, existingPaths: paths }); await load(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const save = async (path) => {
    setBusy(true); setError('');
    try {
      const row = annotations[path] || { annotations: [] };
      const saved = await callFunction('save-photo-annotations', { job_id: job.id, photo_path: path, annotations: row.annotations, version: row.version });
      setAnnotations((current) => ({ ...current, [path]: saved }));
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return <section className="glass space-y-4 rounded-3xl p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Photos & problem areas</h2><button type="button" disabled={busy} onClick={load} className="min-h-11 text-sm font-semibold text-primary">Refresh photos</button></div><p className="text-sm text-muted-foreground">Photos are for human review, not automatic diagnosis. Avoid faces, identity documents and private contact details.</p>{error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm">{error}</p>}{!paths.length && <p className="text-sm text-muted-foreground">No photos attached yet.</p>}{editable && <label className="block text-sm font-semibold">Add photos (up to 6, JPG/PNG, 8 MB each)<input type="file" multiple accept="image/jpeg,image/png" disabled={busy || paths.length >= 6} className="mt-2 block min-h-11 w-full text-sm" onChange={(event) => { upload(Array.from(event.target.files || [])); event.target.value = ''; }} /></label>}<div className="grid gap-5 sm:grid-cols-2">{paths.map((path, index) => <div key={path}>{urls[path] ? <PhotoAnnotator src={urls[path]} alt={`Request photo ${index+1}`} readOnly={!editable || busy} points={annotations[path]?.annotations || []} onChange={(points) => setAnnotations((current) => ({ ...current, [path]: { ...current[path], annotations: points } }))} /> : <p className="text-sm">Photo link unavailable. Refresh to retry.</p>}{editable && <button type="button" disabled={busy} onClick={() => save(path)} className="mt-3 min-h-11 rounded-xl border border-primary px-4 text-sm font-semibold">Save photo notes</button>}</div>)}</div></section>;
}
