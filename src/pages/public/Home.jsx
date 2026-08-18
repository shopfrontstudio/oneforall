import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarCheck, ClipboardList, Headphones, RefreshCcw, ShieldCheck } from 'lucide-react';
import { CATEGORY_META, groupedServices } from '@/lib/catalogue';
import { PUBLIC_PATHS } from '@/lib/routes';
import { CategoryIcon } from '@/components/public/ServiceCard';

const steps = [
  { icon: ClipboardList, title: 'Structured request', body: 'The service pathway gathers the details needed to assess scope safely.' },
  { icon: ShieldCheck, title: 'Eligible matching', body: 'Only providers approved for that service, area, evidence and capacity can progress.' },
  { icon: CalendarCheck, title: 'Clear booking record', body: 'An accepted quote creates one authoritative booking and attending-worker record.' },
  { icon: RefreshCcw, title: 'Support and recovery', body: 'The managed pathway keeps cancellations, support and rebooking connected to the booking.' },
];

export default function PublicHome() {
  const serviceCount = groupedServices().reduce((total, category) => total + category.services.length, 0);
  return (
    <div className="space-y-10">
      <section className="home-hero px-5 py-8 sm:px-8 sm:py-12">
        <span className="home-hero-glow" />
        <p className="relative text-xs font-bold uppercase tracking-[0.18em] text-terracotta">Managed local fulfilment · Founding phase</p>
        <h1 className="relative mt-3 max-w-3xl text-3xl font-semibold leading-tight sm:text-5xl">A clearer path from “I need help” to a supported local booking.</h1>
        <p className="relative mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">OneForAll guides the request, applies service-specific eligibility, records the booking and keeps support or rebooking connected. Public requests are not open yet.</p>
        <div className="relative mt-6 flex flex-wrap gap-3">
          <Link to="/services" className="home-cta mt-0">Explore {serviceCount} service pathways <ArrowRight size={17} /></Link>
          <span className="inline-flex items-center rounded-2xl border border-border bg-white/75 px-4 py-3 text-sm font-semibold" role="status">All release gates are currently off</span>
        </div>
      </section>

      <section aria-labelledby="categories-heading">
        <div className="mb-4 flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-terracotta">Service marketplace</p><h2 id="categories-heading" className="mt-1 text-2xl font-semibold">{CATEGORY_META.length} practical service categories</h2></div><Link to="/services" className="hidden text-sm font-semibold text-eucalyptus-deep sm:inline">See every service</Link></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {CATEGORY_META.map((category) => <Link key={category.key} to={`/services#${category.key}`} className="glass-soft min-w-0 rounded-2xl p-4 text-center focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"><span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-sage/55 text-eucalyptus-deep"><CategoryIcon category={category.key} /></span><span className="mt-2 block text-sm font-semibold">{category.name}</span></Link>)}
        </div>
      </section>

      <section aria-labelledby="managed-heading" className="rounded-3xl bg-eucalyptus-deep px-5 py-7 text-white sm:px-8">
        <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.14em] text-lime">How it is designed to work</p><h2 id="managed-heading" className="mt-2 text-2xl font-semibold">Managed from scope to recovery</h2></div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{steps.map((step) => <article key={step.title} className="rounded-2xl bg-white/10 p-4"><step.icon size={20} className="text-lime" /><h3 className="mt-3 font-semibold">{step.title}</h3><p className="mt-1 text-sm text-white/75">{step.body}</p></article>)}</div>
      </section>

      <section className="glass grid gap-5 rounded-3xl p-6 sm:grid-cols-[1fr_auto] sm:items-center"><div><Headphones className="text-terracotta" aria-hidden="true" /><h2 className="mt-3 text-xl font-semibold">Honest availability first</h2><p className="mt-2 max-w-2xl text-sm text-muted-foreground">You can explore the catalogue and, in local development, preview the intake. No service is represented as live while its release flags remain off.</p></div><Link to={PUBLIC_PATHS.services} className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">Review services</Link></section>
    </div>
  );
}
