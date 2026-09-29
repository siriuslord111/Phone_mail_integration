import { Router } from 'express';

import { addMessage, messages, normalizePhone } from '../store';
import { normalizeRecipients } from '../services/email-recipient';
import { requireAuth } from '../middlewares/auth';
import { CannotSendToSelfError, deliverEmail, UnknownPhoneMailRecipientError } from '../services/email-delivery.service';

const router = Router();
router.use(requireAuth);

router.get('/inbox', (req, res) => {
  const normalized = res.locals.authenticatedUser.phoneNumber;

  const inbox = messages.filter((message) => message.to.includes(normalized));
  return res.json({ success: true, messages: inbox });
});

router.get('/conversation', (req, res) => {
  const phoneNumber = res.locals.authenticatedUser.phoneNumber;
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
  const { to, subject, body } = req.body ?? {};
  const sender = res.locals.authenticatedUser.phoneNumber;
  let recipients: string[];
  try {
    recipients = normalizeRecipients(to);
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Invalid recipient.',
    });
  }

  if (!sender || typeof body !== 'string') {
    return res.status(400).json({ success: false, message: 'Sender, recipient and message body are required.' });
  }

  const emailSubject = String(subject ?? '').trim();
  let delivery;
  try {
    delivery = await deliverEmail({
      sender: res.locals.authenticatedUser,
      recipients,
      subject: emailSubject,
      body: body.trim(),
    });
  } catch (error) {
    if (
      error instanceof UnknownPhoneMailRecipientError ||
      error instanceof CannotSendToSelfError
    ) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error('SMTP delivery failed:', error);
    return res.status(502).json({
      success: false,
      message: error instanceof Error && error.message.startsWith('Email sending is not configured.')
        ? error.message
        : 'The email could not be sent. Check SMTP settings and the recipient address, then try again.',
    });
  }

  if (delivery.externalRecipients > 0) {
    const externalRecipients = recipients.filter((recipient) => !recipient.endsWith('@phonemail.com'));
    addMessage({ from: sender, to: externalRecipients, subject: emailSubject, body: body.trim() });
  }
  const saved = {
    id: `delivery-${Date.now()}`,
    from: sender,
    to: recipients,
    subject: emailSubject,
    body: body.trim(),
    createdAt: new Date().toISOString(),
    read: false,
  };
  return res.status(201).json({ success: true, message: saved, delivery });
});

router.get('/search', (req, res) => {
  const query = String(req.query.q ?? '').toLowerCase();
  const phone = res.locals.authenticatedUser.phoneNumber;
  const results = messages.filter((message) => {
    if (message.from !== phone && !message.to.includes(phone)) return false;
    const haystack = `${message.from} ${message.subject} ${message.body}`.toLowerCase();
    return haystack.includes(query);
  });

  return res.json({ success: true, results });
});

export default router;
