import React from 'react';
import { ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

export default function ProviderTitleBar({ title, subtitle }) {
  const { user } = useAuth();
  const initial = String(user?.full_name || user?.email || 'P').charAt(0).toUpperCase();
  return <header className="provider-reference-titlebar">
    <div><h1>{title}</h1><p>{subtitle}</p></div>
    <Link to="/provider/account" className="provider-reference-account" aria-label="Open provider account"><span>{initial}</span><ChevronDown size={18} /></Link>
  </header>;
}
