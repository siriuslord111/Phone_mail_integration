import { Router } from 'express';

import { requireAuth } from '../middlewares/auth';

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

router.put('/preferences', (req, res) => {
  const user = res.locals.authenticatedUser;

  return res.json({
    success: true,
    message: 'Preferences updated.',
    user: {
      id: user.id,
      phoneNumber: user.phoneNumber,
      email: user.email,
      hasMobileApp: user.hasMobileApp,
    },
  });
});

export default router;
