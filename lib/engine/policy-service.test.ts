import { describe, expect, it } from 'vitest';

import { EngineError } from './errors';
import { createPolicyService } from './policy-service';
import type { EngineDeps } from './types';
import {
  makeFakeBuildEnvelope,
  makeFakeEngineDb,
  makeFakeRecordsPort,
  type FakeEngineDb,
  type FakeRecordsPort,
} from './testing/fake-engine-db';

interface Harness {
  readonly db: FakeEngineDb;
  readonly records: FakeRecordsPort;
  readonly deps: EngineDeps;
  readonly svc: ReturnType<typeof createPolicyService>;
}

/** Seed one community with an active epoch (#5) and a v1 policy. */
function setup(overrides?: { epochStatus?: string }): Harness {
  const db = makeFakeEngineDb();
  const records = makeFakeRecordsPort();
  const buildEnvelope = makeFakeBuildEnvelope();
  const deps: EngineDeps = { db, records, buildEnvelope };

  db.seedCommunity({ id: 'c1' });
  db.seedPolicy({
    id: 'pol1',
    communityId: 'c1',
    policyVersion: 1,
    monthlyInflationRateBps: 100,
    maxAdvanceRateBps: 200,
    memberMintCapRateBps: 300,
    epochDurationDays: 30,
    rules: ['r0'],
  });
  db.seedEpoch({
    id: 'ep5',
    communityId: 'c1',
    epochNumber: 5,
    status: overrides?.epochStatus ?? 'active',
  });

  return { db, records, deps, svc: createPolicyService(deps) };
}

const PENDING_INPUT = {
  communityId: 'c1',
  proposalId: 'p1',
  monthlyInflationRateBps: 150,
  maxAdvanceRateBps: 250,
  memberMintCapRateBps: 350,
  rules: ['r1'],
} as const;

describe('createPolicyService.createPendingVersion', () => {
  it('creates the next version, arms pending, and leaves live params untouched', async () => {
    const { db, svc } = setup();
    const res = await db.$transaction((tx) => svc.createPendingVersion(tx, { ...PENDING_INPUT }));

    expect(res.version).toBe(2);
    expect(res.effectiveEpoch).toBe(6);

    const pol = db.rows('communityTokenPolicy')[0];
    // Live params unchanged until activation.
    expect(pol.monthlyInflationRateBps).toBe(100);
    expect(pol.maxAdvanceRateBps).toBe(200);
    expect(pol.memberMintCapRateBps).toBe(300);
    expect(pol.policyVersion).toBe(1);
    // Pending pointers armed.
    expect(pol.pendingPolicyVersionId).toBe(res.versionId);
    expect(pol.pendingPolicyEffectiveEpoch).toBe(6);

    const vrow = db.rows('tokenPolicyVersion').find((r) => r.id === res.versionId);
    expect(vrow?.version).toBe(2);
    expect(vrow?.effectiveEpoch).toBe(6);
    expect(vrow?.monthlyInflationRateBps).toBe(150);
    expect(vrow?.maxAdvanceRateBps).toBe(250);
    expect(vrow?.memberMintCapRateBps).toBe(350);
    expect(vrow?.rules).toEqual(['r1']);
    expect(vrow?.proposalId).toBe('p1');
    expect(vrow?.policyId).toBe('pol1');
  });

  it('inherits current rules when input omits them', async () => {
    const { db, svc } = setup();
    const res = await db.$transaction((tx) =>
      svc.createPendingVersion(tx, { ...PENDING_INPUT, rules: undefined }),
    );
    const vrow = db.rows('tokenPolicyVersion').find((r) => r.id === res.versionId);
    expect(vrow?.rules).toEqual(['r0']);
  });

  it('rejects a second pending version with CONFLICT (one at a time)', async () => {
    const { db, svc } = setup();
    await db.$transaction((tx) => svc.createPendingVersion(tx, { ...PENDING_INPUT }));
    await expect(
      db.$transaction((tx) => svc.createPendingVersion(tx, { ...PENDING_INPUT })),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects bps above 10000 with VALIDATION_ERROR', async () => {
    const { db, svc } = setup();
    await expect(
      db.$transaction((tx) =>
        svc.createPendingVersion(tx, { ...PENDING_INPUT, monthlyInflationRateBps: 10001 }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects negative bps with VALIDATION_ERROR', async () => {
    const { db, svc } = setup();
    await expect(
      db.$transaction((tx) =>
        svc.createPendingVersion(tx, { ...PENDING_INPUT, maxAdvanceRateBps: -1 }),
      ),
    ).rejects.toBeInstanceOf(EngineError);
  });

  it('throws NOT_FOUND when the community has no policy row', async () => {
    const { db, svc } = setup();
    await expect(
      db.$transaction((tx) =>
        svc.createPendingVersion(tx, { ...PENDING_INPUT, communityId: 'ghost' }),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws EPOCH_NOT_ACTIVE when no active epoch exists', async () => {
    const { db, svc } = setup({ epochStatus: 'closed' });
    await expect(
      db.$transaction((tx) => svc.createPendingVersion(tx, { ...PENDING_INPUT })),
    ).rejects.toMatchObject({ code: 'EPOCH_NOT_ACTIVE' });
  });
});

describe('createPolicyService.activatePendingVersion', () => {
  async function arm(h: Harness): Promise<string> {
    const res = await h.db.$transaction((tx) =>
      h.svc.createPendingVersion(tx, { ...PENDING_INPUT }),
    );
    return res.versionId;
  }

  it('activates on the matching epoch: live params/rules/version updated, pending cleared', async () => {
    const h = setup();
    await arm(h);

    const out = await h.db.$transaction((tx) => h.svc.activatePendingVersion(tx, 'c1', 6));
    expect(out).not.toBeNull();
    expect(out?.monthlyInflationRateBps).toBe(150);
    expect(out?.chainRecordIds).toHaveLength(1);

    const pol = h.db.rows('communityTokenPolicy')[0];
    expect(pol.monthlyInflationRateBps).toBe(150);
    expect(pol.maxAdvanceRateBps).toBe(250);
    expect(pol.memberMintCapRateBps).toBe(350);
    expect(pol.policyVersion).toBe(2);
    expect(pol.rules).toEqual(['r1']);
    expect(pol.pendingPolicyVersionId).toBeNull();
    expect(pol.pendingPolicyEffectiveEpoch).toBeNull();
  });

  it('returns null when the epoch does not match the pending effective epoch', async () => {
    const h = setup();
    await arm(h);

    const out = await h.db.$transaction((tx) => h.svc.activatePendingVersion(tx, 'c1', 7));
    expect(out).toBeNull();

    // Nothing changed: still pending, live params intact.
    const pol = h.db.rows('communityTokenPolicy')[0];
    expect(pol.policyVersion).toBe(1);
    expect(pol.monthlyInflationRateBps).toBe(100);
    expect(pol.pendingPolicyEffectiveEpoch).toBe(6);
    expect(h.records.created).toHaveLength(0);
  });

  it('keeps the version row immutable: only publicRecordId is backfilled', async () => {
    const h = setup();
    const versionId = await arm(h);

    const before = h.db.rows('tokenPolicyVersion').find((r) => r.id === versionId);
    await h.db.$transaction((tx) => h.svc.activatePendingVersion(tx, 'c1', 6));
    const after = h.db.rows('tokenPolicyVersion').find((r) => r.id === versionId);

    expect(after?.publicRecordId).toBeTruthy();
    expect(before?.publicRecordId ?? null).toBeNull();
    for (const key of [
      'version',
      'effectiveEpoch',
      'monthlyInflationRateBps',
      'maxAdvanceRateBps',
      'memberMintCapRateBps',
      'proposalId',
      'policyId',
      'rules',
    ] as const) {
      expect(after?.[key]).toEqual(before?.[key]);
    }
  });

  it('emits exactly two PublicRecords: on-chain policy_version + DB-only inflation_rate_change', async () => {
    const h = setup();
    await arm(h);
    await h.db.$transaction((tx) => h.svc.activatePendingVersion(tx, 'c1', 6));

    // On-chain record went through the records port (status pending, chain-bound).
    expect(h.records.created).toHaveLength(1);
    expect(h.records.created[0]?.status).toBe('pending');

    // DB-only inflation_rate_change written straight to terminal recorded state.
    const dbRec = h.db.rows('publicRecord').find((r) => r.recordType === 'inflation_rate_change');
    expect(dbRec).toBeDefined();
    expect(dbRec?.status).toBe('recorded');
    expect(dbRec?.chainEligible).toBe(false);
    expect(dbRec?.sourceTable).toBe('CommunityTokenPolicy');
    expect(dbRec?.sourceId).toBe('pol1');

    // No network IO inside the tx: requestSubmission is the caller's job.
    expect(h.records.submissions).toHaveLength(0);
  });

  it('is idempotent: a second activation returns null and creates no new records', async () => {
    const h = setup();
    await arm(h);
    await h.db.$transaction((tx) => h.svc.activatePendingVersion(tx, 'c1', 6));

    const second = await h.db.$transaction((tx) => h.svc.activatePendingVersion(tx, 'c1', 6));
    expect(second).toBeNull();
    expect(h.records.created).toHaveLength(1);
    const inflationRecords = h.db
      .rows('publicRecord')
      .filter((r) => r.recordType === 'inflation_rate_change');
    expect(inflationRecords).toHaveLength(1);
  });

  it('returns null for a community without a policy', async () => {
    const h = setup();
    const out = await h.db.$transaction((tx) => h.svc.activatePendingVersion(tx, 'ghost', 6));
    expect(out).toBeNull();
  });
});

describe('createPolicyService read helpers', () => {
  it('getCurrentPolicy returns the live params plus the pending summary', async () => {
    const h = setup();
    expect(await h.svc.getCurrentPolicy('ghost')).toBeNull();

    await h.db.$transaction((tx) => h.svc.createPendingVersion(tx, { ...PENDING_INPUT }));
    const current = await h.svc.getCurrentPolicy('c1');
    expect(current?.policyVersion).toBe(1);
    expect(current?.monthlyInflationRateBps).toBe(100);
    expect(current?.epochDurationDays).toBe(30);
    expect(current?.pendingPolicyEffectiveEpoch).toBe(6);
    expect(current?.pendingPolicyVersionId).toBeTruthy();
  });

  it('listVersions returns every version newest-first', async () => {
    const h = setup();
    // v2 armed + activated, then v3 armed.
    await h.db.$transaction((tx) => h.svc.createPendingVersion(tx, { ...PENDING_INPUT }));
    await h.db.$transaction((tx) => h.svc.activatePendingVersion(tx, 'c1', 6));
    await h.db.$transaction((tx) =>
      h.svc.createPendingVersion(tx, { ...PENDING_INPUT, monthlyInflationRateBps: 175 }),
    );

    const versions = await h.svc.listVersions('c1');
    expect(versions.map((v) => v.policyVersion)).toEqual([3, 2]);
    expect(versions[0]?.monthlyInflationRateBps).toBe(175);
    expect(versions[1]?.monthlyInflationRateBps).toBe(150);

    expect(await h.svc.listVersions('ghost')).toEqual([]);
  });
});
