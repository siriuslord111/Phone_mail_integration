import nodemailer from 'nodemailer';

import { env } from '../config/env';

const transporter = env.smtpUser && env.smtpPassword
  ? nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: {
        user: env.smtpUser,
        pass: env.smtpPassword,
      },
    })
  : null;

export type OutboundEmail = {
  from: string;
  to: string[];
  subject: string;
  body: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
};

export async function sendOutboundEmail(email: OutboundEmail) {
  if (!transporter) {
    throw new Error('Email sending is not configured. Set SMTP_USER and SMTP_PASSWORD in the root .env file, then restart the API.');
  }

  await transporter.sendMail({
    from: env.smtpFrom || env.smtpUser,
    to: email.to.join(', '),
    subject: email.subject,
    text: email.body,
    attachments: email.attachments?.map(({ filename, content }) => ({ filename, content })),
  });

  return { delivered: true };
}
