import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { activeAssertions, displayDate } from '@/lib/intelligentExperience';
import { PHASE1_SERVICE_MAP } from '@/lib/catalogue';

export default function VerificationPassport({ providerId, serviceKey }) {
  const [state, setState] = useState({ loading: true, error: false, assertions: [] });
  useEffect(() => {
    let active = true;
    setState({ loading: true, error: false, assertions: [] });
    if (!providerId || !serviceKey) { setState({ loading: false, error: false, assertions: [] }); return; }
    base44.entities.ProviderPublicAssertion.filter({ provider_id: providerId }).then((rows) => {
      if (active) setState({ loading: false, error: false, assertions: activeAssertions(rows, serviceKey) });
    }).catch(() => { if (active) setState({ loading: false, error: true, assertions: [] }); });
    return () => { active = false; };
  }, [providerId, serviceKey]);
  return <details className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
    <summary className="flex min-h-7 cursor-pointer items-center gap-2 text-sm font-semibold"><ShieldCheck size={18} aria-hidden="true" />Provider checks for this service</summary>
    {state.loading ? <p className="mt-3 text-sm" role="status">Loading recorded checks…</p> : state.error ? <p className="mt-3 text-sm" role="alert">Checks could not be loaded. No verification claim is shown.</p> : !state.assertions.length ? <p className="mt-3 text-sm text-muted-foreground">No current, publicly approved verification summary is available for this service.</p> : state.assertions.map((assertion) => <div key={assertion.id} className="mt-3 text-sm"><p className="font-semibold">{assertion.display_name}</p><ul className="mt-2 list-disc space-y-1 pl-5">{(assertion.credential_scope || []).map((scope) => <li key={scope}>{scope === '*' ? 'Approved service scope' : PHASE1_SERVICE_MAP[serviceKey]?.scope_options.find((option) => option.id === scope)?.label || 'Approved scope on record'}</li>)}</ul><p className="mt-3 text-xs text-muted-foreground">Checked {displayDate(assertion.evidence_checked_date)} · valid through {displayDate(assertion.valid_through)}</p></div>)}
    <p className="mt-3 text-xs text-muted-foreground">Only approved summaries are shown. Private identity documents, licence numbers and insurance files are never displayed here.</p>
  </details>;
}
