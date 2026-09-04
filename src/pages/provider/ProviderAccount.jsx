import React, { useCallback, useEffect, useState } from 'react';
import { Bell, BriefcaseBusiness, CalendarClock, FileCheck2, LogOut, MapPin, Repeat, ShieldCheck, UsersRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { PHASE1_SERVICES, setAccountType } from '@/lib/oneforall';
import { evidenceRequirementLabel, mergeProviderControls, providerApplicationStatusLabel, providerStatusLabel } from '@/lib/provider';
import { FlagsOffNotice, ProviderError, ProviderLoading, ProviderPageHeader } from '@/components/provider/ProviderShellBits';
import { useToast } from '@/components/ui/use-toast';

const safeRead = async (read, fallback = []) => { try { return await read(); } catch { return fallback; } };

export default function ProviderAccount() {
  const { user, logout, checkUserAuth } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [state, setState] = useState({ loading: true, error: '', application: null, profile: null, offerings: [], workers: [], evidence: [], controls: mergeProviderControls() });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const [applications, profiles, offerings, workers, evidence, controls] = await Promise.all([
        safeRead(() => base44.entities.ProviderApplication.filter({ provider_id: user.id })),
        base44.entities.TradieProfile.filter({ user_id: user.id }),
        base44.entities.ProviderOffering.filter({ provider_id: user.id }),
        base44.entities.ProviderWorker.filter({ provider_id: user.id }),
        base44.entities.ProviderEvidence.filter({ provider_id: user.id }),
        safeRead(() => base44.entities.ProviderFeatureControl.list('-updated_date', 1)),
      ]);
      setState({ loading: false, error: '', application: applications[0] || null, profile: profiles[0] || null, offerings, workers, evidence, controls: mergeProviderControls(controls[0]) });
    } catch { setState((current) => ({ ...current, loading: false, error: 'Your provider account could not be loaded.' })); }
  }, [user.id]);
  useEffect(() => { load(); }, [load]);

  const switchToCustomer = async () => {
    try { await setAccountType('customer'); await checkUserAuth(); navigate('/'); }
    catch (error) { toast({ title: 'Account switch was not completed', description: error.message, variant: 'destructive' }); }
  };

  if (state.loading) return <ProviderLoading label="Loading provider account" />;
  if (state.error) return <ProviderError message={state.error} onRetry={load} />;
  const selectedOfferings = state.offerings.filter((row) => row.requested_selected !== false);
  const coverage = [...new Set(selectedOfferings.flatMap((row) => row.requested_coverage_suburbs || row.coverage_suburbs || []))];
  const availability = [...new Set(selectedOfferings.flatMap((row) => row.requested_availability_days || row.availability_days || []))];

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><ProviderPageHeader title="Account">Your business, availability, verification and team in one place.</ProviderPageHeader><Link to="/provider/apply" className="min-h-11 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">{state.application ? 'View application' : 'Application setup'}</Link></div>
    {!state.controls.provider_job_actions_enabled && <FlagsOffNotice />}
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <AccountCard Icon={BriefcaseBusiness} title="Business profile"><p className="font-semibold">{state.profile?.business_name || state.profile?.full_name || 'Provider profile'}</p><p className="mt-1 text-sm text-muted-foreground">{state.profile?.provider_type === 'team' ? 'Team' : 'Solo provider'} · {state.profile?.suburb || 'Ballarat'}</p></AccountCard>
      <AccountCard Icon={ShieldCheck} title="Application"><p className="font-semibold">{providerApplicationStatusLabel(state.application?.status)}</p><p className="mt-1 text-sm text-muted-foreground">{state.application ? `Step ${state.application.current_step || 1} of 4` : 'Application not started'}</p></AccountCard>
      <AccountCard Icon={Bell} title="Notifications"><p className="font-semibold">In-app notifications</p><p className="mt-1 text-sm text-muted-foreground">Email {state.controls.transactional_email_enabled && state.application?.notification_email_enabled !== false ? 'on' : 'not enabled yet'}</p></AccountCard>
    </section>
    <section className="grid gap-4 lg:grid-cols-2">
      <AccountSection id="services" Icon={BriefcaseBusiness} title="Services">{selectedOfferings.length ? <div className="space-y-2">{selectedOfferings.map((offering) => <div key={offering.id} className="flex items-center justify-between gap-3 rounded-xl bg-mist-soft px-3 py-2"><span className="text-sm font-semibold">{PHASE1_SERVICES.find((service) => service.key === offering.service_key)?.name || offering.service_key}</span><span className="text-xs text-muted-foreground">{providerStatusLabel(offering)}</span></div>)}</div> : <EmptyLine>No services selected yet.</EmptyLine>}</AccountSection>
      <AccountSection id="coverage" Icon={MapPin} title="Coverage"><p className="text-sm font-semibold">{coverage.join(', ') || 'No coverage area saved'}</p><p className="mt-2 text-xs text-muted-foreground">Only eligible private matches inside the approved area can appear.</p></AccountSection>
      <AccountSection id="availability" Icon={CalendarClock} title="Weekly availability"><p className="text-sm font-semibold capitalize">{availability.join(', ') || 'No regular availability saved'}</p><p className="mt-2 text-xs text-muted-foreground">Confirmed jobs appear in Calendar using Ballarat time.</p></AccountSection>
      <AccountSection id="team" Icon={UsersRound} title="Team">{state.workers.length ? <div className="space-y-2">{state.workers.map((worker) => <div key={worker.id} className="flex items-center justify-between gap-3 rounded-xl bg-mist-soft px-3 py-2"><span className="text-sm font-semibold">{worker.display_name}</span><span className="text-xs capitalize text-muted-foreground">{worker.relationship_type} · {providerStatusLabel(worker)}</span></div>)}</div> : <EmptyLine>The owner worker is created when an application starts.</EmptyLine>}</AccountSection>
    </section>
    <AccountSection id="verification" Icon={FileCheck2} title="Verification">{state.evidence.length ? <div className="grid gap-2 sm:grid-cols-2">{state.evidence.map((item) => <div key={item.id} className="rounded-xl bg-mist-soft px-3 py-3"><p className="text-sm font-semibold">{evidenceRequirementLabel(item.evidence_type)}</p><p className="mt-1 text-xs text-muted-foreground">{providerStatusLabel(item)}</p>{item.provider_action_reason && <p className="mt-1 text-xs text-terracotta">{item.provider_action_reason}</p>}</div>)}</div> : <EmptyLine>Your exact checklist appears after services are selected.</EmptyLine>}<p className="mt-3 text-xs text-muted-foreground">Documents and identifiers stay private. Customers only receive a bounded service-level trust statement after independent approval.</p></AccountSection>
    <section className="glass rounded-2xl p-5"><button onClick={switchToCustomer} className="glass-soft flex min-h-11 w-full items-center gap-2 rounded-xl p-3 text-sm font-semibold"><Repeat size={17} />Switch to Customer</button><button onClick={() => logout()} className="glass-soft mt-2 flex min-h-11 w-full items-center gap-2 rounded-xl p-3 text-sm font-semibold text-terracotta"><LogOut size={17} />Log out</button></section>
  </div>;
}

function AccountCard({ Icon, title, children }) {
  return <article className="glass-soft rounded-2xl p-4"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"><Icon size={16} />{title}</div><div className="mt-3">{children}</div></article>;
}
function AccountSection({ id, Icon, title, children }) {
  return <section id={id} className="glass rounded-2xl p-5"><h2 className="flex items-center gap-2 font-semibold"><Icon size={18} />{title}</h2><div className="mt-4">{children}</div></section>;
}
function EmptyLine({ children }) { return <p className="text-sm text-muted-foreground">{children}</p>; }
