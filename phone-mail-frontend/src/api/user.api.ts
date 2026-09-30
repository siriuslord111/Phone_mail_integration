import type { User } from '../types';
import { DEMO_MODE, DEMO_USER_KEY, api, demoDelay } from './axios';

export interface AccountAlias {
  id: string;
  address: string;
  createdAt?: string;
}

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

/** PATCH /users/me { name?, avatarUrl?, bio? } */
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

export async function getSmsNotificationsEnabled(): Promise<boolean> {
  const preferenceKey = 'phonemail_setting_notifications';
  if (DEMO_MODE) {
    await demoDelay(150);
    return localStorage.getItem(preferenceKey) === 'true';
  }
  const { data } = await api.get('/user/preferences');
  return data.user?.smsNotificationsEnabled === true;
}

export async function setSmsNotificationsEnabled(enabled: boolean): Promise<boolean> {
  const preferenceKey = 'phonemail_setting_notifications';
  if (DEMO_MODE) {
    await demoDelay(150);
    localStorage.setItem(preferenceKey, String(enabled));
    return enabled;
  }
  const { data } = await api.put('/user/preferences', { smsNotificationsEnabled: enabled });
  return data.user?.smsNotificationsEnabled === true;
}

export async function getAliases(): Promise<{ primaryAddress: string; aliases: AccountAlias[] }> {
  if (DEMO_MODE) return { primaryAddress: '', aliases: [] };
  const { data } = await api.get('/user/aliases');
  return { primaryAddress: data.primaryAddress ?? '', aliases: data.aliases ?? [] };
}

export async function addAlias(address: string): Promise<AccountAlias> {
  if (DEMO_MODE) throw new Error('Aliases require a configured backend.');
  const { data } = await api.post('/user/aliases', { address });
  return data.alias;
}

export async function removeAlias(aliasId: string): Promise<void> {
  if (DEMO_MODE) throw new Error('Aliases require a configured backend.');
  await api.delete(`/user/aliases/${encodeURIComponent(aliasId)}`);
}
