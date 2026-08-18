import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

export default function ProviderRoute() {
  const { user } = useAuth();
  const location = useLocation();
  if (user?.account_type !== 'tradie' && user?.role !== 'admin') return <Navigate to="/account" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

export function AdminRoute() {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <Navigate to="/account" replace />;
  return <Outlet />;
}
