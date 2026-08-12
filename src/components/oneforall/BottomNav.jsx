import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Home as HomeIcon, CalendarDays, Shapes, MessageSquare, User, Compass, Ticket } from 'lucide-react';

const CUSTOMER_NAV = [
  { to: '/', label: 'Home', icon: HomeIcon },
  { to: '/services', label: 'Services', icon: Shapes },
  { to: '/bookings', label: 'Bookings', icon: CalendarDays },
  { to: '/messages', label: 'Messages', icon: MessageSquare },
  { to: '/account', label: 'Account', icon: User },
];
const TRADIE_NAV = [
  { to: '/provider/discover', label: 'Discover', icon: Compass },
  { to: '/provider/invites', label: 'Invites', icon: Ticket },
  { to: '/messages', label: 'Chat', icon: MessageSquare },
  { to: '/provider/account', label: 'Account', icon: User },
];

export default function BottomNav() {
  const { user } = useAuth();
  const loc = useLocation();
  const nav = user?.account_type === 'tradie' ? TRADIE_NAV : CUSTOMER_NAV;
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 px-3 pb-3 pt-1">
      <div className="glass rounded-2xl flex items-center justify-around px-1 py-1.5 shadow-lg">
        {nav.map(n => {
          const active = n.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.to);
          if (n.primary) {
            return (
              <Link key={n.to} to={n.to} className="-mt-6 flex flex-col items-center" aria-label={n.label}>
                <span className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center btn-tactile shadow-lg">
                  <n.icon size={22} />
                </span>
                <span className="text-[11px] mt-0.5 font-semibold text-eucalyptus-deep">{n.label}</span>
              </Link>
            );
          }
          return (
            <Link key={n.to} to={n.to} className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl ${active ? 'text-eucalyptus-deep' : 'text-muted-foreground'}`}>
              <n.icon size={20} />
              <span className="text-[11px] font-semibold">{n.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
