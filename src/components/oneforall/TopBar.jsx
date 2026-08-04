import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { Bell, Home as HomeIcon, Briefcase, Plus, MessageSquare, User, Compass, Ticket, Crown, LogOut, Repeat } from 'lucide-react';
import Logo from './Logo';
import { setAccountType, ensureProfile } from '@/lib/oneforall';
import { useToast } from '@/components/ui/use-toast';

const CUSTOMER_NAV = [
  { to: '/', label: 'Home', icon: HomeIcon },
  { to: '/my-jobs', label: 'My Jobs', icon: Briefcase },
  { to: '/post-job', label: 'Post Job', icon: Plus, primary: true },
  { to: '/messages', label: 'Messages', icon: MessageSquare },
  { to: '/profile', label: 'Profile', icon: User },
];
const TRADIE_NAV = [
  { to: '/', label: 'Discover', icon: Compass },
  { to: '/invites', label: 'Invites', icon: Ticket },
  { to: '/messages', label: 'Messages', icon: MessageSquare },
  { to: '/membership', label: 'Membership', icon: Crown },
  { to: '/profile', label: 'Profile', icon: User },
];

export default function TopBar() {
  const { user, logout, checkUserAuth } = useAuth();
  const loc = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [unread, setUnread] = useState(0);
  const isTradie = user?.account_type === 'tradie';
  const nav = isTradie ? TRADIE_NAV : CUSTOMER_NAV;

  const refreshUnread = async () => {
    if (!user?.id) return;
    try { setUnread(await base44.entities.Notification.filter({ user_id: user.id, read: false })); } catch (e) {}
  };
  useEffect(() => { refreshUnread(); const t = setInterval(refreshUnread, 8000); return () => clearInterval(t); }, [user?.id, loc.pathname]);

  const switchAccount = async () => {
    const next = isTradie ? 'customer' : 'tradie';
    await setAccountType(next);
    await ensureProfile(next, user);
    await checkUserAuth();
    toast({ title: `Switched to ${next === 'tradie' ? 'tradie' : 'customer'} account` });
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-30">
      <div className="glass border-b border-white/30">
        <div className="mx-auto max-w-5xl px-4 h-16 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <Logo size={34} />
            <div className="leading-tight hidden sm:block">
              <div className="font-semibold text-foreground tracking-tight">OneForAll</div>
              <div className="text-[10px] text-muted-foreground -mt-0.5">Local jobs · verified tradies</div>
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {nav.map(n => {
              const active = n.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.to);
              return (
                <Link key={n.to} to={n.to} className={`px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 transition ${active ? 'bg-eucalyptus text-white shadow' : 'text-foreground/70 hover:bg-white/60'}`}>
                  <n.icon size={16} />{n.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-1.5">
            <button onClick={() => navigate('/messages')} className="relative w-10 h-10 rounded-xl glass-soft flex items-center justify-center btn-tactile hover:bg-white/80" aria-label="Notifications">
              <Bell size={18} className="text-eucalyptus-deep" />
              {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-terracotta text-white text-[10px] font-bold flex items-center justify-center">{unread}</span>}
            </button>
            <button onClick={switchAccount} className="hidden sm:flex w-10 h-10 rounded-xl glass-soft items-center justify-center btn-tactile hover:bg-white/80" title="Switch account type" aria-label="Switch account type">
              <Repeat size={16} className="text-eucalyptus-deep" />
            </button>
            <button onClick={() => logout()} className="w-10 h-10 rounded-xl glass-soft flex items-center justify-center btn-tactile hover:bg-white/80" aria-label="Log out">
              <LogOut size={16} className="text-eucalyptus-deep" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}