import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hashPassword, verifyPassword } from './password.service';
import { createSessionToken, verifySessionToken } from './session.service';

test('passwords are hashed and only the original password verifies', async () => {
  const password = 'correct horse battery staple';
  const passwordHash = await hashPassword(password);

  assert.notEqual(passwordHash, password);
  assert.match(passwordHash, /^\$argon2id\$/);
  assert.equal(await verifyPassword(password, passwordHash), true);
  assert.equal(await verifyPassword('incorrect password', passwordHash), false);
});

test('unknown accounts fail password verification without revealing existence', async () => {
  assert.equal(await verifyPassword('some password', undefined), false);
});

test('signed sessions verify and reject tampering', () => {
  const issuedAt = Math.floor(Date.now() / 1000);
  const token = createSessionToken('user-1', '+919876543210');

  const session = verifySessionToken(token);
  assert.equal(session?.sub, 'user-1');
  assert.equal(session?.phone, '+919876543210');
  assert.ok(session && session.exp > issuedAt && session.exp <= issuedAt + 60 * 60 * 24);
  assert.equal(verifySessionToken(`${token}x`), null);
  assert.equal(verifySessionToken('phonemail-user-1'), null);
});
