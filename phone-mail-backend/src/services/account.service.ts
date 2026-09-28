import type { User as PrismaUser } from '@prisma/client';

import { prisma } from '../config/prisma';
import { ensureUser, normalizePhone, users, type User } from '../store';

export class AccountAlreadyExistsError extends Error {}

const useMemoryStore = process.env.PHONEMAIL_STORAGE_MODE === 'memory';

function toAccount(user: PrismaUser): User {
  return {
    id: user.id,
    phoneNumber: user.phoneNumber,
    email: user.email,
    name: user.name ?? undefined,
    bio: user.bio ?? undefined,
    passwordHash: user.passwordHash ?? undefined,
    createdAt: user.createdAt.toISOString(),
    hasMobileApp: user.hasMobileApp,
  };
}

export async function findAccountByPhone(phoneNumber: string): Promise<User | undefined> {
  const phone = normalizePhone(phoneNumber);
  if (useMemoryStore) return users.find((user) => user.phoneNumber === phone);

  const user = await prisma.user.findUnique({ where: { phoneNumber: phone } });
  return user ? toAccount(user) : undefined;
}

export async function findAccountByEmail(email: string): Promise<User | undefined> {
  const normalizedEmail = email.trim().toLowerCase();
  if (useMemoryStore) {
    return users.find((user) => user.email.toLowerCase() === normalizedEmail);
  }

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  return user ? toAccount(user) : undefined;
}

export async function findAccountBySession(id: string, phoneNumber: string): Promise<User | undefined> {
  if (useMemoryStore) {
    return users.find((user) => user.id === id && user.phoneNumber === phoneNumber);
  }

  const user = await prisma.user.findFirst({ where: { id, phoneNumber } });
  return user ? toAccount(user) : undefined;
}

export async function createAccount(
  phoneNumber: string,
  passwordHash?: string,
  hasMobileApp = false,
): Promise<User> {
  const phone = normalizePhone(phoneNumber);
  if (useMemoryStore) {
    if (users.some((user) => user.phoneNumber === phone)) throw new AccountAlreadyExistsError();
    return ensureUser(phone, passwordHash, hasMobileApp);
  }

  try {
    const user = await prisma.user.create({
      data: {
        phoneNumber: phone,
        email: `${phone.replace(/\D/g, '')}@phonemail.com`,
        passwordHash,
        hasMobileApp,
      },
    });
    return toAccount(user);
  } catch (error) {
    if (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      throw new AccountAlreadyExistsError();
    }
    throw error;
  }
}

export async function updateAccount(
  user: User,
  changes: Pick<User, 'name' | 'bio'>,
): Promise<void> {
  if (useMemoryStore) {
    Object.assign(user, changes);
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: changes,
  });
  Object.assign(user, changes);
}
