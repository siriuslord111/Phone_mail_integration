import type { RequestHandler } from 'express';

import { findAccountBySession } from '../services/account.service';
import { verifySessionToken } from '../services/session.service';

export const requireAuth: RequestHandler = (req, res, next) => {
  const authorization = req.header('authorization') ?? '';
  const [scheme, token, extra] = authorization.split(' ');
  if (scheme !== 'Bearer' || !token || extra !== undefined) {
    return res.status(401).json({ success: false, message: 'Sign in to continue.' });
  }

  const session = verifySessionToken(token);
  if (!session) {
    return res.status(401).json({ success: false, message: 'Your session is invalid or expired. Sign in again.' });
  }

  void findAccountBySession(session.sub, session.phone).then((user) => {
    if (!user) {
      res.status(401).json({ success: false, message: 'Your session is invalid or expired. Sign in again.' });
      return;
    }
    res.locals.authenticatedUser = user;
    next();
  }).catch(next);
};
