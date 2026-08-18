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
  return (
    <div className="min-h-screen overflow-x-hidden">
      <BrandBackground />
      <TopBar />
      <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-5 md:pb-12">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
