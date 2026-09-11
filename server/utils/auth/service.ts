import { randomUUID } from 'node:crypto';
import { DUMMY_HASH, hashPassword, verifyPassword } from './password';
import { createSessionToken, verifySessionToken } from './session';
import type { PublicUser, User } from './types';
import type { UserRepository } from './users';

export type AuthErrorCode =
  | 'INVALID_INPUT'
  | 'WEAK_PASSWORD'
  | 'USERNAME_TAKEN'
  | 'INVALID_CREDENTIALS';

export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

const MIN_USERNAME_LENGTH = 3;
const MIN_PASSWORD_LENGTH = 8;

/** Strip the password hash before a user ever leaves this layer. */
export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}

/**
 * Framework-agnostic authentication logic. Knows nothing about HTTP, cookies,
 * Nuxt, or the UI — it takes credentials and returns users/tokens. The server
 * routes adapt this to requests and cookies.
 */
export class AuthService {
  constructor(private readonly users: UserRepository) {}

  /** Create a new user. Used for seeding and, later, a real sign-up flow. */
  async register(username: string, password: string): Promise<PublicUser> {
    const normalized = username.trim();

    if (normalized.length < MIN_USERNAME_LENGTH) {
      throw new AuthError(
        'INVALID_INPUT',
        `Username must be at least ${MIN_USERNAME_LENGTH} characters`,
      );
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new AuthError(
        'WEAK_PASSWORD',
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }
    if (await this.users.findByUsername(normalized)) {
      throw new AuthError('USERNAME_TAKEN', 'That username is already taken');
    }

    const user: User = {
      id: randomUUID(),
      username: normalized,
      passwordHash: await hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    await this.users.create(user);
    return toPublicUser(user);
  }

  /**
   * Verify credentials and, on success, issue a session token. Throws
   * AuthError('INVALID_CREDENTIALS') for both unknown users and wrong
   * passwords so callers can't distinguish the two.
   */
  async login(
    username: string,
    password: string,
  ): Promise<{ user: PublicUser; token: string }> {
    const user = await this.users.findByUsername(username.trim());

    if (!user) {
      // Compare against a dummy hash to keep timing consistent whether or not
      // the username exists (mitigates user-enumeration via response time).
      await verifyPassword(password, DUMMY_HASH);
      throw new AuthError('INVALID_CREDENTIALS', 'Invalid username or password');
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      throw new AuthError('INVALID_CREDENTIALS', 'Invalid username or password');
    }

    const token = await createSessionToken({ sub: user.id, username: user.username });
    return { user: toPublicUser(user), token };
  }

  /** Resolve the user for a session token, or null if the token is invalid. */
  async getUserFromToken(token: string | undefined | null): Promise<PublicUser | null> {
    if (!token) return null;

    const payload = await verifySessionToken(token);
    if (!payload) return null;

    const user = await this.users.findById(payload.sub);
    return user ? toPublicUser(user) : null;
  }
}
