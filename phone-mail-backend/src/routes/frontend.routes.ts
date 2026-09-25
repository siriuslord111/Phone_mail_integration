import { Router } from 'express';

import { addMessage, messages, normalizePhone, users, ensureUser } from '../store';
import { otpStore } from '../store';
import { TwilioService } from '../services/twilio.service';

const router = Router();

function toUser(user: ReturnType<typeof ensureUser>) {
  return {
    id: user.id,
    phone: user.phoneNumber.replace(/^\+1/, ''),
    name: '',
    avatarUrl: undefined,
    bio: undefined,
  };
}

function findUser(phone: string) {
  return users.find((user) => user.phoneNumber === normalizePhone(phone));
}

router.post('/auth/send-otp', async (req, res) => {
  const phone = normalizePhone(String(req.body?.phone ?? req.body?.phoneNumber ?? ''));
  if (!phone) return res.status(400).json({ message: 'Phone number is required.' });
  const otp = TwilioService.generateOTP();
  otpStore.set(phone, otp);
  const sent = await TwilioService.sendOTP(phone, otp);
  return res.json({ success: true, isDemo: !sent, otp: sent ? undefined : otp });
});

router.post('/auth/verify-otp', (req, res) => {
  const phone = normalizePhone(String(req.body?.phone ?? req.body?.phoneNumber ?? ''));
  const otp = String(req.body?.otp ?? '');
  if (otpStore.get(phone) !== otp) return res.status(401).json({ message: 'Invalid OTP.' });
  const user = ensureUser(phone, undefined, true);
  return res.json({ token: `phonemail-${user.id}`, user: toUser(user), isNewUser: true });
});

router.post('/auth/login-password', (req, res) => {
  const phone = normalizePhone(String(req.body?.phone ?? ''));
  const user = findUser(phone);
  if (!user || user.password !== String(req.body?.password ?? '')) {
    return res.status(401).json({ message: 'Invalid phone number or password.' });
  }
  return res.json({ token: `phonemail-${user.id}`, user: toUser(user), isNewUser: false });
});

router.get('/users/me', (req, res) => {
  const phone = String(req.headers['x-phone'] ?? req.query.phone ?? '');
  const user = findUser(phone) ?? users[0];
  if (!user) return res.status(401).json({ message: 'User session not found.' });
  return res.json({ user: toUser(user) });
});

router.patch('/users/me', (req, res) => {
  const user = users[0];
  if (!user) return res.status(401).json({ message: 'User session not found.' });
  return res.json({ user: { ...toUser(user), name: String(req.body?.name ?? ''), bio: req.body?.bio } });
});

router.get('/conversations', (req, res) => {
  const query = String(req.query.q ?? '').toLowerCase();
  const grouped = new Map<string, typeof messages>();
  for (const message of messages) {
    const peer = message.from === users[0]?.phoneNumber ? message.to[0] : message.from;
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
  const result = messages.filter((message) => message.from === normalized || message.to.includes(normalized));
  return res.json({ messages: result.map((message) => ({ ...message, fromPhone: message.from, direction: 'in' as const })) });
});

router.post('/messages', (req, res) => {
  const recipients = Array.isArray(req.body?.to) ? req.body.to : [req.body?.to];
  const message = addMessage({
    from: users[0]?.phoneNumber ?? normalizePhone(String(req.headers['x-phone'] ?? '')),
    to: recipients.map((value: string) => normalizePhone(value)),
    subject: String(req.body?.subject ?? 'New message'),
    body: String(req.body?.body ?? ''),
  });
  return res.status(201).json({ message });
});

router.patch('/messages/:id', (req, res) => {
  const message = messages.find((entry) => entry.id === req.params.id);
  if (!message) return res.status(404).json({ message: 'Message not found.' });
  const action = String(req.body?.action ?? '');
  if (action === 'markRead') message.read = true;
  return res.json({ message });
});

router.patch('/conversations/:id', (req, res) => {
  return res.json({
    conversation: {
      id: req.params.id,
      ...req.body,
    },
  });
});

export default router;
