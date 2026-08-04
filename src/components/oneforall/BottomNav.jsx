import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Home as HomeIcon, Briefcase, Plus, MessageSquare, User, Compass, Ticket, Crown } from 'lucide-react';

const CUSTOMER_NAV = [
  { to: '/', label: 'Home', icon: HomeIcon },
  { to: '/my-jobs', label: 'Jobs', icon: Briefcase },
  { to: '/post-job', label: 'Post', icon: Plus, primary: true },
  { to: '/messages', label: 'Chat', icon: MessageSquare },
  { to: '/profile', label: 'Me', icon: User },
];
const TRADIE_NAV = [
  { to: '/', label: 'Discover', icon: Compass },
  { to: '/invites', label: 'Invites', icon: Ticket },
  { to: '/messages', label: 'Chat', icon: MessageSquare },
  { to: '/membership', label: 'Plan', icon: Crown },
  { to: '/profile', label: 'Me', icon: User },
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
                <span className="w-12 h-12 rounded-2xl bg-eucalyptus text-white flex items-center justify-center btn-tactile shadow-lg">
                  <n.icon size={22} />
                </span>
                <span className="text-[10px] mt-0.5 font-medium text-eucalyptus-deep">{n.label}</span>
              </Link>
            );
          }
          return (
            <Link key={n.to} to={n.to} className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl ${active ? 'text-eucalyptus-deep' : 'text-muted-foreground'}`}>
              <n.icon size={20} />
              <span className="text-[10px] font-medium">{n.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}