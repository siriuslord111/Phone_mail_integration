import { randomUUID } from 'crypto';

import { prisma } from '../config/prisma';
import type { User } from '../store';
import { sendOutboundEmail } from './email.service';
import { findAccountByEmail } from './account.service';
import { TwilioService } from './twilio.service';

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
  replyToId?: string;
  quotedText?: string;
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
  let senderAttachments: Array<{ id: string; filename: string; size: number; mimeType: string }> = [];
  if (externalRecipients.length) {
    externalDelivery = await sendOutboundEmail({
      from: input.sender.email,
      to: externalRecipients,
      subject: input.subject,
      body: input.body,
      attachments: input.attachments,
    });
  }

  const copies = [
    ...localRecipients.flatMap((recipient) => [
      {
        messageId: randomUUID(),
        userId: input.sender.id,
        peerAddress: recipient.phoneNumber,
        fromAddress: input.sender.email,
        toAddress: recipient.email,
        subject: input.subject,
        body: input.body,
        replyToId: input.replyToId,
        quotedText: input.quotedText,
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
        replyToId: input.replyToId,
        quotedText: input.quotedText,
        direction: 'in',
        mailbox: 'inbox',
        isRead: false,
      },
    ]),
    ...externalRecipients.map((recipient) => ({
      messageId: randomUUID(),
      userId: input.sender.id,
      peerAddress: recipient,
      fromAddress: input.sender.email,
      toAddress: recipient,
      subject: input.subject,
      body: input.body,
      replyToId: input.replyToId,
      quotedText: input.quotedText,
      direction: 'out',
      mailbox: 'sent',
      isRead: true,
    })),
  ];

  if (copies.length > 0) {
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
          include: { attachments: { select: { id: true, filename: true, size: true, mimeType: true } } },
        }));
      }
      return created;
    });
    const senderCopy = savedCopies.find((copy) => copy.userId === input.sender.id);
    senderAttachments = senderCopy?.attachments ?? [];
  }

  await Promise.all(
    localRecipients
      .filter((recipient) => !recipient.hasMobileApp)
      .map((recipient) => TwilioService.sendEmailNotificationSMS(
        recipient.phoneNumber,
        input.sender.phoneNumber,
        input.subject,
      )),
  );

  return {
    delivered: true,
    localRecipients: localRecipients.length,
    externalRecipients: externalRecipients.length,
    externalDelivery,
    attachments: senderAttachments,
  };
}
