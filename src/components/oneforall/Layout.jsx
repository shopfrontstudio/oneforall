import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import BrandBackground from './BrandBackground';
import TopBar from './TopBar';
import BottomNav from './BottomNav';

export default function Layout() {
  const { user } = useAuth();
  const loc = useLocation();
  if (!user?.account_type) return <Navigate to="/onboarding" replace state={{ from: loc.pathname }} />;
  const provider = user.account_type === 'tradie';
  return (
    <div className={`min-h-screen overflow-x-clip ${provider ? 'provider-workspace' : ''}`}>
      <BrandBackground />
      <TopBar />
      <main className={`mx-auto w-full px-4 pb-28 pt-6 md:pb-12 ${provider ? 'max-w-7xl lg:px-6 lg:pt-8' : 'max-w-5xl'}`}>
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
