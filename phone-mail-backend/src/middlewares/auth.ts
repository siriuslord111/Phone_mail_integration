import type { RequestHandler } from 'express';

import { users } from '../store';
import { verifySessionToken } from '../services/session.service';

export const requireAuth: RequestHandler = (req, res, next) => {
  const authorization = req.header('authorization') ?? '';
  const [scheme, token, extra] = authorization.split(' ');
  if (scheme !== 'Bearer' || !token || extra !== undefined) {
    return res.status(401).json({ success: false, message: 'Sign in to continue.' });
  }

  const session = verifySessionToken(token);
  const user = session && users.find(
    (entry) => entry.id === session.sub && entry.phoneNumber === session.phone,
  );
  if (!user) {
    return res.status(401).json({ success: false, message: 'Your session is invalid or expired. Sign in again.' });
  }

  res.locals.authenticatedUser = user;
  return next();
};
