// Authentication/authorization ports shared by every W5 endpoint group
// (conventions §API-endpoint-group). Pure functions only: header parsing and
// context predicates. No framework types beyond a minimal header-reader shape.
//
// HANDOFF: x-youfen-actor-id is a placeholder identity channel for local/dev and
// service-to-service calls. In production the actor identity MUST be resolved
// from the authenticated session (NextAuth) inside the route adapter and passed
// down, not trusted from a raw request header.
//
// SEPARATION OF DUTIES: a single shared INTERNAL_API_TOKEN combined with a
// forgeable x-youfen-actor-id header lets one operator mint arbitrary distinct
// actor ids, defeating dual-approval / non-self-approval checks (approverId !==
// requestedBy, distinct second approver). To bind a privileged actor identity to
// a real principal, deployments register per-admin credentials (AdminCredential):
// each admin authenticates with their own secret Bearer token, and the resulting
// actorId is derived from that credential — the header can neither override a
// bound admin identity nor impersonate a configured admin principal. Approver /
// second-approver identities MUST require `actorVerified` so that only
// credential-bound principals satisfy separation of duties.

/** Minimal structural shape of a Web `Headers` object. */
export interface HeaderReader {
  get(name: string): string | null;
}

/**
 * A per-admin credential: a distinct secret Bearer `token` bound to a stable
 * admin `principalId`. Holding the secret is the only way to act as that
 * principal, so two distinct approver identities require two distinct real
 * admins rather than one operator swapping a header value.
 */
export interface AdminCredential {
  readonly token: string;
  readonly principalId: string;
}

export interface AuthEnv {
  readonly internalApiToken: string | null;
  readonly cronSecret: string | null;
  /**
   * Optional registry of per-admin credentials. When present, a matching Bearer
   * token binds `actorId` to the credential's `principalId` (verified), and a
   * header-supplied actor id can never masquerade as any configured principal.
   * Omitted for back-compat: without it there are no distinctly-authenticated
   * admins, only shared internal automation.
   */
  readonly adminCredentials?: readonly AdminCredential[];
}

export interface AuthContext {
  readonly actorId: string | null;
  readonly isAdmin: boolean;
  readonly isInternal: boolean;
  /**
   * True only when `actorId` is bound to an authenticated per-admin credential
   * rather than the forgeable x-youfen-actor-id header. Separation-of-duties
   * checks (dual approval, non-self approval) MUST require this for approvers.
   * Optional so existing AuthContext literals default to unverified (safe).
   */
  readonly actorVerified?: boolean;
}

export type AuthorizeAdminFn = (
  ctx: AuthContext,
  communityId: string,
) => Promise<boolean> | boolean;

function bearerToken(headers: HeaderReader): string | null {
  const raw = headers.get('authorization');
  if (raw === null) return null;
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  if (match === null) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

/**
 * Derive an AuthContext from request headers. A Bearer token matching the
 * internal API token or the cron secret marks the caller internal (and admin).
 * A Bearer token matching a registered per-admin credential grants admin and
 * binds `actorId` to that credential's principal (verified). x-youfen-admin:1
 * combined with the internal Bearer token grants admin without marking the
 * caller internal. x-youfen-actor-id supplies a (placeholder, unverified) actor
 * — but it can never override a credential-bound identity nor impersonate a
 * configured admin principal.
 */
export function resolveAuthFromHeaders(
  headers: HeaderReader,
  env: AuthEnv,
): AuthContext {
  const token = bearerToken(headers);
  const matchesInternal = env.internalApiToken !== null && token === env.internalApiToken;
  const matchesCron = env.cronSecret !== null && token === env.cronSecret;
  const isInternal = matchesInternal || matchesCron;

  const credentials = env.adminCredentials ?? [];
  const matchedAdmin =
    token === null
      ? undefined
      : credentials.find((c) => c.token.length > 0 && c.token === token);

  const adminFlag = headers.get('x-youfen-admin') === '1';
  const isAdmin = isInternal || matchedAdmin !== undefined || (adminFlag && matchesInternal);

  const rawActor = headers.get('x-youfen-actor-id');
  const headerActor = rawActor !== null && rawActor.length > 0 ? rawActor : null;
  // A header-supplied actor id may never claim to be a configured admin
  // principal: only the holder of that admin's credential can act as it.
  const headerImpersonatesAdmin =
    headerActor !== null && credentials.some((c) => c.principalId === headerActor);

  let actorId: string | null;
  let actorVerified: boolean;
  if (matchedAdmin !== undefined) {
    // Identity is bound to the authenticated credential; header is ignored.
    actorId = matchedAdmin.principalId;
    actorVerified = true;
  } else if (headerImpersonatesAdmin) {
    // Reject a forged privileged identity from a non-credential caller.
    actorId = null;
    actorVerified = false;
  } else {
    actorId = headerActor;
    actorVerified = false;
  }

  return {
    actorId,
    isAdmin,
    isInternal,
    actorVerified,
  };
}

/** Default community-admin policy: any admin or internal caller is allowed. */
export const defaultAuthorizeAdmin: AuthorizeAdminFn = (ctx) =>
  ctx.isAdmin || ctx.isInternal;

/** Guard for internal-only endpoints. Throws a FORBIDDEN engine-shaped error. */
export function requireInternal(ctx: AuthContext): void {
  if (!ctx.isInternal) {
    const err = new Error('Internal authorization required');
    (err as Error & { code: string }).code = 'FORBIDDEN';
    throw err;
  }
}

/**
 * Guard for approver / second-approver identities under separation of duties.
 * Returns the credential-bound actorId, or throws a FORBIDDEN engine-shaped
 * error when the actor is unverified (identity came from a forgeable header
 * rather than an authenticated per-admin credential). Use this instead of
 * trusting `ctx.actorId` directly wherever a distinct, real approver is
 * required, so a single shared-token operator cannot mint approver identities.
 */
export function requireVerifiedActor(ctx: AuthContext): string {
  if (ctx.actorVerified !== true || ctx.actorId === null) {
    const err = new Error('Verified actor identity required');
    (err as Error & { code: string }).code = 'FORBIDDEN';
    throw err;
  }
  return ctx.actorId;
}
