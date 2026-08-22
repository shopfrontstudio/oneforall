import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarCheck, ClipboardList, Headphones, RefreshCcw, Search, ShieldCheck } from 'lucide-react';
import { CATEGORY_META, groupedServices } from '@/lib/catalogue';
import { PUBLIC_PATHS } from '@/lib/routes';
import { findServiceProblem, saveServiceGuideResult, SERVICE_GUIDE_MAX_LENGTH } from '@/lib/serviceGuide';
import { CategoryIcon } from '@/components/public/ServiceCard';

const steps = [
  { icon: ClipboardList, title: 'Structured request', body: 'The service pathway gathers the details needed to assess scope safely.' },
  { icon: ShieldCheck, title: 'Eligible matching', body: 'Only providers approved for that service, area, evidence and capacity can progress.' },
  { icon: CalendarCheck, title: 'Clear booking record', body: 'An accepted quote creates one authoritative booking and attending-worker record.' },
  { icon: RefreshCcw, title: 'Support and recovery', body: 'The managed pathway keeps cancellations, support and rebooking connected to the booking.' },
];

export default function PublicHome() {
  const serviceCount = groupedServices().reduce((total, category) => total + category.services.length, 0);
  const navigate = useNavigate();
  const [problem, setProblem] = useState('');
  const [guideError, setGuideError] = useState('');

  const submitGuide = (event) => {
    event.preventDefault();
    if (problem.trim().length < 3) {
      setGuideError('Briefly describe what you need help with.');
      return;
    }
    const result = findServiceProblem(problem);
    if (!saveServiceGuideResult(result)) {
      setGuideError('This browser could not save your private guide result. Please browse the service categories instead.');
      return;
    }
    setGuideError('');
    navigate(PUBLIC_PATHS.serviceGuideResults);
  };

  return (
    <div className="space-y-8">
      <section className="home-hero px-5 py-6 sm:px-7 sm:py-7">
        <span className="home-hero-glow" />
        <p className="relative text-xs font-bold uppercase tracking-[0.18em] text-terracotta">Managed local fulfilment · Ballarat</p>
        <h1 className="relative mt-2 max-w-2xl text-3xl font-semibold leading-tight sm:text-4xl">A clearer path from “I need help” to a supported local booking.</h1>
        <p className="relative mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">Tell us what you need. OneForAll checks the scope, keeps the request private and confirms provider availability, pricing and timing before any booking.</p>
        <form id="service-guide" onSubmit={submitGuide} className="glass relative mt-4 max-w-2xl rounded-2xl p-4" noValidate>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-terracotta">OneForAll service guide</p>
          <label htmlFor="service-guide-problem" className="mt-1.5 block text-base font-semibold">Tell me what’s going on.</label>
          <p id="service-guide-help" className="mt-1 text-sm text-muted-foreground">Describe the problem in your own words. I’ll narrow it to the closest services in our approved catalogue.</p>
          <textarea
            id="service-guide-problem"
            value={problem}
            onChange={(event) => { setProblem(event.target.value); setGuideError(''); }}
            rows={2}
            maxLength={SERVICE_GUIDE_MAX_LENGTH}
            aria-describedby={`service-guide-help${guideError ? ' service-guide-error' : ''}`}
            aria-invalid={Boolean(guideError)}
            placeholder="For example: My bathroom needs cleaning and the tap keeps dripping"
            className="inp mt-2 min-h-20 resize-y"
          />
          <div className="mt-2.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">Private in this browser for 30 minutes · no external AI service</p>
            <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-action px-5 py-3 text-sm font-semibold text-action-foreground shadow-sm transition-colors hover:bg-action-deep hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"><Search size={17} aria-hidden="true" />Find the right service</button>
          </div>
          {guideError && <p id="service-guide-error" className="mt-3 text-sm font-semibold text-destructive" role="alert">{guideError}</p>}
        </form>
        <div className="relative mt-4 flex flex-wrap gap-3">
          <Link to="/services" className="home-cta mt-0">Explore {serviceCount} service pathways <ArrowRight size={17} /></Link>
          <span className="inline-flex items-center rounded-2xl border border-border bg-white/75 px-4 py-3 text-sm font-semibold" role="status">Now accepting service requests</span>
        </div>
      </section>

      <section aria-labelledby="categories-heading">
        <div className="mb-4 flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-terracotta">Service marketplace</p><h2 id="categories-heading" className="mt-1 text-2xl font-semibold">{CATEGORY_META.length} practical service categories</h2></div><Link to="/services" className="hidden text-sm font-semibold text-eucalyptus-deep sm:inline">See every service</Link></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CATEGORY_META.map((category) => {
            const guided = category.key === 'not-sure';
            return <Link key={category.key} to={PUBLIC_PATHS.category(category.key)} className={`category-glass min-w-0 rounded-[28px] px-3 py-4 text-center focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 ${guided ? 'col-span-2 w-full max-w-64 justify-self-center sm:col-span-4' : ''}`}><span className="category-glass-icon mx-auto flex h-24 w-24 items-center justify-center rounded-[30px] sm:h-28 sm:w-28 sm:rounded-[34px]"><CategoryIcon category={category.key} size={40} /></span><span className="mt-3 block text-base font-semibold">{category.name}</span></Link>;
          })}
        </div>
      </section>

      <section aria-labelledby="managed-heading" className="rounded-3xl bg-eucalyptus-deep px-5 py-7 text-white sm:px-8">
        <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.14em] text-lime">How it is designed to work</p><h2 id="managed-heading" className="mt-2 text-2xl font-semibold">Managed from scope to recovery</h2></div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{steps.map((step) => <article key={step.title} className="rounded-2xl bg-white/10 p-4"><step.icon size={20} className="text-lime" /><h3 className="mt-3 font-semibold">{step.title}</h3><p className="mt-1 text-sm text-white/75">{step.body}</p></article>)}</div>
      </section>

      <section className="glass grid gap-5 rounded-3xl p-6 sm:grid-cols-[1fr_auto] sm:items-center"><div><Headphones className="text-terracotta" aria-hidden="true" /><h2 className="mt-3 text-xl font-semibold">Honest availability first</h2><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Every service can be requested. A request is not a confirmed booking: we confirm an eligible provider, price and time before work is scheduled.</p></div><Link to={PUBLIC_PATHS.services} className="inline-flex items-center justify-center rounded-xl bg-action px-5 py-3 text-sm font-semibold text-action-foreground shadow-sm transition-colors hover:bg-action-deep hover:text-white">Request a service</Link></section>
    </div>
  );
}
