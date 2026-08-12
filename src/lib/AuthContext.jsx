// @ts-nocheck
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { appParams } from '@/lib/app-params';
import { removeAccessToken } from '@base44/sdk/dist/utils/auth-utils';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(!appParams.token);

  const checkUserAuth = useCallback(async () => {
    try {
      setIsLoadingAuth(true);
      setAuthError(null);
      const { base44 } = await import('@/api/base44Client');
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(Boolean(currentUser?.id));
    } catch (error) {
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({
        type: error?.status === 403 && error?.data?.extra_data?.reason === 'user_not_registered' ? 'user_not_registered' : 'auth_required',
        message: error?.message || 'Authentication required',
      });
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    if (appParams.token) checkUserAuth();
  }, [checkUserAuth]);

  const logout = async (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    const isLocalPreview = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (isLocalPreview) {
      removeAccessToken({ storageKey: 'base44_access_token' });
      removeAccessToken({ storageKey: 'token' });
      if (shouldRedirect) window.location.assign('/login');
      return;
    }
    const { base44 } = await import('@/api/base44Client');
    if (shouldRedirect) base44.auth.logout(window.location.origin);
    else base44.auth.logout();
  };

  const navigateToLogin = () => {
    window.location.assign('/login');
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings: false,
      authError,
      appPublicSettings: null,
      authChecked,
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
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
