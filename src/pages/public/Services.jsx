import React from 'react';
import { groupedServices } from '@/lib/catalogue';
import ServiceCard from '@/components/public/ServiceCard';

export default function Services() {
  const groups = groupedServices();
  return (
    <div className="space-y-9">
      <header className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.16em] text-terracotta">Local service catalogue</p><h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Choose the pathway that fits the work.</h1><p className="mt-3 text-muted-foreground">Every category has a request pathway with explicit allowed, reviewed and blocked boundaries. Live public requests remain closed until release approval.</p></header>
      {groups.length === 0 ? <div className="glass rounded-2xl p-6" role="status">No services are configured.</div> : groups.map((group) => (
        <section key={group.key} id={group.key} className="scroll-mt-28" aria-labelledby={`${group.key}-heading`}>
          <h2 id={`${group.key}-heading`} className="text-2xl font-semibold">{group.name}</h2><p className="mt-1 text-sm text-muted-foreground">{group.summary}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{group.services.map((service) => <ServiceCard key={service.key} service={service} />)}</div>
        </section>
      ))}
    </div>
  );
}
