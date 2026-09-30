import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';

import { env } from '../config/env';
import { loginRateLimit, otpSendRateLimit } from '../middlewares/login-rate-limit';
import { requireAuth } from '../middlewares/auth';
import { normalizePhone, otpStore } from '../store';
import { AccountAlreadyExistsError, createAccount, findAccountByPhone, updateAccountPassword } from '../services/account.service';
import { OtpProviderError, sendOtp } from '../services/otp.service';
import { hashPassword, verifyPassword } from '../services/password.service';
import { createSessionToken } from '../services/session.service';
import { TwilioService } from '../services/twilio.service';
import type { User } from '../store';

const router = Router();
const OTP_LIFETIME_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const IVR_OTP_COOLDOWN_MS = 15 * 60 * 1000;
const ivrOtpRequests = new Map<string, number>();

function validPhone(phone: string) {
  return /^\+\d{8,15}$/.test(phone);
}

function toUser(user: User) {
  return {
    id: user.id,
    phone: user.phoneNumber.replace(/^\+91/, ''),
    name: user.name ?? '',
    bio: user.bio ?? '',
    avatarUrl: user.avatarUrl ?? '',
    phoneNumber: user.phoneNumber,
    email: user.email,
    hasMobileApp: user.hasMobileApp,
  };
}

function issueSession(res: Response, user: User, isNewUser: boolean) {
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

type ChallengePurpose = 'login' | 'register' | 'ivr-register' | 'demo-ivr-register';

function challengeKey(phone: string, purpose: ChallengePurpose) {
  return `${purpose}:${phone}`;
}

function consumeChallenge(
  phone: string,
  suppliedOtp: unknown,
  purpose: ChallengePurpose,
): 'valid' | 'expired' | 'invalid' | 'locked' {
  const key = challengeKey(phone, purpose);
  const challenge = otpStore.get(key);
  if (!challenge || challenge.expiresAt <= Date.now()) {
    otpStore.delete(key);
    return 'expired';
  }

  challenge.attempts += 1;
  if (typeof suppliedOtp !== 'string' || !otpMatches(phone, suppliedOtp, challenge.hash)) {
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
      otpStore.delete(key);
      return 'locked';
    }
    return 'invalid';
  }

  otpStore.delete(key);
  return 'valid';
}

function twimlResponse(res: Response, status = 200) {
  res.status(status).type('text/xml');
}

function validTwilioWebhookBaseUrl() {
  try {
    const url = new URL(env.twilioWebhookBaseUrl);
    return url.protocol === 'https:'
      && Boolean(url.hostname)
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
      && url.pathname.replace(/\/+$/, '').endsWith('/api/auth');
  } catch {
    return false;
  }
}

function trialWebhookKeyMatches(req: Request) {
  const expectedKey = env.twilioTrialWebhookKey;
  const suppliedKey = req.query.trialKey;
  if (!env.twilioTrialMode || expectedKey.length < 32 || typeof suppliedKey !== 'string') return false;

  const expected = Buffer.from(expectedKey);
  const supplied = Buffer.from(suppliedKey);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function ivrWebhookUrl(path: string) {
  const url = TwilioService.webhookUrl(path);
  if (!env.twilioTrialMode || env.twilioTrialWebhookKey.length < 32) return url;
  return `${url}${path.includes('?') ? '&' : '?'}trialKey=${encodeURIComponent(env.twilioTrialWebhookKey)}`;
}

function twilioWebhook(req: Request, res: Response, next: NextFunction) {
  if (!validTwilioWebhookBaseUrl()) {
    twimlResponse(res, 503);
    return res.send(TwilioService.sayIvrMessage('otpUnavailable'));
  }

  const signature = req.header('x-twilio-signature') ?? '';
  const requestPath = req.originalUrl.startsWith(req.baseUrl)
    ? req.originalUrl.slice(req.baseUrl.length)
    : req.path;
  const expectedUrl = `${env.twilioWebhookBaseUrl}${requestPath}`;
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).send('Invalid Twilio webhook payload.');
  }
  const params = req.body as Record<string, string>;
  const trialKeyValid = !signature && trialWebhookKeyMatches(req);
  if (!env.twilioAuthToken && !trialKeyValid
    && (!env.twilioTrialMode || env.twilioTrialWebhookKey.length < 32)) {
    twimlResponse(res, 503);
    return res.send(TwilioService.sayIvrMessage('otpUnavailable'));
  }

  const signatureValid = Boolean(env.twilioAuthToken)
    && TwilioService.isWebhookSignatureValid(expectedUrl, signature, params);
  if (!signatureValid && !trialKeyValid) {
    console.warn('Twilio webhook signature validation failed.', {
      signaturePresent: Boolean(signature),
      trialKeyPresent: typeof req.query.trialKey === 'string',
      requestHost: req.get('host'),
      requestPath: req.path,
      configuredWebhookHost: new URL(env.twilioWebhookBaseUrl).host,
    });
    return res.status(403).send('Invalid Twilio webhook signature.');
  }
  return next();
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
  if (purpose === 'register' && await findAccountByPhone(phone)) {
    return res.status(409).json({
      success: false,
      message: 'An account already exists for this phone number. Log in instead.',
    });
  }
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

  otpStore.set(challengeKey(phone, purpose), {
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
  if (await findAccountByPhone(phone)) {
    return res.status(409).json({ success: false, message: 'An account already exists for this phone number. Log in instead.' });
  }
  if (!verifyChallenge(phone, req.body?.otp, 'register', res)) return;

  const passwordHash = await hashPassword(password);
  if (await findAccountByPhone(phone)) {
    return res.status(409).json({ success: false, message: 'An account already exists for this phone number. Log in instead.' });
  }
  let user: User;
  try {
    user = await createAccount(phone, passwordHash, req.body?.client === 'mobile');
  } catch (error) {
    if (error instanceof AccountAlreadyExistsError) {
      return res.status(409).json({ success: false, message: 'An account already exists for this phone number. Log in instead.' });
    }
    throw error;
  }
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
router.post('/login', loginRateLimit, (req: Request, res: Response, next) => {
  void passwordLogin(req, res).catch(next);
});
router.post('/login-password', loginRateLimit, (req: Request, res: Response, next) => {
  void passwordLogin(req, res).catch(next);
});

router.post('/change-password', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = req.body?.newPassword;
  if (typeof newPassword !== 'string' || newPassword.length < PASSWORD_MIN_LENGTH || newPassword.length > PASSWORD_MAX_LENGTH) {
    return res.status(400).json({
      success: false,
      message: `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`,
    });
  }

  const user = res.locals.authenticatedUser as User;
  try {
    if (user.passwordHash && !await verifyPassword(currentPassword, user.passwordHash)) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect. Try again.' });
    }
    await updateAccountPassword(user, await hashPassword(newPassword));
    return res.json({ success: true, message: 'Password updated successfully.' });
  } catch (error) {
    return next(error);
  }
});

async function passwordLogin(req: Request, res: Response) {
  const phone = validateCredentials(req.body?.phoneNumber ?? req.body?.phone, res);
  if (!phone) return;

  const user = await findAccountByPhone(phone);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const passwordMatches = password.length <= PASSWORD_MAX_LENGTH
    && await verifyPassword(password, user?.passwordHash);
  if (!user || !passwordMatches) {
    return res.status(401).json({ success: false, message: 'Invalid phone number or password.' });
  }
  return issueSession(res, user, false);
}

function verifyChallenge(
  phone: string,
  suppliedOtp: unknown,
  purpose: ChallengePurpose,
  res: Response,
) {
  const challenge = otpStore.get(challengeKey(phone, purpose));
  if (challenge && challenge.purpose !== purpose) {
    res.status(400).json({ success: false, message: 'Request a new OTP for this action.' });
    return false;
  }
  const result = consumeChallenge(phone, suppliedOtp, purpose);
  if (result === 'expired') {
    res.status(401).json({ success: false, message: 'OTP is missing or expired. Request a new code.' });
    return false;
  }
  if (result !== 'valid') {
    res.status(401).json({
      success: false,
      message: result === 'locked'
        ? 'Too many incorrect OTP attempts. Request a new code.'
        : 'Invalid OTP.',
    });
    return false;
  }
  return true;
}

router.post('/verify-otp', loginRateLimit, (req: Request, res: Response, next) => {
  void verifyOtpLogin(req, res).catch(next);
});

async function verifyOtpLogin(req: Request, res: Response) {
  const phone = validateCredentials(req.body?.phoneNumber ?? req.body?.phone, res);
  if (!phone || !verifyChallenge(phone, req.body?.otp, 'login', res)) return;

  const user = await findAccountByPhone(phone);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'No account exists for this number. Choose sign-up to create one.',
    });
  }
  return issueSession(res, user, false);
}

router.post('/register-otp', loginRateLimit, (req: Request, res: Response, next) => {
  void registerWithOtp(req, res).catch(next);
});

async function registerWithOtp(req: Request, res: Response) {
  const phone = validateCredentials(req.body?.phoneNumber ?? req.body?.phone, res);
  if (!phone || !verifyChallenge(phone, req.body?.otp, 'register', res)) return;
  if (await findAccountByPhone(phone)) {
    return res.status(409).json({ success: false, message: 'An account already exists for this phone number. Log in instead.' });
  }

  let user: User;
  try {
    user = await createAccount(phone, undefined, req.body?.client === 'mobile');
  } catch (error) {
    if (error instanceof AccountAlreadyExistsError) {
      return res.status(409).json({ success: false, message: 'An account already exists for this phone number. Log in instead.' });
    }
    throw error;
  }
  return res.status(201).json({
    success: true,
    token: createSessionToken(user.id, user.phoneNumber),
    isNewUser: true,
    user: toUser(user),
    message: 'Account created successfully.',
  });
}

router.get('/options', (_req: Request, res: Response) => {
  return res.json({
    registrationNumber: env.twilioRegistrationNumber,
    otpConfigured: Boolean(env.twoFactorApiKey.trim() && env.twoFactorOtpTemplate.trim()),
    ivrDemoEnabled: env.ivrDemoMode,
  });
});

router.post('/ivr/demo/start', otpSendRateLimit, async (req: Request, res: Response) => {
  if (!env.ivrDemoMode) {
    return res.status(404).json({ success: false, message: 'The local IVR demo is disabled.' });
  }

  const phone = normalizePhone(String(req.body?.phone ?? ''));
  if (!validPhone(phone)) {
    return res.status(400).json({ success: false, message: 'Enter a valid phone number including country code.' });
  }
  if (await findAccountByPhone(phone)) {
    return res.status(409).json({ success: false, message: 'An account already exists for this phone number. Log in instead.' });
  }

  const demoOtp = String(randomInt(100_000, 1_000_000));
  otpStore.set(challengeKey(phone, 'demo-ivr-register'), {
    hash: otpHash(phone, demoOtp).toString('hex'),
    expiresAt: Date.now() + OTP_LIFETIME_MS,
    attempts: 0,
    purpose: 'demo-ivr-register',
  });
  return res.json({
    success: true,
    demoOtp,
    message: `Simulated PhoneMail call: press 1 to create your account. Your spoken verification code is ${demoOtp}.`,
  });
});

router.post('/ivr/demo/verify', loginRateLimit, (req: Request, res: Response, next) => {
  void verifyDemoIvrRegistration(req, res).catch(next);
});

async function verifyDemoIvrRegistration(req: Request, res: Response) {
  if (!env.ivrDemoMode) {
    return res.status(404).json({ success: false, message: 'The local IVR demo is disabled.' });
  }

  const phone = normalizePhone(String(req.body?.phone ?? ''));
  const otp = req.body?.otp;
  if (!validPhone(phone)) {
    return res.status(400).json({ success: false, message: 'Enter a valid phone number including country code.' });
  }
  if (!verifyChallenge(phone, otp, 'demo-ivr-register', res)) return;
  if (await findAccountByPhone(phone)) {
    return res.status(409).json({ success: false, message: 'An account already exists for this phone number. Log in instead.' });
  }

  let user: User;
  try {
    user = await createAccount(phone, undefined, false);
  } catch (error) {
    if (error instanceof AccountAlreadyExistsError) {
      return res.status(409).json({ success: false, message: 'An account already exists for this phone number. Log in instead.' });
    }
    throw error;
  }
  return res.status(201).json({
    success: true,
    token: createSessionToken(user.id, user.phoneNumber),
    isNewUser: true,
    user: toUser(user),
  });
}

router.post('/ivr/incoming', twilioWebhook, (req: Request, res: Response) => {
  if (!validTwilioWebhookBaseUrl()) {
    twimlResponse(res, 503);
    return res.send(TwilioService.sayIvrMessage('otpUnavailable'));
  }
  twimlResponse(res);
  return res.send(TwilioService.generateIVRMenu(ivrWebhookUrl('/ivr/start-registration')));
});

router.post('/ivr/start-registration', twilioWebhook, (req: Request, res: Response, next) => {
  void startIvrRegistration(req, res).catch(next);
});

async function startIvrRegistration(req: Request, res: Response) {
  const now = Date.now();
  for (const [number, requestedAt] of ivrOtpRequests) {
    if (now - requestedAt >= IVR_OTP_COOLDOWN_MS) ivrOtpRequests.delete(number);
  }

  const callerNumber = normalizePhone(String(req.body?.From ?? ''));
  if (!validPhone(callerNumber)) {
    twimlResponse(res);
    return res.send(TwilioService.sayIvrMessage('invalid'));
  }
  if (String(req.body?.Digits ?? '') !== '1') {
    twimlResponse(res);
    return res.send(TwilioService.sayIvrMessage('invalid'));
  }

  const registeredUser = await findAccountByPhone(callerNumber);
  if (registeredUser) {
    twimlResponse(res);
    return res.send(TwilioService.sayIvrMessage('alreadyRegistered'));
  }

  let requestedAt = ivrOtpRequests.get(callerNumber) ?? 0;
  const ivrKey = challengeKey(callerNumber, 'ivr-register');
  const pendingChallenge = otpStore.get(ivrKey);
  if (pendingChallenge && pendingChallenge.expiresAt <= Date.now()) {
    otpStore.delete(ivrKey);
    ivrOtpRequests.delete(callerNumber);
    requestedAt = 0;
  }
  if (pendingChallenge && pendingChallenge.expiresAt > Date.now()) {
    twimlResponse(res);
    return res.send(TwilioService.promptForIvrOtp(ivrWebhookUrl('/ivr/verify-registration')));
  }
  if (now - requestedAt < IVR_OTP_COOLDOWN_MS) {
    twimlResponse(res);
    return res.send(TwilioService.sayIvrMessage('otpUnavailable'));
  }
  otpStore.delete(ivrKey);

  const otp = String(randomInt(100_000, 1_000_000));
  try {
    await sendOtp(callerNumber, otp);
  } catch (error) {
    if (!(error instanceof OtpProviderError)) console.error('IVR OTP delivery failed:', error);
    ivrOtpRequests.delete(callerNumber);
    twimlResponse(res, 503);
    return res.send(TwilioService.sayIvrMessage('otpUnavailable'));
  }

  ivrOtpRequests.set(callerNumber, Date.now());
  otpStore.set(ivrKey, {
    hash: otpHash(callerNumber, otp).toString('hex'),
    expiresAt: Date.now() + OTP_LIFETIME_MS,
    attempts: 0,
    purpose: 'ivr-register',
  });
  twimlResponse(res);
  return res.send(TwilioService.promptForIvrOtp(ivrWebhookUrl('/ivr/verify-registration')));
}

router.post('/ivr/verify-registration', twilioWebhook, (req: Request, res: Response, next) => {
  void verifyIvrRegistration(req, res).catch(next);
});

async function verifyIvrRegistration(req: Request, res: Response) {
  const callerNumber = normalizePhone(String(req.body?.From ?? ''));
  if (!validPhone(callerNumber)) {
    twimlResponse(res);
    return res.send(TwilioService.sayIvrMessage('invalid'));
  }

  const digits = String(req.body?.Digits ?? '');
  const challenge = otpStore.get(challengeKey(callerNumber, 'ivr-register'));
  const result = consumeChallenge(
    callerNumber,
    /^\d{6}$/.test(digits) ? digits : undefined,
    'ivr-register',
  );
  if (result !== 'valid') {
    if (result === 'expired') ivrOtpRequests.delete(callerNumber);
    twimlResponse(res);
    return res.send(TwilioService.sayIvrMessage('otpInvalid'));
  }
  if (!challenge || challenge.purpose !== 'ivr-register') {
    twimlResponse(res);
    return res.send(TwilioService.sayIvrMessage('otpInvalid'));
  }

  ivrOtpRequests.delete(callerNumber);
  try {
    await createAccount(callerNumber, undefined, false);
  } catch (error) {
    if (error instanceof AccountAlreadyExistsError) {
      twimlResponse(res);
      return res.send(TwilioService.sayIvrMessage('alreadyRegistered'));
    }
    throw error;
  }

  twimlResponse(res);
  return res.send(TwilioService.sayIvrMessage('created'));
}

export default router;
