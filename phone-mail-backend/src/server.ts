import app from './app';
import { env } from './config/env';
import { prisma } from './config/prisma';
import { startLocalInboundMailSync } from './services/local-inbound-mail.service';

const port = env.port;

const server = app.listen(port, () => {
  console.log(`PhoneMail server listening on http://localhost:${port}`);
  startLocalInboundMailSync();
});

server.on('close', () => {
  void prisma.$disconnect();
});
