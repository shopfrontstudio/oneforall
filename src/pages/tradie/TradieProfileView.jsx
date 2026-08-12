import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { EmptyState } from '@/components/oneforall/Bits';
import { CalendarClock, Lock, ShieldCheck } from 'lucide-react';
import { latestPublicAssertionForService, providerAssertionLabels } from '../../../base44/shared/public-assertions.js';

export default function ProviderProfileView() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const serviceKey = searchParams.get('service') || undefined;
  const [assertion, setAssertion] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const matches = await base44.entities.ProviderPublicAssertion.filter({ provider_id: id });
        const record = latestPublicAssertionForService(matches, serviceKey);
        if (active) setAssertion(record);
      } catch {
        if (active) setAssertion(null);
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => { active = false; };
  }, [id, serviceKey]);

  if (!loaded) return <div className="glass-soft h-40 rounded-2xl" role="status" aria-label="Loading provider trust details" />;
  if (!assertion) {
    return <EmptyState icon={CalendarClock} title="Provider details pending" body="OneForAll has not published an approved provider assertion for this account. Self-entered profile, licence, insurance, location and biography details are not shown as trust claims." action={<Link to="/services" className="font-semibold text-eucalyptus-deep">Review service pathways</Link>} />;
  }
  const labels = providerAssertionLabels(assertion, serviceKey);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <section className="glass rounded-3xl p-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-terracotta">OneForAll-published provider assertion</p>
        <h1 className="mt-2 text-2xl font-semibold">{assertion.display_name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">General service area: {(assertion.general_service_area || []).join(', ') || 'Not published'}</p>
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-border bg-white/65 p-3 text-sm text-muted-foreground"><Lock size={15} className="mt-0.5 shrink-0" />Contact details remain private until a managed booking creates the participant relationship.</div>
      </section>

      <section className="glass-soft rounded-2xl p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={16} className="text-eucalyptus-deep" />Published trust details</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <TrustItem label="Approved services" value={labels.serviceLabels.join(', ') || 'Unavailable'} />
          <TrustItem label="Evidence checked" value={assertion.evidence_checked_date || 'Unavailable'} />
          <TrustItem label="Credential type" value={assertion.credential_type || 'Unavailable'} />
          <TrustItem label="Credential scope" value={labels.credentialScopeLabels.join(', ') || 'Unavailable'} />
          <TrustItem label="Valid through" value={assertion.valid_through || 'Unavailable'} />
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">Only a separately reviewed ProviderPublicAssertion appears here. Draft provider entries are never used as a fallback.</p>
      </section>
      <Link to="/services" className="block text-center text-sm font-semibold text-eucalyptus-deep">Return to managed services</Link>
    </div>
  );
}

function TrustItem({ label, value }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-0.5 font-medium">{value}</dd></div>;
}
