import type { User } from '../types';
import { DEMO_MODE, DEMO_USER_KEY, api, demoDelay } from './axios';

export interface VerifyResult {
  token: string;
  user: User;
  /** true → show the "What's your name?" step */
  isNewUser: boolean;
}

export type AuthPurpose = 'login' | 'register';

export interface AuthOptions {
  tollFreeNumber: string;
  otpConfigured: boolean;
  ivrDemoEnabled: boolean;
}

export async function getAuthOptions(): Promise<AuthOptions> {
  if (DEMO_MODE) return { tollFreeNumber: '', otpConfigured: false, ivrDemoEnabled: false };
  const { data } = await api.get('/auth/options');
  return data;
}

export async function startDemoIvrRegistration(phone: string): Promise<{ demoOtp: string; message: string }> {
  const { data } = await api.post('/auth/ivr/demo/start', { phone: toInternationalPhone(phone) });
  return data;
}

export async function verifyDemoIvrRegistration(phone: string, otp: string): Promise<VerifyResult> {
  const { data } = await api.post('/auth/ivr/demo/verify', {
    phone: toInternationalPhone(phone),
    otp,
  });
  return { token: data.token, user: data.user, isNewUser: data.isNewUser ?? false };
}

const DEMO_PASSWORD_ITERATIONS = 310_000;

function toBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function deriveDemoPassword(password: string, salt: Uint8Array) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Secure local password storage is unavailable in this browser. Use the hosted backend.');
  }
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(salt).buffer, iterations: DEMO_PASSWORD_ITERATIONS },
    key,
    256,
  );
  return new Uint8Array(bits);
}

async function hashDemoPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveDemoPassword(password, salt);
  return JSON.stringify({ salt: toBase64(salt), hash: toBase64(hash), iterations: DEMO_PASSWORD_ITERATIONS });
}

async function verifyDemoPassword(password: string, stored: string) {
  try {
    const parsed = JSON.parse(stored) as { salt?: string; hash?: string; iterations?: number };
    if (parsed.iterations !== DEMO_PASSWORD_ITERATIONS || !parsed.salt || !parsed.hash) return false;
    const actual = await deriveDemoPassword(password, fromBase64(parsed.salt));
    const expected = fromBase64(parsed.hash);
    if (actual.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
    return difference === 0;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Secure local password storage')) throw error;
    return false;
  }
}

function toInternationalPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `+91${digits}` : phone;
}

export async function sendOtp(phone: string, purpose: AuthPurpose): Promise<void> {
  if (DEMO_MODE) {
    throw new Error('OTP sign-in requires a configured backend. Use password sign-in instead.');
  }
  await api.post('/auth/send-otp', { phone: toInternationalPhone(phone), purpose });
}

export async function verifyOtp(
  phone: string,
  otp: string,
  purpose: AuthPurpose,
): Promise<VerifyResult> {
  if (DEMO_MODE) {
    throw new Error('OTP sign-in requires a configured backend. Use password sign-in instead.');
  }
  const endpoint = purpose === 'register' ? '/auth/register-otp' : '/auth/verify-otp';
  const { data } = await api.post(endpoint, {
    phone: toInternationalPhone(phone),
    otp,
    client: 'mobile',
  });
  return { token: data.token, user: data.user, isNewUser: data.isNewUser ?? false };
}

export async function loginWithPassword(phone: string, password: string): Promise<VerifyResult> {
  if (DEMO_MODE) {
    await demoDelay();
    if (password.length < 8 || password.length > 128) throw new Error('Password must be between 8 and 128 characters.');
    const storedPassword = localStorage.getItem(`phonemail_password_${phone}`);
    if (!storedPassword) throw new Error('Account not found. Create an account first.');
    if (!await verifyDemoPassword(password, storedPassword)) throw new Error('Incorrect phone number or password.');
    const stored = localStorage.getItem(DEMO_USER_KEY);
    const user: User = stored ? JSON.parse(stored) : { id: `demo-${phone}`, phone, name: '' };
    localStorage.setItem(DEMO_USER_KEY, JSON.stringify(user));
    return { token: 'demo-token', user, isNewUser: !user.name };
  }
  const { data } = await api.post('/auth/login-password', { phone: toInternationalPhone(phone), password });
  return { token: data.token, user: data.user, isNewUser: data.isNewUser ?? !data.user?.name };
}

export async function registerWithPassword(phone: string, password: string): Promise<VerifyResult> {
  if (DEMO_MODE) {
    await demoDelay();
    if (password.length < 8 || password.length > 128) throw new Error('Password must be between 8 and 128 characters.');
    if (localStorage.getItem(`phonemail_password_${phone}`)) {
      throw new Error('An account already exists for this phone number.');
    }
    const user: User = { id: `demo-${phone}`, phone, name: '' };
    localStorage.setItem(`phonemail_password_${phone}`, await hashDemoPassword(password));
    localStorage.setItem(DEMO_USER_KEY, JSON.stringify(user));
    return { token: 'demo-token', user, isNewUser: !user.name };
  }

  const { data } = await api.post('/auth/register', {
    phone: toInternationalPhone(phone),
    password,
    client: 'web',
  });
  return { token: data.token, user: data.user, isNewUser: data.isNewUser ?? !data.user?.name };
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  if (newPassword.length < 8 || newPassword.length > 128) {
    throw new Error('Password must be between 8 and 128 characters.');
  }
  if (DEMO_MODE) {
    await demoDelay();
    const storedUser = localStorage.getItem(DEMO_USER_KEY);
    if (!storedUser) throw new Error('Sign in to continue.');
    const user = JSON.parse(storedUser) as User;
    const passwordKey = `phonemail_password_${user.phone}`;
    const storedPassword = localStorage.getItem(passwordKey);
    if (storedPassword && !await verifyDemoPassword(currentPassword, storedPassword)) {
      throw new Error('Current password is incorrect.');
    }
    localStorage.setItem(passwordKey, await hashDemoPassword(newPassword));
    return;
  }
  await api.post('/auth/change-password', { currentPassword, newPassword });
}
