import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarCheck,
  ClipboardList,
  Headphones,
  MapPin,
  RefreshCcw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { CATEGORY_META, groupedServices } from '@/lib/catalogue';
import { PUBLIC_PATHS } from '@/lib/routes';
import { findServiceProblem, saveServiceGuideResult, SERVICE_GUIDE_MAX_LENGTH } from '@/lib/serviceGuide';
import { HOME_SERVICE_IMAGES } from '@/lib/serviceImages';
import { CategoryIcon } from '@/components/public/ServiceCard';

const steps = [
  { icon: ClipboardList, title: 'Structured request', body: 'The service pathway gathers the details needed to assess scope safely.' },
  { icon: ShieldCheck, title: 'Eligible matching', body: 'Only providers approved for that service, area, evidence and capacity can progress.' },
  { icon: CalendarCheck, title: 'Clear booking record', body: 'An accepted quote creates one authoritative booking and attending-worker record.' },
  { icon: RefreshCcw, title: 'Support and recovery', body: 'The managed pathway keeps cancellations, support and rebooking connected to the booking.' },
];

const guideExamples = [
  { category: 'cleaning', label: 'Clean my home', problem: 'I need help cleaning my home' },
  { category: 'plumbing', label: 'Fix a leaking tap', problem: 'My tap keeps leaking and needs to be fixed' },
  { category: 'beauty', label: 'Book beauty at home', problem: 'I need a mobile beauty service at home' },
  { category: 'moving-packing', label: 'Help with my move', problem: 'I need help packing and moving house' },
];

function ServiceCategoryVisual({ category }) {
  const media = HOME_SERVICE_IMAGES[category];
  if (!media) {
    return <span className="hero-category-stage"><CategoryIcon category={category} size={29} /></span>;
  }

  const imageUrl = (filename) => `${import.meta.env.BASE_URL}service-images/${filename}`;
  return (
    <span className="hero-category-stage hero-category-photo" aria-hidden="true">
      <img
        src={imageUrl(media.primary)}
        alt=""
        className="hero-category-photo-main"
        style={{ objectPosition: media.primaryPosition }}
        decoding="async"
      />
      {media.secondary && (
        <img
          src={imageUrl(media.secondary)}
          alt=""
          className="hero-category-photo-detail"
          style={{ objectPosition: media.secondaryPosition }}
          decoding="async"
        />
      )}
    </span>
  );
}

export default function PublicHome() {
  const serviceCount = groupedServices().reduce((total, category) => total + category.services.length, 0);
  const navigate = useNavigate();
  const problemInput = useRef(null);
  const [problem, setProblem] = useState('');
  const [guideError, setGuideError] = useState('');

  const submitGuide = (event) => {
    event.preventDefault();
    if (problem.trim().length < 3) {
      setGuideError('Briefly describe what you need help with.');
      problemInput.current?.focus();
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

  const chooseExample = (value) => {
    setProblem(value);
    setGuideError('');
    requestAnimationFrame(() => problemInput.current?.focus());
  };

  return (
    <div className="space-y-12 sm:space-y-16">
      <section className="marketplace-hero" aria-labelledby="home-hero-heading">
        <div className="marketplace-intro">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.17em] text-terracotta">Managed local services · Ballarat</p>
            <h1 id="home-hero-heading" className="mt-3 max-w-xl text-4xl font-semibold leading-[1.02] sm:text-5xl">Local services, handled with care.</h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">Choose a category or describe the problem in your own words. OneForAll helps you reach the right service without opening a crowded job board.</p>
          </div>

          <section className="service-picker" aria-labelledby="service-picker-heading">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Choose a service</p>
                <h2 id="service-picker-heading" className="mt-1 text-xl font-semibold">What can we help with?</h2>
              </div>
              <Link to={PUBLIC_PATHS.services} className="hidden shrink-0 text-sm font-semibold text-eucalyptus-deep hover:underline sm:inline">See all {serviceCount}</Link>
            </div>

            <div className="service-picker-grid">
              {CATEGORY_META.map((category) => {
                const guided = category.key === 'not-sure';
                return (
                  <Link
                    key={category.key}
                    to={PUBLIC_PATHS.category(category.key)}
                    className={`hero-category ${guided ? 'hero-category-guided' : ''}`}
                  >
                    <ServiceCategoryVisual category={category.key} />
                    <span className="hero-category-label">{category.name}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>

        <section className="marketplace-guide" aria-labelledby="service-guide-heading">
          <span className="marketplace-guide-orb" aria-hidden="true" />
          <div className="relative">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-terracotta">OneForAll service guide</p>
            <h2 id="service-guide-heading" className="mt-3 max-w-lg text-3xl font-semibold leading-tight sm:text-4xl">Tell us what needs sorting.</h2>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">We’ll narrow your description to the closest options in our service catalogue.</p>
          </div>

          <form id="service-guide" onSubmit={submitGuide} className="relative mt-6" noValidate>
            <label htmlFor="service-guide-problem" className="text-sm font-semibold">What do you need help with?</label>
            <div className="guide-search-field mt-2">
              <Search size={21} className="guide-search-icon" aria-hidden="true" />
              <textarea
                ref={problemInput}
                id="service-guide-problem"
                value={problem}
                onChange={(event) => { setProblem(event.target.value); setGuideError(''); }}
                rows={4}
                maxLength={SERVICE_GUIDE_MAX_LENGTH}
                aria-describedby={`service-guide-help${guideError ? ' service-guide-error' : ''}`}
                aria-invalid={Boolean(guideError)}
                placeholder="For example: My bathroom needs cleaning and the tap keeps dripping"
              />
            </div>
            <p id="service-guide-help" className="mt-2 text-xs text-muted-foreground">Private in this browser for 30 minutes · no external AI service</p>
            {guideError && <p id="service-guide-error" className="mt-2 text-sm font-semibold text-destructive" role="alert">{guideError}</p>}
            <button type="submit" className="guide-submit mt-4">Find the right service <ArrowRight size={18} aria-hidden="true" /></button>
          </form>

          <div className="relative mt-7">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Or start with an example</p>
            <div className="guide-shortcut-grid mt-3">
              {guideExamples.map((example) => (
                <button key={example.label} type="button" onClick={() => chooseExample(example.problem)} className="guide-shortcut">
                  <span className="guide-shortcut-icon"><CategoryIcon category={example.category} size={20} /></span>
                  <span>{example.label}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="hero-assurance" aria-label="OneForAll service principles">
          <span><ShieldCheck size={18} aria-hidden="true" />Private requests</span>
          <span><MapPin size={18} aria-hidden="true" />Ballarat, Victoria</span>
          <span><Headphones size={18} aria-hidden="true" />Managed support</span>
        </div>
      </section>

      <section aria-labelledby="managed-heading" className="rounded-3xl bg-eucalyptus-deep px-5 py-7 text-white sm:px-8">
        <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.14em] text-sandstone">How it is designed to work</p><h2 id="managed-heading" className="mt-2 text-2xl font-semibold">Managed from scope to recovery</h2></div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{steps.map((step) => <article key={step.title} className="rounded-2xl bg-white/10 p-4"><step.icon size={20} className="text-sandstone" /><h3 className="mt-3 font-semibold">{step.title}</h3><p className="mt-1 text-sm text-white/75">{step.body}</p></article>)}</div>
      </section>

      <section className="glass grid gap-5 rounded-3xl p-6 sm:grid-cols-[1fr_auto] sm:items-center"><div><Headphones className="text-terracotta" aria-hidden="true" /><h2 className="mt-3 text-xl font-semibold">Honest availability first</h2><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Every service can be requested. A request is not a confirmed booking: we confirm an eligible provider, price and time before work is scheduled.</p></div><Link to={PUBLIC_PATHS.services} className="inline-flex items-center justify-center rounded-xl bg-action px-5 py-3 text-sm font-semibold text-action-foreground shadow-sm transition-colors hover:bg-action-deep hover:text-white">Request a service</Link></section>
    </div>
  );
}
