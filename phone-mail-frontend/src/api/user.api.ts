import type { User } from '../types';
import { DEMO_MODE, DEMO_USER_KEY, api, demoDelay } from './axios';

/** GET /users/me */
export async function getMe(): Promise<User> {
  if (DEMO_MODE) {
    await demoDelay(150);
    const stored = localStorage.getItem(DEMO_USER_KEY);
    if (!stored) throw new Error('No demo session');
    return JSON.parse(stored) as User;
  }
  const { data } = await api.get('/users/me');
  return data.user ?? data;
}

/** PATCH /users/me  { name?, avatarUrl? } */
export async function updateProfile(patch: Partial<Pick<User, 'name' | 'avatarUrl' | 'bio'>>): Promise<User> {
  if (DEMO_MODE) {
    await demoDelay(200);
    const current = await getMe();
    const next = { ...current, ...patch };
    localStorage.setItem(DEMO_USER_KEY, JSON.stringify(next));
    return next;
  }
  const { data } = await api.patch('/users/me', patch);
  return data.user ?? data;
}
