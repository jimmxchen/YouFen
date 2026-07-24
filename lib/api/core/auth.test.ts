import { describe, it, expect } from 'vitest';

import {
  resolveAuthFromHeaders,
  defaultAuthorizeAdmin,
  requireInternal,
  requireVerifiedActor,
  type AuthContext,
  type AuthEnv,
} from './auth';

const ENV = { internalApiToken: 'internal-secret', cronSecret: 'cron-secret' };

function headers(entries: Record<string, string>): { get(name: string): string | null } {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(entries)) lower[k.toLowerCase()] = v;
  return { get: (name: string) => lower[name.toLowerCase()] ?? null };
}

describe('resolveAuthFromHeaders', () => {
  it('no token: anonymous, not admin, not internal', () => {
    const ctx = resolveAuthFromHeaders(headers({}), ENV);
    expect(ctx).toEqual<AuthContext>({ actorId: null, isAdmin: false, isInternal: false, actorVerified: false });
  });

  it('wrong bearer token: not admin, not internal', () => {
    const ctx = resolveAuthFromHeaders(headers({ authorization: 'Bearer nope' }), ENV);
    expect(ctx).toEqual<AuthContext>({ actorId: null, isAdmin: false, isInternal: false, actorVerified: false });
  });

  it('internal token: internal and admin', () => {
    const ctx = resolveAuthFromHeaders(headers({ authorization: 'Bearer internal-secret' }), ENV);
    expect(ctx.isInternal).toBe(true);
    expect(ctx.isAdmin).toBe(true);
  });

  it('cron secret: internal and admin', () => {
    const ctx = resolveAuthFromHeaders(headers({ authorization: 'Bearer cron-secret' }), ENV);
    expect(ctx.isInternal).toBe(true);
    expect(ctx.isAdmin).toBe(true);
  });

  it('actor header: carries actorId without elevating privileges', () => {
    const ctx = resolveAuthFromHeaders(headers({ 'x-youfen-actor-id': 'user_42' }), ENV);
    expect(ctx.actorId).toBe('user_42');
    expect(ctx.isAdmin).toBe(false);
    expect(ctx.isInternal).toBe(false);
  });

  it('admin flag + internal bearer grants admin but not internal', () => {
    const ctx = resolveAuthFromHeaders(
      headers({ 'x-youfen-admin': '1', authorization: 'Bearer internal-secret', 'x-youfen-actor-id': 'admin_1' }),
      ENV,
    );
    // bearer === internalApiToken so this is also internal; admin holds regardless
    expect(ctx.isAdmin).toBe(true);
    expect(ctx.actorId).toBe('admin_1');
  });

  it('admin flag without the internal bearer does not grant admin', () => {
    const ctx = resolveAuthFromHeaders(
      headers({ 'x-youfen-admin': '1', 'x-youfen-actor-id': 'user_9' }),
      ENV,
    );
    expect(ctx.isAdmin).toBe(false);
    expect(ctx.isInternal).toBe(false);
    expect(ctx.actorId).toBe('user_9');
  });

  it('null env tokens never authenticate an empty bearer', () => {
    const ctx = resolveAuthFromHeaders(
      headers({ authorization: 'Bearer ' }),
      { internalApiToken: null, cronSecret: null },
    );
    expect(ctx.isInternal).toBe(false);
    expect(ctx.isAdmin).toBe(false);
  });
});

describe('resolveAuthFromHeaders — per-admin credential binding (separation of duties)', () => {
  const CRED_ENV: AuthEnv = {
    internalApiToken: 'internal-secret',
    cronSecret: 'cron-secret',
    adminCredentials: [
      { token: 'admin-a-secret', principalId: 'admin_a' },
      { token: 'admin-b-secret', principalId: 'admin_b' },
    ],
  };

  it('binds actorId to the authenticating credential and marks it verified', () => {
    const ctx = resolveAuthFromHeaders(headers({ authorization: 'Bearer admin-a-secret' }), CRED_ENV);
    expect(ctx.actorId).toBe('admin_a');
    expect(ctx.isAdmin).toBe(true);
    expect(ctx.actorVerified).toBe(true);
  });

  it('ignores a spoofed x-youfen-actor-id header for a credentialed admin', () => {
    // Holder of admin A's secret tries to act as admin B via the header.
    const ctx = resolveAuthFromHeaders(
      headers({ authorization: 'Bearer admin-a-secret', 'x-youfen-actor-id': 'admin_b' }),
      CRED_ENV,
    );
    expect(ctx.actorId).toBe('admin_a');
    expect(ctx.actorVerified).toBe(true);
  });

  it('two distinct credentials yield two distinct verified principals', () => {
    const a = resolveAuthFromHeaders(headers({ authorization: 'Bearer admin-a-secret' }), CRED_ENV);
    const b = resolveAuthFromHeaders(headers({ authorization: 'Bearer admin-b-secret' }), CRED_ENV);
    expect(a.actorId).not.toBe(b.actorId);
    expect(a.actorVerified && b.actorVerified).toBe(true);
  });

  it('shared internal token cannot forge a verified admin approver identity', () => {
    // The exploit: one operator holding the shared INTERNAL_API_TOKEN sets an
    // arbitrary actor header to satisfy a dual-approval / non-self check.
    const ctx = resolveAuthFromHeaders(
      headers({ authorization: 'Bearer internal-secret', 'x-youfen-actor-id': 'admin_a' }),
      CRED_ENV,
    );
    // The header may not impersonate a configured admin principal.
    expect(ctx.actorId).toBeNull();
    expect(ctx.actorVerified).toBe(false);
  });

  it('shared internal token with an unconfigured header actor stays unverified', () => {
    const ctx = resolveAuthFromHeaders(
      headers({ authorization: 'Bearer internal-secret', 'x-youfen-actor-id': 'random_person' }),
      CRED_ENV,
    );
    expect(ctx.actorId).toBe('random_person');
    expect(ctx.actorVerified).toBe(false);
  });

  it('a plain header actor is never verified', () => {
    const ctx = resolveAuthFromHeaders(headers({ 'x-youfen-actor-id': 'user_42' }), CRED_ENV);
    expect(ctx.actorId).toBe('user_42');
    expect(ctx.actorVerified).toBe(false);
    expect(ctx.isAdmin).toBe(false);
  });
});

describe('requireVerifiedActor', () => {
  it('returns the actorId for a verified admin principal', () => {
    expect(
      requireVerifiedActor({ actorId: 'admin_a', isAdmin: true, isInternal: false, actorVerified: true }),
    ).toBe('admin_a');
  });

  it('throws FORBIDDEN when the actor is unverified (header-supplied)', () => {
    try {
      requireVerifiedActor({ actorId: 'admin_a', isAdmin: true, isInternal: true, actorVerified: false });
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as Error & { code: string }).code).toBe('FORBIDDEN');
    }
  });

  it('throws FORBIDDEN when actorVerified is absent (legacy context)', () => {
    try {
      requireVerifiedActor({ actorId: 'admin_a', isAdmin: true, isInternal: false });
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as Error & { code: string }).code).toBe('FORBIDDEN');
    }
  });
});

describe('defaultAuthorizeAdmin', () => {
  it('true when admin', () => {
    expect(defaultAuthorizeAdmin({ actorId: null, isAdmin: true, isInternal: false }, 'c_1')).toBe(true);
  });
  it('true when internal', () => {
    expect(defaultAuthorizeAdmin({ actorId: null, isAdmin: false, isInternal: true }, 'c_1')).toBe(true);
  });
  it('false for a plain actor', () => {
    expect(defaultAuthorizeAdmin({ actorId: 'u', isAdmin: false, isInternal: false }, 'c_1')).toBe(false);
  });
});

describe('requireInternal', () => {
  it('passes for internal contexts', () => {
    expect(() => requireInternal({ actorId: null, isAdmin: true, isInternal: true })).not.toThrow();
  });

  it('throws a FORBIDDEN engine-shaped error otherwise', () => {
    try {
      requireInternal({ actorId: 'u', isAdmin: false, isInternal: false });
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error & { code: string }).code).toBe('FORBIDDEN');
    }
  });
});
