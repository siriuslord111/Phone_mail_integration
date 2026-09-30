import { Router } from 'express';

import { requireAuth } from '../middlewares/auth';
import { updateSmsNotificationsEnabled } from '../services/account.service';

const router = Router();
router.use(requireAuth);

router.get('/profile', (_req, res) => {
  const user = res.locals.authenticatedUser;

  return res.json({
    success: true,
    profile: {
      id: user.id,
      phoneNumber: user.phoneNumber,
      email: user.email,
      aliasIds: ['sales@phonemail.com', 'family@phonemail.com'],
      language: 'en',
      personalDetails: {
        name: 'PhoneMail User',
      },
    },
  });
});

router.get('/aliases', (req, res) => {
  const user = res.locals.authenticatedUser;

  return res.json({
    success: true,
    aliases: [
      { id: 'alias-1', address: `${user.phoneNumber.replace(/\D/g, '')}@phonemail.com` },
      { id: 'alias-2', address: `${user.phoneNumber.replace(/\D/g, '')}-updates@phonemail.com` },
    ],
  });
});

router.get('/preferences', (_req, res) => {
  const user = res.locals.authenticatedUser;
  return res.json({
    success: true,
    user: { smsNotificationsEnabled: user.smsNotificationsEnabled },
  });
});

router.put('/preferences', (req, res, next) => {
  if (typeof req.body?.smsNotificationsEnabled !== 'boolean') {
    return res.status(400).json({ success: false, message: 'smsNotificationsEnabled must be a boolean.' });
  }
  const user = res.locals.authenticatedUser;
  void updateSmsNotificationsEnabled(user, req.body.smsNotificationsEnabled).then(() => res.json({
    success: true,
    message: 'Preferences updated.',
    user: {
      id: user.id,
      phoneNumber: user.phoneNumber,
      email: user.email,
      hasMobileApp: user.hasMobileApp,
      smsNotificationsEnabled: user.smsNotificationsEnabled,
    },
  })).catch(next);
});

export default router;
