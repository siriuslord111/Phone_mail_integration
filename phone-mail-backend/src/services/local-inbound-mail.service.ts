import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { findAccountByPhone } from './account.service';
import { normalizePhone } from '../store';

type MailpitAddress = {
  Address?: string;
};

type MailpitMessageSummary = {
  ID: string;
};

type MailpitMessageList = {
  total: number;
  messages: MailpitMessageSummary[];
};

type MailpitMessage = {
  ID: string;
  From?: MailpitAddress;
  To?: MailpitAddress[] | null;
  Cc?: MailpitAddress[] | null;
  Subject?: string;
  Date?: string;
  Text?: string;
  HTML?: string;
};

const PAGE_SIZE = 100;

async function mailpitGet<T>(path: string): Promise<T> {
  const response = await fetch(`${env.mailpitApiUrl}${path}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Mailpit returned HTTP ${response.status} for ${path}.`);
  }
  return response.json() as Promise<T>;
}

function plainTextBody(message: MailpitMessage) {
  if (message.Text?.trim()) return message.Text.trim();
  if (message.HTML?.trim()) return message.HTML.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return '';
}

function phoneFromRecipient(address: string) {
  const match = /^(\d{10,15})@phonemail\.com$/i.exec(address.trim());
  if (!match) return null;
  return normalizePhone(match[1]);
}

async function importMessage(summary: MailpitMessageSummary) {
  const detail = await mailpitGet<MailpitMessage>(`/api/v1/message/${encodeURIComponent(summary.ID)}`);
  const fromAddress = detail.From?.Address?.trim().toLowerCase();
  if (!fromAddress || !detail.ID) return;

  const recipients = [...(detail.To ?? []), ...(detail.Cc ?? [])]
    .map((address) => address.Address?.trim().toLowerCase())
    .filter((address): address is string => Boolean(address));
  const body = plainTextBody(detail);
  const receivedAt = new Date(detail.Date ?? Date.now());
  if (Number.isNaN(receivedAt.getTime())) {
    throw new Error(`Mailpit message ${detail.ID} has an invalid received date.`);
  }

  for (const recipient of new Set(recipients)) {
    const phone = phoneFromRecipient(recipient);
    if (!phone) continue;
    const user = await findAccountByPhone(phone);
    if (!user) continue;

    await prisma.inboundEmail.upsert({
      where: {
        providerMessageId_userId: {
          providerMessageId: detail.ID,
          userId: user.id,
        },
      },
      create: {
        providerMessageId: detail.ID,
        userId: user.id,
        fromAddress,
        toAddress: user.email,
        subject: detail.Subject?.trim() || '(no subject)',
        body,
        receivedAt,
        mailbox: 'inbox',
        isRead: false,
      },
      update: {},
    });
  }
}

export async function syncLocalInboundMail() {
  if (!env.mailpitApiUrl) return 0;

  let imported = 0;
  for (let start = 0; ; start += PAGE_SIZE) {
    const page = await mailpitGet<MailpitMessageList>(
      `/api/v1/messages?start=${start}&limit=${PAGE_SIZE}`,
    );
    for (const message of page.messages) {
      await importMessage(message);
      imported += 1;
    }
    if (start + page.messages.length >= page.total || page.messages.length === 0) break;
  }
  return imported;
}

export function startLocalInboundMailSync() {
  if (!env.mailpitApiUrl) return;

  let stopped = false;
  let timeout: NodeJS.Timeout;

  const poll = async () => {
    try {
      await syncLocalInboundMail();
    } catch (error) {
      console.error('Local inbound email sync failed:', error);
    }
    if (!stopped) {
      timeout = setTimeout(() => void poll(), env.mailpitPollIntervalMs);
      timeout.unref();
    }
  };

  void poll();
  return () => {
    stopped = true;
    clearTimeout(timeout);
  };
}
