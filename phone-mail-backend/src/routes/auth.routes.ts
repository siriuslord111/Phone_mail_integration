import { Router, Request, Response } from 'express';

import { normalizePhone, otpStore, users, ensureUser } from '../store';
import { TwilioService } from '../services/twilio.service';

const router = Router();

router.post('/send-otp', async (req: Request, res: Response) => {
  const { phoneNumber, phone } = req.body ?? {};
  const normalized = normalizePhone(String(phoneNumber ?? phone ?? ''));

  if (!normalized) {
    return res.status(400).json({ success: false, message: 'Phone number is required.' });
  }

  const otp = TwilioService.generateOTP();
  otpStore.set(normalized, otp);

  const sent = await TwilioService.sendOTP(normalized, otp);

  return res.json({
    success: true,
    isDemo: !sent,
    otp: sent ? undefined : otp,
    message: sent ? 'OTP sent successfully.' : 'OTP generated in demo mode (for testing).',
  });
});

router.post('/register', async (req: Request, res: Response) => {
  const { phoneNumber, phone, password, client } = req.body ?? {};
  const normalized = normalizePhone(String(phoneNumber ?? phone ?? ''));

  if (!normalized) {
    return res.status(400).json({ success: false, message: 'Phone number is required.' });
  }

  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
  }

  if (users.some((entry) => entry.phoneNumber === normalized)) {
    return res.status(409).json({ success: false, message: 'An account already exists for this phone number.' });
  }

  const user = ensureUser(normalized, password, client === 'mobile');

  const payload = {
    success: true,
    token: `phonemail-${user.id}`,
    isNewUser: true,
    user: {
      id: user.id,
      phone: user.phoneNumber.replace(/^\+1/, ''),
      name: '',
      phoneNumber: user.phoneNumber,
      email: user.email,
      hasMobileApp: user.hasMobileApp,
    },
    message: 'Account created successfully.',
  };

  return res.status(201).json(payload);
});

router.post('/login', (req: Request, res: Response) => {
  const { phoneNumber, phone, password } = req.body ?? {};
  const normalized = normalizePhone(String(phoneNumber ?? phone ?? ''));

  if (!normalized) {
    return res.status(400).json({ success: false, message: 'Phone number is required.' });
  }

  const user = users.find((entry) => entry.phoneNumber === normalized);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found. Create an account first.' });
  }

  if (typeof password !== 'string' || user.password !== password) {
    return res.status(401).json({ success: false, message: 'Invalid phone number or password.' });
  }

  return res.json({
    success: true,
    message: 'Login successful.',
    token: `phonemail-${user.id}`,
    isNewUser: false,
    user: {
      id: user.id,
      phone: user.phoneNumber.replace(/^\+1/, ''),
      name: '',
      phoneNumber: user.phoneNumber,
      email: user.email,
      hasMobileApp: user.hasMobileApp,
    },
  });
});

router.post('/ivr/incoming', (req: Request, res: Response) => {
  const twiml = TwilioService.generateIVRMenu();
  res.type('text/xml');
  return res.send(twiml);
});

router.post('/ivr/process', (req: Request, res: Response) => {
  const { Digits, From } = req.body ?? {};
  const twiml = TwilioService.handleIVRInput(String(Digits ?? ''), String(From ?? 'unknown'));
  res.type('text/xml');
  return res.send(twiml);
});

export default router;
