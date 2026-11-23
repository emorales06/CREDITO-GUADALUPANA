import { createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { passwordSchema, type ChangePasswordInput, type LoginInput, type RegisterInput, type UserDTO } from '@guadalupana/shared';
import { inTransaction, isUniqueViolation, type Db } from '../db/database.ts';
import { AppError, businessRule, tooManyRequests, unauthorized } from '../domain/errors.ts';
import type { AdminAuditRepository, PasswordResetRepository } from '../repositories/admin.repository.ts';
import { toPublicUser, type UsersRepository } from '../repositories/users.repository.ts';
import type { Clock } from './clock.ts';

const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(password, salt, KEY_LENGTH).toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(expected, actual);
}

const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';

/** Contraseña temporal legible (sin caracteres ambiguos) que cumple la política. */
export function generateTemporaryPassword(): string {
  const letters = Array.from({ length: 8 }, () => TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)]).join('');
  const temp = `${letters.slice(0, 4)}-${letters.slice(4)}${randomInt(10, 99)}#`;
  passwordSchema.parse(temp);
  return temp;
}

// Hash ficticio para que un usuario inexistente tarde lo mismo que uno real (evita enumeración).
const DUMMY_HASH = hashPassword(randomBytes(16).toString('hex'));

interface TokenPayload {
  sub: number;
  iat: number;
  exp: number;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000;

export interface AuthDeps {
  db: Db;
  users: UsersRepository;
  resets: PasswordResetRepository;
  adminAudit: AdminAuditRepository;
  clock: Clock;
  secret: string;
  ttlHours: number;
}

export class AuthService {
  #d: AuthDeps;
  #ttlMs: number;
  #failures = new Map<string, { count: number; firstAt: number }>();

  constructor(deps: AuthDeps) {
    this.#d = deps;
    this.#ttlMs = deps.ttlHours * 60 * 60 * 1000;
  }

  get ttlMs(): number {
    return this.#ttlMs;
  }

  login(input: LoginInput): { user: UserDTO; token: string } {
    const key = input.username.toLowerCase();
    this.#assertNotLocked(key);

    const user = this.#d.users.findByUsername(input.username);
    const valid = verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH) && user !== undefined;
    if (!valid || !user) {
      this.#registerFailure(key);
      throw unauthorized('Usuario o contraseña incorrectos');
    }
    if (!user.isActive) throw new AppError(403, 'ACCOUNT_DISABLED', 'La cuenta está desactivada. Contacte a un administrador.');
    this.#failures.delete(key);
    return { user: toPublicUser(user), token: this.#issue(user.id) };
  }

  /** Alta pública: siempre crea un SOLICITANTE. El rol nunca viene del cliente. */
  register(input: RegisterInput): { user: UserDTO; token: string } {
    const now = this.#d.clock().toISOString();
    try {
      const id = inTransaction(this.#d.db, () => {
        const newId = this.#d.users.insert(
          { username: input.username, fullName: input.fullName, role: 'SOLICITANTE', passwordHash: hashPassword(input.password), mustChangePassword: false },
          now,
        );
        this.#d.adminAudit.append({ id: newId, username: input.username }, 'REGISTRO', `usuario:${input.username}`, 'Alta pública como solicitante', now);
        return newId;
      });
      const user = this.#d.users.findById(id);
      if (!user) throw new Error('Usuario recién creado no encontrado');
      return { user: toPublicUser(user), token: this.#issue(id) };
    } catch (error) {
      if (isUniqueViolation(error)) throw businessRule('USERNAME_TAKEN', 'Ese usuario ya está en uso', 'username');
      throw error;
    }
  }

  changePassword(actor: UserDTO, input: ChangePasswordInput): { user: UserDTO; token: string } {
    const user = this.#d.users.findById(actor.id);
    if (!user || !verifyPassword(input.currentPassword, user.passwordHash)) {
      throw businessRule('WRONG_PASSWORD', 'La contraseña actual no es correcta', 'currentPassword');
    }
    if (input.newPassword.toLowerCase().includes(user.username.toLowerCase())) {
      throw businessRule('WEAK_PASSWORD', 'La contraseña no puede contener el usuario', 'newPassword');
    }
    const now = this.#d.clock().toISOString();
    inTransaction(this.#d.db, () => {
      this.#d.users.setPassword(user.id, hashPassword(input.newPassword), false, now);
      this.#d.adminAudit.append(user, 'CAMBIO_CONTRASENA', `usuario:${user.username}`, null, now);
    });
    const updated = this.#d.users.findById(user.id);
    if (!updated) throw unauthorized();
    // Las sesiones anteriores quedan invalidadas; esta recibe un token nuevo.
    return { user: toPublicUser(updated), token: this.#issue(user.id, Date.parse(now)) };
  }

  /** Siempre responde igual exista o no el usuario: no permite enumerar cuentas. */
  requestPasswordReset(username: string): void {
    const user = this.#d.users.findByUsername(username);
    if (!user || !user.isActive) return;
    this.#d.resets.requestFor(user.id, this.#d.clock().toISOString());
  }

  /** Valida el token y recarga el usuario desde la BD: el rol nunca se toma del cliente. */
  authenticate(token: string | undefined): UserDTO {
    const payload = token ? this.#verify(token) : undefined;
    if (!payload) throw unauthorized();
    const user = this.#d.users.findById(payload.sub);
    if (!user || !user.isActive) throw unauthorized('Su sesión ya no es válida. Inicie sesión de nuevo.');
    if (payload.iat < Date.parse(user.passwordChangedAt)) throw unauthorized('Su sesión expiró por un cambio de credenciales.');
    return toPublicUser(user);
  }

  #issue(userId: number, notBefore = Date.now()): string {
    const iat = Math.max(Date.now(), notBefore);
    const body = Buffer.from(JSON.stringify({ sub: userId, iat, exp: iat + this.#ttlMs } satisfies TokenPayload)).toString('base64url');
    return `${body}.${this.#mac(body)}`;
  }

  #verify(token: string): TokenPayload | undefined {
    const [body, mac] = token.split('.');
    if (!body || !mac) return undefined;
    const expected = Buffer.from(this.#mac(body));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return undefined;
    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as TokenPayload;
      const ok = typeof payload.sub === 'number' && typeof payload.iat === 'number' && payload.exp > Date.now();
      return ok ? payload : undefined;
    } catch {
      return undefined;
    }
  }

  #mac(body: string): string {
    return createHmac('sha256', this.#d.secret).update(body).digest('base64url');
  }

  #assertNotLocked(key: string): void {
    const entry = this.#failures.get(key);
    if (!entry) return;
    if (Date.now() - entry.firstAt > LOCK_WINDOW_MS) {
      this.#failures.delete(key);
      return;
    }
    if (entry.count >= MAX_FAILED_ATTEMPTS) {
      throw tooManyRequests('Demasiados intentos fallidos. Intente de nuevo en unos minutos.');
    }
  }

  #registerFailure(key: string): void {
    const entry = this.#failures.get(key);
    if (entry) entry.count++;
    else this.#failures.set(key, { count: 1, firstAt: Date.now() });
  }
}
