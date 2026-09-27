import { hash, verify } from '@node-rs/argon2';

const ARGON2_OPTIONS = {
  algorithm: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string) {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(password: string, passwordHash: string | undefined) {
  if (!passwordHash) {
    await hash(password, ARGON2_OPTIONS);
    return false;
  }

  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
