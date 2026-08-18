import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPasswordRecoveryIntent } from '../src/lib/passwordRecovery.js';

test('password recovery accepts Supabase recovery links and an established recovery event marker', () => {
  assert.equal(hasPasswordRecoveryIntent({ hash: '#access_token=abc&type=recovery' }), true);
  assert.equal(hasPasswordRecoveryIntent({ search: '?code=pkce-code' }), true);
  assert.equal(hasPasswordRecoveryIntent({ marker: 'active' }), true);
  assert.equal(hasPasswordRecoveryIntent({ search: '?token=legacy-token' }), false);
  assert.equal(hasPasswordRecoveryIntent(), false);
});
