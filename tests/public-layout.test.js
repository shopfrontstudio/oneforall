import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('public header keeps one account destination and uses the approved sticky gradient', async () => {
  const [layout, styles] = await Promise.all([
    read('../src/components/public/PublicLayout.jsx'),
    read('../src/index.css'),
  ]);

  assert.doesNotMatch(layout, /Your account/);
  assert.match(layout, /to: '\/account', label: 'Account'/);
  assert.match(layout, /public-site-header sticky top-0 z-50/);
  assert.match(styles, /\.public-site-header\s*\{[\s\S]*#050505 40%[\s\S]*#ffffff 68%/);
  assert.match(styles, /\.service-picker-grid\s*\{[\s\S]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(styles, /\.marketplace-guide\s*\{[\s\S]*align-self:start[\s\S]*justify-content:flex-start[\s\S]*background:hsl\(var\(--sage\)\)/);
});

test('home service picker uses one clear, prominent heading', async () => {
  const home = await read('../src/pages/public/Home.jsx');

  assert.match(home, /<h2 id="service-picker-heading" className="text-2xl font-bold leading-tight">Choose a service<\/h2>/);
  assert.doesNotMatch(home, /What can we help with\?/);
});

test('every focused category page returns customers to home', async () => {
  const categoryPage = await read('../src/pages/public/CategoryServices.jsx');

  assert.match(categoryPage, /<Link to=\{PUBLIC_PATHS\.home\}[^>]*><ArrowLeft size=\{15\} \/>Back to home<\/Link>/);
  assert.doesNotMatch(categoryPage, /<ArrowLeft size=\{15\} \/>All service categories/);
});
