import React, { useEffect, useState } from 'react';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { callFunction } from '@/lib/oneforall';
import { PHASE1_SERVICE_MAP } from '@/lib/catalogue';
import { PUBLIC_PATHS } from '@/lib/routes';

export default function ProviderBookingLink() {
  const { token = '' } = useParams();
  const [state, setState] = useState({ loading: true, link: null, error: '' });

  useEffect(() => {
    let active = true;
    callFunction('resolve-provider-booking-link', { token: String(token).slice(0, 240) })
      .then((link) => {
        if (!active) return;
        const service = PHASE1_SERVICE_MAP[link?.service_key];
        setState(service ? { loading: false, link: { ...link, service }, error: '' } : { loading: false, link: null, error: 'This provider request link is unavailable or has expired.' });
      })
      .catch(() => active && setState({ loading: false, link: null, error: 'This provider request link is unavailable or has expired.' }));
    return () => { active = false; };
  }, [token]);

  if (state.loading) return <div className="glass-soft h-64 animate-pulse rounded-3xl" role="status" aria-label="Checking provider request link" />;
  if (!state.link) return <section className="mx-auto max-w-xl glass rounded-3xl p-6 sm:p-8"><h1 className="text-2xl font-semibold">Provider request link unavailable</h1><p className="mt-3 text-muted-foreground">{state.error}</p><Link to={PUBLIC_PATHS.services} className="mt-5 inline-flex min-h-11 items-center font-semibold text-eucalyptus-deep">Browse services</Link></section>;

  const requestUrl = `${PUBLIC_PATHS.intake(state.link.service.key)}?bookingLink=${encodeURIComponent(token)}`;
  return <section className="mx-auto max-w-2xl glass rounded-3xl p-6 sm:p-8">
    <LockKeyhole size={30} className="text-eucalyptus-deep" />
    <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em] text-terracotta">Private provider request link</p>
    <h1 className="mt-2 text-3xl font-semibold">Request {state.link.service.name.toLowerCase()} from {state.link.provider_display_name}</h1>
    <p className="mt-3 text-muted-foreground">The listed provider is your requested provider, not a guaranteed booking. OneForAll rechecks current service scope, availability, evidence and attending-worker eligibility before any invitation or booking.</p>
    <Link to={requestUrl} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-action px-5 py-3 text-sm font-semibold text-action-foreground">Continue to private request <ArrowRight size={16} /></Link>
  </section>;
}
