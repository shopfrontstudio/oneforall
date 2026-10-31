import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { estimatePrice, melbourneDate } from '@/lib/intelligentExperience';
import { formatAUDRange } from '@/lib/oneforall';
export default function PriceGuide({ serviceKey, quantity = 1 }) {
  const [guide, setGuide] = useState(null);
  useEffect(() => {
    let active = true; setGuide(null);
    base44.entities.ServicePriceGuide.filter({ service_key: serviceKey }).then((rows) => { if (active) setGuide(rows.find((row) => row.valid_through >= melbourneDate()) || null); }).catch(() => {});
    return () => { active = false; };
  }, [serviceKey]);
  const estimate = estimatePrice(guide, quantity);
  return <section className="rounded-2xl border border-primary/15 bg-sage/20 p-4"><h2 className="font-semibold">Price guide</h2>{estimate ? <><p className="mt-2 text-2xl font-semibold">{formatAUDRange(estimate.low, estimate.high)}</p><p className="mt-1 text-sm">For {quantity} {guide.unit_label}, including the listed call-out charge.</p><p className="mt-2 text-sm"><b>Includes:</b> {guide.inclusions}</p><p className="mt-1 text-sm"><b>Excludes:</b> {guide.exclusions}</p><p className="mt-2 text-xs text-muted-foreground">Indicative only, not a quote. The provider confirms the scope and final price for your approval. No platform fee or online payment.</p></> : <p className="mt-2 text-sm text-muted-foreground">No approved price guide is available for this service yet. Request a quote; your planning budget is not a price estimate or charge.</p>}</section>;
}
