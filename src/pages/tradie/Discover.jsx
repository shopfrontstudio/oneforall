import React, { useEffect, useState } from 'react';
import { ClipboardCheck, Lock } from 'lucide-react';
import { EmptyState } from '@/components/oneforall/Bits';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { formatAUDRange } from '@/lib/oneforall';

export default function ProviderRequests() {
  const { user } = useAuth();
  const [invitations, setInvitations] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    // Deliberately consume participant-scoped Invitation snapshots, never the
    // private Job entity or an authenticated open request feed.
    base44.entities.Invitation.filter({ tradie_id: user.id }).then((rows) => {
      if (active) setInvitations(rows.filter((row) => row.status === 'pending'));
    }).catch(() => active && setInvitations([])).finally(() => active && setLoaded(true));
    return () => { active = false; };
  }, [user.id]);

  return <div className="space-y-5"><header><h1 className="text-2xl font-semibold tracking-tight">Eligible requests</h1><p className="mt-1 text-sm text-muted-foreground">Only requests within an approved service offering, scope, coverage area, availability and evidence set can appear here.</p></header><div className="glass-soft flex items-start gap-3 rounded-2xl p-4" role="status"><Lock size={18} className="mt-0.5 shrink-0 text-terracotta" /><div><p className="text-sm font-semibold">Provider request routing is closed.</p><p className="mt-1 text-sm text-muted-foreground">All release flags remain off. There is no open request feed, paid placement or self-approved access.</p></div></div>{!loaded ? <div className="glass-soft h-28 animate-pulse rounded-2xl" role="status" aria-label="Loading routed invitations" /> : invitations.length ? <div className="space-y-3">{invitations.map((invitation) => <article key={invitation.id} className="glass-soft rounded-2xl p-4"><p className="text-sm font-semibold">{invitation.job_title || 'Managed service request'}</p><p className="mt-1 text-xs text-muted-foreground">{(invitation.selected_scope_labels || []).join(', ') || 'Scope pending review'} · {invitation.service_area || 'Service area withheld'}</p><p className="mt-2 text-xs text-muted-foreground">Preferred date: {invitation.preferred_date || 'Flexible'} · Indicative range: {formatAUDRange(invitation.indicative_low, invitation.indicative_high)}</p></article>)}</div> : <EmptyState icon={ClipboardCheck} title="No routed requests" body="A request will appear only after OneForAll has reviewed the exact provider offering and enabled the relevant service gates." />}</div>;
}
