import { authService } from '../../utils/auth/instance';
import { SESSION_COOKIE } from '../../utils/auth/config';

export default defineEventHandler(async (event) => {
  const token = getCookie(event, SESSION_COOKIE);
  const user = await authService.getUserFromToken(token);

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' });
  }

  return { user };
});
