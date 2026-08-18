import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, LockKeyhole, MapPin, MessageSquare, ShieldCheck } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { JOB_STATUS_LABEL, PHASE1_SERVICE_MAP } from '@/lib/oneforall';
import { chooseCanonicalBooking } from '@/domain/eligibility';

const formatDateTime = (value) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Not scheduled';
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

export default function BookingDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, error: '', job: null, booking: null });

  useEffect(() => {
    let current = true;
    Promise.all([
      base44.entities.Job.get(id),
      base44.entities.Booking.filter({ job_id: id }),
    ]).then(([job, bookings]) => {
      if (!current) return;
      const participant = job?.customer_id === user.id || bookings.some((booking) => booking.provider_id === user.id);
      setState({ loading: false, error: '', job: participant ? job : null, booking: participant ? chooseCanonicalBooking(bookings) : null });
    }).catch(() => current && setState({ loading: false, error: 'This booking could not be loaded.', job: null, booking: null }));
    return () => { current = false; };
  }, [id, user.id]);

  if (state.loading) return <div className="glass-soft h-56 rounded-2xl" role="status" aria-label="Loading booking details" />;
  if (!state.job) return <section className="glass mx-auto max-w-xl rounded-3xl p-6"><h1 className="text-xl font-semibold">Booking unavailable</h1><p className="mt-2 text-sm text-muted-foreground">{state.error || 'This private record is unavailable to this account.'}</p><Link to="/bookings" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-eucalyptus-deep"><ArrowLeft size={15} />Back to bookings</Link></section>;

  const { job, booking } = state;
  const service = PHASE1_SERVICE_MAP[job.service_key];
  return <div className="mx-auto max-w-2xl space-y-4">
    <Link to="/bookings" className="inline-flex items-center gap-1 text-sm font-semibold text-eucalyptus-deep"><ArrowLeft size={15} />Bookings</Link>
    <section className="glass rounded-3xl p-5">
      <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-eucalyptus/10 px-2.5 py-1 text-xs font-semibold text-eucalyptus-deep">{service?.category_name || job.category_name || 'Service request'}</span><span className="rounded-full bg-mist-soft px-2.5 py-1 text-xs font-semibold">{JOB_STATUS_LABEL[job.status] || job.status}</span></div>
      <h1 className="mt-3 text-xl font-semibold">{job.title || service?.title || 'Service request'}</h1>
      {job.description && <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/80">{job.description}</p>}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Info icon={MapPin} label="Service area" value={job.suburb ? `${job.suburb}, VIC` : 'Private until confirmed'} />
        <Info icon={CalendarClock} label="Confirmed schedule" value={booking?.scheduled_start ? formatDateTime(booking.scheduled_start) : 'Not scheduled'} />
        <Info icon={ShieldCheck} label="Safety review" value={job.hazard_screen_status === 'passed' ? 'Passed for recorded scope' : 'Pending or private review'} />
        <Info icon={LockKeyhole} label="Privacy" value="Booking participants and OneForAll support only" />
      </div>
    </section>
    <section className="glass-soft rounded-2xl p-4"><p className="text-sm text-muted-foreground">This is a read-only booking record. Authoritative changes use bounded server operations, and disabled service pathways cannot write or notify.</p>{booking && <p className="mt-2 text-sm font-semibold">Booking state: {booking.state.replaceAll('_', ' ')}</p>}</section>
    <Link to="/messages" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"><MessageSquare size={16} />Messages</Link>
  </div>;
}

function Info({ icon: Icon, label, value }) {
  return <div className="flex items-start gap-2"><Icon size={16} className="mt-0.5 shrink-0 text-eucalyptus-deep" /><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm font-medium">{value}</p></div></div>;
}
