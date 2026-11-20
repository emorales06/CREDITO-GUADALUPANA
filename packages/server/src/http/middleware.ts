import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import type { ApiErrorBody, Role, UserDTO } from '@guadalupana/shared';
import { AppError, forbidden, notFound } from '../domain/errors.ts';
import type { AuthService } from '../services/auth.service.ts';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      user?: UserDTO;
    }
  }
}

export const SESSION_COOKIE = 'gp_session';

export const authenticate =
  (auth: AuthService): RequestHandler =>
  (req, res, next) => {
    res.locals.user = auth.authenticate(req.cookies?.[SESSION_COOKIE] as string | undefined);
    next();
  };

/** Autorización en el servidor: el rol proviene de la BD, nunca del cliente. */
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (_req, res, next) => {
    const user = res.locals.user;
    if (!user || !roles.includes(user.role)) throw forbidden();
    next();
  };

export function currentUser(res: Response): UserDTO {
  const user = res.locals.user;
  if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Debe iniciar sesión');
  return user;
}

/**
 * Si la petición trae cuerpo, debe ser JSON. Un formulario HTML de otro sitio no puede
 * enviar JSON: junto con la cookie SameSite=Strict mitiga CSRF.
 */
export const requireJson: RequestHandler = (req, _res, next) => {
  const hasBody = Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding'] !== undefined;
  if (hasBody && !req.is('application/json')) {
    throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type debe ser application/json');
  }
  next();
};

export const apiNotFound: RequestHandler = (req) => {
  throw notFound(`Ruta no encontrada: ${req.method} ${req.path}`);
};

const send = (res: Response, status: number, body: ApiErrorBody) => res.status(status).json(body);

export const errorHandler: ErrorRequestHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    return send(res, err.status, { error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}) } });
  }
  if (err instanceof z.ZodError) {
    const fields = z.flattenError(err).fieldErrors as Record<string, string[]>;
    const first = err.issues[0]?.message ?? 'Datos inválidos';
    return send(res, 400, { error: { code: 'VALIDATION_ERROR', message: first, fields } });
  }
  if (typeof err === 'object' && err !== null && 'type' in err && err.type === 'entity.parse.failed') {
    return send(res, 400, { error: { code: 'INVALID_JSON', message: 'El cuerpo de la petición no es JSON válido' } });
  }
  if (typeof err === 'object' && err !== null && 'type' in err && err.type === 'entity.too.large') {
    return send(res, 413, { error: { code: 'PAYLOAD_TOO_LARGE', message: 'La petición es demasiado grande' } });
  }
  console.error('[http] error no controlado', err);
  return send(res, 500, { error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } });
};
