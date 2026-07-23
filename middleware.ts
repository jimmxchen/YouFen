import createMiddleware from 'next-intl/middleware';
import { locales, defaultLocale } from './i18n';

export default createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'always'
});

// Match all routes except Next.js internals and static files
// This ensures every request gets locale-prefixed (e.g. /admin → /zh/admin)
export const config = {
  matcher: ['/((?!_next|api|.*\\..*).*)']
};
