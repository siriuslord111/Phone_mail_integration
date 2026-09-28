import dotenv from 'dotenv';
import { randomBytes } from 'crypto';

dotenv.config();

const configuredAuthTokenSecret = process.env.AUTH_TOKEN_SECRET?.trim();
if (configuredAuthTokenSecret && Buffer.byteLength(configuredAuthTokenSecret) < 32) {
  throw new Error('AUTH_TOKEN_SECRET must contain at least 32 bytes.');
}
if (!configuredAuthTokenSecret) {
  console.warn('AUTH_TOKEN_SECRET is not configured; using an ephemeral secret. Sessions will be invalidated on restart.');
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  authTokenSecret: configuredAuthTokenSecret || randomBytes(32).toString('base64url'),
  twoFactorApiKey: process.env.TWO_FACTOR_API_KEY ?? '',
  twoFactorOtpTemplate: process.env.TWO_FACTOR_OTP_TEMPLATE ?? '',
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? '',
  twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER ?? '+15005550006',
  twilioTollFreeNumber: process.env.TWILIO_TOLL_FREE_NUMBER ?? '',
  twilioWebhookBaseUrl: process.env.TWILIO_WEBHOOK_BASE_URL?.replace(/\/+$/, '') ?? '',
  ivrDemoMode: process.env.IVR_DEMO_MODE === 'true',
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://postgres:password@db:5432/phonemail',
  smtpHost: process.env.SMTP_HOST ?? 'smtp.gmail.com',
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER ?? '',
  smtpPassword: process.env.SMTP_PASSWORD ?? '',
  smtpFrom: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? '',
  mailpitApiUrl: process.env.MAILPIT_API_URL ?? '',
  mailpitPollIntervalMs: Number(process.env.MAILPIT_POLL_INTERVAL_MS ?? 5000),
};
