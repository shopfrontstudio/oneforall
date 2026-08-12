import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { Bell, Home as HomeIcon, Briefcase, Plus, MessageSquare, User, Compass, Ticket, Crown, CheckCheck } from 'lucide-react';
import Logo from './Logo';

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
  { to: '/tradie-profile', label: 'Profile', icon: User },
];

export default function TopBar() {
  const { user } = useAuth();
  const loc = useLocation();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const isTradie = user?.account_type === 'tradie';
  const nav = isTradie ? TRADIE_NAV : CUSTOMER_NAV;

  const refreshUnread = async () => {
    if (!user?.id) return;
    try {
      const list = await base44.entities.Notification.filter({ user_id: user.id });
      const sorted = list.sort((a, b) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime());
      setNotifications(sorted.slice(0, 8));
      setUnread(sorted.filter(item => !item.read).length);
    } catch {
      setUnread(0);
    }
  };
  useEffect(() => { refreshUnread(); const t = setInterval(refreshUnread, 8000); return () => clearInterval(t); }, [user?.id, loc.pathname]);

  const openNotification = async (notification) => {
    if (!notification.read) await base44.entities.Notification.update(notification.id, { read: true });
    setShowNotifications(false);
    await refreshUnread();
    if (notification.link) navigate(notification.link);
  };

  const markAllRead = async () => {
    await Promise.all(notifications.filter(item => !item.read).map(item => base44.entities.Notification.update(item.id, { read: true })));
    await refreshUnread();
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
          <div className="relative flex items-center gap-1.5">
            <button onClick={() => setShowNotifications(value => !value)} className="relative w-10 h-10 rounded-xl glass-soft flex items-center justify-center btn-tactile hover:bg-white/80" aria-expanded={showNotifications} aria-label={unread ? `${unread} unread notifications` : 'Notifications'}>
              <Bell size={18} className="text-eucalyptus-deep" />
              {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-terracotta text-white text-[10px] font-bold flex items-center justify-center">{unread > 99 ? '99+' : unread}</span>}
            </button>
            <Link to={isTradie ? '/tradie-profile' : '/profile'} className="w-10 h-10 rounded-xl bg-eucalyptus text-white flex items-center justify-center btn-tactile" aria-label="Open profile"><User size={17} /></Link>
            {showNotifications && <div className="absolute right-0 top-12 w-[min(22rem,calc(100vw-2rem))] glass rounded-2xl shadow-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/50"><b className="text-sm">Notifications</b>{unread > 0 && <button onClick={markAllRead} className="text-xs text-eucalyptus-deep inline-flex items-center gap-1"><CheckCheck size={13} /> Mark all read</button>}</div>
              {notifications.length ? notifications.map(item => <button key={item.id} onClick={() => openNotification(item)} className={`w-full text-left px-4 py-3 border-b border-border/40 last:border-0 hover:bg-white/60 ${item.read ? '' : 'bg-sage/20'}`}><span className="block text-sm font-medium">{item.title}</span><span className="block text-xs text-muted-foreground mt-0.5">{item.body}</span></button>) : <p className="p-6 text-center text-sm text-muted-foreground">You’re all caught up.</p>}
            </div>}
          </div>
        </div>
      </div>
    </header>
  );
}
