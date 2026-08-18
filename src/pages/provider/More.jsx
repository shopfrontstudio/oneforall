import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileCheck2, LogOut, MessageSquare, Repeat, ShieldCheck, UsersRound, Wrench } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { setAccountType } from '@/lib/oneforall';
import { FlagsOffNotice, ProviderPageHeader } from '@/components/provider/ProviderShellBits';

const READINESS = [{ Icon: Wrench, title: 'Services', body: 'Private approved offerings only' }, { Icon: UsersRound, title: 'Workers', body: 'Exact attending worker required' }, { Icon: FileCheck2, title: 'Evidence', body: 'Raw evidence stays private' }, { Icon: ShieldCheck, title: 'Trust details', body: 'Only bounded approved assertions can be public' }];
export default function More() {
  const { logout, checkUserAuth } = useAuth(); const navigate = useNavigate();
  const switchToCustomer = async () => { await setAccountType('customer'); await checkUserAuth(); navigate('/'); };
  return <div className="space-y-5"><ProviderPageHeader title="More">Provider readiness and account controls.</ProviderPageHeader><FlagsOffNotice>Provider setup, evidence submission, approval and publication are closed. No draft or approval write is available here.</FlagsOffNotice><div className="grid gap-3 sm:grid-cols-2">{READINESS.map(({ Icon, title, body }) => <article key={title} className="glass-soft rounded-2xl p-4"><Icon size={18} /><b className="mt-2 block">{title}</b><p className="text-sm text-muted-foreground">{body}</p></article>)}</div><Link to="/messages" className="glass-soft flex min-h-11 items-center gap-2 rounded-2xl p-4 text-sm font-semibold"><MessageSquare size={18} />Messages</Link><button onClick={switchToCustomer} className="glass-soft flex min-h-11 w-full items-center gap-2 rounded-2xl p-4 text-sm font-semibold"><Repeat size={18} />Switch to customer</button><button onClick={() => logout()} className="glass-soft flex min-h-11 w-full items-center gap-2 rounded-2xl p-4 text-sm font-semibold text-terracotta"><LogOut size={18} />Log out</button></div>;
}
