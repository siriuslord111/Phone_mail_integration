export type User = {
  id: string;
  phoneNumber: string;
  email: string;
  password?: string;
  createdAt: string;
  hasMobileApp: boolean;
};

export type Message = {
  id: string;
  from: string;
  to: string[];
  subject: string;
  body: string;
  createdAt: string;
  read: boolean;
};

export const users: User[] = [];
export const messages: Message[] = [];
export const otpStore = new Map<string, string>();

export function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}

export function ensureUser(phoneNumber: string, password?: string, hasMobileApp = false): User {
  const normalized = normalizePhone(phoneNumber);
  const existing = users.find((user) => user.phoneNumber === normalized);
  if (existing) {
    if (password && existing.password !== password) {
      throw new Error('Invalid password.');
    }
    return existing;
  }

  const user: User = {
    id: `user-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    phoneNumber: normalized,
    email: `${normalized.replace(/\D/g, '')}@phonemail.com`,
    password,
    createdAt: new Date().toISOString(),
    hasMobileApp,
  };

  users.push(user);
  return user;
}

export function addMessage(input: Omit<Message, 'id' | 'createdAt' | 'read'>): Message {
  const next: Message = {
    ...input,
    id: `msg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    read: false,
  };

  messages.unshift(next);
  return next;
}
