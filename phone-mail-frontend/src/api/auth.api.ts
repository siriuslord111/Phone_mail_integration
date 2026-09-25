import type { User } from '../types';
import { DEMO_MODE, DEMO_USER_KEY, api, demoDelay } from './axios';

export interface VerifyResult {
  token: string;
  user: User;
  /** true → show the "What's your name?" step */
  isNewUser: boolean;
}

/** POST /auth/send-otp  { phone } */
export async function requestOtp(phone: string): Promise<void> {
  if (DEMO_MODE) return demoDelay();
  await api.post('/auth/send-otp', { phone });
}

export async function loginWithPassword(phone: string, password: string): Promise<VerifyResult> {
  if (DEMO_MODE) {
    await demoDelay();
    if (password.length < 6) throw new Error('Password must be at least 6 characters.');
    const storedPassword = localStorage.getItem(`phonemail_password_${phone}`);
    if (storedPassword && storedPassword !== password) throw new Error('Incorrect password.');
    const stored = localStorage.getItem(DEMO_USER_KEY);
    const existing: User | null = stored ? JSON.parse(stored) : null;
    const user = existing && existing.phone === phone ? existing : { id: `demo-${phone}`, phone, name: '' };
    localStorage.setItem(`phonemail_password_${phone}`, password);
    localStorage.setItem(DEMO_USER_KEY, JSON.stringify(user));
    return { token: 'demo-token', user, isNewUser: !user.name };
  }
  const { data } = await api.post('/auth/login-password', { phone, password });
  return { token: data.token, user: data.user, isNewUser: data.isNewUser ?? !data.user?.name };
}

/** POST /auth/verify-otp  { phone, otp } → { token, user, isNewUser? } */
export async function verifyOtp(phone: string, otp: string): Promise<VerifyResult> {
  if (DEMO_MODE) {
    await demoDelay();
    if (!/^\d{6}$/.test(otp)) throw new Error('Enter the 6-digit code.');

    const stored = localStorage.getItem(DEMO_USER_KEY);
    const existing: User | null = stored ? JSON.parse(stored) : null;
    const user: User =
      existing && existing.phone === phone ? existing : { id: `demo-${phone}`, phone, name: '' };

    localStorage.setItem(DEMO_USER_KEY, JSON.stringify(user));
    return { token: 'demo-token', user, isNewUser: !user.name };
  }

  const { data } = await api.post('/auth/verify-otp', { phone, otp });
  return { token: data.token, user: data.user, isNewUser: data.isNewUser ?? !data.user?.name };
}
