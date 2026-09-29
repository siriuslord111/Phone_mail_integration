import type { User as PrismaUser } from '@prisma/client';

import { prisma } from '../config/prisma';
import { ensureUser, normalizePhone, users, type User } from '../store';

export class AccountAlreadyExistsError extends Error {}

export const memoryStoreEnabled = process.env.PHONEMAIL_STORAGE_MODE === 'memory';

function toAccount(user: PrismaUser): User {
  return {
    id: user.id,
    phoneNumber: user.phoneNumber,
    email: user.email,
    name: user.name ?? undefined,
    bio: user.bio ?? undefined,
    avatarUrl: user.profilePic ?? undefined,
    passwordHash: user.passwordHash ?? undefined,
    createdAt: user.createdAt.toISOString(),
    hasMobileApp: user.hasMobileApp,
  };
}

export async function findAccountByPhone(phoneNumber: string): Promise<User | undefined> {
  const phone = normalizePhone(phoneNumber);
  if (memoryStoreEnabled) return users.find((user) => user.phoneNumber === phone);

  const user = await prisma.user.findUnique({ where: { phoneNumber: phone } });
  return user ? toAccount(user) : undefined;
}

export async function findAccountByEmail(email: string): Promise<User | undefined> {
  const normalizedEmail = email.trim().toLowerCase();
  if (memoryStoreEnabled) {
    return users.find((user) => user.email.toLowerCase() === normalizedEmail);
  }

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  return user ? toAccount(user) : undefined;
}

export async function findAccountsByPhones(phoneNumbers: string[]): Promise<User[]> {
  const phones = [...new Set(phoneNumbers.map(normalizePhone).filter(Boolean))];
  if (phones.length === 0) return [];
  if (memoryStoreEnabled) return users.filter((user) => phones.includes(user.phoneNumber));

  const accounts = await prisma.user.findMany({ where: { phoneNumber: { in: phones } } });
  return accounts.map(toAccount);
}

export async function findAccountBySession(id: string, phoneNumber: string): Promise<User | undefined> {
  if (memoryStoreEnabled) {
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
  if (memoryStoreEnabled) {
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
  changes: Pick<User, 'name' | 'bio' | 'avatarUrl'>,
): Promise<void> {
  if (memoryStoreEnabled) {
    Object.assign(user, changes);
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { name: changes.name, bio: changes.bio, profilePic: changes.avatarUrl },
  });
  Object.assign(user, changes);
}

export async function updateAccountPassword(user: User, passwordHash: string): Promise<void> {
  if (memoryStoreEnabled) {
    user.passwordHash = passwordHash;
    return;
  }

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  user.passwordHash = passwordHash;
}
