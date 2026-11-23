import type { BureauStatus, RequestStatus, Role } from './status.ts';
import type { Cents } from './money.ts';

export interface UserDTO {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  mustChangePassword: boolean;
}

export interface AdminUserDTO extends UserDTO {
  isActive: boolean;
  createdAt: string;
  pendingReset: boolean;
}

export interface PasswordResetRequestDTO {
  id: number;
  userId: number;
  username: string;
  fullName: string;
  createdAt: string;
}

export interface AdminAuditDTO {
  id: number;
  actor: string;
  action: string;
  target: string;
  detail: string | null;
  timestamp: string;
}

export interface AdminOverviewDTO {
  users: Record<Role, number> & { inactive: number };
  requests: Record<RequestStatus, { count: number; amountCents: Cents }>;
  bureau: Record<BureauStatus, number> & { avgAttempts: number };
  budget: BudgetDTO;
  auditEntries: number;
  adminEntries: number;
  pendingResets: number;
  system: { node: string; uptimeSeconds: number; dbSizeBytes: number; startedAt: string; schemaVersion: number };
}

export interface BureauResultDTO {
  status: BureauStatus;
  score: number | null;
  rating: string | null;
  attempts: number;
  error: string | null;
  checkedAt: string | null;
}

export interface CreditRequestDTO {
  id: number;
  ownerId: number;
  ownerName: string;
  applicantName: string;
  documentId: string;
  monthlyIncomeCents: Cents;
  amountCents: Cents;
  termMonths: number;
  monthlyPaymentCents: Cents;
  status: RequestStatus;
  rejectionReason: string | null;
  bureau: BureauResultDTO;
  version: number;
  createdAt: string;
  updatedAt: string;
  decidedAt: string | null;
}

export interface BudgetDTO {
  totalCents: Cents;
  availableCents: Cents;
  approvedCents: Cents;
  updatedAt: string;
}

export interface AuditEntryDTO {
  id: number;
  requestId: number;
  actor: { id: number; username: string; role: Role };
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  comment: string | null;
  timestamp: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string; fields?: Record<string, string[]> };
}

export type ServerEvent =
  | { type: 'theme.updated' }
  | { type: 'request.updated'; requestId: number; ownerId: number }
  | { type: 'audit.created'; entry: AuditEntryDTO; ownerId: number }
  | { type: 'budget.updated'; budget: BudgetDTO };
