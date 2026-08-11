import React from 'react';
import CategoryTile from './CategoryTile';
import { CATEGORIES } from '@/lib/oneforall';

export default function CategoryGrid({ onSelect, activeSlug }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {CATEGORIES.map((c) => (
        <CategoryTile key={c.slug} category={c} active={activeSlug === c.slug} onClick={onSelect} />
      ))}
    </div>
  );
}