import type { User } from '../types';
import { DEMO_MODE, DEMO_USER_KEY, api, demoDelay } from './axios';

export interface VerifyResult {
  token: string;
  user: User;
  /** true → show the "What's your name?" step */
  isNewUser: boolean;
}

function toInternationalPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `+91${digits}` : phone;
}

export async function loginWithPassword(phone: string, password: string): Promise<VerifyResult> {
  if (DEMO_MODE) {
    await demoDelay();
    if (password.length < 6) throw new Error('Password must be at least 6 characters.');
    const storedPassword = localStorage.getItem(`phonemail_password_${phone}`);
    if (!storedPassword) throw new Error('Account not found. Create an account first.');
    if (storedPassword !== password) throw new Error('Incorrect password.');
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
    if (password.length < 6) throw new Error('Password must be at least 6 characters.');
    if (localStorage.getItem(`phonemail_password_${phone}`)) {
      throw new Error('An account already exists for this phone number.');
    }
    const user: User = { id: `demo-${phone}`, phone, name: '' };
    localStorage.setItem(`phonemail_password_${phone}`, password);
    localStorage.setItem(DEMO_USER_KEY, JSON.stringify(user));
    return { token: 'demo-token', user, isNewUser: !user.name };
  }

  const { data } = await api.post('/auth/register', {
    phone: toInternationalPhone(phone),
    password,
    client: 'mobile',
  });
  return { token: data.token, user: data.user, isNewUser: data.isNewUser ?? !data.user?.name };
}
