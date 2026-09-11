import type { User } from './types';

/**
 * Storage boundary for users. Swap the in-memory implementation below for a
 * database-backed one (Postgres, Prisma, Drizzle, etc.) later without touching
 * the auth logic — the service only depends on this interface.
 */
export interface UserRepository {
  findByUsername(username: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(user: User): Promise<User>;
}

/**
 * In-memory user store. State lives only for the lifetime of the process, so
 * users reset on every server restart. Fine for early development; replace
 * with a real database before this is anything more than a prototype.
 */
export class InMemoryUserRepository implements UserRepository {
  private byId = new Map<string, User>();
  private byUsername = new Map<string, User>();

  async findByUsername(username: string): Promise<User | null> {
    return this.byUsername.get(username.toLowerCase()) ?? null;
  }

  async findById(id: string): Promise<User | null> {
    return this.byId.get(id) ?? null;
  }

  async create(user: User): Promise<User> {
    this.byId.set(user.id, user);
    this.byUsername.set(user.username.toLowerCase(), user);
    return user;
  }
}
