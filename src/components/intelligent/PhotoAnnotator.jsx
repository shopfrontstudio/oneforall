import React, { useId, useState } from 'react';
import { MapPin, Trash2 } from 'lucide-react';

// Coordinates are normalised to the actual image so marks survive resizing.
// Saving/ownership remains the responsibility of the parent RPC flow.
export default function PhotoAnnotator({ src, alt = 'Job photo', points = [], onChange, readOnly = false }) {
  const id = useId();
  const [note, setNote] = useState('');
  const [position, setPosition] = useState({ x: 0.5, y: 0.5 });
  const add = () => {
    if (!note.trim() || points.length >= 10) return;
    onChange([...points, { ...position, note: note.trim() }]); setNote('');
  };
  return <div className="space-y-3">
    <div className="relative mx-auto w-fit max-w-full overflow-hidden rounded-xl border border-border">
      <img src={src} alt={alt} className="block max-h-96 max-w-full" onClick={readOnly ? undefined : (event) => { const rect = event.currentTarget.getBoundingClientRect(); setPosition({ x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) }); }} />
      {points.map((point, index) => <span key={index} title={point.note} className="pointer-events-none absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-xs font-bold text-white shadow" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}>{index + 1}</span>)}
      {!readOnly && <MapPin aria-hidden="true" className="pointer-events-none absolute h-7 w-7 -translate-x-1/2 -translate-y-full text-orange-700 drop-shadow" style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%` }} />}
    </div>
    {!readOnly && <fieldset className="space-y-3 rounded-xl bg-primary/5 p-3"><legend className="px-1 text-sm font-semibold">Mark an area</legend><p className="text-xs text-muted-foreground">Tap the photo, or use the sliders, then describe the marked area. Up to 10 notes.</p><div className="grid grid-cols-2 gap-4"><label className="text-xs">Horizontal position<input className="mt-1 w-full" type="range" min="0" max="100" value={Math.round(position.x * 100)} onChange={(event) => setPosition((current) => ({ ...current, x: Number(event.target.value) / 100 }))} /></label><label className="text-xs">Vertical position<input className="mt-1 w-full" type="range" min="0" max="100" value={Math.round(position.y * 100)} onChange={(event) => setPosition((current) => ({ ...current, y: Number(event.target.value) / 100 }))} /></label></div><label htmlFor={`${id}-note`} className="block text-sm font-semibold">What should the provider notice?</label><input id={`${id}-note`} className="inp" maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} placeholder="For example: water dripping here" /><button type="button" disabled={!note.trim() || points.length >= 10} onClick={add} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">Add note</button></fieldset>}
    <ol className="space-y-2">{points.map((point, index) => <li key={index} className="flex items-start justify-between gap-2 rounded-lg bg-white/70 p-2 text-sm"><span><b>{index + 1}.</b> {point.note}</span>{!readOnly && <button type="button" aria-label={`Remove note ${index + 1}`} className="flex min-h-11 min-w-11 items-center justify-center text-destructive" onClick={() => onChange(points.filter((_, i) => i !== index))}><Trash2 size={16} /></button>}</li>)}</ol>
  </div>;
}
