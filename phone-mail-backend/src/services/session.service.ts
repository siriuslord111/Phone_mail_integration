import { createHmac, timingSafeEqual } from 'crypto';

import { env } from '../config/env';

const SESSION_LIFETIME_SECONDS = 60 * 60 * 24;

type SessionPayload = {
  sub: string;
  phone: string;
  exp: number;
};

function sign(content: string) {
  return createHmac('sha256', env.authTokenSecret).update(content).digest('base64url');
}

export function createSessionToken(userId: string, phone: string) {
  const payload: SessionPayload = {
    sub: userId,
    phone,
    exp: Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const content = `v1.${encodedPayload}`;
  return `${content}.${sign(content)}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const [version, encodedPayload, providedSignature, extra] = token.split('.');
  if (version !== 'v1' || !encodedPayload || !providedSignature || extra !== undefined) return null;

  const content = `${version}.${encodedPayload}`;
  const expectedSignature = Buffer.from(sign(content));
  const actualSignature = Buffer.from(providedSignature);
  if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Partial<SessionPayload>;
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.phone !== 'string' ||
      typeof payload.exp !== 'number' ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload as SessionPayload;
  } catch {
    return null;
  }
}
