import { AuthService } from './service';
import { InMemoryUserRepository } from './users';

/**
 * Process-wide auth service backed by the in-memory store. When you move to a
 * real database, construct AuthService with your DB-backed UserRepository here
 * and nothing else in the app needs to change.
 */
const repository = new InMemoryUserRepository();
export const authService = new AuthService(repository);

let seeding: Promise<void> | null = null;

/**
 * Ensure the demo user exists before handling auth. Idempotent and safe to
 * call on every request. Because the store is in-memory, this reseeds after a
 * server restart. Drop this once a persistent user store is in place.
 */
export function ensureSeeded(): Promise<void> {
  if (!seeding) {
    seeding = (async () => {
      const username = process.env.DEMO_USERNAME ?? 'demo';
      const password = process.env.DEMO_PASSWORD ?? 'password123';
      if (!(await repository.findByUsername(username))) {
        await authService.register(username, password);
      }
    })();
  }
  return seeding;
}
