import React from 'react';

// Retained only so old imports/bookmarks fail safely during local development.
// The route is intentionally not registered and no Subscription mutation exists.
export default function Membership() {
  return (
    <div className="glass rounded-3xl p-6 max-w-xl mx-auto">
      <h1 className="text-xl font-semibold">Founding provider access is fee-free</h1>
      <p className="text-sm text-muted-foreground mt-2">Membership plans are not part of Phase 1. Access depends on approved services, evidence, coverage, availability and account standing.</p>
    </div>
  );
}
