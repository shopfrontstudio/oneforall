// @ts-nocheck
import React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import AppleIcon from "@/components/AppleIcon";
import GoogleIcon from "@/components/GoogleIcon";
import { APPLE_AUTH_ENABLED, GOOGLE_AUTH_ENABLED } from "@/lib/runtime";

const PROVIDERS = [
  { id: "google", label: "Continue with Google", enabled: GOOGLE_AUTH_ENABLED, icon: GoogleIcon },
  { id: "apple", label: "Continue with Apple", enabled: APPLE_AUTH_ENABLED, icon: AppleIcon },
].filter(({ enabled }) => enabled);

export default function SocialAuthButtons({ busyProvider = "", disabled = false, onSelect }) {
  if (!PROVIDERS.length) return null;

  return (
    <>
      <div className={`grid gap-3 ${PROVIDERS.length > 1 ? "sm:grid-cols-2" : ""}`}>
        {PROVIDERS.map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            type="button"
            variant="outline"
            className="h-12 w-full rounded-xl bg-white/60 text-sm font-medium"
            disabled={disabled || Boolean(busyProvider)}
            onClick={() => onSelect(id)}
          >
            {busyProvider === id ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Icon className="mr-2 h-5 w-5" />}
            {busyProvider === id ? "Connecting…" : label}
          </Button>
        ))}
      </div>
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
        <div className="relative flex justify-center text-xs uppercase"><span className="bg-transparent px-3 text-muted-foreground">or use your email</span></div>
      </div>
    </>
  );
}
