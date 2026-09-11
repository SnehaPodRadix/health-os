import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * A precomputed hash of a throwaway value. When a login is attempted for a
 * username that doesn't exist, we still run a comparison against this so the
 * response time is similar to a real user — avoiding a timing side-channel
 * that would reveal which usernames are registered.
 */
export const DUMMY_HASH = bcrypt.hashSync('unused-timing-guard-value', SALT_ROUNDS);
