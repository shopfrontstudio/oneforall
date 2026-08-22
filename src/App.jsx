import React, { lazy, Suspense } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { queryClientInstance } from '@/lib/query-client';
import { AuthProvider } from '@/lib/AuthContext';
import ScrollToTop from '@/components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import ProviderRoute from '@/components/ProviderRoute';
import PublicLayout from '@/components/public/PublicLayout';
import PublicHome from '@/pages/public/Home';
import Services from '@/pages/public/Services';
import CategoryServices from '@/pages/public/CategoryServices';
import ServiceDetail from '@/pages/public/ServiceDetail';
import ServiceGuideResults from '@/pages/public/ServiceGuideResults';
import Intake from '@/pages/public/Intake';
import Privacy from '@/pages/Privacy';

const PrivateLayout = lazy(() => import('@/components/oneforall/Layout'));
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const Onboarding = lazy(() => import('@/pages/Onboarding'));
const Bookings = lazy(() => import('@/pages/customer/MyJobs'));
const BookingDetail = lazy(() => import('@/pages/customer/BookingDetail'));
const Messages = lazy(() => import('@/pages/Messages'));
const Account = lazy(() => import('@/pages/Account'));
const ProviderToday = lazy(() => import('@/pages/provider/Today'));
const ProviderRequests = lazy(() => import('@/pages/provider/Requests'));
const ProviderRequestDetail = lazy(() => import('@/pages/provider/RequestDetail'));
const ProviderJobs = lazy(() => import('@/pages/provider/Jobs'));
const ProviderJobDetail = lazy(() => import('@/pages/provider/JobDetail'));
const ProviderCalendar = lazy(() => import('@/pages/provider/Calendar'));
const ProviderMore = lazy(() => import('@/pages/provider/More'));
const PageNotFound = lazy(() => import('@/lib/PageNotFound'));

const RouteFallback = () => <div className="mx-auto mt-16 h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" role="status" aria-label="Loading page" />;

function LoginRedirect() {
  const location = useLocation();
  return <Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`} replace />;
}

function AppRoutes() {
  return <Suspense fallback={<RouteFallback />}><Routes>
    <Route element={<PublicLayout />}>
      <Route path="/" element={<PublicHome />} />
      <Route path="/services" element={<Services />} />
      <Route path="/services/category/:categoryKey" element={<CategoryServices />} />
      <Route path="/services/:serviceKey" element={<ServiceDetail />} />
      <Route path="/service-guide/results" element={<ServiceGuideResults />} />
      <Route path="/request/:serviceKey" element={<Intake />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/post-job" element={<Navigate to="/services" replace />} />
    </Route>

    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/reset-password" element={<ResetPassword />} />

    <Route element={<ProtectedRoute unauthenticatedElement={<LoginRedirect />} />}>
      <Route path="/onboarding" element={<Onboarding />} />
      <Route element={<PrivateLayout />}>
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/booking/:id" element={<BookingDetail />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/account" element={<Account />} />
        <Route element={<ProviderRoute />}>
          <Route path="/provider/today" element={<ProviderToday />} />
          <Route path="/provider/requests" element={<ProviderRequests />} />
          <Route path="/provider/requests/:invitationId" element={<ProviderRequestDetail />} />
          <Route path="/provider/jobs" element={<ProviderJobs />} />
          <Route path="/provider/jobs/:bookingId" element={<ProviderJobDetail />} />
          <Route path="/provider/calendar" element={<ProviderCalendar />} />
          <Route path="/provider/more" element={<ProviderMore />} />
        </Route>
        <Route path="/my-jobs" element={<Navigate to="/bookings" replace />} />
        <Route path="/profile" element={<Navigate to="/account" replace />} />
        <Route path="/job/:id" element={<BookingDetail />} />
      </Route>
    </Route>
    <Route path="*" element={<PageNotFound />} />
  </Routes></Suspense>;
}

export default function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <ScrollToTop />
          <AppRoutes />
        </BrowserRouter>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}
