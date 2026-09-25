import { Router } from 'express';

import { addMessage, messages, normalizePhone, users } from '../store';
import { TwilioService } from '../services/twilio.service';
import { sendOutboundEmail } from '../services/email.service';

const router = Router();

router.get('/inbox', (req, res) => {
  const phoneNumber = String(req.query.phoneNumber ?? '');
  const normalized = normalizePhone(phoneNumber);

  const inbox = messages.filter((message) => message.to.includes(normalized));
  return res.json({ success: true, messages: inbox });
});

router.get('/conversation', (req, res) => {
  const phoneNumber = String(req.query.phoneNumber ?? '');
  const peer = String(req.query.peer ?? '');
  const normalized = normalizePhone(phoneNumber);
  const peerNormalized = normalizePhone(peer);

  const conversation = messages.filter((message) => {
    const isFromPeer = message.from === peerNormalized;
    const isToPeer = message.to.includes(peerNormalized);
    const isForUser = message.to.includes(normalized) || message.from === normalized;
    return isForUser && (isFromPeer || isToPeer);
  });

  return res.json({ success: true, conversation });
});

router.post('/send', async (req, res) => {
  const { from, to, subject, body } = req.body ?? {};
  const sender = normalizePhone(String(from ?? ''));
  const rawRecipients = Array.isArray(to) ? to.map((value) => String(value)) : [String(to ?? '')];
  const recipients = rawRecipients
    .filter((value) => value.trim().length > 0)
    .map((value) => normalizePhone(value));

  if (!sender || !recipients.length || !body) {
    return res.status(400).json({ success: false, message: 'Sender, recipient and body are required.' });
  }

  const saved = addMessage({
    from: sender,
    to: rawRecipients,
    subject: String(subject ?? 'New message'),
    body: String(body),
  });

  let delivery;
  try {
    delivery = await sendOutboundEmail({
      from: sender,
      to: recipients,
      subject: saved.subject,
      body: saved.body,
    });
  } catch (error) {
    console.error('SMTP delivery failed:', error);
    return res.status(502).json({
      success: false,
      message: 'The message was saved, but SMTP delivery failed. Check SMTP host, port, and credentials.',
      storedMessageId: saved.id,
    });
  }

  for (const recipient of recipients) {
    const user = users.find((entry) => entry.phoneNumber === recipient);
    if (user && !user.hasMobileApp) {
      await TwilioService.sendEmailNotificationSMS(recipient, sender, saved.subject);
    }
  }

  return res.status(201).json({ success: true, message: saved, delivery });
});

router.get('/search', (req, res) => {
  const query = String(req.query.q ?? '').toLowerCase();
  const results = messages.filter((message) => {
    const haystack = `${message.from} ${message.subject} ${message.body}`.toLowerCase();
    return haystack.includes(query);
  });

  return res.json({ success: true, results });
});

export default router;
