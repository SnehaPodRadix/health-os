/** Name of the cookie that stores the session token. */
export const SESSION_COOKIE = 'health_os_session';

/** How long a session lasts, in seconds (7 days). */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

/**
 * Secret used to sign/verify session tokens, as bytes.
 *
 * In production AUTH_SECRET must be set. In development we fall back to a
 * well-known insecure value so the app runs out of the box — never rely on it
 * for anything real. (Nuxt loads .env into process.env automatically; to move
 * this to runtimeConfig later, pass the secret in from the route handler.)
 */
export function getAuthSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;

  if (secret && secret.length > 0) {
    return new TextEncoder().encode(secret);
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET must be set in production');
  }

  return new TextEncoder().encode('dev-insecure-secret-change-me-please-000000');
}
