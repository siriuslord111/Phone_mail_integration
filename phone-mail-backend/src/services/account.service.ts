import type { User as PrismaUser } from '@prisma/client';

import { prisma } from '../config/prisma';
import { aliases, ensureUser, normalizePhone, users, type Alias, type User } from '../store';

export class AccountAlreadyExistsError extends Error {}
export class AliasAlreadyExistsError extends Error {}
export class AliasNotFoundError extends Error {}

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
    smsNotificationsEnabled: user.smsNotificationsEnabled,
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
    const user = users.find((item) => item.email.toLowerCase() === normalizedEmail);
    if (user) return user;
    const alias = aliases.find((item) => item.address === normalizedEmail);
    return alias ? users.find((item) => item.id === alias.userId) : undefined;
  }

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (user) return toAccount(user);
  const alias = await prisma.alias.findUnique({ where: { address: normalizedEmail }, include: { user: true } });
  return alias ? toAccount(alias.user) : undefined;
}

function toAlias(alias: { id: string; address: string; userId: string; createdAt: Date }): Alias {
  return {
    id: alias.id,
    address: alias.address,
    userId: alias.userId,
    createdAt: alias.createdAt.toISOString(),
  };
}

export async function listAccountAliases(user: User): Promise<Alias[]> {
  if (memoryStoreEnabled) return aliases.filter((alias) => alias.userId === user.id);
  const accountAliases = await prisma.alias.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });
  return accountAliases.map(toAlias);
}

export async function createAccountAlias(user: User, address: string): Promise<Alias> {
  if (memoryStoreEnabled) {
    if (users.some((item) => item.email.toLowerCase() === address) || aliases.some((item) => item.address === address)) {
      throw new AliasAlreadyExistsError();
    }
    const alias = { id: `alias-${Date.now()}-${Math.random().toString(36).slice(2)}`, address, userId: user.id, createdAt: new Date().toISOString() };
    aliases.push(alias);
    return alias;
  }

  try {
    return toAlias(await prisma.alias.create({ data: { address, userId: user.id } }));
  } catch (error) {
    if (error !== null && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      throw new AliasAlreadyExistsError();
    }
    throw error;
  }
}

export async function deleteAccountAlias(user: User, aliasId: string): Promise<void> {
  if (memoryStoreEnabled) {
    const index = aliases.findIndex((alias) => alias.id === aliasId && alias.userId === user.id);
    if (index < 0) throw new AliasNotFoundError();
    aliases.splice(index, 1);
    return;
  }
  const alias = await prisma.alias.findFirst({ where: { id: aliasId, userId: user.id }, select: { id: true } });
  if (!alias) throw new AliasNotFoundError();
  await prisma.alias.delete({ where: { id: alias.id } });
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

export async function updateSmsNotificationsEnabled(user: User, enabled: boolean): Promise<void> {
  if (memoryStoreEnabled) {
    user.smsNotificationsEnabled = enabled;
    return;
  }

  await prisma.user.update({ where: { id: user.id }, data: { smsNotificationsEnabled: enabled } });
  user.smsNotificationsEnabled = enabled;
}
