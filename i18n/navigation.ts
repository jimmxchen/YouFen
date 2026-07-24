import { createNavigation } from 'next-intl/navigation'
import { routing } from './routing'

// Locale-aware navigation APIs. Link/useRouter automatically apply the
// current locale prefix; usePathname returns the path WITHOUT the locale
// prefix (e.g. '/admin/proposals', not '/zh/admin/proposals').
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing)
