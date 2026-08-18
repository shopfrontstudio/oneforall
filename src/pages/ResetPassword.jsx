// @ts-nocheck
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/api/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2, AlertTriangle } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { appPath } from "@/lib/appUrl";
import { toAuthErrorMessage } from "@/lib/authErrors";
import { useAuth } from "@/lib/AuthContext";
import { hasPasswordRecoveryIntent, PASSWORD_RECOVERY_MARKER } from "@/lib/passwordRecovery";

export default function ResetPassword() {
  const { isPasswordRecovery, clearPasswordRecovery } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [recoveryState, setRecoveryState] = useState("checking");

  useEffect(() => {
    let active = true;
    const verifyRecoverySession = async () => {
      try {
        let marker = '';
        try { marker = window.sessionStorage.getItem(PASSWORD_RECOVERY_MARKER) || ''; } catch { /* Supabase URL signal still applies. */ }
        const hasIntent = isPasswordRecovery || hasPasswordRecoveryIntent({
          search: window.location.search,
          hash: window.location.hash,
          marker,
        });
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (active) setRecoveryState(hasIntent && session ? "valid" : "invalid");
      } catch {
        if (active) setRecoveryState("invalid");
      }
    };
    verifyRecoverySession();
    return () => { active = false; };
  }, [isPasswordRecovery]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await base44.auth.resetPassword({ newPassword });
      clearPasswordRecovery();
      await base44.auth.logout();
      window.location.href = appPath("/login");
    } catch (err) {
      setError(toAuthErrorMessage(err, "Failed to reset password"));
    } finally {
      setLoading(false);
    }
  };

  if (recoveryState === "checking") {
    return <AuthLayout icon={Lock} title="Checking reset link" subtitle="Confirming your secure recovery session"><div className="flex items-center justify-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" />Checking…</div></AuthLayout>;
  }

  if (recoveryState !== "valid") {
    return (
      <AuthLayout
        icon={AlertTriangle}
        title="Invalid reset link"
        subtitle="This password reset link is missing or invalid"
        footer={
          <Link
            to="/forgot-password"
            className="-my-3.5 inline-flex items-center py-3.5 font-medium text-primary hover:underline"
          >
            Request a new link
          </Link>
        }
      >
        <p className="text-sm text-foreground text-center">
          The link you used appears to be incomplete. Please request a new password reset email.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={Lock}
      title="New password"
      subtitle="Enter your new password below"
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="pl-10 h-12"
              required
              minLength={8}
            />
          </div>
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
              className="pl-10 h-12"
              required
              minLength={8}
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Resetting...
            </>
          ) : (
            "Reset password"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
