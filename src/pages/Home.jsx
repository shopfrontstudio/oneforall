import React from 'react';
import { useAuth } from '@/lib/AuthContext';
import CustomerHome from './customer/Home';
import Discover from './tradie/Discover';

export default function Home() {
  const { user } = useAuth();
  if (user?.account_type === 'tradie') return <Discover />;
  return <CustomerHome />;
}
