import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { BadgeCheck, Crown, MapPin, ShieldCheck, Lock, Star } from 'lucide-react';
import { StarRating, EmptyState } from '@/components/oneforall/Bits';
import { pseudoDistance } from '@/lib/oneforall';
import { Image as UIImage } from '@/components/ui/image';

export default function TradieProfileView() {
  const { id } = useParams();
  const [t, setT] = useState(null);
  const [reviews, setReviews] = useState([]);
  useEffect(() => {
    base44.entities.TradieProfile.get(id).then(setT).catch(() => setT(false));
    base44.entities.Review.filter({ reviewee_id: id }).then(setReviews).catch(() => {});
  }, [id]);
  if (t === null) return <div className="glass-soft rounded-2xl h-40 animate-pulse" />;
  if (t === false) return <EmptyState title="Tradie not found" />;
  return (
    <div className="space-y-5">
      <div className="glass rounded-3xl p-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-eucalyptus text-white flex items-center justify-center font-semibold text-2xl">{(t.full_name || '?')[0]}</div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-1.5">{t.business_name || t.full_name}{t.verified && <BadgeCheck size={18} className="text-eucalyptus" />}{t.founding_badge && <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-lime/25 text-eucalyptus-deep font-semibold"><Crown size={11} />Founding</span>}</h1>
            <p className="text-sm text-muted-foreground">{(t.trade_categories || []).join(' · ')}</p>
            <div className="flex items-center gap-3 mt-1.5"><StarRating value={t.rating_avg} count={t.rating_count} /><span className="text-xs text-muted-foreground inline-flex items-center gap-1"><MapPin size={12} />{t.suburb} · {pseudoDistance('Ballarat', t.suburb).toFixed(0)} km</span></div>
          </div>
        </div>
        {t.bio && <p className="text-sm text-foreground/80 mt-4">{t.bio}</p>}
        <div className="glass-soft rounded-xl p-3 mt-4 flex items-center gap-2 text-xs text-muted-foreground"><Lock size={13} /> Contact details are shared only after you accept an interest request from this tradie.</div>
      </div>

      <div className="glass-soft rounded-2xl p-4">
        <h2 className="text-sm font-semibold flex items-center gap-1.5"><ShieldCheck size={15} className="text-eucalyptus-deep" /> Verification</h2>
        <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
          <V k="ABN" ok={!!t.abn} />
          <V k="Licence" ok={!!t.licence_number} />
          <V k="Insurance" ok={!!t.insurance_provider} />
          <V k="Public liability" ok={t.public_liability} />
          <V k="Experience" ok={t.experience_years > 0} val={`${t.experience_years} yrs`} />
          <V k="Open to work" ok={t.open_to_work} />
        </div>
      </div>

      {t.portfolio_photos?.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2">Portfolio</h2>
          <div className="grid grid-cols-3 gap-2">{t.portfolio_photos.map((u, i) => <div key={i} className="aspect-square rounded-xl overflow-hidden"><UIImage src={u} className="w-full h-full" fittingType="fill" /></div>)}</div>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold mb-2">Reviews</h2>
        {reviews.length === 0 ? <p className="text-sm text-muted-foreground">No reviews yet.</p> : (
          <div className="space-y-2">{reviews.map(r => <div key={r.id} className="glass-soft rounded-xl p-3"><div className="flex items-center justify-between"><StarRating value={r.rating} /><span className="text-xs text-muted-foreground">{r.reviewer_name}</span></div>{r.body && <p className="text-sm mt-1.5 text-foreground/80">{r.body}</p>}</div>)}</div>
        )}
      </div>
      <Link to="/post-job" className="block text-center text-sm text-eucalyptus-deep font-medium">Post a job for this tradie →</Link>
    </div>
  );
}
const V = ({ k, ok, val }) => <div className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${ok ? 'bg-eucalyptus' : 'bg-muted-foreground/30'}`} />{k}: <span className="font-medium">{val || (ok ? 'Yes' : '—')}</span></div>;