import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import type { Express } from 'express';

let baseUrl: string;
let server: ReturnType<Express['listen']>;

before(async () => {
  process.env.PHONEMAIL_STORAGE_MODE = 'memory';
  const { default: app } = await import('./app');
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

test('security headers are present without breaking app pages, assets, or health checks', async () => {
  const paths = ['/health', '/', '/mobile', '/portal', '/styles.css', '/missing'];

  for (const path of paths) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff', path);
    assert.equal(response.headers.get('x-frame-options'), 'DENY', path);
    assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', path);
    assert.equal(response.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()', path);

    if (path === '/health') {
      assert.equal(response.status, 200);
      const health = await response.json() as { success: boolean; message: string; timestamp: string };
      assert.equal(health.success, true);
      assert.equal(health.message, 'PhoneMail backend is running.');
      assert.ok(Number.isFinite(Date.parse(health.timestamp)));
    } else if (path === '/missing') {
      assert.equal(response.status, 404);
      assert.equal(response.headers.get('content-security-policy'), "default-src 'none'");
    } else {
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'self'/, path);
      assert.match(response.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/, path);
      assert.ok((await response.text()).length > 0, path);
    }
  }
});
