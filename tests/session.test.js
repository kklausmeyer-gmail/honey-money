import test from 'node:test';
import assert from 'node:assert/strict';
import { mfaExpiresAt } from '../src/session.js';
const session = claims => ({ access_token: 'header.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.signature' });
test('MFA expiry uses original verification rather than token refresh time', () => {
  const timestamp = 1700000000;
  const first = session({ amr: [{ method: 'password', timestamp }, { method: 'totp', timestamp: timestamp + 10 }], iat: timestamp + 100 });
  const refreshed = session({ amr: [{ method: 'totp', timestamp: timestamp + 10 }], iat: timestamp + 50000 });
  assert.equal(mfaExpiresAt(first), (timestamp + 10) * 1000 + 30 * 86400000);
  assert.equal(mfaExpiresAt(first), mfaExpiresAt(refreshed));
  assert.equal(mfaExpiresAt(session({amr: [{method: 'password', timestamp}]})), 0);
  assert.equal(mfaExpiresAt(null), 0);
});
