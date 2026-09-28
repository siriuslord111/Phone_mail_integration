import { Router, type Request, type Response } from 'express';

import { addMessage, messages, normalizePhone } from '../store';
import { requireAuth } from '../middlewares/auth';
import { sendOutboundEmail } from '../services/email.service';
import { normalizeRecipients } from '../services/email-recipient';
import { updateAccount } from '../services/account.service';
import { prisma } from '../config/prisma';
import { CannotSendToSelfError, deliverEmail, LocalAttachmentNotSupportedError, UnknownPhoneMailRecipientError } from '../services/email-delivery.service';
import multer from 'multer';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
});
const parseAttachments = upload.array('attachments', 5);
router.use(requireAuth);

function participantKey(value: string) {
  const address = value.trim().toLowerCase();
  if (address.endsWith('@phonemail.com')) {
    return normalizePhone(address.slice(0, -'@phonemail.com'.length));
  }
  return address.includes('@') ? address : normalizePhone(address);
}

function isMessageForUser(message: { from: string; to: string[] }, phone: string, email: string) {
  return message.from === phone || message.to.some((recipient) => {
    const key = participantKey(recipient);
    return key === phone || key === email.toLowerCase();
  });
}

function peerForMessage(message: { from: string; to: string[] }, phone: string) {
  return message.from === phone
    ? participantKey(message.to[0] ?? '')
    : participantKey(message.from);
}

type ConversationEntry = {
  id: string;
  from: string;
  to: string[];
  subject: string;
  body: string;
  createdAt: string;
  read: boolean;
  direction: 'in' | 'out';
  mailbox: 'inbox' | 'sent' | 'spam' | 'trash';
  isStarred: boolean;
  hasAttachments: boolean;
};

function conversationMessage(message: {
  id: string;
  fromAddress: string;
  subject: string;
  body: string;
  receivedAt: Date;
  mailbox: string;
  isRead: boolean;
  isStarred: boolean;
}) {
  return {
    id: `inbound-${message.id}`,
    fromPhone: message.fromAddress,
    subject: message.subject,
    body: message.body,
    createdAt: message.receivedAt.toISOString(),
    direction: 'in' as const,
    read: message.isRead,
    mailbox: message.mailbox,
    isStarred: message.isStarred,
    isReply: false,
  };
}

function storedMessage(message: {
  id: string;
  messageId: string;
  peerAddress: string;
  fromAddress: string;
  toAddress: string;
  subject: string;
  body: string;
  direction: string;
  mailbox: string;
  createdAt: Date;
  isRead: boolean;
  isStarred: boolean;
}) {
  return {
    id: `local-${message.id}`,
    conversationId: `conversation-${message.peerAddress}`,
    fromPhone: message.fromAddress,
    subject: message.subject,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    direction: message.direction === 'out' ? 'out' as const : 'in' as const,
    mailbox: message.mailbox,
    isReply: false,
    read: message.isRead,
    isStarred: message.isStarred,
    status: message.direction === 'out' ? 'sent' as const : undefined,
    messageId: message.messageId,
  };
}

router.get('/users/me', (req, res) => {
  const user = res.locals.authenticatedUser;
  return res.json({
    user: {
      id: user.id,
      phone: user.phoneNumber.replace(/^\+91/, ''),
      name: user.name ?? '',
      email: user.email,
      avatarUrl: undefined,
      bio: user.bio ?? '',
    },
  });
});

router.patch('/users/me', (req, res, next) => {
  void updateUserProfile(req, res).catch(next);
});

async function updateUserProfile(req: Request, res: Response) {
  const user = res.locals.authenticatedUser;
  if (req.body?.name !== undefined) {
    if (typeof req.body.name !== 'string' || req.body.name.trim().length > 100) {
      return res.status(400).json({ message: 'Name must be 100 characters or fewer.' });
    }
    user.name = req.body.name.trim();
  }
  if (req.body?.bio !== undefined) {
    if (typeof req.body.bio !== 'string' || req.body.bio.trim().length > 500) {
      return res.status(400).json({ message: 'Description must be 500 characters or fewer.' });
    }
    user.bio = req.body.bio.trim();
  }
  await updateAccount(user, { name: user.name, bio: user.bio });
  return res.json({
    user: {
      id: user.id,
      phone: user.phoneNumber.replace(/^\+91/, ''),
      name: user.name ?? '',
      email: user.email,
      avatarUrl: undefined,
      bio: user.bio ?? '',
    },
  });
}

router.get('/conversations', (req, res, next) => {
  void listConversations(req, res).catch(next);
});

async function listConversations(req: Request, res: Response) {
  const query = String(req.query.q ?? '').toLowerCase();
  const requestedFolder = String(req.query.folder ?? 'inbox');
  const folder = ['inbox', 'sent', 'spam', 'trash'].includes(requestedFolder)
    ? requestedFolder
    : 'inbox';
  const filter = String(req.query.filter ?? 'all');
  const user = res.locals.authenticatedUser;
  const userPhone = user.phoneNumber;
  const grouped = new Map<string, ConversationEntry[]>();
  for (const message of messages.filter((entry) => isMessageForUser(entry, userPhone, user.email))) {
    const peer = peerForMessage(message, userPhone);
    const list = grouped.get(peer) ?? [];
    list.push({
      ...message,
      direction: message.from === userPhone ? 'out' : 'in',
      mailbox: message.mailbox ?? (message.from === userPhone ? 'sent' : 'inbox'),
      isStarred: message.isStarred ?? false,
      hasAttachments: false,
    });
    grouped.set(peer, list);
  }

  const inboundEmails = await prisma.inboundEmail.findMany({
    where: { userId: user.id },
    orderBy: { receivedAt: 'desc' },
  });
  for (const email of inboundEmails) {
    const list = grouped.get(email.fromAddress) ?? [];
    list.push({
      id: `inbound-${email.id}`,
      from: email.fromAddress,
      to: [email.toAddress],
      subject: email.subject,
      body: email.body,
      createdAt: email.receivedAt.toISOString(),
      read: email.isRead,
      direction: 'in',
      mailbox: email.mailbox as ConversationEntry['mailbox'],
      isStarred: email.isStarred,
      hasAttachments: false,
    });
    grouped.set(email.fromAddress, list);
  }

  const storedEmails = await prisma.mailMessage.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });
  for (const email of storedEmails) {
    const list = grouped.get(email.peerAddress) ?? [];
    list.push({
      id: email.id,
      from: email.fromAddress,
      to: [email.toAddress],
      subject: email.subject,
      body: email.body,
      createdAt: email.createdAt.toISOString(),
      read: email.isRead,
      direction: email.direction === 'out' ? 'out' : 'in',
      mailbox: email.mailbox as ConversationEntry['mailbox'],
      isStarred: email.isStarred,
      hasAttachments: false,
    });
    grouped.set(email.peerAddress, list);
  }

  const conversations = [...grouped.entries()]
    .map(([peer, list]) => [
      peer,
      list.filter((message) => folder === 'inbox'
        ? message.mailbox === 'inbox' || message.mailbox === 'sent'
        : message.mailbox === folder),
    ] as const)
    .filter(([, list]) => list.length > 0)
    .filter(([, list]) => {
      if (filter === 'unread' && !list.some((message) => !message.read && message.direction === 'in')) return false;
      if (filter === 'favourites' && !list.some((message) => message.isStarred)) return false;
      if (filter === 'attachments' && !list.some((message) => message.hasAttachments)) return false;
      return true;
    })
    .filter(([peer, list]) => !query || peer.includes(query) || list.some((message) => `${message.subject} ${message.body}`.toLowerCase().includes(query)))
    .map(([peer, list]) => {
      list.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      const last = list.reduce((latest, message) =>
        message.createdAt > latest.createdAt ? message : latest,
      );
      return {
        id: `conversation-${peer}`,
        title: peer,
        isGroup: false,
        participants: [{ phone: peer, name: peer }],
        lastMessage: {
          preview: last.body,
          subject: last.subject,
          createdAt: last.createdAt,
          hasAttachment: false,
          direction: last.direction,
        },
        unreadCount: list.filter((message) => !message.read && message.direction === 'in').length,
        isFavourite: list.some((message) => message.isStarred),
        hasAttachments: list.some((message) => message.hasAttachments),
      };
    })
    .sort((left, right) =>
      right.lastMessage.createdAt.localeCompare(left.lastMessage.createdAt),
    );
  return res.json({ conversations });
}

router.get('/conversations/:id/messages', (req, res, next) => {
  void listConversationMessages(req, res).catch(next);
});

async function listConversationMessages(req: Request, res: Response) {
  const conversationId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const peer = participantKey(conversationId.replace(/^conversation-/, ''));
  const user = res.locals.authenticatedUser;
  const userPhone = user.phoneNumber;
  const result = messages.filter((message) =>
    isMessageForUser(message, userPhone, user.email) &&
    peerForMessage(message, userPhone) === peer,
  );
  const inboundEmails = await prisma.inboundEmail.findMany({
    where: { userId: user.id, fromAddress: peer },
    orderBy: { receivedAt: 'asc' },
  });
  const storedEmails = await prisma.mailMessage.findMany({
    where: { userId: user.id, peerAddress: peer },
    orderBy: { createdAt: 'asc' },
  });
  await Promise.all([
    prisma.inboundEmail.updateMany({
      where: { userId: user.id, fromAddress: peer, isRead: false },
      data: { isRead: true },
    }),
    prisma.mailMessage.updateMany({
      where: { userId: user.id, peerAddress: peer, direction: 'in', isRead: false },
      data: { isRead: true },
    }),
  ]);
  for (const message of result) {
    if (message.from !== userPhone) message.read = true;
  }
  return res.json({
    messages: [
      ...result.map((message) => ({
        ...message,
        fromPhone: message.from,
        direction: message.from === userPhone ? 'out' as const : 'in' as const,
      })),
      ...inboundEmails.map((email) => ({ ...conversationMessage(email), read: true })),
      ...storedEmails.map((email) => ({ ...storedMessage(email), read: true })),
    ].sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
  });
}

router.post('/messages', (req, res, next) => {
  parseAttachments(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({
        message: error.code === 'LIMIT_FILE_SIZE'
          ? 'Each attachment must be 10 MB or smaller.'
          : 'You can attach up to 5 files to an email.',
      });
    }
    return next(error);
  });
}, async (req, res) => {
  let recipients: string[];
  try {
    recipients = normalizeRecipients(req.body?.to ?? req.body?.['to[]']);
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid recipient.' });
  }
  const subject = String(req.body?.subject ?? 'New message').trim();
  const body = typeof req.body?.body === 'string' ? req.body.body : '';
  if (!body.trim()) {
    return res.status(400).json({ message: 'Write a message before sending.' });
  }
  if (subject.length > 200 || /[\r\n]/.test(subject)) {
    return res.status(400).json({ message: 'Subject must be 200 characters or fewer and contain no line breaks.' });
  }

  const files = Array.isArray(req.files) ? req.files : [];
  const sender = res.locals.authenticatedUser.phoneNumber;
  try {
    const delivery = await deliverEmail({
      sender: res.locals.authenticatedUser,
      recipients,
      subject,
      body,
      attachments: files.map((file) => ({ filename: file.originalname, content: file.buffer })),
    });
    if (delivery.externalRecipients > 0) {
      const externalRecipients = recipients.filter((recipient) => !recipient.endsWith('@phonemail.com'));
      addMessage({
        from: sender,
        to: externalRecipients,
        subject,
        body,
      });
    }
    const message = {
      id: `delivery-${Date.now()}`,
      from: sender,
      fromPhone: sender,
      to: recipients,
      subject,
      body,
      createdAt: new Date().toISOString(),
      read: false,
      direction: 'out' as const,
      mailbox: 'sent' as const,
      isReply: Boolean(req.body?.inReplyTo),
    };
    return res.status(201).json({ message, delivery });
  } catch (error) {
    if (
      error instanceof UnknownPhoneMailRecipientError ||
      error instanceof LocalAttachmentNotSupportedError ||
      error instanceof CannotSendToSelfError
    ) {
      return res.status(400).json({ message: error.message });
    }
    console.error('SMTP delivery failed:', error);
    const message = error instanceof Error && error.message.startsWith('Email sending is not configured.')
      ? error.message
      : 'The email could not be sent. Check SMTP settings and the recipient address, then try again.';
    return res.status(message.startsWith('Email sending is not configured.') ? 503 : 502).json({ message });
  }
});

router.get('/drafts', (req, res, next) => {
  void prisma.mailDraft.findMany({
    where: { userId: res.locals.authenticatedUser.id },
    orderBy: { updatedAt: 'desc' },
  }).then((drafts) => res.json({ drafts })).catch(next);
});

router.post('/drafts', async (req, res, next) => {
  try {
    const { id, recipients, subject, body } = req.body ?? {};
    if (!Array.isArray(recipients) || !recipients.every((item: unknown) => typeof item === 'string')) {
      return res.status(400).json({ message: 'Recipients must be a list of addresses.' });
    }
    const safeRecipients = recipients.map((item: string) => item.trim()).filter(Boolean);
    const values = {
      recipients: safeRecipients,
      subject: typeof subject === 'string' ? subject.slice(0, 200) : '',
      body: typeof body === 'string' ? body : '',
    };
    const userId = res.locals.authenticatedUser.id;
    let draft;
    if (typeof id === 'string') {
      const existing = await prisma.mailDraft.findFirst({ where: { id, userId } });
      if (!existing) return res.status(404).json({ message: 'Draft not found.' });
      draft = await prisma.mailDraft.update({ where: { id }, data: values });
    } else {
      draft = await prisma.mailDraft.create({ data: { ...values, userId } });
    }
    return res.status(200).json({ draft });
  } catch (error) {
    return next(error);
  }
});

router.delete('/drafts/:id', (req, res, next) => {
  void prisma.mailDraft.deleteMany({
    where: { id: req.params.id, userId: res.locals.authenticatedUser.id },
  }).then((result) => result.count
    ? res.status(204).end()
    : res.status(404).json({ message: 'Draft not found.' })).catch(next);
});

router.patch('/messages/:id', async (req, res, next) => {
  const id = req.params.id;
  const action = String(req.body?.action ?? '');
  if (!['star', 'spam', 'trash', 'restore', 'delete', 'markRead'].includes(action)) {
    return res.status(400).json({ message: 'Unsupported message action.' });
  }
  const user = res.locals.authenticatedUser;
  try {
    const mailbox = action === 'spam' ? 'spam'
      : action === 'trash' ? 'trash'
      : action === 'restore' ? 'inbox'
      : undefined;
    const inboundId = id.startsWith('inbound-') ? id.slice('inbound-'.length) : id;
    const storedId = id.startsWith('local-') ? id.slice('local-'.length) : id;
    const [inbound, stored] = await Promise.all([
      prisma.inboundEmail.findFirst({ where: { id: inboundId, userId: user.id } }),
      prisma.mailMessage.findFirst({ where: { id: storedId, userId: user.id } }),
    ]);
    const message = messages.find((entry) => entry.id === id);
    if (inbound) {
      if (action === 'delete') {
        await prisma.inboundEmail.delete({ where: { id: inbound.id } });
        return res.json({ message: conversationMessage(inbound) });
      }
      const updated = await prisma.inboundEmail.update({
        where: { id: inbound.id },
        data: action === 'star'
          ? { isStarred: !inbound.isStarred }
          : action === 'markRead'
            ? { isRead: true }
            : mailbox ? { mailbox } : {},
      });
      return res.json({ message: conversationMessage(updated) });
    }
    if (stored) {
      if (action === 'delete') {
        await prisma.mailMessage.delete({ where: { id: stored.id } });
        return res.json({ message: storedMessage(stored) });
      }
      const updated = await prisma.mailMessage.update({
        where: { id: stored.id },
        data: action === 'star'
          ? { isStarred: !stored.isStarred }
          : action === 'markRead'
            ? { isRead: true }
            : mailbox ? { mailbox } : {},
      });
      return res.json({ message: storedMessage(updated) });
    }
    if (!message) return res.status(404).json({ message: 'Message not found.' });
    if (action === 'star') message.isStarred = !message.isStarred;
    if (action === 'markRead') message.read = true;
    if (mailbox) message.mailbox = mailbox;
    if (action === 'delete') messages.splice(messages.indexOf(message), 1);
    return res.json({ message });
  } catch (error) {
    return next(error);
  }
});

router.patch('/conversations/:id', async (req, res, next) => {
  const userPhone = res.locals.authenticatedUser.phoneNumber;
  const userId = res.locals.authenticatedUser.id;
  const peer = participantKey(req.params.id.replace(/^conversation-/, ''));
  const belongsToUser = messages.some((message) =>
    (message.from === userPhone && message.to.includes(peer)) ||
    (message.from === peer && message.to.includes(userPhone)),
  );
  try {
    const storedCount = await prisma.mailMessage.count({ where: { userId, peerAddress: peer } });
    const inboundCount = await prisma.inboundEmail.count({ where: { userId, fromAddress: peer } });
    if (!belongsToUser && storedCount === 0 && inboundCount === 0) {
      return res.status(404).json({ message: 'Conversation not found.' });
    }
    if (typeof req.body?.isFavourite === 'boolean') {
      const starred = req.body.isFavourite;
      await Promise.all([
        prisma.inboundEmail.updateMany({
          where: { userId, fromAddress: peer },
          data: { isStarred: starred },
        }),
        prisma.mailMessage.updateMany({
          where: { userId, peerAddress: peer },
          data: { isStarred: starred },
        }),
      ]);
    }
    return res.json({
      conversation: {
        id: req.params.id,
        ...req.body,
      },
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
