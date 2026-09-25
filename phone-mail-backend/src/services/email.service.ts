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
};

export async function sendOutboundEmail(email: OutboundEmail) {
  if (!transporter) {
    console.log(`Demo email to ${email.to.join(', ')}: ${email.subject}`);
    return { delivered: false, demo: true };
  }

  await transporter.sendMail({
    from: env.smtpFrom || env.smtpUser,
    to: email.to.map((recipient) => recipient.includes('@')
      ? recipient
      : `${recipient.replace(/\D/g, '')}@phonemail.com`).join(', '),
    subject: email.subject,
    text: email.body,
  });

  return { delivered: true, demo: false };
}
