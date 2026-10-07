import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import BrandBackground from './BrandBackground';
import TopBar from './TopBar';
import BottomNav from './BottomNav';
import ProviderSidebar from '@/components/provider/ProviderSidebar';

export default function Layout() {
  const { user } = useAuth();
  const loc = useLocation();
  if (!user?.account_type) return <Navigate to="/onboarding" replace state={{ from: loc.pathname }} />;
  const provider = user.account_type === 'tradie';
  const providerHome = loc.pathname.replace(/\/+$/, '') === '/provider/today';
  if (provider) return (
    <div className={`provider-workspace min-h-screen overflow-x-clip ${providerHome ? 'provider-workspace-home' : ''}`}>
      {providerHome ? <TopBar /> : <div className="md:hidden"><TopBar /></div>}
      {providerHome ? <main className="provider-home-canvas mx-auto w-full max-w-[1680px] px-4 pb-28 pt-6 md:px-10 md:pb-10 md:pt-7"><Outlet /></main> : <div className="provider-reference-shell"><ProviderSidebar /><main className="provider-reference-main"><Outlet /></main></div>}
      <BottomNav />
    </div>
  );
  return (
    <div className="min-h-screen overflow-x-clip">
      <BrandBackground />
      <TopBar />
      <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 md:pb-12">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
