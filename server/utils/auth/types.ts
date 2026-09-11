export interface User {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: string;
}

/** A user safe to send to the client — never includes the password hash. */
export type PublicUser = Omit<User, 'passwordHash'>;

/** Claims carried inside the session token. */
export interface SessionPayload {
  /** User id. */
  sub: string;
  username: string;
}
