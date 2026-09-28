import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import type { Express } from 'express';
import type { User } from '../store';

let baseUrl: string;
let app: Express;
let users: User[];
let server: ReturnType<Express['listen']>;

before(async () => {
  process.env.PHONEMAIL_STORAGE_MODE = 'memory';
  const [{ default: application }, store] = await Promise.all([
    import('../app'),
    import('../store'),
  ]);
  app = application;
  users = store.users;
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server failed to bind a port.');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

test('password registration hashes credentials and issues an authenticated session', async () => {
  const phone = `9${Math.floor(100_000_000 + Math.random() * 900_000_000)}`;
  const password = 'correct horse battery staple';
  const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, password, client: 'web' }),
  });

  assert.equal(registerResponse.status, 201);
  const registration = await registerResponse.json() as { token: string; user: Record<string, unknown> };
  assert.ok(registration.token);
  assert.equal('password' in registration.user, false);
  assert.equal(users.find((user) => user.phoneNumber.endsWith(phone))?.passwordHash?.startsWith('$argon2id$'), true);

  const duplicateRegistrationResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: `+91${phone}`, password, client: 'web' }),
  });
  assert.equal(duplicateRegistrationResponse.status, 409);

  const wrongPasswordResponse = await fetch(`${baseUrl}/api/auth/login-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, password: 'not the password' }),
  });
  assert.equal(wrongPasswordResponse.status, 401);

  const loginResponse = await fetch(`${baseUrl}/api/auth/login-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  });
  assert.equal(loginResponse.status, 200);
  const login = await loginResponse.json() as { token: string };
  assert.ok(login.token);

  const profileResponse = await fetch(`${baseUrl}/api/users/me`, {
    headers: { authorization: `Bearer ${login.token}` },
  });
  assert.equal(profileResponse.status, 200);

  const patchResponse = await fetch(`${baseUrl}/api/users/me`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${login.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ name: 'Test User', bio: 'Profile description' }),
  });
  assert.equal(patchResponse.status, 200);

  const updatedProfileResponse = await fetch(`${baseUrl}/api/users/me`, {
    headers: { Authorization: `Bearer ${login.token}` },
  });
  const updatedProfile = await updatedProfileResponse.json() as { user: { name: string; bio: string } };
  assert.equal(updatedProfile.user.name, 'Test User');
  assert.equal(updatedProfile.user.bio, 'Profile description');

  const unauthenticatedResponse = await fetch(`${baseUrl}/api/users/me`);
  assert.equal(unauthenticatedResponse.status, 401);
});
