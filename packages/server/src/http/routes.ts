import { Router, type Response } from 'express';
import { z } from 'zod';
import {
  REQUEST_STATUSES,
  createRequestSchema,
  documentIdSchema,
  idSchema,
  idempotencyKeySchema,
  loginSchema,
  rejectRequestSchema,
  type ServerEvent,
  type UserDTO,
} from '@guadalupana/shared';
import type { Container } from '../container.ts';
import { SESSION_COOKIE, authenticate, currentUser, requireRole } from './middleware.ts';

const listQuery = z.object({ status: z.enum(REQUEST_STATUSES).optional() });
const auditQuery = z.object({ requestId: idSchema.optional(), limit: z.coerce.number().int().min(1).max(1000).optional() });

export function authRouter(c: Container): Router {
  const r = Router();

  r.post('/login', (req, res) => {
    const { user, token } = c.auth.login(loginSchema.parse(req.body));
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: c.config.cookieSecure,
      maxAge: c.auth.ttlMs,
      path: '/',
    });
    res.json({ user });
  });

  r.post('/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(204).end();
  });

  r.get('/me', authenticate(c.auth), (_req, res) => {
    res.json({ user: currentUser(res) });
  });

  return r;
}

export function apiRouter(c: Container): Router {
  const r = Router();
  r.use(authenticate(c.auth));

  const sendDecision = (res: Response, result: { request: unknown; replayed: boolean }) => {
    if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
    res.json({ request: result.request });
  };

  r.get('/requests', (req, res) => {
    const { status } = listQuery.parse(req.query);
    res.json({ requests: c.requestsService.list(currentUser(res), status) });
  });

  r.get('/requests/eligibility', requireRole('SOLICITANTE'), (req, res) => {
    const documentId = documentIdSchema.parse(req.query.documentId);
    res.json(c.requestsService.checkEligibility(documentId));
  });

  r.post('/requests', requireRole('SOLICITANTE'), (req, res) => {
    const input = createRequestSchema.parse(req.body);
    res.status(201).json({ request: c.requestsService.create(currentUser(res), input) });
  });

  r.get('/requests/:id', (req, res) => {
    res.json({ request: c.requestsService.getForActor(currentUser(res), idSchema.parse(req.params.id)) });
  });

  r.get('/requests/:id/audit', (req, res) => {
    const request = c.requestsService.getForActor(currentUser(res), idSchema.parse(req.params.id));
    res.json({ entries: c.audit.list({ requestId: request.id }) });
  });

  r.post('/requests/:id/review', requireRole('ANALISTA'), (req, res) => {
    res.json({ request: c.requestsService.startReview(currentUser(res), idSchema.parse(req.params.id)) });
  });

  r.post('/requests/:id/approve', requireRole('ANALISTA'), (req, res) => {
    const key = idempotencyKeySchema.parse(req.get('Idempotency-Key'));
    sendDecision(res, c.requestsService.approve(currentUser(res), idSchema.parse(req.params.id), key));
  });

  r.post('/requests/:id/reject', requireRole('ANALISTA'), (req, res) => {
    const key = idempotencyKeySchema.parse(req.get('Idempotency-Key'));
    const { reason } = rejectRequestSchema.parse(req.body);
    sendDecision(res, c.requestsService.reject(currentUser(res), idSchema.parse(req.params.id), key, reason));
  });

  r.post('/requests/:id/bureau/retry', (req, res) => {
    res.status(202).json({ request: c.requestsService.retryBureau(currentUser(res), idSchema.parse(req.params.id)) });
  });

  r.get('/budget', requireRole('ANALISTA'), (_req, res) => {
    res.json({ budget: c.budget.get() });
  });

  r.get('/audit', requireRole('ANALISTA'), (req, res) => {
    res.json({ entries: c.audit.list(auditQuery.parse(req.query)) });
  });

  r.get('/events', (req, res) => {
    const user = currentUser(res);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');

    const unsubscribe = c.events.subscribe((event) => {
      if (canSee(user, event)) res.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 20_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  return r;
}

/** Filtro de eventos por rol: un solicitante solo recibe eventos de sus propias solicitudes. */
function canSee(user: UserDTO, event: ServerEvent): boolean {
  if (user.role === 'ANALISTA') return true;
  if (event.type === 'budget.updated') return false;
  return event.ownerId === user.id;
}
