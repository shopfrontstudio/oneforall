import React, { useEffect, useState } from 'react';
import { callFunction } from '@/lib/oneforall';
import { formatMelbourneDateTime } from '@/lib/provider';
export default function QuoteAvailability({ quoteId }) {
  const [state, setState] = useState({ loading: true, windows: [], error: '' });
  useEffect(() => {
    let active = true; setState({ loading: true, windows: [], error: '' });
    callFunction('availability-for-quote', { quote_id: quoteId }).then((windows) => {
      if (active) setState({ loading: false, windows: Array.isArray(windows) ? windows : [], error: '' });
    }).catch(() => { if (active) setState({ loading: false, windows: [], error: 'Available times could not be confirmed. Agree a time with the provider.' }); });
    return () => { active = false; };
  }, [quoteId]);
  return <details className="mt-4 rounded-xl border border-primary/15 p-3"><summary className="min-h-7 cursor-pointer text-sm font-semibold">View this provider’s available times</summary><p className="mt-2 text-xs text-muted-foreground">Ballarat time. These are provider-published windows, not reservations. The provider confirms the appointment after quote approval.</p>{state.loading ? <p className="mt-2 text-sm" role="status">Checking availability…</p> : state.error ? <p className="mt-2 text-sm">{state.error}</p> : state.windows.length ? <ul className="mt-3 space-y-2">{state.windows.map((window) => <li key={window.id} className="rounded-lg bg-sage/20 p-2 text-sm">{formatMelbourneDateTime(window.starts_at)} – {formatMelbourneDateTime(window.ends_at)}</li>)}</ul> : <p className="mt-2 text-sm">No available windows published for this quote yet. A date still needs to be agreed.</p>}</details>;
}
