import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
export default function AdaptiveHome() {
  const { user } = useAuth();
  const [recent, setRecent] = useState(null);
  useEffect(() => {
    let active = true; setRecent(null);
    if (user?.account_type === 'customer') base44.entities.Job.filter({ customer_id: user.id }, '-created_date', 1).then((rows) => { if (active) setRecent(rows[0] || null); }).catch(() => {});
    return () => { active = false; };
  }, [user?.id, user?.account_type]);
  if (!user || user.account_type !== 'customer') return null;
  return <section className="glass flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5"><div><h2 className="text-lg font-semibold">Welcome back, {(user.full_name || 'there').split(' ')[0]}</h2><p className="mt-1 text-sm text-muted-foreground">{recent ? `Continue with ${(recent.title || 'your service request').toLowerCase()}.` : 'Your home details and service plans are together here.'}</p></div><div className="flex flex-wrap gap-3">{recent && <Link to={`/booking/${recent.id}`} className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-white">{recent.status === 'completed' ? 'View & book again' : 'View my request'}</Link>}<Link to="/my-home" className="inline-flex min-h-11 items-center rounded-xl border border-primary px-4 text-sm font-semibold">My home</Link><Link to="/service-list" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-primary">My service list</Link></div></section>;
}
