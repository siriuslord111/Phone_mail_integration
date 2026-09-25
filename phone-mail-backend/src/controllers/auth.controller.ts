import { Request, Response } from 'express';

export const registerAccount = async (_req: Request, res: Response) => {
  res.json({ success: true, message: 'Registration handled by auth routes.' });
};

export const loginAccount = async (_req: Request, res: Response) => {
  res.json({ success: true, message: 'Login handled by auth routes.' });
};
