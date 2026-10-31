import React from 'react';
import { comparableQuotes, displayDate } from '@/lib/intelligentExperience';
import { formatAUDRange } from '@/lib/oneforall';
import VerificationPassport from './VerificationPassport';

export default function QuoteComparison({ quotes = [], selectedQuoteId, onSelect, serviceKey }) {
  const available = comparableQuotes(quotes);
  if (!available.length) return null;
  return <section className="glass rounded-3xl p-5" aria-labelledby="compare-quotes-title"><h2 id="compare-quotes-title" className="text-xl font-semibold">{available.length > 1 ? 'Compare your quotes' : 'Your provider’s offer'}</h2><p className="mt-1 text-sm text-muted-foreground">Compare the work included, not just the price. Selecting a quote does not approve it.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">{available.map((quote) => <article key={quote.id} className={`min-w-0 rounded-2xl border p-4 ${quote.id === selectedQuoteId ? 'border-primary bg-primary/5' : 'border-border bg-white/70'}`}>
      <p className="font-semibold">{quote.attending_worker_display_name || 'Attending provider'}</p><p className="mt-2 text-xl font-bold">{formatAUDRange(quote.quote_low, quote.quote_high)}</p><dl className="mt-3 space-y-2 text-sm"><div><dt className="text-muted-foreground">Available from</dt><dd>{displayDate(quote.earliest_availability)}</dd></div><div><dt className="text-muted-foreground">Included work and exclusions</dt><dd className="whitespace-pre-wrap">{quote.quote_terms || 'Not supplied—clarify with the provider before approving.'}</dd></div><div><dt className="text-muted-foreground">Labour, materials and call-out</dt><dd>Included only as stated in the provider’s quote; no breakdown is assumed.</dd></div></dl>
      <div className="mt-4"><VerificationPassport providerId={quote.tradie_id} serviceKey={serviceKey} /></div>
      <button type="button" className="mt-3 min-h-11 w-full rounded-xl border border-primary px-3 text-sm font-semibold text-primary" aria-pressed={quote.id === selectedQuoteId} onClick={() => onSelect(quote.id)}>{quote.id === selectedQuoteId ? 'Selected for review' : 'Review this quote'}</button>
    </article>)}</div>
  </section>;
}
