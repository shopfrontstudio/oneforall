import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { BriefcaseBusiness, CalendarDays, Home, MessageSquare, Shapes, User } from 'lucide-react';
import Logo from './Logo';

const CUSTOMER_NAV = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/services', label: 'Services', icon: Shapes },
  { to: '/bookings', label: 'Bookings', icon: CalendarDays },
  { to: '/messages', label: 'Messages', icon: MessageSquare },
  { to: '/account', label: 'Account', icon: User },
];
const PROVIDER_NAV = [
  { to: '/provider/today', label: 'Today', icon: Home },
  { to: '/provider/jobs', label: 'Jobs', icon: BriefcaseBusiness },
  { to: '/provider/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/provider/account', label: 'Account', icon: User },
];

export default function TopBar() {
  const { user } = useAuth();
  const location = useLocation();
  const provider = user?.account_type === 'tradie';
  const nav = provider ? PROVIDER_NAV : CUSTOMER_NAV;
  return (
    <header className={`public-site-header sticky top-0 z-50 ${provider ? 'provider-site-header' : ''}`}>
      <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 py-3">
        <Link to={provider ? '/provider/today' : '/'} className="flex min-w-0 items-center gap-2" aria-label="OneForAll home">
          <Logo size={34} />
          <span className="font-heading text-lg font-semibold tracking-tight text-white">OneForAll</span>
          {provider && <span className="hidden rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/80 sm:inline-flex">Provider</span>}
        </Link>
        <nav className={`hidden items-center gap-1 md:flex ${provider ? 'provider-nav-glass' : ''}`} aria-label={provider ? 'Provider' : 'Customer'}>
          {nav.map((item) => {
            const active = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
            const className = provider
              ? `provider-nav-tab ${active ? 'provider-nav-tab-active' : ''}`
              : `flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground/70 hover:bg-white/70'}`;
            return <Link key={item.to} to={item.to} aria-current={active ? 'page' : undefined} className={className}><item.icon size={16} />{item.label}</Link>;
          })}
        </nav>
      </div>
    </header>
  );
}
