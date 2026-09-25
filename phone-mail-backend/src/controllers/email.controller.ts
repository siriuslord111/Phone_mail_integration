import { Request, Response } from 'express';

export const listInbox = async (_req: Request, res: Response) => {
  res.json({ success: true, messages: [] });
};

export const composeEmail = async (_req: Request, res: Response) => {
  res.json({ success: true, message: 'Compose route is served by the email API.' });
};
