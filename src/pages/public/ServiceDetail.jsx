import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, Eye, LockKeyhole } from 'lucide-react';
import { CATEGORY_META_MAP, PHASE1_SERVICE_MAP, serviceAvailability, serviceAvailabilityMessage, servicePathwayLabel } from '@/lib/catalogue';
import { PUBLIC_PATHS } from '@/lib/routes';
import { EmptyState } from '@/components/oneforall/Bits';
import { IS_DEV_PREVIEW } from '@/lib/runtime';
import { loadServiceGuideHandoff } from '@/lib/serviceGuide';

const Boundary = ({ icon: Icon, title, items, tone }) => <section className={`rounded-2xl border p-4 ${tone}`}><h2 className="flex items-center gap-2 text-base font-semibold"><Icon size={18} />{title}</h2><ul className="mt-3 space-y-2 text-sm">{items.map((item) => <li key={item} className="flex gap-2"><span aria-hidden="true">•</span><span>{item}</span></li>)}</ul></section>;

export default function ServiceDetail() {
  const { serviceKey } = useParams();
  const service = PHASE1_SERVICE_MAP[serviceKey];
  if (!service) return <EmptyState title="Service not found" body="This service is not in the Phase 1 catalogue." action={<Link to="/services" className="font-semibold text-eucalyptus-deep">Return to services</Link>} />;
  const unavailable = serviceAvailability(service) !== 'available';
  const guideHandoff = loadServiceGuideHandoff(service.key);
  const suggestedScopes = guideHandoff ? service.scope_options.filter((scope) => guideHandoff.scope_ids.includes(scope.id)) : [];
  return (
    <div className="space-y-6">
      <Link to={PUBLIC_PATHS.category(service.category)} className="inline-flex items-center gap-1 text-sm font-semibold text-eucalyptus-deep"><ArrowLeft size={15} />{CATEGORY_META_MAP[service.category]?.name}</Link>
      <header className="glass rounded-3xl p-5 sm:p-8"><p className="text-xs font-bold uppercase tracking-[0.14em] text-terracotta">{CATEGORY_META_MAP[service.category]?.name}</p><h1 className="mt-2 text-3xl font-semibold">{service.name}</h1><p className="mt-3 text-lg font-medium text-eucalyptus-deep">{servicePathwayLabel(service)}</p>{service.adults_only && <p className="mt-3 inline-flex rounded-full bg-sandstone/60 px-3 py-1 text-sm font-semibold">Adults only · low-risk services</p>}{service.category === 'pest-control' && <p className="mt-3 text-sm text-muted-foreground">Diagnostic first: treatment is never performed through the initial assessment route.</p>}<div className="mt-5 rounded-2xl border border-sandstone-deep/50 bg-sandstone/30 p-4" role="status"><b>{unavailable ? 'Not accepting public requests.' : 'Accepting requests.'}</b><span className="block text-sm text-muted-foreground">{serviceAvailabilityMessage(service)}</span></div></header>
      {guideHandoff && <section className="rounded-2xl border border-eucalyptus/25 bg-sage/25 p-5" aria-labelledby="guide-suggestion-heading"><p className="text-xs font-bold uppercase tracking-[0.14em] text-eucalyptus-deep">From your service guide</p><h2 id="guide-suggestion-heading" className="mt-2 text-lg font-semibold">Check whether this service fits.</h2><p className="mt-2 text-sm text-muted-foreground">You told us: “{guideHandoff.problem}”</p>{suggestedScopes.length > 0 && <div className="mt-3"><p className="text-sm font-semibold">Suggested sub-options</p><ul className="mt-2 space-y-1 text-sm">{suggestedScopes.map((scope) => <li key={scope.id}>• {scope.label}</li>)}</ul></div>}<p className="mt-3 text-xs text-muted-foreground">Nothing is submitted yet. Review the boundaries below before continuing.</p></section>}
      <div className="grid gap-3 lg:grid-cols-3"><Boundary icon={CheckCircle2} title="Within this pathway" items={service.allowed_scope} tone="border-eucalyptus/20 bg-sage/25" /><Boundary icon={Eye} title="Needs review" items={service.review_scope} tone="border-sandstone-deep/40 bg-sandstone/25" /><Boundary icon={LockKeyhole} title="Not offered" items={service.blocked_scope} tone="border-terracotta/25 bg-terracotta/5" /></div>
      <section className="glass rounded-2xl p-5"><h2 className="flex items-center gap-2 font-semibold"><AlertTriangle size={18} className="text-terracotta" />Before continuing</h2><p className="mt-2 text-sm text-muted-foreground">Unknown or mixed scope is held for manual review. Regulated or prohibited scope is blocked. Eligibility is service-specific and checked again before quoting and booking.</p>{!unavailable || IS_DEV_PREVIEW ? <Link to={PUBLIC_PATHS.intake(service.key)} className="mt-4 inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25">{IS_DEV_PREVIEW ? 'Preview request intake' : 'Start service request'}</Link> : <p className="mt-4 rounded-xl border border-border bg-white/60 px-4 py-3 text-sm font-semibold" role="status">Requests are temporarily paused for this service.</p>}{IS_DEV_PREVIEW && <p className="mt-2 text-xs font-semibold text-terracotta">Local QA preview only · creates no record</p>}</section>
    </div>
  );
}
