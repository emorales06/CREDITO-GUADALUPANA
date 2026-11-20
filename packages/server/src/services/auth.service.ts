import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { LoginInput, UserDTO } from '@guadalupana/shared';
import { tooManyRequests, unauthorized } from '../domain/errors.ts';
import type { UsersRepository } from '../repositories/users.repository.ts';

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

// Hash ficticio para que un usuario inexistente tarde lo mismo que uno real (evita enumeración).
const DUMMY_HASH = hashPassword(randomBytes(16).toString('hex'));

interface TokenPayload {
  sub: number;
  exp: number;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000;

export class AuthService {
  #users: UsersRepository;
  #secret: string;
  #ttlMs: number;
  #failures = new Map<string, { count: number; firstAt: number }>();

  constructor(users: UsersRepository, secret: string, ttlHours: number) {
    this.#users = users;
    this.#secret = secret;
    this.#ttlMs = ttlHours * 60 * 60 * 1000;
  }

  get ttlMs(): number {
    return this.#ttlMs;
  }

  login(input: LoginInput): { user: UserDTO; token: string } {
    const key = input.username.toLowerCase();
    this.#assertNotLocked(key);

    const user = this.#users.findByUsername(input.username);
    const valid = verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH) && user !== undefined;
    if (!valid || !user) {
      this.#registerFailure(key);
      throw unauthorized('Usuario o contraseña incorrectos');
    }
    this.#failures.delete(key);

    const { passwordHash: _omit, ...publicUser } = user;
    return { user: publicUser, token: this.#sign({ sub: user.id, exp: Date.now() + this.#ttlMs }) };
  }

  /** Valida el token y recarga el usuario desde la BD: el rol nunca se toma del cliente. */
  authenticate(token: string | undefined): UserDTO {
    const payload = token ? this.#verify(token) : undefined;
    if (!payload) throw unauthorized();
    const user = this.#users.findById(payload.sub);
    if (!user) throw unauthorized();
    const { passwordHash: _omit, ...publicUser } = user;
    return publicUser;
  }

  #sign(payload: TokenPayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
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
      return typeof payload.sub === 'number' && payload.exp > Date.now() ? payload : undefined;
    } catch {
      return undefined;
    }
  }

  #mac(body: string): string {
    return createHmac('sha256', this.#secret).update(body).digest('base64url');
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
