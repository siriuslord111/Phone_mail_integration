import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { Router, type Request, type Response } from 'express';

import { env } from '../config/env';
import { loginRateLimit, otpSendRateLimit } from '../middlewares/login-rate-limit';
import { ensureUser, normalizePhone, otpStore, users } from '../store';
import { OtpProviderError, sendOtp } from '../services/otp.service';
import { hashPassword, verifyPassword } from '../services/password.service';
import { createSessionToken } from '../services/session.service';
import { TwilioService } from '../services/twilio.service';

const router = Router();
const OTP_LIFETIME_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

function validPhone(phone: string) {
  return /^\+\d{8,15}$/.test(phone);
}

function toUser(user: ReturnType<typeof ensureUser>) {
  return {
    id: user.id,
    phone: user.phoneNumber.replace(/^\+91/, ''),
    name: user.name ?? '',
    bio: user.bio ?? '',
    phoneNumber: user.phoneNumber,
    email: user.email,
    hasMobileApp: user.hasMobileApp,
  };
}

function issueSession(res: Response, user: ReturnType<typeof ensureUser>, isNewUser: boolean) {
  return res.json({
    success: true,
    token: createSessionToken(user.id, user.phoneNumber),
    isNewUser,
    user: toUser(user),
  });
}

function otpHash(phone: string, otp: string) {
  return createHmac('sha256', env.authTokenSecret).update(`${phone}:${otp}`).digest();
}

function otpMatches(phone: string, otp: string, expectedHash: string) {
  const actual = otpHash(phone, otp);
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function validateCredentials(phoneInput: unknown, res: Response) {
  const phone = normalizePhone(String(phoneInput ?? ''));
  if (!validPhone(phone)) {
    res.status(400).json({ success: false, message: 'Enter a valid phone number including country code.' });
    return null;
  }
  return phone;
}

router.post('/send-otp', otpSendRateLimit, async (req: Request, res: Response) => {
  const phone = validateCredentials(req.body?.phoneNumber ?? req.body?.phone, res);
  if (!phone) return;

  const purpose = req.body?.purpose === 'register' ? 'register' : 'login';
  const otp = String(randomInt(100_000, 1_000_000));
  try {
    await sendOtp(phone, otp);
  } catch (error) {
    const message = error instanceof OtpProviderError
      ? error.message
      : 'OTP delivery failed. Use password sign-up or try again later.';
    if (!(error instanceof OtpProviderError)) console.error('OTP delivery failed:', error);
    return res.status(503).json({ success: false, message, passwordFallbackAvailable: true });
  }

  otpStore.set(phone, {
    hash: otpHash(phone, otp).toString('hex'),
    expiresAt: Date.now() + OTP_LIFETIME_MS,
    attempts: 0,
    purpose,
  });
  return res.json({ success: true, message: 'OTP sent successfully.' });
});

async function registerWithPassword(req: Request, res: Response) {
  const phone = validateCredentials(req.body?.phoneNumber ?? req.body?.phone, res);
  if (!phone) return;

  const password = req.body?.password;
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return res.status(400).json({
      success: false,
      message: `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`,
    });
  }
  if (users.some((user) => user.phoneNumber === phone)) {
    return res.status(409).json({ success: false, message: 'An account already exists for this phone number.' });
  }

  const passwordHash = await hashPassword(password);
  if (users.some((user) => user.phoneNumber === phone)) {
    return res.status(409).json({ success: false, message: 'An account already exists for this phone number.' });
  }
  const user = ensureUser(phone, passwordHash, req.body?.client === 'mobile');
  return res.status(201).json({
    success: true,
    token: createSessionToken(user.id, user.phoneNumber),
    isNewUser: true,
    user: toUser(user),
    message: 'Account created successfully.',
  });
}

router.post('/register', loginRateLimit, (req: Request, res: Response, next) => {
  void registerWithPassword(req, res).catch(next);
});
router.post('/login', loginRateLimit, (req: Request, res: Response) => passwordLogin(req, res));
router.post('/login-password', loginRateLimit, (req: Request, res: Response) => passwordLogin(req, res));

async function passwordLogin(req: Request, res: Response) {
  const phone = validateCredentials(req.body?.phoneNumber ?? req.body?.phone, res);
  if (!phone) return;

  const user = users.find((entry) => entry.phoneNumber === phone);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const passwordMatches = password.length <= PASSWORD_MAX_LENGTH
    && await verifyPassword(password, user?.passwordHash);
  if (!user || !passwordMatches) {
    return res.status(401).json({ success: false, message: 'Invalid phone number or password.' });
  }
  return issueSession(res, user, false);
}

function verifyChallenge(phone: string, suppliedOtp: unknown, purpose: 'login' | 'register', res: Response) {
  const challenge = otpStore.get(phone);
  if (!challenge || challenge.expiresAt <= Date.now()) {
    otpStore.delete(phone);
    res.status(401).json({ success: false, message: 'OTP is missing or expired. Request a new code.' });
    return false;
  }
  if (challenge.purpose !== purpose) {
    res.status(400).json({ success: false, message: 'Request a new OTP for this action.' });
    return false;
  }

  challenge.attempts += 1;
  if (typeof suppliedOtp !== 'string' || !otpMatches(phone, suppliedOtp, challenge.hash)) {
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) otpStore.delete(phone);
    res.status(401).json({
      success: false,
      message: challenge.attempts >= OTP_MAX_ATTEMPTS
        ? 'Too many incorrect OTP attempts. Request a new code.'
        : 'Invalid OTP.',
    });
    return false;
  }

  otpStore.delete(phone);
  return true;
}

router.post('/verify-otp', loginRateLimit, (req: Request, res: Response) => {
  const phone = validateCredentials(req.body?.phoneNumber ?? req.body?.phone, res);
  if (!phone || !verifyChallenge(phone, req.body?.otp, 'login', res)) return;

  const user = users.find((entry) => entry.phoneNumber === phone);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'No account exists for this number. Choose sign-up to create one.',
    });
  }
  return issueSession(res, user, false);
});

router.post('/register-otp', loginRateLimit, (req: Request, res: Response) => {
  const phone = validateCredentials(req.body?.phoneNumber ?? req.body?.phone, res);
  if (!phone || !verifyChallenge(phone, req.body?.otp, 'register', res)) return;
  if (users.some((entry) => entry.phoneNumber === phone)) {
    return res.status(409).json({ success: false, message: 'An account already exists for this phone number.' });
  }

  const user = ensureUser(phone, undefined, req.body?.client === 'mobile');
  return res.status(201).json({
    success: true,
    token: createSessionToken(user.id, user.phoneNumber),
    isNewUser: true,
    user: toUser(user),
    message: 'Account created successfully.',
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
