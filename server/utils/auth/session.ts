import { SignJWT, jwtVerify } from 'jose';
import { getAuthSecret, SESSION_TTL_SECONDS } from './config';
import type { SessionPayload } from './types';

/** Sign a session token for the given user. */
export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ username: payload.username })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getAuthSecret());
}

/** Verify a session token. Returns the payload, or null if invalid/expired. */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecret(), {
      algorithms: ['HS256'],
    });

    if (typeof payload.sub !== 'string' || typeof payload.username !== 'string') {
      return null;
    }

    return { sub: payload.sub, username: payload.username };
  } catch {
    return null;
  }
}
