import React from "react";
import BrandBackground from "@/components/oneforall/BrandBackground";
import Logo from "@/components/oneforall/Logo";
import { BadgeCheck, MapPin, ShieldCheck } from "lucide-react";

export default function AuthLayout({ icon: Icon, title, subtitle = '', footer = null, children = null }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-6 sm:py-10">
      <BrandBackground />
      <div className="relative w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/50 bg-white/45 shadow-[0_28px_90px_-32px_rgba(89,45,20,0.45)] backdrop-blur-xl lg:grid lg:grid-cols-[1.05fr_0.95fr]">
        <aside className="relative hidden min-h-[680px] overflow-hidden bg-eucalyptus p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-28 -top-24 h-72 w-72 rounded-full bg-lime/25 blur-3xl" />
          <div className="absolute -bottom-24 -left-20 h-64 w-64 rounded-full bg-terracotta/40 blur-3xl" />

          <div className="relative flex items-center gap-3">
            <Logo size={48} className="drop-shadow-lg" />
            <div>
              <p className="text-xl font-bold tracking-tight">OneForAll</p>
              <p className="text-xs text-white/70">Ballarat's local job marketplace</p>
            </div>
          </div>

          <div className="relative max-w-md">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-lime">
              <MapPin size={13} /> Built for Ballarat
            </p>
            <h2 className="text-4xl font-bold leading-[1.08] tracking-tight text-balance">
              Good local work, matched with good local people.
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-6 text-white/75">
              Post a job for free or discover nearby opportunities—without commissions getting in the way.
            </p>
          </div>

          <div className="relative grid gap-3 text-sm">
            <TrustPoint icon={BadgeCheck}>Verified local tradie profiles</TrustPoint>
            <TrustPoint icon={ShieldCheck}>Private contact details until you match</TrustPoint>
          </div>
        </aside>

        <section className="px-5 py-7 sm:px-10 sm:py-10 lg:px-12 lg:py-12">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Logo size={42} />
            <div>
              <p className="font-bold tracking-tight">OneForAll</p>
              <p className="text-[11px] text-muted-foreground">Local jobs · verified tradies</p>
            </div>
          </div>

          <div className="mb-7">
            <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
            {subtitle && <p className="mt-2 text-sm leading-6 text-muted-foreground">{subtitle}</p>}
          </div>

          {children}

          {footer && <p className="mt-6 text-center text-sm text-muted-foreground">{footer}</p>}
        </section>
      </div>
    </div>
  );
}

function TrustPoint({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-3 text-white/85">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10">
        <Icon size={17} className="text-lime" />
      </span>
      <span>{children}</span>
    </div>
  );
}
