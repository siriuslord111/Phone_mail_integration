import { prisma } from '../config/prisma';
import { contactNicknames, normalizePhone } from '../store';
import { memoryStoreEnabled } from './account.service';

function nicknameKey(userId: string, phone: string) {
  return `${userId}:${phone}`;
}

export async function getContactNicknames(userId: string, phones: string[]) {
  const normalizedPhones = [...new Set(phones.map(normalizePhone).filter(Boolean))];
  if (normalizedPhones.length === 0) return new Map<string, string>();

  if (memoryStoreEnabled) {
    return new Map(normalizedPhones.flatMap((phone) => {
      const nickname = contactNicknames.get(nicknameKey(userId, phone));
      return nickname ? [[phone, nickname] as const] : [];
    }));
  }

  const entries = await prisma.contactNickname.findMany({
    where: { userId, phone: { in: normalizedPhones } },
    select: { phone: true, nickname: true },
  });
  return new Map(entries.map(({ phone, nickname }) => [phone, nickname]));
}

export async function saveContactNickname(userId: string, phoneInput: string, nicknameInput: string) {
  const phone = normalizePhone(phoneInput);
  const nickname = nicknameInput.trim();
  const key = nicknameKey(userId, phone);

  if (memoryStoreEnabled) {
    if (nickname) contactNicknames.set(key, nickname);
    else contactNicknames.delete(key);
    return nickname;
  }

  if (!nickname) {
    await prisma.contactNickname.deleteMany({ where: { userId, phone } });
    return '';
  }

  await prisma.contactNickname.upsert({
    where: { userId_phone: { userId, phone } },
    create: { userId, phone, nickname },
    update: { nickname },
  });
  return nickname;
}
