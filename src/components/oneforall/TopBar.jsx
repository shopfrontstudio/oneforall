import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { BriefcaseBusiness, CalendarDays, ClipboardList, Home, Menu, MessageSquare, Shapes, User } from 'lucide-react';
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
  { to: '/provider/requests', label: 'Requests', icon: ClipboardList },
  { to: '/provider/jobs', label: 'Jobs', icon: BriefcaseBusiness },
  { to: '/provider/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/provider/more', label: 'More', icon: Menu },
];

export default function TopBar() {
  const { user } = useAuth();
  const location = useLocation();
  const provider = user?.account_type === 'tradie';
  const nav = provider ? PROVIDER_NAV : CUSTOMER_NAV;
  return (
    <header className="sticky top-0 z-50">
      <div className="glass border-b border-white/30">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
          <Link to={provider ? '/provider/today' : '/'} className="flex shrink-0 items-center gap-2">
            <Logo size={34} />
            <div className="hidden leading-tight sm:block"><div className="font-semibold">OneForAll</div><div className="text-[10px] text-muted-foreground">Managed local services</div></div>
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label={provider ? 'Provider' : 'Customer'}>
            {nav.map((item) => {
              const active = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
              return <Link key={item.to} to={item.to} aria-current={active ? 'page' : undefined} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium ${active ? 'bg-primary text-primary-foreground shadow' : 'text-foreground/70 hover:bg-white/60'}`}><item.icon size={16} />{item.label}</Link>;
            })}
          </nav>
          <Link to={provider ? '/provider/more' : '/account'} aria-label={provider ? 'Open provider More' : 'Open account'} className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><User size={17} /></Link>
        </div>
      </div>
    </header>
  );
}
