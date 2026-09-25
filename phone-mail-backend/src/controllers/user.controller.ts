import { Request, Response } from 'express';

export const getProfile = async (_req: Request, res: Response) => {
  res.json({ success: true, profile: { name: 'PhoneMail User' } });
};

export const updateProfile = async (_req: Request, res: Response) => {
  res.json({ success: true, message: 'Profile updated.' });
};
