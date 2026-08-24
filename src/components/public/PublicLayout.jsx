import React from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { CalendarDays, Home, MessageSquare, Shapes, UserRound } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import BrandBackground from '@/components/oneforall/BrandBackground';
import Logo from '@/components/oneforall/Logo';

const publicNav = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/services', label: 'Services', icon: Shapes },
  { to: '/bookings', label: 'Bookings', icon: CalendarDays },
  { to: '/messages', label: 'Messages', icon: MessageSquare },
  { to: '/account', label: 'Account', icon: UserRound },
];

export default function PublicLayout() {
  const { isAuthenticated } = useAuth();
  return (
    <div className="min-h-screen overflow-x-clip">
      <BrandBackground />
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex min-w-0 items-center gap-2" aria-label="OneForAll home">
            <Logo size={34} />
            <span className="font-heading text-lg font-semibold tracking-tight">OneForAll</span>
          </Link>
          <Link to={isAuthenticated ? '/account' : '/login'} className="rounded-xl border border-border bg-white/80 px-3 py-2 text-sm font-semibold text-eucalyptus-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25">
            {isAuthenticated ? 'Your account' : 'Log in'}
          </Link>
          <nav aria-label="Primary" className="order-3 grid w-full grid-cols-5 gap-1 md:order-2 md:w-auto">
            {publicNav.map((item) => <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `flex min-w-0 flex-col items-center gap-1 rounded-xl px-0.5 py-2 text-[10px] font-semibold leading-tight focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 md:flex-row md:px-3 md:text-sm ${isActive ? 'bg-primary text-primary-foreground' : 'text-foreground/70 hover:bg-white/70'}`}><item.icon size={16} aria-hidden="true" /><span className="text-center">{item.label}</span></NavLink>)}
          </nav>
        </div>
      </header>
      <main className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-20 pt-8 sm:pt-10"><Outlet /></main>
      <footer className="relative z-10 border-t border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">Managed local service requests · Ballarat, Victoria · Availability confirmed before booking.</footer>
    </div>
  );
}
