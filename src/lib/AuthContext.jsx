// @ts-nocheck
import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabase';
import { assignAppPath } from '@/lib/appUrl';
import { hasPasswordRecoveryIntent, PASSWORD_RECOVERY_MARKER } from '@/lib/passwordRecovery';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    let recoveryMarker = '';
    try { recoveryMarker = window.sessionStorage.getItem(PASSWORD_RECOVERY_MARKER) || ''; } catch { /* URL/session checks still apply. */ }
    if (window.location.pathname.endsWith('/reset-password') && hasPasswordRecoveryIntent({
      search: window.location.search,
      hash: window.location.hash,
      marker: recoveryMarker,
    })) {
      setIsPasswordRecovery(true);
    }
    checkUserAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        try { window.sessionStorage.setItem(PASSWORD_RECOVERY_MARKER, 'active'); } catch { /* In-memory state remains authoritative. */ }
        setIsPasswordRecovery(true);
        checkUserAuth();
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        checkUserAuth();
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setIsAuthenticated(false);
        setAuthChecked(true);
        setIsLoadingAuth(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setUser(null);
        setIsAuthenticated(false);
        return;
      }
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setAuthError(null);
    } catch (error) {
      console.error('Auth check failed:', error);
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  const logout = async (shouldRedirect = true) => {
    await supabase.auth.signOut();
    setUser(null);
    setIsAuthenticated(false);
    if (shouldRedirect) {
      assignAppPath('/login');
    }
  };

  const navigateToLogin = () => {
    assignAppPath('/login');
  };

  const clearPasswordRecovery = () => {
    try { window.sessionStorage.removeItem(PASSWORD_RECOVERY_MARKER); } catch { /* In-memory state is still cleared. */ }
    setIsPasswordRecovery(false);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      // Supabase has no separate platform-level public-settings gate, so these
      // compatibility values resolve immediately.
      isLoadingPublicSettings: false,
      authError,
      appPublicSettings: null,
      authChecked,
      isPasswordRecovery,
      clearPasswordRecovery,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState: checkUserAuth,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
