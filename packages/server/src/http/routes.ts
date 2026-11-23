import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  REQUEST_STATUSES,
  adminCreateUserSchema,
  adminUpdateUserSchema,
  changePasswordSchema,
  createRequestSchema,
  documentIdSchema,
  forgotPasswordSchema,
  idSchema,
  idempotencyKeySchema,
  loginSchema,
  registerSchema,
  rejectRequestSchema,
  themeSchema,
  type ServerEvent,
  type UserDTO,
} from '@guadalupana/shared';
import type { Container } from '../container.ts';
import { SESSION_COOKIE, authenticate, currentUser, requireFreshPassword, requireRole } from './middleware.ts';

const listQuery = z.object({ status: z.enum(REQUEST_STATUSES).optional() });
const auditQuery = z.object({ requestId: idSchema.optional(), limit: z.coerce.number().int().min(1).max(1000).optional() });
const limitQuery = z.object({ limit: z.coerce.number().int().min(1).max(1000).optional() });

const clientKey = (req: Request) => req.ip ?? req.socket.remoteAddress ?? 'desconocido';

function setSession(c: Container, res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: c.config.cookieSecure,
    maxAge: c.auth.ttlMs,
    path: '/',
  });
}

export function authRouter(c: Container): Router {
  const r = Router();

  r.post('/login', (req, res) => {
    c.limits.login.consume(clientKey(req));
    const { user, token } = c.auth.login(loginSchema.parse(req.body));
    setSession(c, res, token);
    res.json({ user });
  });

  r.post('/register', (req, res) => {
    c.limits.register.consume(clientKey(req));
    const { user, token } = c.auth.register(registerSchema.parse(req.body));
    setSession(c, res, token);
    res.status(201).json({ user });
  });

  r.post('/forgot-password', (req, res) => {
    c.limits.forgot.consume(clientKey(req));
    c.auth.requestPasswordReset(forgotPasswordSchema.parse(req.body).username);
    // Misma respuesta exista o no la cuenta.
    res.status(202).json({ message: 'Si la cuenta existe, un administrador recibirá su solicitud y le entregará una contraseña temporal.' });
  });

  r.post('/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(204).end();
  });

  r.get('/me', authenticate(c.auth), (_req, res) => {
    res.json({ user: currentUser(res) });
  });

  // Permitido aunque la cuenta deba cambiar su contraseña: es justamente la salida de ese estado.
  r.post('/change-password', authenticate(c.auth), (req, res) => {
    const { user, token } = c.auth.changePassword(currentUser(res), changePasswordSchema.parse(req.body));
    setSession(c, res, token);
    res.json({ user });
  });

  return r;
}

/** Público: el login necesita el tema (colores y logo) antes de que exista una sesión. */
export function publicRouter(c: Container): Router {
  const r = Router();
  r.get('/settings/theme', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.json({ theme: c.admin.getTheme() });
  });
  return r;
}

export function apiRouter(c: Container): Router {
  const r = Router();
  r.use(authenticate(c.auth));
  r.use(requireFreshPassword);

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

  // Segregación de funciones: solo el analista decide; el administrador consulta pero no aprueba.
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

  r.post('/requests/:id/bureau/retry', requireRole('SOLICITANTE', 'ANALISTA'), (req, res) => {
    res.status(202).json({ request: c.requestsService.retryBureau(currentUser(res), idSchema.parse(req.params.id)) });
  });

  r.get('/budget', requireRole('ANALISTA', 'ADMIN'), (_req, res) => {
    res.json({ budget: c.budget.get() });
  });

  r.get('/audit', requireRole('ANALISTA', 'ADMIN'), (req, res) => {
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

  r.use('/admin', requireRole('ADMIN'), adminRouter(c));
  return r;
}

function adminRouter(c: Container): Router {
  const r = Router();

  r.get('/overview', (_req, res) => {
    res.json({ overview: c.admin.overview() });
  });

  r.get('/audit', (req, res) => {
    res.json({ entries: c.admin.listAudit(limitQuery.parse(req.query).limit) });
  });

  r.put('/settings/theme', (req, res) => {
    res.json({ theme: c.admin.updateTheme(currentUser(res), themeSchema.parse(req.body)) });
  });

  r.post('/settings/theme/reset', (_req, res) => {
    res.json({ theme: c.admin.resetTheme(currentUser(res)) });
  });

  r.get('/users', (_req, res) => {
    res.json({ users: c.admin.listUsers() });
  });

  r.post('/users', (req, res) => {
    res.status(201).json(c.admin.createUser(currentUser(res), adminCreateUserSchema.parse(req.body)));
  });

  r.patch('/users/:id', (req, res) => {
    res.json({ user: c.admin.updateUser(currentUser(res), idSchema.parse(req.params.id), adminUpdateUserSchema.parse(req.body)) });
  });

  r.post('/users/:id/reset-password', (req, res) => {
    res.json(c.admin.resetPassword(currentUser(res), idSchema.parse(req.params.id)));
  });

  r.get('/password-resets', (_req, res) => {
    res.json({ requests: c.admin.listResetRequests() });
  });

  r.post('/password-resets/:id/dismiss', (req, res) => {
    c.admin.dismissResetRequest(currentUser(res), idSchema.parse(req.params.id));
    res.status(204).end();
  });

  return r;
}

/** Filtro de eventos por rol: un solicitante solo recibe eventos de sus propias solicitudes. */
function canSee(user: UserDTO, event: ServerEvent): boolean {
  if (event.type === 'theme.updated') return true;
  if (user.role === 'ANALISTA' || user.role === 'ADMIN') return true;
  if (event.type === 'budget.updated') return false;
  return event.ownerId === user.id;
}
