import cors from 'cors';
import express, { type Express } from 'express';
import path from 'path';

import authRoutes from './routes/auth.routes';
import emailRoutes from './routes/email.routes';
import userRoutes from './routes/user.routes';
import frontendRoutes from './routes/frontend.routes';

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req, res) => {
  res.json({ success: true, message: 'PhoneMail backend is running.', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/user', userRoutes);
app.use('/api', frontendRoutes);

const publicDir = path.resolve(__dirname, '../public');
app.use(express.static(publicDir));

app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/mobile', (_req, res) => {
  res.sendFile(path.join(publicDir, 'mobile.html'));
});

app.get('/portal', (_req, res) => {
  res.sendFile(path.join(publicDir, 'portal.html'));
});

export default app;
