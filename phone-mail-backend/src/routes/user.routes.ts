import { Router } from 'express';

import { users } from '../store';

const router = Router();

router.get('/profile', (req, res) => {
  const phoneNumber = String(req.query.phoneNumber ?? '');
  const user = users.find((entry) => entry.phoneNumber === phoneNumber);

  if (!user) {
    return res.status(404).json({ success: false, message: 'User profile not found.' });
  }

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
  const phoneNumber = String(req.query.phoneNumber ?? '');
  const user = users.find((entry) => entry.phoneNumber === phoneNumber);

  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  return res.json({
    success: true,
    aliases: [
      { id: 'alias-1', address: `${user.phoneNumber.replace(/\D/g, '')}@phonemail.com` },
      { id: 'alias-2', address: `${user.phoneNumber.replace(/\D/g, '')}-updates@phonemail.com` },
    ],
  });
});

router.put('/preferences', (req, res) => {
  const { phoneNumber } = req.body ?? {};
  const user = users.find((entry) => entry.phoneNumber === phoneNumber);

  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  return res.json({
    success: true,
    message: 'Preferences updated.',
    user,
  });
});

export default router;
