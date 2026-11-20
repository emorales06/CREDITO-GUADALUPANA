import { existsSync } from 'node:fs';
import { join } from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import type { Container } from './container.ts';
import { mockBureauRouter } from './http/mock-bureau.ts';
import { apiNotFound, errorHandler, requireJson } from './http/middleware.ts';
import { apiRouter, authRouter } from './http/routes.ts';

export function createApp(c: Container) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } } }));
  app.use(express.json({ limit: '16kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });
  app.use('/api/mock-bureau', mockBureauRouter(c.config.mockBureau));
  app.use('/api', requireJson);
  app.use('/api/auth', authRouter(c));
  app.use('/api', apiRouter(c));
  app.use('/api', apiNotFound);

  // En producción el mismo proceso sirve el frontend compilado (un solo puerto, un solo comando).
  if (existsSync(c.config.clientDistPath)) {
    app.use(express.static(c.config.clientDistPath, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(join(c.config.clientDistPath, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
