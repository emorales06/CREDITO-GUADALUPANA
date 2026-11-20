export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string[]> | undefined;

  constructor(status: number, code: string, message: string, fields?: Record<string, string[]>) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const unauthorized = (message = 'Debe iniciar sesión') => new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'No tiene permisos para realizar esta acción') =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (message = 'Recurso no encontrado') => new AppError(404, 'NOT_FOUND', message);

export const conflict = (code: string, message: string) => new AppError(409, code, message);

export const businessRule = (code: string, message: string, field?: string) =>
  new AppError(422, code, message, field ? { [field]: [message] } : undefined);

export const tooManyRequests = (message: string) => new AppError(429, 'TOO_MANY_REQUESTS', message);
