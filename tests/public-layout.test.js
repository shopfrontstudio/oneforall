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
  assert.match(styles, /\.public-site-header\s*\{[\s\S]*#050505 50%[\s\S]*#ffffff 78%/);
});
