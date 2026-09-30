import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { ipKeyGenerator } from 'express-rate-limit';
import { after, before, beforeEach, test } from 'node:test';

import type { Express } from 'express';
import { loginRateLimit } from '../middlewares/login-rate-limit';
import type { User } from '../store';

let baseUrl: string;
let app: Express;
let users: User[];
let messages: typeof import('../store').messages;
let otpStore: typeof import('../store').otpStore;
let authTokenSecret: string;
let testRateLimitKey: string;
let server: ReturnType<Express['listen']>;

function seedRegistrationOtp(phone: string, otp = '246810') {
  const digits = phone.replace(/\D/g, '');
  const normalizedPhone = digits.length === 10 ? `+91${digits}` : `+${digits}`;
  otpStore.set(`register:${normalizedPhone}`, {
    hash: createHmac('sha256', authTokenSecret).update(`${normalizedPhone}:${otp}`).digest('hex'),
    expiresAt: Date.now() + 5 * 60 * 1000,
    attempts: 0,
    purpose: 'register',
  });
  return { normalizedPhone, otp };
}

before(async () => {
  process.env.PHONEMAIL_STORAGE_MODE = 'memory';
  const [{ default: application }, store] = await Promise.all([
    import('../app'),
    import('../store'),
  ]);
  app = application;
  users = store.users;
  messages = store.messages;
  otpStore = store.otpStore;
  authTokenSecret = (await import('../config/env')).env.authTokenSecret;
  app.get('/__test/client-ip', (req, res) => res.json({ ip: req.ip }));
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server failed to bind a port.');
  baseUrl = `http://127.0.0.1:${address.port}`;
  const ipResponse = await fetch(`${baseUrl}/__test/client-ip`);
  const client = await ipResponse.json() as { ip: string };
  testRateLimitKey = ipKeyGenerator(client.ip);
});

beforeEach(() => loginRateLimit.resetKey(testRateLimitKey));

after(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

test('password registration requires a valid OTP before creating an account', async () => {
  const phone = `9${Math.floor(100_000_000 + Math.random() * 900_000_000)}`;
  const password = 'correct horse battery staple';
  const missingOtpResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, password, client: 'web' }),
  });
  assert.equal(missingOtpResponse.status, 401);
  assert.equal(users.some((user) => user.phoneNumber.endsWith(phone)), false);

  const { normalizedPhone, otp } = seedRegistrationOtp(phone);
  const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, password, otp, client: 'web' }),
  });

  const registrationBody = await registerResponse.clone().text();
  assert.equal(
    registerResponse.status,
    201,
    `${registerResponse.statusText} (${registerResponse.headers.get('content-type')}): ${registrationBody.slice(0, 200)}`,
  );
  const registrationResult = await registerResponse.json() as { token: string; user: Record<string, unknown> };
  assert.ok(registrationResult.token);
  assert.equal('password' in registrationResult.user, false);
  assert.equal(users.find((user) => user.phoneNumber.endsWith(phone))?.passwordHash?.startsWith('$argon2id$'), true);
  assert.equal(otpStore.has(`register:${normalizedPhone}`), false);

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

  const preferenceHeaders = {
    authorization: `Bearer ${login.token}`,
    'content-type': 'application/json',
  };
  const initialPreferencesResponse = await fetch(`${baseUrl}/api/user/preferences`, {
    headers: { authorization: `Bearer ${login.token}` },
  });
  const initialPreferences = await initialPreferencesResponse.json() as { user: { smsNotificationsEnabled: boolean } };
  assert.equal(initialPreferences.user.smsNotificationsEnabled, false);

  const invalidPreferencesResponse = await fetch(`${baseUrl}/api/user/preferences`, {
    method: 'PUT',
    headers: preferenceHeaders,
    body: JSON.stringify({ smsNotificationsEnabled: 'yes' }),
  });
  assert.equal(invalidPreferencesResponse.status, 400);

  const enabledPreferencesResponse = await fetch(`${baseUrl}/api/user/preferences`, {
    method: 'PUT',
    headers: preferenceHeaders,
    body: JSON.stringify({ smsNotificationsEnabled: true }),
  });
  assert.equal(enabledPreferencesResponse.status, 200);
  const enabledPreferences = await enabledPreferencesResponse.json() as { user: { smsNotificationsEnabled: boolean } };
  assert.equal(enabledPreferences.user.smsNotificationsEnabled, true);

  const persistedPreferencesResponse = await fetch(`${baseUrl}/api/user/preferences`, {
    headers: { authorization: `Bearer ${login.token}` },
  });
  const persistedPreferences = await persistedPreferencesResponse.json() as { user: { smsNotificationsEnabled: boolean } };
  assert.equal(persistedPreferences.user.smsNotificationsEnabled, true);

  const rejectedPasswordChange = await fetch(`${baseUrl}/api/auth/change-password`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${login.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ currentPassword: 'not the password', newPassword: 'new secure password' }),
  });
  assert.equal(rejectedPasswordChange.status, 400);
  assert.deepEqual(await rejectedPasswordChange.json(), {
    success: false,
    message: 'Current password is incorrect. Try again.',
  });
  const sessionAfterRejectedPasswordChange = await fetch(`${baseUrl}/api/users/me`, {
    headers: { authorization: `Bearer ${login.token}` },
  });
  assert.equal(sessionAfterRejectedPasswordChange.status, 200);

  const passwordChange = await fetch(`${baseUrl}/api/auth/change-password`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${login.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ currentPassword: password, newPassword: 'new secure password' }),
  });
  assert.equal(passwordChange.status, 200);

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
    body: JSON.stringify({
      name: 'Test User',
      bio: 'Profile description',
      avatarUrl: 'data:image/png;base64,aGVsbG8=',
    }),
  });
  assert.equal(patchResponse.status, 200);

  const updatedProfileResponse = await fetch(`${baseUrl}/api/users/me`, {
    headers: { Authorization: `Bearer ${login.token}` },
  });
  const updatedProfile = await updatedProfileResponse.json() as { user: { name: string; bio: string; avatarUrl: string } };
  assert.equal(updatedProfile.user.name, 'Test User');
  assert.equal(updatedProfile.user.bio, 'Profile description');
  assert.equal(updatedProfile.user.avatarUrl, 'data:image/png;base64,aGVsbG8=');

  const recipientPhone = `+91${Math.floor(600_000_000 + Math.random() * 300_000_000)}`;
  const recipientOtp = seedRegistrationOtp(recipientPhone).otp;
  const recipientResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: recipientPhone, password, otp: recipientOtp }),
  });
  assert.equal(recipientResponse.status, 201);
  const recipient = await recipientResponse.json() as { token: string; user: { phoneNumber: string } };
  messages.push({
    id: `profile-test-${Date.now()}`,
    from: registrationResult.user.phoneNumber as string,
    to: [recipient.user.phoneNumber],
    subject: 'Profile propagation test',
    body: 'Hello',
    createdAt: new Date().toISOString(),
    read: false,
  });

  const conversationsResponse = await fetch(`${baseUrl}/api/conversations`, {
    headers: { authorization: `Bearer ${recipient.token}` },
  });
  assert.equal(conversationsResponse.status, 200);
  const conversations = await conversationsResponse.json() as {
    conversations: Array<{ title: string; avatarUrl?: string; description?: string }>;
  };
  const contact = conversations.conversations.find((conversation) => conversation.title === 'Test User');
  assert.ok(contact);
  assert.equal(contact.avatarUrl, 'data:image/png;base64,aGVsbG8=');
  assert.equal(contact.description, 'Profile description');

  const privateNickname = 'My private contact name';
  const nicknameResponse = await fetch(`${baseUrl}/api/contacts/${encodeURIComponent(registrationResult.user.phoneNumber as string)}/nickname`, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${recipient.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ nickname: privateNickname }),
  });
  assert.equal(nicknameResponse.status, 200);

  const recipientConversationsResponse = await fetch(`${baseUrl}/api/conversations`, {
    headers: { authorization: `Bearer ${recipient.token}` },
  });
  const recipientConversations = await recipientConversationsResponse.json() as {
    conversations: Array<{ title: string; actualName: string; nickname: string }>;
  };
  const recipientContact = recipientConversations.conversations.find((item) => item.actualName === 'Test User');
  assert.ok(recipientContact);
  assert.equal(recipientContact.title, privateNickname);
  assert.equal(recipientContact.nickname, privateNickname);
  const ownerConversationsResponse = await fetch(`${baseUrl}/api/conversations`, {
    headers: { authorization: `Bearer ${registrationResult.token}` },
  });
  const ownerConversations = await ownerConversationsResponse.json() as {
    conversations: Array<{ title: string; nickname: string }>;
  };
  assert.equal(ownerConversations.conversations.some((item) => item.title === privateNickname), false);
  assert.equal(ownerConversations.conversations.some((item) => item.nickname === privateNickname), false);

  const unauthenticatedResponse = await fetch(`${baseUrl}/api/users/me`);
  assert.equal(unauthenticatedResponse.status, 401);
});

test('account registration requires a valid one-time OTP and consumes it once', async () => {
  const phone = `+91${Math.floor(600_000_000 + Math.random() * 300_000_000)}`;
  const otp = '123456';
  const key = `register:${phone}`;
  otpStore.set(key, {
    hash: createHmac('sha256', authTokenSecret).update(`${phone}:${otp}`).digest('hex'),
    expiresAt: Date.now() + 5 * 60 * 1000,
    attempts: 0,
    purpose: 'register',
  });

  const registration = await fetch(`${baseUrl}/api/auth/register-otp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, otp, client: 'web' }),
  });
  assert.equal(registration.status, 201);
  const registered = await registration.json() as { token: string; user: { phoneNumber: string } };
  assert.ok(registered.token);
  assert.equal(registered.user.phoneNumber, phone);

  const replay = await fetch(`${baseUrl}/api/auth/register-otp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, otp, client: 'web' }),
  });
  assert.equal(replay.status, 401);
});

test('shared content requires authentication and avoids reporting unstored files', async () => {
  const unauthorized = await fetch(`${baseUrl}/api/shared-content`);
  assert.equal(unauthorized.status, 401);

  const phone = `+91${Math.floor(600_000_000 + Math.random() * 300_000_000)}`;
  const otp = seedRegistrationOtp(phone).otp;
  const registrationResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, password: 'shared-content-test-password', otp }),
  });
  assert.equal(registrationResponse.status, 201);
  const registration = await registrationResponse.json() as { token: string };

  const response = await fetch(`${baseUrl}/api/shared-content`, {
    headers: { authorization: `Bearer ${registration.token}` },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { attachments: [] });
});

test('conversation actions toggle read status and move messages to recoverable trash', async () => {
  const phone = `+91${Math.floor(600_000_000 + Math.random() * 300_000_000)}`;
  const peerPhone = `+91${Math.floor(600_000_000 + Math.random() * 300_000_000)}`;
  const otp = seedRegistrationOtp(phone).otp;
  const registrationResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, password: 'conversation-action-test-password', otp }),
  });
  assert.equal(registrationResponse.status, 201);
  const registration = await registrationResponse.json() as { token: string; user: { phoneNumber: string } };
  const message = {
    id: `conversation-action-${Date.now()}`,
    from: peerPhone,
    to: [registration.user.phoneNumber],
    subject: '',
    body: 'Conversation action test',
    createdAt: new Date().toISOString(),
    read: false,
  };
  messages.push(message);

  try {
    const conversationsResponse = await fetch(`${baseUrl}/api/conversations`, {
      headers: { authorization: `Bearer ${registration.token}` },
    });
    const conversations = await conversationsResponse.json() as { conversations: Array<{ id: string }> };
    const conversation = conversations.conversations.find((item) => item.id !== undefined);
    assert.ok(conversation);

    const applyAction = async (action: string) => fetch(`${baseUrl}/api/conversations/${encodeURIComponent(conversation.id)}/actions`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${registration.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ action }),
    });

    assert.equal((await applyAction('markRead')).status, 200);
    assert.equal(message.read, true);
    assert.equal((await applyAction('markUnread')).status, 200);
    assert.equal(message.read, false);
    assert.equal((await applyAction('delete')).status, 200);
    assert.equal(message.mailbox, 'trash');

    const inboxResponse = await fetch(`${baseUrl}/api/conversations?folder=inbox`, {
      headers: { authorization: `Bearer ${registration.token}` },
    });
    const inbox = await inboxResponse.json() as { conversations: Array<{ id: string }> };
    assert.equal(inbox.conversations.some((item) => item.id === conversation.id), false);
    const trashResponse = await fetch(`${baseUrl}/api/conversations?folder=trash`, {
      headers: { authorization: `Bearer ${registration.token}` },
    });
    const trash = await trashResponse.json() as { conversations: Array<{ id: string }> };
    assert.equal(trash.conversations.some((item) => item.id === conversation.id), true);
  } finally {
    messages.splice(messages.indexOf(message), 1);
  }
});
