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
  const { phoneNumber, otp, password, client } = req.body ?? {};
  const normalized = normalizePhone(String(phoneNumber ?? ''));

  if (!normalized) {
    return res.status(400).json({ success: false, message: 'Phone number is required.' });
  }

  if (!otp && !password) {
    return res.status(400).json({ success: false, message: 'Provide OTP or password.' });
  }

  const storedOtp = otpStore.get(normalized);
  if (otp && storedOtp && otp !== storedOtp) {
    return res.status(400).json({ success: false, message: 'Invalid OTP.' });
  }

  const user = ensureUser(normalized, password, client === 'mobile');

  if (!user.password && !password) {
    user.password = 'phonemail';
  }

  if (!otp && !password) {
    return res.status(400).json({ success: false, message: 'Registration requires OTP or password.' });
  }

  const payload = {
    success: true,
    user: {
      id: user.id,
      phoneNumber: user.phoneNumber,
      email: user.email,
      hasMobileApp: user.hasMobileApp,
    },
    message: 'Account created successfully.',
  };

  return res.status(201).json(payload);
});

router.post('/login', (req: Request, res: Response) => {
  const { phoneNumber, otp, password } = req.body ?? {};
  const normalized = normalizePhone(String(phoneNumber ?? ''));

  if (!normalized) {
    return res.status(400).json({ success: false, message: 'Phone number is required.' });
  }

  const user = users.find((entry) => entry.phoneNumber === normalized);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found. Create an account first.' });
  }

  if (otp) {
    const expectedOtp = otpStore.get(normalized);
    if (!expectedOtp || expectedOtp !== String(otp)) {
      return res.status(401).json({ success: false, message: 'OTP mismatch.' });
    }
  } else if (password) {
    if (user.password !== String(password)) {
      return res.status(401).json({ success: false, message: 'Invalid password.' });
    }
  } else {
    return res.status(400).json({ success: false, message: 'Provide otp or password.' });
  }

  return res.json({
    success: true,
    message: 'Login successful.',
    user: {
      id: user.id,
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
