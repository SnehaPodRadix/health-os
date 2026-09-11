import { describe, it, expect } from 'vitest';
import { AuthService, AuthError } from '../server/utils/auth/service';
import { InMemoryUserRepository } from '../server/utils/auth/users';
import { createSessionToken, verifySessionToken } from '../server/utils/auth/session';

function makeService() {
  return new AuthService(new InMemoryUserRepository());
}

describe('AuthService.register', () => {
  it('creates a user and never leaks the password hash', async () => {
    const auth = makeService();
    const user = await auth.register('alice', 'supersecret');
    expect(user.username).toBe('alice');
    expect(user.id).toBeTruthy();
    expect((user as Record<string, unknown>).passwordHash).toBeUndefined();
  });

  it('rejects a too-short password', async () => {
    const auth = makeService();
    await expect(auth.register('alice', 'short')).rejects.toMatchObject({
      code: 'WEAK_PASSWORD',
    });
  });

  it('rejects a duplicate username (case-insensitive)', async () => {
    const auth = makeService();
    await auth.register('alice', 'supersecret');
    await expect(auth.register('ALICE', 'anotherpass')).rejects.toMatchObject({
      code: 'USERNAME_TAKEN',
    });
  });
});

describe('AuthService.login', () => {
  it('returns a user and token for correct credentials', async () => {
    const auth = makeService();
    await auth.register('bob', 'correcthorse');
    const { user, token } = await auth.login('bob', 'correcthorse');
    expect(user.username).toBe('bob');
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3); // JWT
  });

  it('rejects a wrong password with INVALID_CREDENTIALS', async () => {
    const auth = makeService();
    await auth.register('bob', 'correcthorse');
    await expect(auth.login('bob', 'wrongpass')).rejects.toBeInstanceOf(AuthError);
    await expect(auth.login('bob', 'wrongpass')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('rejects an unknown user with the same error (no enumeration)', async () => {
    const auth = makeService();
    await expect(auth.login('nobody', 'whatever')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });
});

describe('session token + getUserFromToken', () => {
  it('round-trips a valid token back to the user', async () => {
    const auth = makeService();
    const created = await auth.register('carol', 'passphrase1');
    const { token } = await auth.login('carol', 'passphrase1');
    const user = await auth.getUserFromToken(token);
    expect(user?.id).toBe(created.id);
    expect(user?.username).toBe('carol');
  });

  it('returns null for a missing or garbage token', async () => {
    const auth = makeService();
    expect(await auth.getUserFromToken(undefined)).toBeNull();
    expect(await auth.getUserFromToken('not-a-real-token')).toBeNull();
  });

  it('verifies a signed token payload directly', async () => {
    const token = await createSessionToken({ sub: 'u1', username: 'zed' });
    const payload = await verifySessionToken(token);
    expect(payload).toMatchObject({ sub: 'u1', username: 'zed' });
  });
});
