import { Router } from 'express';

import { addMessage, messages, normalizePhone } from '../store';
import { requireAuth } from '../middlewares/auth';
import { sendOutboundEmail } from '../services/email.service';
import { normalizeRecipients } from '../services/email-recipient';
import multer from 'multer';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
});
const parseAttachments = upload.array('attachments', 5);
router.use(requireAuth);

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

router.patch('/users/me', (req, res) => {
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

router.get('/conversations', (req, res) => {
  const query = String(req.query.q ?? '').toLowerCase();
  const userPhone = res.locals.authenticatedUser.phoneNumber;
  const grouped = new Map<string, typeof messages>();
  for (const message of messages.filter((entry) => entry.from === userPhone || entry.to.includes(userPhone))) {
    const peer = message.from === userPhone ? message.to[0] : message.from;
    const list = grouped.get(peer) ?? [];
    list.push(message);
    grouped.set(peer, list);
  }
  const conversations = [...grouped.entries()]
    .filter(([peer, list]) => !query || peer.includes(query) || list.some((message) => `${message.subject} ${message.body}`.toLowerCase().includes(query)))
    .map(([peer, list]) => {
      const last = list[0];
      return {
        id: `conversation-${peer}`,
        title: peer,
        isGroup: false,
        participants: [{ phone: peer, name: peer }],
        lastMessage: { preview: last.body, subject: last.subject, createdAt: last.createdAt, hasAttachment: false, direction: 'in' as const },
        unreadCount: list.filter((message) => !message.read).length,
        isFavourite: false,
        hasAttachments: false,
      };
    });
  return res.json({ conversations });
});

router.get('/conversations/:id/messages', (req, res) => {
  const peer = req.params.id.replace(/^conversation-/, '');
  const normalized = normalizePhone(peer);
  const userPhone = res.locals.authenticatedUser.phoneNumber;
  const result = messages.filter((message) =>
    (message.from === userPhone || message.to.includes(userPhone)) &&
    (message.from === normalized || message.to.includes(normalized)),
  );
  return res.json({
    messages: result.map((message) => ({
      ...message,
      fromPhone: message.from,
      direction: message.from === userPhone ? 'out' as const : 'in' as const,
    })),
  });
});

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
    await sendOutboundEmail({
      from: sender,
      to: recipients,
      subject,
      body,
      attachments: files.map((file) => ({ filename: file.originalname, content: file.buffer })),
    });
  } catch (error) {
    console.error('SMTP delivery failed:', error);
    const message = error instanceof Error && error.message.startsWith('Email sending is not configured.')
      ? error.message
      : 'The email could not be sent. Check SMTP settings and the recipient address, then try again.';
    return res.status(message.startsWith('Email sending is not configured.') ? 503 : 502).json({ message });
  }

  const message = addMessage({
    from: sender,
    to: recipients,
    subject,
    body,
  });
  return res.status(201).json({ message, delivery: { delivered: true } });
});

router.patch('/messages/:id', (req, res) => {
  const message = messages.find((entry) => entry.id === req.params.id);
  if (!message) return res.status(404).json({ message: 'Message not found.' });
  const userPhone = res.locals.authenticatedUser.phoneNumber;
  if (message.from !== userPhone && !message.to.includes(userPhone)) {
    return res.status(404).json({ message: 'Message not found.' });
  }
  const action = String(req.body?.action ?? '');
  if (action === 'markRead') message.read = true;
  return res.json({ message });
});

router.patch('/conversations/:id', (req, res) => {
  const userPhone = res.locals.authenticatedUser.phoneNumber;
  const peer = normalizePhone(req.params.id.replace(/^conversation-/, ''));
  const belongsToUser = messages.some((message) =>
    (message.from === userPhone && message.to.includes(peer)) ||
    (message.from === peer && message.to.includes(userPhone)),
  );
  if (!belongsToUser) return res.status(404).json({ message: 'Conversation not found.' });
  return res.json({
    conversation: {
      id: req.params.id,
      ...req.body,
    },
  });
});

export default router;
