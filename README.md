# Health OS

Nuxt 3 app. Currently only the **login functionality** is built — username + password,
with the UI kept intentionally tentative (a throwaway dev harness at `/`).

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # auth logic unit tests (vitest)
```

Seeded demo user: **`demo` / `password123`** (configurable via `.env`, see `.env.example`).

## How auth is structured

The logic is split so the **UI and the database can each be swapped in later**
without touching the core:

```
server/utils/auth/         framework-agnostic core (no Nuxt/HTTP in here)
  types.ts                 User / PublicUser / SessionPayload
  password.ts              bcrypt hash + verify (+ timing guard)
  session.ts               sign / verify session JWT (jose, HS256)
  users.ts                 UserRepository interface + InMemoryUserRepository
  service.ts               AuthService — register / login / getUserFromToken
  config.ts                cookie name, TTL, AUTH_SECRET
  instance.ts              singleton service + demo-user seeding
server/api/auth/           Nuxt (h3) routes — the only HTTP/cookie-aware layer
  login.post.ts            POST  → sets httpOnly session cookie
  logout.post.ts           POST  → clears the cookie
  me.get.ts                GET   → current user, or 401
app.vue                    TEMPORARY dev harness — replace with the real login UI
```

**Session:** signed JWT (HS256) stored in an `httpOnly`, `SameSite=Lax` cookie
(`secure` in production), 7-day expiry.

## The two seams to fill in later

1. **Real UI** — the login screen calls `POST /api/auth/login` with
   `{ username, password }` and relies on the cookie the response sets. Delete
   `app.vue` and point the real Nuxt pages at these endpoints.
2. **Real user store** — implement `UserRepository` against your database and
   construct `AuthService` with it in `server/utils/auth/instance.ts`. Nothing
   else changes. Remove the demo-user seeding at that point.

## Before production

- Set a strong `AUTH_SECRET` (`openssl rand -base64 32`).
- Replace the in-memory store (it resets on restart and isn't shared across instances).
- Add a real sign-up flow / rate limiting as needed.
