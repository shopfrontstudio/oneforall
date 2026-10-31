import React from 'react';
import { Check, Circle } from 'lucide-react';
import { displayDate, journeySteps } from '@/lib/intelligentExperience';

export default function JobJourney({ job, booking }) {
  const journey = journeySteps(job, booking);
  return <section className="glass rounded-3xl p-5" aria-labelledby="job-journey-title">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="job-journey-title" className="text-lg font-semibold">Your job, step by step</h2><span className="text-sm capitalize text-eucalyptus-deep" role="status">{journey.status}</span></div>
    {journey.special ? <p className="mt-3 text-sm">This booking is {journey.status}. Use your booking messages to arrange the next step with support.</p> : <ol className="mt-5 grid gap-4 sm:grid-cols-5">{journey.steps.map((step, index) => <li key={step.key} aria-current={journey.current === index ? 'step' : undefined} className="flex gap-3 sm:block">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${index <= journey.current ? 'bg-primary text-white' : 'bg-primary/10 text-primary/50'}`}>{index < journey.current ? <Check size={16} aria-hidden="true" /> : <Circle size={journey.current === index ? 12 : 7} fill="currentColor" aria-hidden="true" />}</span>
      <div><p className={`mt-1 text-sm font-semibold ${index > journey.current ? 'text-muted-foreground' : ''}`}>{step.label}</p>{index === journey.current && <p className="mt-1 text-xs text-muted-foreground">{step.detail}</p>}</div>
    </li>)}</ol>}
    <p className="mt-4 text-xs text-muted-foreground">Recorded booking updates, not GPS tracking.{booking?.updated_date ? ` Last updated ${displayDate(booking.updated_date)}.` : ''}</p>
  </section>;
}
