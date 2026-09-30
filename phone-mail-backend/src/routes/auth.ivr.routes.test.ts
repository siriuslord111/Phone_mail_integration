import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, test } from 'node:test';

import type { Express } from 'express';

process.env.PHONEMAIL_STORAGE_MODE = 'memory';
process.env.AUTH_TOKEN_SECRET = 'phone-mail-ivr-tests-auth-secret-32-bytes';
process.env.TWILIO_AUTH_TOKEN = 'unit-test-twilio-token';
process.env.TWILIO_WEBHOOK_BASE_URL = 'https://public.example/api/auth';
process.env.TWILIO_TOLL_FREE_NUMBER = '+18005550100';
process.env.IVR_DEMO_MODE = 'true';

const TWILIO_TOKEN = 'unit-test-twilio-token';
const WEBHOOK_BASE_URL = 'https://public.example/api/auth';
let baseUrl: string;
let server: ReturnType<Express['listen']>;
let app: Express;
let env: typeof import('../config/env').env;
let users: typeof import('../store').users;

function signature(url: string, params: Record<string, string>) {
  const content = url + Object.keys(params).sort().map((key) => key + params[key]).join('');
  return createHmac('sha1', TWILIO_TOKEN).update(content).digest('base64');
}

function formBody(params: Record<string, string>) {
  return new URLSearchParams(params).toString();
}

before(async () => {
  process.env.PHONEMAIL_STORAGE_MODE = 'memory';
  process.env.AUTH_TOKEN_SECRET = 'phone-mail-ivr-tests-auth-secret-32-bytes';
  process.env.TWILIO_AUTH_TOKEN = TWILIO_TOKEN;
  process.env.TWILIO_WEBHOOK_BASE_URL = WEBHOOK_BASE_URL;
  process.env.TWILIO_TOLL_FREE_NUMBER = '+18005550100';
  process.env.TWO_FACTOR_API_KEY = '';
  process.env.TWO_FACTOR_OTP_TEMPLATE = '';
  const [{ default: application }, config, store] = await Promise.all([
    import('../app'),
    import('../config/env'),
    import('../store'),
  ]);
  app = application;
  env = config.env;
  users = store.users;
  env.twilioAuthToken = TWILIO_TOKEN;
  env.twilioWebhookBaseUrl = WEBHOOK_BASE_URL;
  env.twilioRegistrationNumber = '+18005550100';
  env.ivrDemoMode = true;
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

test('public auth options expose the call registration number and OTP availability', async () => {
  const response = await fetch(`${baseUrl}/api/auth/options`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    registrationNumber: '+18005550100',
    otpConfigured: false,
    ivrDemoEnabled: true,
  });
});

test('local IVR demo endpoints are disabled unless explicitly enabled', async () => {
  env.ivrDemoMode = false;
  const response = await fetch(`${baseUrl}/api/auth/ivr/demo/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '+14155550102' }),
  });
  env.ivrDemoMode = true;
  assert.equal(response.status, 404);
});

test('local IVR demo simulates spoken OTP and creates account after verification', async () => {
  const phone = '+14155550102';
  const startResponse = await fetch(`${baseUrl}/api/auth/ivr/demo/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  assert.equal(startResponse.status, 200);
  const started = await startResponse.json() as { demoOtp: string; message: string };
  assert.match(started.demoOtp, /^\d{6}$/);
  assert.match(started.message, /press 1/);

  const verifyResponse = await fetch(`${baseUrl}/api/auth/ivr/demo/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, otp: started.demoOtp }),
  });
  assert.equal(verifyResponse.status, 201);
  const result = await verifyResponse.json() as { token: string; user: { phoneNumber: string } };
  assert.ok(result.token);
  assert.equal(result.user.phoneNumber, phone);
  assert.equal(users.find((user) => user.phoneNumber === phone)?.passwordHash, undefined);

  const replay = await fetch(`${baseUrl}/api/auth/ivr/demo/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, otp: started.demoOtp }),
  });
  assert.equal(replay.status, 401);
});

test('incoming Twilio call requires a valid signature and returns a keypad menu', async () => {
  const url = `${WEBHOOK_BASE_URL}/ivr/incoming`;
  const params = {
    CallSid: 'CA-test-call',
    From: '+14155550100',
    To: '+18005550100',
    CallStatus: 'ringing',
  };
  const rejected = await fetch(`${baseUrl}/api/auth/ivr/incoming`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': 'invalid' },
    body: formBody(params),
  });
  assert.equal(rejected.status, 403);

  const accepted = await fetch(`${baseUrl}/api/auth/ivr/incoming`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': signature(url, params),
    },
    body: formBody(params),
  });
  assert.equal(accepted.status, 200);
  assert.match(await accepted.text(), /Press 1 to create an account/);
  assert.equal(users.some((user) => user.phoneNumber === '+14155550100'), false);
});

test('trial IVR accepts unsigned requests only with its configured webhook key', async () => {
  const originalTrialMode = env.twilioTrialMode;
  const originalTrialKey = env.twilioTrialWebhookKey;
  const trialKey = 'test-trial-webhook-key-with-32-bytes';
  env.twilioTrialMode = true;
  env.twilioTrialWebhookKey = trialKey;

  try {
    const params = {
      CallSid: 'CA-trial-call',
      From: '+14155550100',
      To: '+18005550100',
      CallStatus: 'ringing',
    };
    const accepted = await fetch(`${baseUrl}/api/auth/ivr/incoming?trialKey=${trialKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: formBody(params),
    });
    assert.equal(accepted.status, 200);
    assert.match(await accepted.text(), new RegExp(`/ivr/start-registration\\?trialKey=${trialKey}`));

    const invalidSigned = await fetch(`${baseUrl}/api/auth/ivr/incoming?trialKey=${trialKey}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-twilio-signature': 'invalid',
      },
      body: formBody(params),
    });
    assert.equal(invalidSigned.status, 403);

    const rejected = await fetch(`${baseUrl}/api/auth/ivr/incoming?trialKey=wrong-trial-webhook-key-123456789`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: formBody(params),
    });
    assert.equal(rejected.status, 403);
  } finally {
    env.twilioTrialMode = originalTrialMode;
    env.twilioTrialWebhookKey = originalTrialKey;
  }
});

test('voice registration cannot create an account without a valid OTP challenge', async () => {
  const phone = '+14155550100';
  const url = `${WEBHOOK_BASE_URL}/ivr/verify-registration`;
  const params = {
    CallSid: 'CA-test-call',
    From: phone,
    To: '+18005550100',
    Digits: '123456',
  };
  const response = await fetch(`${baseUrl}/api/auth/ivr/verify-registration`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': signature(url, params),
    },
    body: formBody(params),
  });

  assert.equal(response.status, 200);
  assert.match(await response.text(), /incorrect or expired/);
  assert.equal(users.some((user) => user.phoneNumber === phone), false);
});

test('voice registration creates a passwordless account only after matching its OTP', async () => {
  const phone = '+14155550101';
  const otp = '654321';
  const challengeKey = `ivr-register:${phone}`;
  const hash = createHmac('sha256', env.authTokenSecret)
    .update(`${phone}:${otp}`)
    .digest('hex');
  const store = await import('../store');
  store.otpStore.set(challengeKey, {
    hash,
    expiresAt: Date.now() + 5 * 60 * 1000,
    attempts: 0,
    purpose: 'ivr-register',
  });

  const url = `${WEBHOOK_BASE_URL}/ivr/verify-registration`;
  const params = {
    CallSid: 'CA-test-call',
    From: phone,
    To: '+18005550100',
    Digits: otp,
  };
  const response = await fetch(`${baseUrl}/api/auth/ivr/verify-registration`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': signature(url, params),
    },
    body: formBody(params),
  });

  assert.equal(response.status, 200);
  assert.match(await response.text(), /Your PhoneMail account has been created/);
  const created = users.find((user) => user.phoneNumber === phone);
  assert.ok(created);
  assert.equal(created.passwordHash, undefined);
  assert.equal(store.otpStore.has(challengeKey), false);
});
