import { Router } from 'express';

import { requireAuth } from '../middlewares/auth';
import {
  AliasAlreadyExistsError,
  AliasNotFoundError,
  createAccountAlias,
  deleteAccountAlias,
  listAccountAliases,
  updateSmsNotificationsEnabled,
} from '../services/account.service';

const router = Router();
router.use(requireAuth);

router.get('/profile', async (_req, res, next) => {
  const user = res.locals.authenticatedUser;
  try {
    const aliases = await listAccountAliases(user);
    return res.json({
      success: true,
      profile: {
        id: user.id,
        phoneNumber: user.phoneNumber,
        email: user.email,
        aliasIds: aliases.map((alias) => alias.address),
        language: 'en',
        personalDetails: {
          name: 'PhoneMail User',
        },
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/aliases', async (req, res, next) => {
  const user = res.locals.authenticatedUser;
  try {
    const aliases = await listAccountAliases(user);
    return res.json({
      success: true,
      primaryAddress: user.email,
      aliases: aliases.map(({ id, address, createdAt }) => ({ id, address, createdAt })),
    });
  } catch (error) {
    return next(error);
  }
});

function normalizeAliasAddress(value: unknown) {
  const input = String(value ?? '').trim().toLowerCase();
  const address = input.includes('@') ? input : `${input}@phonemail.com`;
  if (!/^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])?@phonemail\.com$/.test(address)) return null;
  return address;
}

router.post('/aliases', async (req, res, next) => {
  const address = normalizeAliasAddress(req.body?.address ?? req.body?.alias);
  if (!address) {
    return res.status(400).json({
      success: false,
      message: 'Alias must use 3-30 lowercase letters, numbers, dots, hyphens, or underscores and end with @phonemail.com.',
    });
  }

  const user = res.locals.authenticatedUser;
  if (address === user.email.toLowerCase()) {
    return res.status(409).json({ success: false, message: 'That is already your primary address.' });
  }
  try {
    const alias = await createAccountAlias(user, address);
    return res.status(201).json({ success: true, alias });
  } catch (error) {
    if (error instanceof AliasAlreadyExistsError) {
      return res.status(409).json({ success: false, message: 'That alias is already in use.' });
    }
    return next(error);
  }
});

router.delete('/aliases/:aliasId', async (req, res, next) => {
  try {
    await deleteAccountAlias(res.locals.authenticatedUser, req.params.aliasId);
    return res.json({ success: true, message: 'Alias removed.' });
  } catch (error) {
    if (error instanceof AliasNotFoundError) {
      return res.status(404).json({ success: false, message: 'Alias not found.' });
    }
    return next(error);
  }
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
