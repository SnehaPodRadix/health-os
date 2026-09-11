import { z } from 'zod';
import { AuthError } from '../../utils/auth/service';
import { authService, ensureSeeded } from '../../utils/auth/instance';
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from '../../utils/auth/config';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export default defineEventHandler(async (event) => {
  await ensureSeeded();

  const body = await readBody(event);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Username and password are required',
    });
  }

  try {
    const { user, token } = await authService.login(
      parsed.data.username,
      parsed.data.password,
    );

    setCookie(event, SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    });

    return { user };
  } catch (error) {
    if (error instanceof AuthError) {
      throw createError({ statusCode: 401, statusMessage: error.message });
    }
    console.error('Login failed:', error);
    throw createError({ statusCode: 500, statusMessage: 'Something went wrong' });
  }
});
