import React from 'react';
import { useAuth } from '@/lib/AuthContext';
import CustomerProfile from '@/pages/customer/Profile';
import ProviderProfile from '@/pages/tradie/Profile';

export default function Account() {
  const { user } = useAuth();
  return user?.account_type === 'tradie' ? <ProviderProfile /> : <CustomerProfile />;
}
