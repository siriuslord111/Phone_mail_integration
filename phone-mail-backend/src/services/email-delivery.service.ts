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
  attachments?: Array<{ filename: string; contentType: string; content: Buffer }>;
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

  let externalDelivery: { delivered: boolean } | undefined;
  let senderAttachments: Array<{ id: string; filename: string; size: number }> = [];
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

    const savedCopies = await prisma.$transaction(async (transaction) => {
      const created = [];
      for (const copy of copies) {
        created.push(await transaction.mailMessage.create({
          data: {
            ...copy,
            attachments: {
              create: (input.attachments ?? []).map((attachment) => ({
                filename: attachment.filename,
                mimeType: attachment.contentType,
                size: attachment.content.length,
                content: new Uint8Array(attachment.content),
              })),
            },
          },
          include: { attachments: { select: { id: true, filename: true, size: true } } },
        }));
      }
      return created;
    });
    const senderCopy = savedCopies.find(
      (copy) => copy.userId === input.sender.id && copy.peerAddress === localRecipients[0].phoneNumber,
    );
    senderAttachments = senderCopy?.attachments ?? [];
  }

  return {
    delivered: true,
    localRecipients: localRecipients.length,
    externalRecipients: externalRecipients.length,
    externalDelivery,
    attachments: senderAttachments,
  };
}
