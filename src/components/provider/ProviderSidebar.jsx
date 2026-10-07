import React from 'react';
import { Bell, BriefcaseBusiness, CalendarDays, Home, MessageSquare, UserRound } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import Logo from '@/components/oneforall/Logo';

const NAV = [
  { to: '/provider/today', label: 'Home', Icon: Home },
  { to: '/provider/calendar', label: 'Schedule', Icon: CalendarDays },
  { to: '/provider/jobs', label: 'Jobs', Icon: BriefcaseBusiness },
  { to: '/provider/messages', label: 'Messages', Icon: MessageSquare },
  { to: '/provider/notifications', label: 'Notifications', Icon: Bell },
];

export default function ProviderSidebar() {
  const { user } = useAuth();
  const location = useLocation();
  const initial = String(user?.full_name || user?.email || 'P').charAt(0).toUpperCase();

  return <aside className="provider-reference-sidebar hidden md:flex">
    <Link to="/provider/today" className="provider-reference-wordmark" aria-label="OneForAll provider home">
      <Logo size={38} />
      <span>OneForAll</span>
    </Link>
    <nav className="mt-10 space-y-2" aria-label="Provider workspace">
      {NAV.map(({ to, label, Icon }) => {
        const active = location.pathname.startsWith(to);
        return <Link key={to} to={to} aria-current={active ? 'page' : undefined} className={`provider-reference-nav ${active ? 'provider-reference-nav-active' : ''}`}><Icon size={22} /><span>{label}</span></Link>;
      })}
    </nav>
    <Link to="/provider/account" className="provider-reference-profile mt-auto">
      <span className="provider-reference-avatar">{initial}</span>
      <span className="min-w-0"><b className="block truncate">{user?.full_name || 'Provider account'}</b><span className="block text-xs text-muted-foreground">Account</span></span>
      <UserRound size={18} className="ml-auto shrink-0" />
    </Link>
  </aside>;
}
