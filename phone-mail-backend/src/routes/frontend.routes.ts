import { Router, type Request, type Response } from 'express';

import { addMessage, messages, normalizePhone } from '../store';
import { requireAuth } from '../middlewares/auth';
import { sendOutboundEmail } from '../services/email.service';
import { normalizeRecipients } from '../services/email-recipient';
import { findAccountByEmail, findAccountsByPhones, memoryStoreEnabled, updateAccount } from '../services/account.service';
import { getContactNicknames, saveContactNickname } from '../services/contact-nickname.service';
import { prisma } from '../config/prisma';
import { CannotSendToSelfError, deliverEmail, UnknownPhoneMailRecipientError } from '../services/email-delivery.service';
import { notifyIncomingMessage } from '../services/message-notification.service';
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

const GROUP_CONVERSATION_PREFIX = 'group-';
const GROUP_MESSAGE_PREFIX = 'group-message-';

function groupConversationId(id: string) {
  return `${GROUP_CONVERSATION_PREFIX}${id}`;
}

function groupMessageId(id: string) {
  return `${GROUP_MESSAGE_PREFIX}${id}`;
}

function groupMessageView(message: {
  id: string;
  groupChatId: string;
  sender: { phoneNumber: string; name: string | null };
  subject: string;
  body: string;
  createdAt: Date;
  isStarred: boolean;
  replyToId: string | null;
  repliedAt?: Date | null;
  attachments: Array<{ id: string; filename: string; size: number }>;
}, userPhone: string, replied = false) {
  return {
    id: groupMessageId(message.id),
    conversationId: groupConversationId(message.groupChatId),
    isGroup: true,
    fromPhone: message.sender.phoneNumber,
    senderName: message.sender.name || message.sender.phoneNumber,
    direction: message.sender.phoneNumber === userPhone ? 'out' as const : 'in' as const,
    subject: message.subject,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    read: true,
    isStarred: message.isStarred,
    isReply: Boolean(message.replyToId),
    replied: replied || Boolean(message.repliedAt),
    inReplyToId: message.replyToId ? groupMessageId(message.replyToId) : undefined,
    attachments: message.attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.filename,
      size: attachment.size,
      url: `/api/attachments/${encodeURIComponent(attachment.id)}`,
    })),
  };
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
  replied?: boolean;
  inReplyToId?: string;
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
  repliedAt: Date | null;
  replyToId?: string | null;
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
    replied: Boolean(message.repliedAt),
    isReply: Boolean(message.replyToId),
    inReplyToId: message.replyToId ?? undefined,
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
  quotedText?: string | null;
  direction: string;
  mailbox: string;
  createdAt: Date;
  isRead: boolean;
  isStarred: boolean;
  repliedAt: Date | null;
  replyToId: string | null;
  attachments?: Array<{ id: string; filename: string; size: number; mimeType?: string }>;
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
    isReply: Boolean(message.replyToId),
    inReplyToId: message.replyToId ?? undefined,
    quotedText: message.quotedText ?? undefined,
    replied: Boolean(message.repliedAt),
    read: message.isRead,
    isStarred: message.isStarred,
    status: message.direction === 'out' ? 'sent' as const : undefined,
    messageId: message.messageId,
    attachments: message.attachments?.map((attachment) => ({
      id: attachment.id,
      name: attachment.filename,
      size: attachment.size,
      mimeType: attachment.mimeType,
      url: `/api/attachments/${encodeURIComponent(attachment.id)}`,
    })),
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
      avatarUrl: user.avatarUrl ?? '',
      bio: user.bio ?? '',
    },
  });
});

router.patch('/users/me', (req, res, next) => {
  void updateUserProfile(req, res).catch(next);
});

router.get('/shared-content', (req, res, next) => {
  void listSharedContent(req, res).catch(next);
});

async function listSharedContent(_req: Request, res: Response) {
  const user = res.locals.authenticatedUser;
  if (memoryStoreEnabled) return res.json({ attachments: [] });

  const attachments = await prisma.mailAttachment.findMany({
    where: { mailMessage: { userId: user.id } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      filename: true,
      size: true,
      mimeType: true,
      createdAt: true,
      mailMessage: {
        select: { peerAddress: true, direction: true },
      },
    },
  });
  return res.json({
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.filename,
      size: attachment.size,
      mimeType: attachment.mimeType,
      createdAt: attachment.createdAt.toISOString(),
      conversation: attachment.mailMessage.peerAddress,
      direction: attachment.mailMessage.direction,
      url: `/api/attachments/${encodeURIComponent(attachment.id)}`,
    })),
  });
}

router.patch('/contacts/:phone/nickname', (req, res, next) => {
  void updateContactNickname(req, res).catch(next);
});

async function updateContactNickname(req: Request, res: Response) {
  const user = res.locals.authenticatedUser;
  const phoneInput = String(req.params.phone ?? '');
  const phone = normalizePhone(phoneInput);
  if (!/^\+\d{8,15}$/.test(phone) || phone === user.phoneNumber) {
    return res.status(400).json({ message: 'Choose a valid contact to save a nickname for.' });
  }
  if (typeof req.body?.nickname !== 'string' || req.body.nickname.trim().length > 100) {
    return res.status(400).json({ message: 'Nickname must be 100 characters or fewer.' });
  }
  const nickname = await saveContactNickname(user.id, phone, req.body.nickname);
  return res.json({ nickname });
}

async function updateUserProfile(req: Request, res: Response) {
  const user = res.locals.authenticatedUser;
  const changes: { name?: string; bio?: string; avatarUrl?: string } = {};
  if (req.body?.name !== undefined) {
    if (typeof req.body.name !== 'string' || req.body.name.trim().length > 100) {
      return res.status(400).json({ message: 'Name must be 100 characters or fewer.' });
    }
    changes.name = req.body.name.trim();
  }
  if (req.body?.bio !== undefined) {
    if (typeof req.body.bio !== 'string' || req.body.bio.trim().length > 500) {
      return res.status(400).json({ message: 'Description must be 500 characters or fewer.' });
    }
    changes.bio = req.body.bio.trim();
  }
  if (req.body?.avatarUrl !== undefined) {
    if (typeof req.body.avatarUrl !== 'string') {
      return res.status(400).json({ message: 'Profile photo must be a valid image.' });
    }
    if (req.body.avatarUrl !== '' && !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(req.body.avatarUrl)) {
      return res.status(400).json({ message: 'Profile photo must be a PNG, JPEG, WebP, or GIF image.' });
    }
    if (Buffer.byteLength(req.body.avatarUrl, 'utf8') > 2_800_000) {
      return res.status(400).json({ message: 'Profile photo must be 2 MB or smaller.' });
    }
    changes.avatarUrl = req.body.avatarUrl;
  }
  await updateAccount(user, {
    name: changes.name ?? user.name,
    bio: changes.bio ?? user.bio,
    avatarUrl: changes.avatarUrl ?? user.avatarUrl,
  });
  return res.json({
    user: {
      id: user.id,
      phone: user.phoneNumber.replace(/^\+91/, ''),
      name: user.name ?? '',
      email: user.email,
      avatarUrl: user.avatarUrl ?? '',
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
      hasAttachments: Boolean(message.attachments?.length),
      replied: message.replied,
      inReplyToId: message.inReplyToId,
    });
    grouped.set(peer, list);
  }

  const inboundEmails = memoryStoreEnabled ? [] : await prisma.inboundEmail.findMany({
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
      replied: Boolean(email.repliedAt),
    });
    grouped.set(email.fromAddress, list);
  }

  const storedEmails = memoryStoreEnabled ? [] : await prisma.mailMessage.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: { attachments: { select: { id: true, filename: true, size: true, mimeType: true } } },
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
      hasAttachments: email.attachments.length > 0,
      replied: Boolean(email.repliedAt),
      inReplyToId: email.replyToId ?? undefined,
    });
    grouped.set(email.peerAddress, list);
  }

  const contactProfiles = await findAccountsByPhones(
    [...grouped.keys()].filter((phone) => /^\+\d{8,15}$/.test(phone)),
  );
  const profileByPhone = new Map(contactProfiles.map((profile) => [profile.phoneNumber, profile]));
  const nicknames = await getContactNicknames(user.id, [...grouped.keys()]);

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
    .filter(([peer, list]) => {
      const profile = profileByPhone.get(peer);
      return !query
        || peer.includes(query)
        || profile?.name?.toLowerCase().includes(query)
        || profile?.bio?.toLowerCase().includes(query)
        || list.some((message) => `${message.subject} ${message.body}`.toLowerCase().includes(query));
    })
    .map(([peer, list]) => {
      list.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      const last = list.reduce((latest, message) =>
        message.createdAt > latest.createdAt ? message : latest,
      );
      return {
        id: `conversation-${peer}`,
        title: nicknames.get(peer) || profileByPhone.get(peer)?.name || peer,
        actualName: profileByPhone.get(peer)?.name || peer,
        nickname: nicknames.get(peer) ?? '',
        isGroup: false,
        avatarUrl: profileByPhone.get(peer)?.avatarUrl,
        description: profileByPhone.get(peer)?.bio,
        participants: [{
          phone: peer,
          name: profileByPhone.get(peer)?.name || peer,
          avatarUrl: profileByPhone.get(peer)?.avatarUrl,
          bio: profileByPhone.get(peer)?.bio,
        }],
        lastMessage: {
          preview: last.body,
          subject: last.subject,
          createdAt: last.createdAt,
          hasAttachment: Boolean(last.hasAttachments),
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
  if (!memoryStoreEnabled) {
    const memberships = await prisma.groupChatMember.findMany({
      where: { userId: user.id },
      include: {
        groupChat: {
          include: { members: { include: { user: true } } },
        },
      },
    });
    for (const membership of memberships) {
      const group = membership.groupChat;
      const groupMessages = await prisma.groupChatMessage.findMany({
        where: { groupChatId: group.id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          senderId: true,
          subject: true,
          body: true,
          createdAt: true,
          attachments: { select: { id: true } },
        },
      });
      const deletedGroupMessages = await prisma.groupChatMessageDeletion.findMany({
        where: { userId: user.id, message: { groupChatId: group.id } },
        select: { messageId: true },
      });
      const deletedMessageIds = new Set(deletedGroupMessages.map(({ messageId }) => messageId));
      const visibleMessages = groupMessages.filter((message) =>
        !deletedMessageIds.has(message.id) &&
          (folder === 'inbox'
            ? true
            : folder === 'sent'
              ? message.senderId === user.id
              : false),
      );
      if (visibleMessages.length === 0) continue;
      const last = visibleMessages[visibleMessages.length - 1];
      const participants = group.members.map(({ user: member }) => ({
        phone: member.phoneNumber,
        name: member.name || member.phoneNumber,
        avatarUrl: member.profilePic ?? undefined,
        bio: member.bio ?? undefined,
      }));
      const title = group.name || participants
        .filter((participant) => participant.phone !== userPhone)
        .map((participant) => participant.name)
        .join(', ');
      const haystack = `${title} ${group.description} ${visibleMessages.map((message) => `${message.subject} ${message.body}`).join(' ')}`.toLowerCase();
      const unreadCount = groupMessages.filter((message) =>
        !deletedMessageIds.has(message.id) &&
        message.senderId !== user.id &&
        (!membership.lastReadAt || message.createdAt > membership.lastReadAt),
      ).length;
      if (filter === 'unread' && unreadCount === 0) continue;
      if (filter === 'favourites' && !membership.isFavourite) continue;
      if (filter === 'attachments' && !visibleMessages.some((message) => message.attachments.length > 0)) continue;
      if (query && !haystack.includes(query)) continue;
      conversations.push({
        id: groupConversationId(group.id),
        title: title || 'Group chat',
        actualName: title || 'Group chat',
        nickname: '',
        isGroup: true,
        avatarUrl: group.avatarUrl || undefined,
        description: group.description || undefined,
        participants,
        lastMessage: {
          preview: last.body,
          subject: last.subject,
          createdAt: last.createdAt.toISOString(),
          hasAttachment: last.attachments.length > 0,
          direction: last.senderId === user.id ? 'out' : 'in',
        },
        unreadCount,
        isFavourite: membership.isFavourite,
        hasAttachments: visibleMessages.some((message) => message.attachments.length > 0),
      });
    }
    conversations.sort((left, right) =>
      right.lastMessage.createdAt.localeCompare(left.lastMessage.createdAt),
    );
  }
  return res.json({ conversations });
}

router.get('/conversations/:id/messages', (req, res, next) => {
  void listConversationMessages(req, res).catch(next);
});

async function listConversationMessages(req: Request, res: Response) {
  const conversationId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const user = res.locals.authenticatedUser;
  if (conversationId.startsWith(GROUP_CONVERSATION_PREFIX) && !memoryStoreEnabled) {
    const groupId = conversationId.slice(GROUP_CONVERSATION_PREFIX.length);
    const membership = await prisma.groupChatMember.findFirst({
      where: { groupChatId: groupId, userId: user.id },
    });
    if (!membership) return res.status(404).json({ message: 'Group conversation not found.' });
    const groupMessages = await prisma.groupChatMessage.findMany({
      where: { groupChatId: groupId },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: { select: { phoneNumber: true, name: true } },
        attachments: { select: { id: true, filename: true, size: true } },
      },
    });
    const deletedGroupMessages = await prisma.groupChatMessageDeletion.findMany({
      where: { userId: user.id, message: { groupChatId: groupId } },
      select: { messageId: true },
    });
    const deletedMessageIds = new Set(deletedGroupMessages.map(({ messageId }) => messageId));
    await prisma.groupChatMember.update({
      where: { id: membership.id },
      data: { lastReadAt: new Date() },
    });
    const visibleMessages = groupMessages.filter((message) => !deletedMessageIds.has(message.id));
    const byId = new Map(visibleMessages.map((message) => [message.id, message]));
    const repliedMessageIds = new Set(groupMessages.flatMap((message) =>
      message.replyToId ? [message.replyToId] : [],
    ));
    return res.json({
      messages: visibleMessages.map((message) => ({
        ...groupMessageView(message, user.phoneNumber, repliedMessageIds.has(message.id)),
        quotedText: message.replyToId ? byId.get(message.replyToId)?.body : undefined,
      })),
    });
  }
  const peer = participantKey(conversationId.replace(/^conversation-/, ''));
  const userPhone = user.phoneNumber;
  const result = messages.filter((message) =>
    isMessageForUser(message, userPhone, user.email) &&
    peerForMessage(message, userPhone) === peer,
  );
  const inboundEmails = memoryStoreEnabled ? [] : await prisma.inboundEmail.findMany({
    where: { userId: user.id, fromAddress: peer },
    orderBy: { receivedAt: 'asc' },
  });
  const storedEmails = memoryStoreEnabled ? [] : await prisma.mailMessage.findMany({
    where: { userId: user.id, peerAddress: peer },
    orderBy: { createdAt: 'asc' },
    include: { attachments: { select: { id: true, filename: true, size: true, mimeType: true } } },
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
  const conversationMessages = [
    ...result.map((message) => ({
        ...message,
        fromPhone: message.from,
        direction: message.from === userPhone ? 'out' as const : 'in' as const,
      })),
      ...inboundEmails.map((email) => ({ ...conversationMessage(email), read: true })),
      ...storedEmails.map((email) => ({ ...storedMessage(email), read: true })),
    ].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const repliedMessageIds = new Set(conversationMessages.flatMap((message) =>
    message.inReplyToId ? [message.inReplyToId] : [],
  ));
  const messagesWithReplyState = conversationMessages.map((message) => ({
    ...message,
    replied: Boolean(message.replied || repliedMessageIds.has(message.id)),
    quotedText: message.inReplyToId
      ? conversationMessages.find((original) => original.id === message.inReplyToId)?.body
      : undefined,
  }));
  return res.json({ messages: messagesWithReplyState });
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
  const requestedConversationId = typeof req.body?.conversationId === 'string'
    ? req.body.conversationId
    : '';
  const requestedGroupId = requestedConversationId.startsWith(GROUP_CONVERSATION_PREFIX)
    ? requestedConversationId.slice(GROUP_CONVERSATION_PREFIX.length)
    : '';
  let recipients: string[];
  if (requestedGroupId) {
    recipients = [];
  } else {
    try {
      recipients = normalizeRecipients(req.body?.to ?? req.body?.['to[]']);
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid recipient.' });
    }
  }
  let subject = String(req.body?.subject ?? '').trim();
  const body = typeof req.body?.body === 'string' ? req.body.body : '';
  const files = Array.isArray(req.files) ? req.files : [];
  if (subject.length > 200 || /[\r\n]/.test(subject)) {
    return res.status(400).json({ message: 'Subject must be 200 characters or fewer and contain no line breaks.' });
  }

  const senderAccount = res.locals.authenticatedUser;
  const sender = senderAccount.phoneNumber;
  const attachments = files.map((file) => ({
    filename: file.originalname,
    contentType: file.mimetype,
    content: file.buffer,
  }));
  const replyTargetId = typeof req.body?.inReplyTo === 'string' ? req.body.inReplyTo : '';
  try {
    if (requestedGroupId && memoryStoreEnabled) {
      return res.status(503).json({ message: 'Group conversations require persistent storage.' });
    }
    if (requestedGroupId && !memoryStoreEnabled) {
      const membership = await prisma.groupChatMember.findFirst({
        where: { groupChatId: requestedGroupId, userId: senderAccount.id },
      });
      if (!membership) return res.status(404).json({ message: 'Group conversation not found.' });
      const replyToId = typeof req.body?.inReplyTo === 'string'
        ? req.body.inReplyTo.replace(/^group-message-/, '')
        : undefined;
      let originalMessage: { id: string; senderId: string; subject: string; body: string; repliedAt: Date | null } | null = null;
      if (replyToId) {
        originalMessage = await prisma.groupChatMessage.findFirst({
          where: { id: replyToId, groupChatId: requestedGroupId },
          select: { id: true, senderId: true, subject: true, body: true, repliedAt: true },
        });
        if (!originalMessage || originalMessage.senderId === senderAccount.id) {
          return res.status(400).json({ message: 'The reply target is not an incoming message in this group.' });
        }
        if (originalMessage.repliedAt || await prisma.groupChatMessage.findFirst({
          where: { groupChatId: requestedGroupId, replyToId },
          select: { id: true },
        })) {
          return res.status(409).json({ message: 'This message has already been replied to.' });
        }
        const reservation = await prisma.groupChatMessage.updateMany({
          where: { id: replyToId, groupChatId: requestedGroupId, repliedAt: null },
          data: { repliedAt: new Date() },
        });
        if (reservation.count !== 1) return res.status(409).json({ message: 'This message has already been replied to.' });
        if (originalMessage.subject) {
          subject = (/^re:/i.test(originalMessage.subject) ? originalMessage.subject : `Re: ${originalMessage.subject}`).slice(0, 200);
        }
      }
      let message;
      try {
        message = await prisma.groupChatMessage.create({
        data: {
          groupChatId: requestedGroupId,
          senderId: senderAccount.id,
          subject,
          body: body.trim(),
          replyToId: replyToId ?? null,
          attachments: {
            create: attachments.map((attachment) => ({
              filename: attachment.filename,
              mimeType: attachment.contentType,
              size: attachment.content.length,
              content: new Uint8Array(attachment.content),
            })),
          },
        },
        include: {
          sender: { select: { phoneNumber: true, name: true } },
          attachments: { select: { id: true, filename: true, size: true } },
        },
        });
      } catch (error) {
        if (replyToId) {
          await prisma.groupChatMessage.updateMany({
            where: { id: replyToId, groupChatId: requestedGroupId },
            data: { repliedAt: null },
          });
        }
        throw error;
      }
      await prisma.groupChat.update({
        where: { id: requestedGroupId },
        data: { updatedAt: new Date() },
      });
      const groupRecipients = await prisma.groupChatMember.findMany({
        where: { groupChatId: requestedGroupId, userId: { not: senderAccount.id } },
        select: { user: { select: { phoneNumber: true, smsNotificationsEnabled: true } } },
      });
      void notifyIncomingMessage(groupRecipients.map(({ user }) => user), senderAccount.phoneNumber);
      const messageView = groupMessageView(message, sender);
      return res.status(201).json({
        message: {
          ...messageView,
          replied: false,
          quotedText: originalMessage?.body,
        },
        delivery: { delivered: true, localRecipients: 0, externalRecipients: 0 },
      });
    }

    const internalGroupRecipients = recipients.length > 1 &&
      recipients.every((recipient) => recipient.endsWith('@phonemail.com'));
    if (internalGroupRecipients && memoryStoreEnabled) {
      return res.status(503).json({ message: 'Group conversations require persistent storage.' });
    }
    if (internalGroupRecipients && !memoryStoreEnabled) {
      const recipientAccounts = await Promise.all(recipients.map((recipient) => findAccountByEmail(recipient)));
      if (recipientAccounts.some((account) => !account)) {
        throw new UnknownPhoneMailRecipientError(recipients[recipientAccounts.findIndex((account) => !account)]);
      }
      if (recipientAccounts.some((account) => account?.id === senderAccount.id)) {
        throw new CannotSendToSelfError();
      }
      const members = [senderAccount, ...recipientAccounts.filter((account) => account !== undefined)]
        .filter((account, index, all) => all.findIndex((item) => item.id === account.id) === index);
      const memberIds = members.map((member) => member.id);
      const candidateGroups = await prisma.groupChat.findMany({
        where: {
          members: {
            some: { userId: senderAccount.id },
            every: { userId: { in: memberIds } },
          },
        },
        include: { members: { select: { userId: true } } },
        orderBy: { updatedAt: 'desc' },
      });
      const existingGroup = candidateGroups.find((group) =>
        group.members.length === memberIds.length &&
        memberIds.every((memberId) => group.members.some((member) => member.userId === memberId)),
      );
      const result = await prisma.$transaction(async (transaction) => {
        const group = existingGroup ?? await transaction.groupChat.create({ data: { name: '' } });
        if (!existingGroup) {
          await transaction.groupChatMember.createMany({
            data: members.map((member) => ({ groupChatId: group.id, userId: member.id })),
          });
        }
        const message = await transaction.groupChatMessage.create({
          data: {
            groupChatId: group.id,
            senderId: senderAccount.id,
            subject,
            body: body.trim(),
            attachments: {
              create: attachments.map((attachment) => ({
                filename: attachment.filename,
                mimeType: attachment.contentType,
                size: attachment.content.length,
                content: new Uint8Array(attachment.content),
              })),
            },
          },
          include: {
            sender: { select: { phoneNumber: true, name: true } },
            attachments: { select: { id: true, filename: true, size: true } },
          },
        });
        return { group, message };
      });
      void notifyIncomingMessage(recipientAccounts.filter((account): account is NonNullable<typeof account> => Boolean(account)), senderAccount.phoneNumber);
      return res.status(201).json({
        message: {
          ...groupMessageView(result.message, sender),
          conversationId: groupConversationId(result.group.id),
        },
        delivery: {
          delivered: true,
          localRecipients: recipientAccounts.length,
          externalRecipients: 0,
        },
      });
    }

    let replyReservation:
      | { kind: 'inbound' | 'stored'; id: string }
      | { kind: 'memory'; message: (typeof messages)[number] }
      | undefined;
    let replyOriginal: { id: string; subject: string; body: string; providerMessageId?: string } | undefined;
    if (replyTargetId) {
      if (recipients.length !== 1) {
        return res.status(400).json({ message: 'Replies must have exactly one recipient.' });
      }
      const peer = participantKey(recipients[0]);
      if (replyTargetId.startsWith('inbound-') && !memoryStoreEnabled) {
        const original = await prisma.inboundEmail.findFirst({
          where: { id: replyTargetId.slice('inbound-'.length), userId: senderAccount.id, fromAddress: peer },
          select: { id: true, subject: true, body: true, providerMessageId: true, repliedAt: true },
        });
        if (!original) return res.status(400).json({ message: 'The reply target is not in this conversation.' });
        if (original.repliedAt) return res.status(409).json({ message: 'This message has already been replied to.' });
        const reservation = await prisma.inboundEmail.updateMany({
          where: { id: original.id, userId: senderAccount.id, repliedAt: null },
          data: { repliedAt: new Date() },
        });
        if (reservation.count !== 1) return res.status(409).json({ message: 'This message has already been replied to.' });
        replyReservation = { kind: 'inbound', id: original.id };
        replyOriginal = { ...original, id: replyTargetId };
      } else if (replyTargetId.startsWith('local-') && !memoryStoreEnabled) {
        const original = await prisma.mailMessage.findFirst({
          where: {
            id: replyTargetId.slice('local-'.length),
            userId: senderAccount.id,
            peerAddress: peer,
            direction: 'in',
          },
          select: { id: true, subject: true, body: true, repliedAt: true },
        });
        if (!original) return res.status(400).json({ message: 'The reply target is not an incoming message in this conversation.' });
        if (original.repliedAt) return res.status(409).json({ message: 'This message has already been replied to.' });
        const reservation = await prisma.mailMessage.updateMany({
          where: { id: original.id, userId: senderAccount.id, repliedAt: null },
          data: { repliedAt: new Date() },
        });
        if (reservation.count !== 1) return res.status(409).json({ message: 'This message has already been replied to.' });
        replyReservation = { kind: 'stored', id: original.id };
        replyOriginal = { ...original, id: replyTargetId };
      } else {
        const original = messages.find((message) =>
          message.id === replyTargetId &&
          message.from !== sender &&
          peerForMessage(message, sender) === peer,
        );
        if (!original) return res.status(400).json({ message: 'The reply target is not an incoming message in this conversation.' });
        if (original.replied) return res.status(409).json({ message: 'This message has already been replied to.' });
        original.replied = true;
        replyReservation = { kind: 'memory', message: original };
        replyOriginal = { id: original.id, subject: original.subject, body: original.body };
      }
      if (replyOriginal.subject) {
        subject = (/^re:/i.test(replyOriginal.subject) ? replyOriginal.subject : `Re: ${replyOriginal.subject}`).slice(0, 200);
      }
    }
    let delivery;
    try {
      delivery = await deliverEmail({
        sender: senderAccount,
        recipients,
        subject,
        body,
        replyToId: replyTargetId || undefined,
        quotedText: replyOriginal?.body ?? (typeof req.body?.quotedText === 'string' ? req.body.quotedText : undefined),
        inReplyToHeader: replyOriginal?.providerMessageId,
        attachments,
      });
    } catch (error) {
      if (replyReservation?.kind === 'inbound') {
        await prisma.inboundEmail.updateMany({
          where: { id: replyReservation.id, userId: senderAccount.id },
          data: { repliedAt: null },
        });
      } else if (replyReservation?.kind === 'stored') {
        await prisma.mailMessage.updateMany({
          where: { id: replyReservation.id, userId: senderAccount.id },
          data: { repliedAt: null },
        });
      } else if (replyReservation?.kind === 'memory') {
        replyReservation.message.replied = false;
      }
      throw error;
    }
    if (delivery.externalRecipients > 0) {
      const externalRecipients = recipients.filter((recipient) => !recipient.endsWith('@phonemail.com'));
      addMessage({
        from: sender,
        to: externalRecipients,
        subject,
        body,
        isReply: Boolean(replyTargetId),
        inReplyToId: replyTargetId || undefined,
        replyToId: replyTargetId || undefined,
        quotedText: replyOriginal?.body,
        replied: false,
        attachments: files.map((file, index) => ({
          id: `external-${Date.now()}-${index}`,
          name: file.originalname,
          size: file.size,
        })),
      });
    }
    const message = {
      id: replyTargetId && delivery.senderMessage
        ? `local-${delivery.senderMessage.id}`
        : `delivery-${Date.now()}`,
      from: sender,
      fromPhone: sender,
      to: recipients,
      subject,
      body,
      createdAt: new Date().toISOString(),
      read: false,
      direction: 'out' as const,
      mailbox: 'sent' as const,
      conversationId: recipients.length === 1 && recipients[0].endsWith('@phonemail.com')
        ? `conversation-${participantKey(recipients[0])}`
        : undefined,
      isReply: Boolean(replyTargetId),
      inReplyToId: replyTargetId || undefined,
      quotedText: replyOriginal?.body,
      replied: false,
      attachments: files.length > 0
        ? (delivery.attachments.length > 0
          ? delivery.attachments.map((attachment) => ({
            id: attachment.id,
            name: attachment.filename,
            size: attachment.size,
            mimeType: attachment.mimeType,
            url: `/api/attachments/${encodeURIComponent(attachment.id)}`,
          }))
          : files.map((file, index) => ({
            id: `external-${Date.now()}-${index}`,
            name: file.originalname,
            size: file.size,
          })))
        : [],
    };
    return res.status(201).json({ message, delivery });
  } catch (error) {
    if (
      error instanceof UnknownPhoneMailRecipientError ||
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

router.get('/attachments/:id', async (req, res, next) => {
  try {
    const groupAttachment = await prisma.groupChatAttachment.findFirst({
      where: {
        id: req.params.id,
        message: { groupChat: { members: { some: { userId: res.locals.authenticatedUser.id } } } },
      },
      select: { filename: true, mimeType: true, content: true },
    });
    if (groupAttachment) {
      res.type(groupAttachment.mimeType || 'application/octet-stream');
      res.attachment(groupAttachment.filename);
      return res.send(Buffer.from(groupAttachment.content));
    }
    const attachment = await prisma.mailAttachment.findFirst({
      where: {
        id: req.params.id,
        mailMessage: { userId: res.locals.authenticatedUser.id },
      },
      select: { filename: true, mimeType: true, content: true },
    });
    if (!attachment) return res.status(404).json({ message: 'Attachment not found.' });
    res.type(attachment.mimeType || 'application/octet-stream');
    res.attachment(attachment.filename);
    return res.send(Buffer.from(attachment.content));
  } catch (error) {
    return next(error);
  }
});

router.get('/drafts', (req, res, next) => {
  void prisma.mailDraft.findMany({
    where: { userId: res.locals.authenticatedUser.id },
    orderBy: { updatedAt: 'desc' },
    include: { attachments: { select: { id: true, filename: true, mimeType: true, size: true } } },
  }).then((drafts) => res.json({
    drafts: drafts.map(({ attachments, ...draft }) => ({
      ...draft,
      attachments: attachments.map(({ id, filename, mimeType, size }) => ({ id, name: filename, mimeType, size })),
    })),
  })).catch(next);
});

router.get('/drafts/:id/attachments/:attachmentId', async (req, res, next) => {
  try {
    const attachment = await prisma.mailDraftAttachment.findFirst({
      where: {
        id: req.params.attachmentId,
        draftId: req.params.id,
        draft: { userId: res.locals.authenticatedUser.id },
      },
      select: { filename: true, mimeType: true, content: true },
    });
    if (!attachment) return res.status(404).json({ message: 'Draft attachment not found.' });
    res.type(attachment.mimeType || 'application/octet-stream');
    res.attachment(attachment.filename);
    return res.send(Buffer.from(attachment.content));
  } catch (error) {
    return next(error);
  }
});

router.post('/drafts', parseAttachments, async (req, res, next) => {
  try {
    const { id, recipients, subject, body } = req.body ?? {};
    let parsedRecipients = recipients;
    if (typeof parsedRecipients === 'string') {
      try {
        parsedRecipients = JSON.parse(parsedRecipients);
      } catch {
        return res.status(400).json({ message: 'Recipients must be a list of addresses.' });
      }
    }
    if (!Array.isArray(parsedRecipients) || !parsedRecipients.every((item: unknown) => typeof item === 'string')) {
      return res.status(400).json({ message: 'Recipients must be a list of addresses.' });
    }
    const safeRecipients = parsedRecipients.map((item: string) => item.trim()).filter(Boolean);
    const values = {
      recipients: safeRecipients,
      subject: typeof subject === 'string' ? subject.slice(0, 200) : '',
      body: typeof body === 'string' ? body : '',
    };
    const files = Array.isArray(req.files) ? req.files : [];
    const userId = res.locals.authenticatedUser.id;
    const draftId = await prisma.$transaction(async (transaction) => {
      let savedDraft;
      if (typeof id === 'string') {
        const existing = await transaction.mailDraft.findFirst({ where: { id, userId } });
        if (!existing) return undefined;
        savedDraft = await transaction.mailDraft.update({ where: { id }, data: values });
        await transaction.mailDraftAttachment.deleteMany({ where: { draftId: id } });
      } else {
        savedDraft = await transaction.mailDraft.create({ data: { ...values, userId } });
      }
      if (files.length) {
        await transaction.mailDraftAttachment.createMany({
          data: files.map((file) => ({
            draftId: savedDraft.id,
            filename: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            content: new Uint8Array(file.buffer),
          })),
        });
      }
      return savedDraft.id;
    });
    if (!draftId) return res.status(404).json({ message: 'Draft not found.' });
    const draft = await prisma.mailDraft.findFirst({
      where: { id: draftId, userId },
      include: { attachments: { select: { id: true, filename: true, mimeType: true, size: true } } },
    });
    if (!draft) return res.status(404).json({ message: 'Draft not found.' });
    const { attachments, ...draftFields } = draft;
    return res.status(200).json({
      draft: {
        ...draftFields,
        attachments: attachments.map(({ id: attachmentId, filename, mimeType, size }) => ({
          id: attachmentId,
          name: filename,
          mimeType,
          size,
        })),
      },
    });
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

router.patch('/conversations/:id/actions', async (req, res, next) => {
  const action = req.body?.action;
  if (!['delete', 'markRead', 'markUnread', 'spam'].includes(action)) {
    return res.status(400).json({ message: 'Unsupported conversation action.' });
  }
  const conversationId = req.params.id;
  const user = res.locals.authenticatedUser;
  try {
    if (conversationId.startsWith(GROUP_CONVERSATION_PREFIX)) {
      if (memoryStoreEnabled) return res.status(503).json({ message: 'Group conversations require persistent storage.' });
      if (action === 'spam') return res.status(400).json({ message: 'Moving group conversations to spam is not supported.' });
      const groupId = conversationId.slice(GROUP_CONVERSATION_PREFIX.length);
      const membership = await prisma.groupChatMember.findFirst({
        where: { groupChatId: groupId, userId: user.id },
        select: { id: true },
      });
      if (!membership) return res.status(404).json({ message: 'Group conversation not found.' });
      if (action === 'delete') {
        const groupMessages = await prisma.groupChatMessage.findMany({
          where: { groupChatId: groupId },
          select: { id: true },
        });
        await prisma.groupChatMessageDeletion.createMany({
          data: groupMessages.map(({ id }) => ({ messageId: id, userId: user.id })),
          skipDuplicates: true,
        });
      } else {
        await prisma.groupChatMember.update({
          where: { id: membership.id },
          data: { lastReadAt: action === 'markRead' ? new Date() : null },
        });
      }
      return res.json({ success: true });
    }

    const peer = participantKey(conversationId.replace(/^conversation-/, ''));
    const peerAddresses = peer.endsWith('@phonemail.com') || !peer.includes('@')
      ? [peer, `${peer.replace(/@phonemail\.com$/, '')}@phonemail.com`]
      : [peer];
    if (!memoryStoreEnabled) {
      if (action === 'delete' || action === 'spam') {
        const mailbox = action === 'delete' ? 'trash' : 'spam';
        await Promise.all([
          prisma.inboundEmail.updateMany({ where: { userId: user.id, fromAddress: { in: peerAddresses } }, data: { mailbox } }),
          prisma.mailMessage.updateMany({ where: { userId: user.id, peerAddress: { in: peerAddresses } }, data: { mailbox } }),
        ]);
      } else {
        const isRead = action === 'markRead';
        await Promise.all([
          prisma.inboundEmail.updateMany({ where: { userId: user.id, fromAddress: { in: peerAddresses } }, data: { isRead } }),
          prisma.mailMessage.updateMany({ where: { userId: user.id, peerAddress: { in: peerAddresses }, direction: 'in' }, data: { isRead } }),
        ]);
      }
    }
    for (const message of messages) {
      if (!isMessageForUser(message, user.phoneNumber, user.email) || peerForMessage(message, user.phoneNumber) !== peer) continue;
      if (action === 'delete') message.mailbox = 'trash';
      else if (action === 'spam') message.mailbox = 'spam';
      else if (message.from !== user.phoneNumber) message.read = action === 'markRead';
    }
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

router.patch('/messages/:id', async (req, res, next) => {
  const id = req.params.id;
  const action = String(req.body?.action ?? '');
  if (!['star', 'spam', 'trash', 'restore', 'delete', 'markRead'].includes(action)) {
    return res.status(400).json({ message: 'Unsupported message action.' });
  }
  const user = res.locals.authenticatedUser;
  try {
    if (id.startsWith(GROUP_MESSAGE_PREFIX) && !memoryStoreEnabled) {
      const groupMessageIdValue = id.slice(GROUP_MESSAGE_PREFIX.length);
      const groupMessage = await prisma.groupChatMessage.findFirst({
        where: {
          id: groupMessageIdValue,
          groupChat: { members: { some: { userId: user.id } } },
        },
        include: {
          sender: { select: { phoneNumber: true, name: true } },
          attachments: { select: { id: true, filename: true, size: true } },
        },
      });
      if (!groupMessage) return res.status(404).json({ message: 'Group message not found.' });
      if (action === 'spam' || action === 'trash' || action === 'restore') {
        return res.status(400).json({ message: 'This action is not available for group messages.' });
      }
      if (action === 'delete') {
        await prisma.groupChatMessageDeletion.upsert({
          where: { messageId_userId: { messageId: groupMessage.id, userId: user.id } },
          create: { messageId: groupMessage.id, userId: user.id },
          update: { deletedAt: new Date() },
        });
        return res.json({ message: groupMessageView(groupMessage, user.phoneNumber) });
      }
      if (action === 'star') {
        const updated = await prisma.groupChatMessage.update({
          where: { id: groupMessage.id },
          data: { isStarred: !groupMessage.isStarred },
          include: {
            sender: { select: { phoneNumber: true, name: true } },
            attachments: { select: { id: true, filename: true, size: true } },
          },
        });
        return res.json({ message: groupMessageView(updated, user.phoneNumber) });
      }
      await prisma.groupChatMember.updateMany({
        where: { groupChatId: groupMessage.groupChatId, userId: user.id },
        data: { lastReadAt: new Date() },
      });
      return res.json({ message: groupMessageView(groupMessage, user.phoneNumber) });
    }
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
  const user = res.locals.authenticatedUser;
  const userPhone = user.phoneNumber;
  const userId = user.id;
  if (req.params.id.startsWith(GROUP_CONVERSATION_PREFIX) && !memoryStoreEnabled) {
    const groupId = req.params.id.slice(GROUP_CONVERSATION_PREFIX.length);
    try {
      const membership = await prisma.groupChatMember.findFirst({
        where: { groupChatId: groupId, userId },
      });
      if (!membership) return res.status(404).json({ message: 'Group conversation not found.' });
      const group = await prisma.groupChat.findUnique({ where: { id: groupId } });
      if (!group) return res.status(404).json({ message: 'Group conversation not found.' });
      if (req.body?.participants !== undefined) {
        return res.status(400).json({ message: 'Group participants cannot be changed.' });
      }
      const updates: { name?: string; description?: string; avatarUrl?: string } = {};
      if (req.body?.title !== undefined) {
        if (typeof req.body.title !== 'string') return res.status(400).json({ message: 'Group name must be text.' });
        updates.name = req.body.title.trim().slice(0, 100);
      }
      if (req.body?.description !== undefined) {
        if (typeof req.body.description !== 'string') return res.status(400).json({ message: 'Group description must be text.' });
        updates.description = req.body.description.trim().slice(0, 500);
      }
      if (req.body?.avatarUrl !== undefined) {
        if (typeof req.body.avatarUrl !== 'string' ||
          (req.body.avatarUrl !== '' && !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(req.body.avatarUrl)) ||
          Buffer.byteLength(req.body.avatarUrl, 'utf8') > 2_800_000) {
          return res.status(400).json({ message: 'Group photo must be a PNG, JPEG, WebP, or GIF image up to 2 MB.' });
        }
        updates.avatarUrl = req.body.avatarUrl;
      }
      await prisma.groupChat.update({ where: { id: groupId }, data: updates });
      if (typeof req.body?.isFavourite === 'boolean') {
        await prisma.groupChatMember.update({
          where: { id: membership.id },
          data: { isFavourite: req.body.isFavourite },
        });
      }
      return res.json({ conversation: { id: req.params.id, ...req.body } });
    } catch (error) {
      return next(error);
    }
  }
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
