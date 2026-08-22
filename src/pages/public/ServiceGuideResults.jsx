import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, CircleHelp } from 'lucide-react';
import { EmptyState } from '@/components/oneforall/Bits';
import { CategoryIcon } from '@/components/public/ServiceCard';
import { CATEGORY_META_MAP, PHASE1_SERVICE_MAP } from '@/lib/catalogue';
import { PUBLIC_PATHS } from '@/lib/routes';
import { loadServiceGuideResult, selectServiceGuideSuggestion } from '@/lib/serviceGuide';

const ProblemSummary = ({ summary }) => (
  <section className="rounded-2xl border border-border bg-white/65 p-4" aria-labelledby="understood-heading">
    <p id="understood-heading" className="text-xs font-bold uppercase tracking-[0.14em] text-terracotta">What we understood</p>
    <p className="mt-2 text-base font-medium">“{summary}”</p>
  </section>
);

export default function ServiceGuideResults() {
  const result = loadServiceGuideResult();
  if (!result) {
    return <EmptyState title="Start with your service problem" body="Your private guide result is not available or has expired." action={<Link to={`${PUBLIC_PATHS.home}#service-guide`} className="font-semibold text-eucalyptus-deep">Describe what you need</Link>} />;
  }

  if (result.state === 'emergency') {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <Link to={PUBLIC_PATHS.home} className="inline-flex items-center gap-1 text-sm font-semibold text-eucalyptus-deep"><ArrowLeft size={15} />Home</Link>
        <ProblemSummary summary={result.summary} />
        <section className="rounded-3xl border border-destructive/30 bg-destructive/5 p-6 sm:p-8" role="alert">
          <AlertTriangle size={34} className="text-destructive" />
          <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em] text-destructive">Emergency wording detected</p>
          <h1 className="mt-2 text-3xl font-semibold">Please use emergency help.</h1>
          <p className="mt-3 text-muted-foreground"><b>OneForAll is not an emergency service.</b> If someone is in immediate danger or life is at risk, call 000. Otherwise contact the appropriate utility or emergency authority for the hazard.</p>
          <a href="tel:000" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-destructive px-5 py-3 text-sm font-semibold text-destructive-foreground">Call 000</a>
        </section>
      </div>
    );
  }

  if (result.state === 'uncertain') {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <Link to={PUBLIC_PATHS.home} className="inline-flex items-center gap-1 text-sm font-semibold text-eucalyptus-deep"><ArrowLeft size={15} />Try another description</Link>
        <ProblemSummary summary={result.summary} />
        <section className="glass rounded-3xl p-6 sm:p-8">
          <CircleHelp size={34} className="text-eucalyptus-deep" />
          <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em] text-terracotta">A careful next step</p>
          <h1 className="mt-2 text-3xl font-semibold">I’m not certain enough to choose safely.</h1>
          <p className="mt-3 text-muted-foreground">Use the private guided pathway and OneForAll can review your description before it reaches any provider.</p>
          <Link onClick={() => selectServiceGuideSuggestion('general.guided_request')} to={PUBLIC_PATHS.service('general.guided_request')} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">Get help choosing <ArrowRight size={16} /></Link>
          <Link to={PUBLIC_PATHS.services} className="ml-0 mt-3 inline-flex min-h-11 items-center px-2 text-sm font-semibold text-eucalyptus-deep sm:ml-3">Browse manually</Link>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to={PUBLIC_PATHS.home} className="inline-flex items-center gap-1 text-sm font-semibold text-eucalyptus-deep"><ArrowLeft size={15} />Try another description</Link>
      <header className="max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-terracotta">OneForAll service guide</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">These are the closest service options.</h1>
        <p className="mt-3 text-muted-foreground">Check the service boundaries before continuing. These suggestions do not confirm availability, price or a booking.</p>
      </header>
      <ProblemSummary summary={result.summary} />
      <section aria-labelledby="suggestions-heading">
        <h2 id="suggestions-heading" className="text-xl font-semibold">Suggested services</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {result.suggestions.map((suggestion) => {
            const service = PHASE1_SERVICE_MAP[suggestion.service_key];
            if (!service) return null;
            const scopes = service.scope_options.filter((scope) => suggestion.scope_ids.includes(scope.id));
            const scopeReasons = new Map((suggestion.scope_matches || []).map((match) => [match.scope_id, match.reason]));
            return (
              <article key={service.key} className="glass-soft flex h-full flex-col rounded-2xl p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sage/55 text-eucalyptus-deep"><CategoryIcon category={service.category} /></span>
                  <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-terracotta">{CATEGORY_META_MAP[service.category]?.name}</p><h3 className="mt-1 text-lg font-semibold">{service.name}</h3></div>
                </div>
                {scopes.length > 0 ? <div className="mt-4"><p className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">Suggested sub-options</p><ul className="mt-2 space-y-2 text-sm">{scopes.map((scope) => <li key={scope.id} className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-eucalyptus-deep" /><span>{scope.label} <span className="font-semibold text-eucalyptus-deep">({scopeReasons.get(scope.id) || suggestion.reason})</span></span></li>)}</ul></div> : <p className="mt-4 text-sm text-muted-foreground">{suggestion.reason && <span className="mb-1 block font-semibold text-eucalyptus-deep">({suggestion.reason})</span>}Choose the exact sub-option after checking this service.</p>}
                <Link onClick={() => selectServiceGuideSuggestion(service.key)} to={PUBLIC_PATHS.service(service.key)} className="mt-auto inline-flex min-h-11 items-center gap-2 pt-5 text-sm font-semibold text-eucalyptus-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25">Check this service <ArrowRight size={16} /></Link>
              </article>
            );
          })}
        </div>
      </section>
      <div className="rounded-2xl border border-border bg-white/55 p-4 text-sm"><b>Need a different service?</b><span className="ml-1 text-muted-foreground">Try another description or browse every category.</span><div className="mt-3 flex flex-wrap gap-4"><Link to={`${PUBLIC_PATHS.home}#service-guide`} className="font-semibold text-eucalyptus-deep">Describe it again</Link><Link to={PUBLIC_PATHS.services} className="font-semibold text-eucalyptus-deep">Browse all services</Link></div></div>
    </div>
  );
}
