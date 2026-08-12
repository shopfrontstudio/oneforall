import React, { lazy, Suspense } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { queryClientInstance } from '@/lib/query-client';
import { AuthProvider } from '@/lib/AuthContext';
import ScrollToTop from '@/components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import PublicLayout from '@/components/public/PublicLayout';
import PublicHome from '@/pages/public/Home';
import Services from '@/pages/public/Services';
import ServiceDetail from '@/pages/public/ServiceDetail';
import Intake from '@/pages/public/Intake';

const PrivateLayout = lazy(() => import('@/components/oneforall/Layout'));
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const Onboarding = lazy(() => import('@/pages/Onboarding'));
const MyJobs = lazy(() => import('@/pages/customer/MyJobs'));
const Messages = lazy(() => import('@/pages/Messages'));
const Account = lazy(() => import('@/pages/Account'));
const Discover = lazy(() => import('@/pages/tradie/Discover'));
const Invites = lazy(() => import('@/pages/tradie/Invites'));
const TradieProfileView = lazy(() => import('@/pages/tradie/TradieProfileView'));
const JobDetail = lazy(() => import('@/pages/JobDetail'));
const PageNotFound = lazy(() => import('@/lib/PageNotFound'));

const RouteFallback = () => <div className="mx-auto mt-16 h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" role="status" aria-label="Loading page" />;

function LoginRedirect() {
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}`;
  return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
}

function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}><Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<PublicHome />} />
        <Route path="/services" element={<Services />} />
        <Route path="/services/:serviceKey" element={<ServiceDetail />} />
        <Route path="/request/:serviceKey" element={<Intake />} />
        <Route path="/post-job" element={<Navigate to="/services" replace />} />
      </Route>

      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route element={<ProtectedRoute unauthenticatedElement={<LoginRedirect />} />}>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route element={<PrivateLayout />}>
          <Route path="/bookings" element={<MyJobs />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/account" element={<Account />} />
          <Route path="/provider/discover" element={<Discover />} />
          <Route path="/provider/invites" element={<Invites />} />
          <Route path="/provider/account" element={<Account />} />
          <Route path="/provider/:id" element={<TradieProfileView />} />
          <Route path="/booking/:id" element={<JobDetail />} />
          <Route path="/job/:id" element={<Navigate to="/bookings" replace />} />
          <Route path="/my-jobs" element={<Navigate to="/bookings" replace />} />
          <Route path="/profile" element={<Navigate to="/account" replace />} />
          <Route path="/discover" element={<Navigate to="/provider/discover" replace />} />
          <Route path="/invites" element={<Navigate to="/provider/invites" replace />} />
          <Route path="/tradie-profile" element={<Navigate to="/provider/account" replace />} />
          <Route path="/tradie/:id" element={<TradieProfileView />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes></Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <BrowserRouter>
          <ScrollToTop />
          <AppRoutes />
        </BrowserRouter>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}
