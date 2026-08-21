// @ts-nocheck
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import SocialAuthButtons from "@/components/SocialAuthButtons";
import { safeReturnTo } from "@/lib/authReturnTo";
import { toAuthErrorMessage } from "@/lib/authErrors";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState("");
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [resent, setResent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await base44.auth.register({ email, password });
      setConfirmationSent(true);
    } catch (err) {
      setError(toAuthErrorMessage(err, "Registration failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setLoading(true);
    try {
      await base44.auth.resendOtp(email);
      setResent(true);
    } catch (err) {
      setError(toAuthErrorMessage(err, "Failed to resend the confirmation email"));
    } finally {
      setLoading(false);
    }
  };

  const handleSocial = async (provider) => {
    setError("");
    setSocialLoading(provider);
    try {
      await base44.auth.loginWithProvider(provider, safeReturnTo());
    } catch (err) {
      setError(toAuthErrorMessage(err, `Could not connect to ${provider === "apple" ? "Apple" : "Google"}`));
      setSocialLoading("");
    }
  };

  if (confirmationSent) {
    return (
      <AuthLayout
        icon={Mail}
        title="Check your email"
        subtitle={`We sent a confirmation link to ${email}`}
      >
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}
        <div className="rounded-xl border border-border bg-white/60 p-4 text-sm text-muted-foreground">Open the email and select <b className="text-foreground">Confirm your email</b>. You’ll return to OneForAll signed in, with your service-request draft still saved in this browser.</div>
        <Button asChild className="mt-5 h-12 w-full font-medium"><Link to={"/login" + (safeReturnTo() !== "/" ? "?returnTo=" + encodeURIComponent(safeReturnTo()) : "")}>Continue to log in</Link></Button>
        {resent && <p className="mt-4 text-center text-sm font-semibold text-eucalyptus-deep" role="status">A new confirmation email was sent.</p>}
        <p className="text-center text-sm text-muted-foreground mt-4">
          Didn't receive the email?{" "}
          <button
            type="button"
            onClick={handleResend}
            disabled={loading}
            className="-my-3.5 inline-flex items-center py-3.5 font-medium text-primary hover:underline"
          >
            {loading ? "Sending…" : "Resend"}
          </button>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={UserPlus}
      title="Create your account"
      subtitle="Join Ballarat locals finding trusted help and quality work."
      footer={
        <>
          Already have an account?{" "}
          <Link
            to={"/login" + (safeReturnTo() !== "/" ? "?returnTo=" + encodeURIComponent(safeReturnTo()) : "")}
            className="-my-3.5 inline-flex items-center py-3.5 font-medium text-primary hover:underline"
          >
            Log in
          </Link>
        </>
      }
    >
      <SocialAuthButtons busyProvider={socialLoading} disabled={loading} onSelect={handleSocial} />

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12 bg-white/60"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12 bg-white/60"
              required
              minLength={8}
            />
          </div>
          <p className="text-xs text-muted-foreground">Use at least 8 characters.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 h-12 bg-white/60"
              required
              minLength={8}
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 rounded-xl font-semibold shadow-lg shadow-primary/20" disabled={loading || Boolean(socialLoading)}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating account...
            </>
          ) : (
            "Create account"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
