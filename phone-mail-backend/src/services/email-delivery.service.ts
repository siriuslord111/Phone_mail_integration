import { randomUUID } from 'crypto';

import { prisma } from '../config/prisma';
import type { User } from '../store';
import { sendOutboundEmail } from './email.service';
import { findAccountByEmail } from './account.service';

export class UnknownPhoneMailRecipientError extends Error {
  constructor(address: string) {
    super(`No PhoneMail account exists for ${address}.`);
  }
}

export class LocalAttachmentNotSupportedError extends Error {
  constructor() {
    super('Attachments are not supported for local PhoneMail-to-PhoneMail delivery yet.');
  }
}

export class CannotSendToSelfError extends Error {
  constructor() {
    super('Choose another PhoneMail account as the recipient.');
  }
}

export async function deliverEmail(input: {
  sender: User;
  recipients: string[];
  subject: string;
  body: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
}) {
  const localRecipients: User[] = [];
  const externalRecipients: string[] = [];

  for (const recipient of new Set(input.recipients.map((value) => value.trim().toLowerCase()))) {
    if (!recipient.endsWith('@phonemail.com')) {
      externalRecipients.push(recipient);
      continue;
    }

    const account = await findAccountByEmail(recipient);
    if (!account) throw new UnknownPhoneMailRecipientError(recipient);
    if (account.id === input.sender.id) throw new CannotSendToSelfError();
    localRecipients.push(account);
  }

  if (localRecipients.length && input.attachments?.length) {
    throw new LocalAttachmentNotSupportedError();
  }

  let externalDelivery: { delivered: boolean } | undefined;
  if (externalRecipients.length) {
    externalDelivery = await sendOutboundEmail({
      from: input.sender.email,
      to: externalRecipients,
      subject: input.subject,
      body: input.body,
      attachments: input.attachments,
    });
  }

  if (localRecipients.length) {
    const copies = localRecipients.flatMap((recipient) => [
      {
        messageId: randomUUID(),
        userId: input.sender.id,
        peerAddress: recipient.phoneNumber,
        fromAddress: input.sender.email,
        toAddress: recipient.email,
        subject: input.subject,
        body: input.body,
        direction: 'out',
        mailbox: 'sent',
        isRead: true,
      },
      {
        messageId: randomUUID(),
        userId: recipient.id,
        peerAddress: input.sender.phoneNumber,
        fromAddress: input.sender.email,
        toAddress: recipient.email,
        subject: input.subject,
        body: input.body,
        direction: 'in',
        mailbox: 'inbox',
        isRead: false,
      },
    ]);

    await prisma.mailMessage.createMany({ data: copies, skipDuplicates: true });
  }

  return {
    delivered: true,
    localRecipients: localRecipients.length,
    externalRecipients: externalRecipients.length,
    externalDelivery,
  };
}
