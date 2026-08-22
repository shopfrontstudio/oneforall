import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { EmptyState } from '@/components/oneforall/Bits';
import ServiceCard, { CategoryIcon } from '@/components/public/ServiceCard';
import { getCategoryServices } from '@/lib/catalogue';
import { PUBLIC_PATHS } from '@/lib/routes';

export default function CategoryServices() {
  const { categoryKey } = useParams();
  const category = getCategoryServices(categoryKey);

  if (!category) {
    return <EmptyState title="Service category not found" body="Choose one of OneForAll’s listed service categories." action={<Link to={PUBLIC_PATHS.services} className="font-semibold text-eucalyptus-deep">Browse all categories</Link>} />;
  }

  return (
    <div className="space-y-6">
      <Link to={PUBLIC_PATHS.services} className="inline-flex items-center gap-1 text-sm font-semibold text-eucalyptus-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"><ArrowLeft size={15} />All service categories</Link>
      <header className="glass rounded-3xl p-5 sm:p-8">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sage/55 text-eucalyptus-deep"><CategoryIcon category={category.key} size={24} /></span>
        <p className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-terracotta">Focused service options</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">{category.name}</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">{category.summary}</p>
      </header>
      <section aria-labelledby="category-options-heading">
        <h2 id="category-options-heading" className="text-xl font-semibold">{category.key === 'not-sure' ? 'Get help choosing a service' : `Choose a ${category.name.toLowerCase()} option`}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Only services from this category are shown here.</p>
        {category.services.length === 0
          ? <div className="glass mt-4 rounded-2xl p-6" role="status">No service pathways are configured for this category.</div>
          : <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{category.services.map((service) => <ServiceCard key={service.key} service={service} />)}</div>}
      </section>
    </div>
  );
}
