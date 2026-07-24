import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

// Match all routes except Next.js internals and static files
// This ensures every request gets locale-prefixed (e.g. /admin → /zh/admin)
export const config = {
  matcher: ['/((?!_next|api|.*\\..*).*)']
};
