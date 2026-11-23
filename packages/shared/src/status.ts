export const ROLES = ['SOLICITANTE', 'ANALISTA', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  SOLICITANTE: 'Solicitante',
  ANALISTA: 'Analista',
  ADMIN: 'Administrador',
};

export const REQUEST_STATUSES = ['CREADA', 'EN_REVISION', 'APROBADA', 'RECHAZADA'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Estados "pendientes" a efectos de la regla de historial: aún no tienen decisión final. */
export const OPEN_STATUSES: readonly RequestStatus[] = ['CREADA', 'EN_REVISION'];

const TRANSITIONS: Readonly<Record<RequestStatus, readonly RequestStatus[]>> = {
  CREADA: ['EN_REVISION'],
  EN_REVISION: ['APROBADA', 'RECHAZADA'],
  APROBADA: [],
  RECHAZADA: [],
};

export const canTransition = (from: RequestStatus, to: RequestStatus): boolean =>
  TRANSITIONS[from].includes(to);

export const isFinalStatus = (status: RequestStatus): boolean => TRANSITIONS[status].length === 0;

export const STATUS_LABELS: Readonly<Record<RequestStatus, string>> = {
  CREADA: 'Creada',
  EN_REVISION: 'En revisión',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
};

export const BUREAU_STATUSES = ['PENDIENTE', 'CONSULTANDO', 'COMPLETADO', 'FALLIDO'] as const;
export type BureauStatus = (typeof BUREAU_STATUSES)[number];
