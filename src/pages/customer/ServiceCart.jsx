import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { PHASE1_SERVICE_MAP, callFunction, ensureProfile, setAccountType } from '@/lib/oneforall';
import { clearCart, loadCart, requestPayload, saveCart } from '@/lib/serviceCart';
import { evaluateIntakeDraft, saveSessionIntake } from '@/lib/intake';
import { serviceImage, serviceImageUrl } from '@/lib/serviceImages';

export default function ServiceCart() {
  const { user, checkUserAuth } = useAuth();
  const [items, setItems] = useState(() => loadCart(user.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(null);
  const [bundleKey] = useState(() => crypto.randomUUID());
  const remove = (id) => {
    try { setItems(saveCart(user.id, items.filter((item) => item.idempotency_key !== id))); setError(''); }
    catch { setError('Your browser could not update this list. Please try again.'); }
  };
  const send = async () => {
    setBusy(true); setError('');
    try {
      if (user.account_type === 'tradie') throw new Error('Switch to Customer mode to send requests.');
      if (items.some((item) => !['ready', 'manual_review'].includes(evaluateIntakeDraft(item).state))) throw new Error('Review the incomplete service details first.');
      if (!user.account_type) { await setAccountType('customer'); await ensureProfile('customer'); await checkUserAuth(); }
      const result = await callFunction('submit-request-bundle', { idempotency_key: bundleKey, items: items.map(requestPayload) });
      setSent(result); clearCart(user.id); setItems([]);
    } catch (failure) { setError(failure.message || 'Could not send requests. Your list is kept for retry.'); }
    finally { setBusy(false); }
  };
  return <div className="mx-auto max-w-3xl space-y-5">
    <header><p className="text-xs font-bold uppercase tracking-widest text-terracotta">Plan your home services</p><h1 className="mt-2 text-3xl font-semibold">Your service list</h1><p className="mt-2 text-sm text-muted-foreground">Send several requests together. Each service gets its own scope check, quote and booking; different specialists may be needed. No payment is collected.</p></header>
    {error && <p role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm">{error}</p>}
    {sent ? <section className="glass rounded-2xl p-6" role="status"><h2 className="text-xl font-semibold">Your requests have been sent</h2><p className="mt-2 text-sm">Review progress and add photos from each request.</p><Link to="/bookings" className="mt-4 inline-flex min-h-11 items-center font-semibold text-primary">View my requests →</Link></section> : <>
      {!items.length && <section className="glass rounded-2xl p-6"><h2 className="text-xl font-semibold">What needs doing?</h2><p className="mt-2 text-sm text-muted-foreground">Choose a service, complete its details, then select “Add to my service list”. Drafts stay in this browser session for 30 minutes.</p></section>}
      {items.map((item) => { const service = PHASE1_SERVICE_MAP[item.service_key]; const media = serviceImage(service); const valid = ['ready', 'manual_review'].includes(evaluateIntakeDraft(item).state); return <article key={item.idempotency_key} className="glass flex gap-4 rounded-2xl p-4">{media && <img src={serviceImageUrl(media, import.meta.env.BASE_URL)} alt="" className="h-20 w-20 rounded-xl object-cover" />}<div className="min-w-0 flex-1"><h2 className="font-semibold">{service.name}</h2><p className="mt-1 text-sm text-muted-foreground">{item.suburb} · {item.preferred_date || 'Date to agree'}</p><p className="mt-1 text-sm">{item.selected_scope_ids.map((id) => service.scope_options.find((scope) => scope.id === id)?.label).filter(Boolean).join(' · ')}</p>{!valid && <p className="mt-2 text-sm text-destructive">Details need review</p>}<div className="mt-2 flex flex-wrap gap-4"><Link onClick={() => saveSessionIntake(item)} to={`/request/${encodeURIComponent(item.service_key)}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary">Edit details</Link><button disabled={busy} onClick={() => remove(item.idempotency_key)} className="min-h-11 text-sm font-semibold text-terracotta">Remove</button></div></div></article>; })}
      <div className="flex flex-wrap gap-3"><Link to="/services" className="inline-flex min-h-11 items-center rounded-xl border border-primary px-4 font-semibold">Add a service</Link>{items.length > 0 && <button disabled={busy} onClick={send} className="min-h-11 rounded-xl bg-primary px-5 font-semibold text-white disabled:opacity-50">{busy ? 'Sending…' : `Send ${items.length} request${items.length === 1 ? '' : 's'}`}</button>}</div>
      <p className="text-xs text-muted-foreground">Photos are added to each request after sending. Submitting this list does not reserve a provider or confirm a price.</p>
    </>}
  </div>;
}
