import { describe, expect, it } from 'vitest';

import {
  buildMerkleProof,
  hashSnapshotLeaf,
  hashVoteLeaf,
  verifyMerkleProof,
} from '../blockchain/hashing/merkle';
import {
  hashMemberId as realHashMemberId,
  hashOptionId as realHashOptionId,
} from '../blockchain/hashing/id-hash';
import { buildEnvelopeForSource } from '../blockchain/payloads';
import type { RecordSource } from '../blockchain/types';
import type { BuildEnvelopePort, Hex32, PolicyService, ProposalCreateInput } from './types';

import {
  makeFakeEngineDb,
  makeFakeRecordsPort,
  type FakeEngineDb,
  type FakeRecordsPort,
} from './testing/fake-engine-db';
import { createProposalService, type ProposalServiceDeps } from './proposal-service';

const COMMUNITY = 'com_1';
const PEPPER = 'test-pepper';
const APPROVE_REJECT = [{ id: 'approve' }, { id: 'reject' }] as const;

/** Deterministic non-crypto hex32 hash port for fake-only tests. */
function fakeHex(seed: string): Hex32 {
  let out = '';
  for (let i = 0; i < 64; i += 1) out += ((seed.charCodeAt(i % seed.length) * (i + 3) + i * 17) % 16).toString(16);
  return `0x${out}` as Hex32;
}
const fakeHashMemberId = (c: string, m: string): Hex32 => fakeHex(`m:${c}:${m}`);
const fakeHashOptionId = (p: string, o: string): Hex32 => fakeHex(`o:${p}:${o}`);

interface Harness {
  readonly db: FakeEngineDb;
  readonly records: FakeRecordsPort;
  readonly pendingVersionCalls: Array<Record<string, unknown>>;
  readonly capturedSources: RecordSource[];
  readonly service: ReturnType<typeof createProposalService>;
}

function makeHarness(
  opts: {
    hashMemberId?: (c: string, m: string) => Hex32;
    hashOptionId?: (p: string, o: string) => Hex32;
    // Inject the REAL buildEnvelopeForSource (via the wrapper below) to close the
    // fake-envelope gap: the fake never validates fields, so a null winningOptionId
    // would go undetected; the real builder throws RESULT_INCOMPLETE.
    buildEnvelope?: BuildEnvelopePort;
  } = {},
): Harness {
  const db = makeFakeEngineDb();
  const records = makeFakeRecordsPort();
  const pendingVersionCalls: Array<Record<string, unknown>> = [];
  const capturedSources: RecordSource[] = [];
  let hashSeq = 0;
  const fakeBuildEnvelope: BuildEnvelopePort = (source) => {
    hashSeq += 1;
    return {
      envelope: { schema: 'youfen.record.v1', type: source.kind, payload: {} },
      recordHash: `0x${hashSeq.toString(16).padStart(64, '0')}` as Hex32,
    };
  };
  const buildEnvelope: BuildEnvelopePort = (source) => {
    capturedSources.push(source as RecordSource);
    return (opts.buildEnvelope ?? fakeBuildEnvelope)(source);
  };
  const policy: Pick<PolicyService, 'createPendingVersion'> = {
    createPendingVersion: async (_tx, input) => {
      pendingVersionCalls.push(input as unknown as Record<string, unknown>);
      return { versionId: 'pv_1', version: 2, effectiveEpoch: 2 };
    },
  };
  const deps: ProposalServiceDeps = {
    db,
    records,
    buildEnvelope,
    policy,
    hashMemberId: opts.hashMemberId ?? fakeHashMemberId,
    hashOptionId: opts.hashOptionId ?? fakeHashOptionId,
  };
  return { db, records, pendingVersionCalls, capturedSources, service: createProposalService(deps) };
}

function seedCommunity(db: FakeEngineDb): void {
  db.seedCommunity({ id: COMMUNITY });
  db.seedState({ communityId: COMMUNITY, currentTotalSupply: 1000n });
  db.seedPolicy({ communityId: COMMUNITY, policyVersion: 3 });
  db.seedEpoch({ id: 'ep_1', communityId: COMMUNITY, epochNumber: 5, status: 'active' });
}

function seedMembers(db: FakeEngineDb, weights: ReadonlyArray<[string, bigint]>): void {
  for (const [memberId, weight] of weights) {
    db.seedBalance({ communityId: COMMUNITY, memberId, activeGovernanceBalance: weight, totalBalance: weight });
  }
}

function input(overrides: Partial<ProposalCreateInput> = {}): ProposalCreateInput {
  return {
    communityId: COMMUNITY,
    title: 'Test proposal',
    type: 'community_decision',
    createdBy: 'author_1',
    options: [...APPROVE_REJECT],
    ...overrides,
  };
}

/** create + patch minimumVoterCount + activate. */
async function createAndActivate(h: Harness, over: Partial<ProposalCreateInput>, minimumVoterCount = 1): Promise<string> {
  const { proposalId } = await h.service.create(input(over));
  await h.db.proposal.update({ where: { id: proposalId }, data: { minimumVoterCount } });
  await h.service.activate(proposalId);
  return proposalId;
}

async function pastEnd(h: Harness, proposalId: string): Promise<void> {
  await h.db.proposal.update({ where: { id: proposalId }, data: { endTime: new Date(Date.now() - 1000) } });
}

function proposalRow(h: Harness, id: string): Record<string, unknown> | undefined {
  return h.db.rows('proposal').find((r) => r.id === id);
}

describe('proposal-service: create (six-type validation)', () => {
  it('creates a community_decision draft + a proposal_created DB-only record (never enqueued)', async () => {
    const h = makeHarness();
    seedCommunity(h.db);
    const { proposalId } = await h.service.create(input());
    const row = proposalRow(h, proposalId);
    expect(row?.status).toBe('draft');
    expect(row?.type).toBe('community_decision');
    const [record] = h.db.rows('publicRecord');
    expect(record.recordType).toBe('proposal_created');
    expect(record.status).toBe('recorded');
    expect(record.chainEligible).toBe(false);
    expect(h.records.submissions).toEqual([]);
  });

  it('rejects an unknown type and fewer-than-two options', async () => {
    const h = makeHarness();
    seedCommunity(h.db);
    await expect(h.service.create(input({ type: 'nonsense' as ProposalCreateInput['type'] }))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(h.service.create(input({ options: [{ id: 'approve' }] }))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('token_policy_change requires the rate payload, then stores it', async () => {
    const h = makeHarness();
    seedCommunity(h.db);
    await expect(h.service.create(input({ type: 'token_policy_change', metadata: {} }))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const { proposalId } = await h.service.create(
      input({
        type: 'token_policy_change',
        metadata: { policyChangePayload: { monthlyInflationRateBps: 100, maxAdvanceRateBps: 2000, memberMintCapRateBps: 500 } },
      }),
    );
    expect((proposalRow(h, proposalId)?.policyChangePayload as { monthlyInflationRateBps: number }).monthlyInflationRateBps).toBe(100);
  });

  it('budget_advance requires advanceAmount + advanceRequestId', async () => {
    const h = makeHarness();
    seedCommunity(h.db);
    await expect(h.service.create(input({ type: 'budget_advance', metadata: { advanceAmount: 50n } }))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const { proposalId } = await h.service.create(
      input({ type: 'budget_advance', metadata: { advanceAmount: 50n, policyChangePayload: { advanceRequestId: 'adv_1' } } }),
    );
    const row = proposalRow(h, proposalId);
    expect(row?.advanceAmount).toBe(50n);
    expect((row?.policyChangePayload as { advanceRequestId: string }).advanceRequestId).toBe('adv_1');
  });

  it('special_mint requires recipient + amount', async () => {
    const h = makeHarness();
    seedCommunity(h.db);
    await expect(h.service.create(input({ type: 'special_mint', metadata: { specialMintRecipientId: 'm1' } }))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const { proposalId } = await h.service.create(input({ type: 'special_mint', metadata: { specialMintRecipientId: 'm1', specialMintAmount: 42n } }));
    expect(proposalRow(h, proposalId)?.specialMintAmount).toBe(42n);
  });

  it('related_party_mint requires recipient + amount + relatedPartyNote', async () => {
    const h = makeHarness();
    seedCommunity(h.db);
    await expect(
      h.service.create(input({ type: 'related_party_mint', metadata: { specialMintRecipientId: 'm1', specialMintAmount: 42n } })),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const { proposalId } = await h.service.create(
      input({ type: 'related_party_mint', metadata: { specialMintRecipientId: 'm1', specialMintAmount: 42n, relatedPartyNote: 'founder' } }),
    );
    expect(proposalRow(h, proposalId)?.relatedPartyNote).toBe('founder');
  });

  it('token_reversal requires targetMintEventId', async () => {
    const h = makeHarness();
    seedCommunity(h.db);
    await expect(h.service.create(input({ type: 'token_reversal', metadata: {} }))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const { proposalId } = await h.service.create(input({ type: 'token_reversal', metadata: { policyChangePayload: { targetMintEventId: 'mint_9' } } }));
    expect((proposalRow(h, proposalId)?.policyChangePayload as { targetMintEventId: string }).targetMintEventId).toBe('mint_9');
  });

  it('persists creator governance params (description/minimumVoterCount/endTime) instead of silently dropping them', async () => {
    const h = makeHarness();
    seedCommunity(h.db);
    const endTime = '2030-01-02T03:04:05.000Z';
    const { proposalId } = await h.service.create(
      input({ metadata: { description: 'quorum needs ten voters', minimumVoterCount: 10, endTime } }),
    );
    const row = proposalRow(h, proposalId);
    // W5-3 API fields must land on the Proposal's own columns (W3-5 frozen store),
    // not be forced to minimumVoterCount=3 / a 72h window / description=null.
    expect(row?.description).toBe('quorum needs ten voters');
    expect(row?.minimumVoterCount).toBe(10);
    expect(row?.endTime).toBeInstanceOf(Date);
    expect((row?.endTime as Date).toISOString()).toBe(endTime);
  });

  it('honors a creator endTime at activation (no forced 72h window) and enforces the creator quorum at end', async () => {
    const h = makeHarness();
    seedCommunity(h.db);
    seedMembers(h.db, [['m1', 60n], ['m2', 10n]]);
    const endTime = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h, not the 72h default
    const { proposalId } = await h.service.create(input({ metadata: { minimumVoterCount: 5, endTime } }));
    await h.service.activate(proposalId);
    // activate must not overwrite the creator window with now+72h.
    expect((proposalRow(h, proposalId)?.endTime as Date).toISOString()).toBe(endTime.toISOString());
    await h.service.castVote({ proposalId, memberId: 'm1', optionId: 'approve' }); // 1 vote, creator quorum is 5
    await pastEnd(h, proposalId);
    // minimumVoterCount=5 came from create (not defaulted to 3), so 1 vote is sub-quorum.
    expect(await h.service.end(proposalId)).toMatchObject({ winningOptionId: 'approve', quorumMet: false });
  });
});

describe('proposal-service: activate (dual-Merkle snapshot)', () => {
  it('snapshots every member (including zero-weight) and enqueues the record', async () => {
    const h = makeHarness();
    seedCommunity(h.db);
    seedMembers(h.db, [['m1', 30n], ['m2', 0n], ['m3', 70n]]);
    const { proposalId } = await h.service.create(input());
    const res = await h.service.activate(proposalId);
    expect(res).toHaveProperty('snapshotRecordId');
    expect(h.db.rows('proposalMemberSnapshot').filter((r) => r.proposalId === proposalId)).toHaveLength(3);
    const row = proposalRow(h, proposalId);
    expect(row?.status).toBe('active');
    expect(row?.activeGovernanceSupplySnapshot).toBe(100n);
    expect(row?.epochNumberSnapshot).toBe(5);
    expect(row?.totalSupplySnapshot).toBe(1000n);
    expect(row?.tokenPolicyVersionSnapshot).toBe(3);
    expect(row?.snapshotPublicRecordId).toBeDefined();
    expect(h.records.submissions).toHaveLength(1);
  });

  it('freezes voting weight: a later live-balance change does not move the snapshot', async () => {
    const h = makeHarness();
    seedCommunity(h.db);
    seedMembers(h.db, [['m1', 30n], ['m2', 70n]]);
    const proposalId = await createAndActivate(h, {});
    await h.db.memberTokenBalance.update({
      where: { communityId_memberId: { communityId: COMMUNITY, memberId: 'm1' } },
      data: { activeGovernanceBalance: 999999n },
    });
    const snap = h.db.rows('proposalMemberSnapshot').find((r) => r.proposalId === proposalId && r.memberId === 'm1');
    expect(snap?.activeGovernanceToken).toBe(30n);
    expect(proposalRow(h, proposalId)?.activeGovernanceSupplySnapshot).toBe(100n);
  });

  it('rejects activation with no active epoch (EPOCH_NOT_ACTIVE)', async () => {
    const h = makeHarness();
    h.db.seedCommunity({ id: COMMUNITY });
    h.db.seedState({ communityId: COMMUNITY });
    h.db.seedPolicy({ communityId: COMMUNITY });
    const { proposalId } = await h.service.create(input());
    await expect(h.service.activate(proposalId)).rejects.toMatchObject({ code: 'EPOCH_NOT_ACTIVE' });
  });

  it('is noop when already active', async () => {
    const h = makeHarness();
    seedCommunity(h.db);
    seedMembers(h.db, [['m1', 10n]]);
    const { proposalId } = await h.service.create(input());
    await h.service.activate(proposalId);
    expect(await h.service.activate(proposalId)).toEqual({ noop: true });
  });

  it('rejects activation of a missing proposal (NOT_FOUND)', async () => {
    const h = makeHarness();
    seedCommunity(h.db);
    await expect(h.service.activate('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('proposal-service: castVote (snapshot-bound)', () => {
  it('rejects a member absent from the snapshot with FORBIDDEN', async () => {
    const h = makeHarness();
    seedCommunity(h.db);
    seedMembers(h.db, [['m1', 10n], ['m2', 20n]]);
    const proposalId = await createAndActivate(h, {});
    await expect(h.service.castVote({ proposalId, memberId: 'intruder', optionId: 'approve' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('adversarial: minting a NEW member after activation grants no vote', async () => {
    const h = makeHarness();
    seedCommunity(h.db);
    seedMembers(h.db, [['m1', 10n], ['m2', 20n]]);
    const proposalId = await createAndActivate(h, {});
    h.db.seedBalance({ communityId: COMMUNITY, memberId: 'attacker', activeGovernanceBalance: 1_000_000n });
    await expect(h.service.castVote({ proposalId, memberId: 'attacker', optionId: 'approve' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('counts the frozen snapshot weight, not the inflated live balance', async () => {
    const h = makeHarness();
    seedCommunity(h.db);
    seedMembers(h.db, [['m1', 10n], ['m2', 20n]]);
    const proposalId = await createAndActivate(h, {});
    await h.db.memberTokenBalance.update({
      where: { communityId_memberId: { communityId: COMMUNITY, memberId: 'm1' } },
      data: { activeGovernanceBalance: 5_000n, totalBalance: 5_000n },
    });
    await h.service.castVote({ proposalId, memberId: 'm1', optionId: 'approve' });
    const vote = h.db.rows('vote').find((v) => v.memberId === 'm1');
    expect(vote?.activeGovernanceBalanceSnapshot).toBe(10n); // counted weight = frozen snapshot
    expect(vote?.totalTokenBalanceSnapshot).toBe(5_000n); // display-only live read
  });

  it('is idempotent on a repeat vote by the same member', async () => {
    const h = makeHarness();
    seedCommunity(h.db);
    seedMembers(h.db, [['m1', 10n], ['m2', 20n]]);
    const proposalId = await createAndActivate(h, {});
    const first = await h.service.castVote({ proposalId, memberId: 'm1', optionId: 'approve' });
    const second = await h.service.castVote({ proposalId, memberId: 'm1', optionId: 'reject' });
    expect(second.voteId).toBe(first.voteId);
    expect(second.idempotent).toBe(true);
    expect(h.db.rows('vote').filter((v) => v.memberId === 'm1')).toHaveLength(1);
  });

  it('rejects an off-ballot option (VALIDATION_ERROR) and a closed proposal (INVALID_STATUS)', async () => {
    const h = makeHarness();
    seedCommunity(h.db);
    seedMembers(h.db, [['m1', 10n]]);
    const proposalId = await createAndActivate(h, {});
    await expect(h.service.castVote({ proposalId, memberId: 'm1', optionId: 'maybe' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await pastEnd(h, proposalId);
    await expect(h.service.castVote({ proposalId, memberId: 'm1', optionId: 'approve' })).rejects.toMatchObject({ code: 'INVALID_STATUS' });
  });
});

describe('proposal-service: end (settlement callback)', () => {
  async function voteAll(h: Harness, proposalId: string, ballots: ReadonlyArray<[string, string]>): Promise<void> {
    for (const [memberId, optionId] of ballots) await h.service.castVote({ proposalId, memberId, optionId });
  }
  const policyMeta = {
    type: 'token_policy_change' as const,
    metadata: { policyChangePayload: { monthlyInflationRateBps: 150, maxAdvanceRateBps: 3000, memberMintCapRateBps: 800 } },
  };

  it('records a winner without quorum but fires NO settlement callback', async () => {
    const h = makeHarness();
    seedCommunity(h.db);
    seedMembers(h.db, [['m1', 40n], ['m2', 10n]]);
    const proposalId = await createAndActivate(h, policyMeta, 5); // quorum needs 5; only 1 votes
    await voteAll(h, proposalId, [['m1', 'approve']]);
    await pastEnd(h, proposalId);
    const res = await h.service.end(proposalId);
    expect(res).toMatchObject({ winningOptionId: 'approve', quorumMet: false });
    expect(h.pendingVersionCalls).toHaveLength(0);
  });

  it('resolves a tie to the status-quo reject (never null) and records instead of stranding active', async () => {
    const h = makeHarness();
    seedCommunity(h.db);
    seedMembers(h.db, [['m1', 50n], ['m2', 50n]]);
    const proposalId = await createAndActivate(h, {}, 1);
    await voteAll(h, proposalId, [['m1', 'approve'], ['m2', 'reject']]);
    await pastEnd(h, proposalId);
    const res = await h.service.end(proposalId);
    // A tie has no plurality: it falls to 'reject' so the frozen result builder
    // never throws RESULT_INCOMPLETE and rolls the proposal back to 'active'.
    expect(res).toMatchObject({ winningOptionId: 'reject', quorumMet: true });
    expect(proposalRow(h, proposalId)?.status).toBe('recorded');
    expect(h.pendingVersionCalls).toHaveLength(0); // reject fires no settlement
  });

  it('REAL builder: a zero-vote (sub-quorum) proposal records to reject rather than throwing RESULT_INCOMPLETE', async () => {
    // Wire the production envelope builder — the same buildEnvelopeForSource that
    // runtime.ts binds. With the old null-winner contract, end() would throw
    // TerminalError('RESULT_INCOMPLETE'), roll the tx back, and strand the
    // proposal 'active' forever. This is the fake-vs-real gap that hid the bug.
    const h = makeHarness({
      buildEnvelope: (source) => buildEnvelopeForSource(source as RecordSource, PEPPER),
      hashMemberId: (c, m) => realHashMemberId(c, m, PEPPER),
      hashOptionId: (p, o) => realHashOptionId(p, o),
    });
    seedCommunity(h.db);
    seedMembers(h.db, [['m1', 10n], ['m2', 20n]]);
    const proposalId = await createAndActivate(h, {}, 1);
    await pastEnd(h, proposalId);
    const res = await h.service.end(proposalId);
    expect(res).toMatchObject({ winningOptionId: 'reject', voterCount: 0 });
    expect(proposalRow(h, proposalId)?.status).toBe('recorded');
    // The result record was actually built and enqueued (proof the real builder ran).
    expect(h.records.submissions).toContain((res as { resultRecordId: string }).resultRecordId);
  });

  it('token_policy_change approval creates a pending policy version', async () => {
    const h = makeHarness();
    seedCommunity(h.db);
    seedMembers(h.db, [['m1', 60n], ['m2', 10n]]);
    const proposalId = await createAndActivate(h, policyMeta, 1);
    await voteAll(h, proposalId, [['m1', 'approve'], ['m2', 'reject']]);
    await pastEnd(h, proposalId);
    await h.service.end(proposalId);
    expect(h.pendingVersionCalls).toHaveLength(1);
    expect(h.pendingVersionCalls[0]).toMatchObject({
      communityId: COMMUNITY,
      proposalId,
      monthlyInflationRateBps: 150,
      maxAdvanceRateBps: 3000,
      memberMintCapRateBps: 800,
    });
  });

  it('budget_advance approval flips the advance request to approved', async () => {
    const h = makeHarness();
    seedCommunity(h.db);
    seedMembers(h.db, [['m1', 60n], ['m2', 10n]]);
    h.db.seedAdvanceRequest({ id: 'adv_1', communityId: COMMUNITY, status: 'pending_proposal' });
    const proposalId = await createAndActivate(
      h,
      { type: 'budget_advance', metadata: { advanceAmount: 500n, policyChangePayload: { advanceRequestId: 'adv_1' } } },
      1,
    );
    await voteAll(h, proposalId, [['m1', 'approve']]);
    await pastEnd(h, proposalId);
    await h.service.end(proposalId);
    const adv = h.db.rows('tokenAdvanceRequest').find((r) => r.id === 'adv_1');
    expect(adv?.status).toBe('approved');
    expect(adv?.approvedAt).toBeInstanceOf(Date);
  });

  it('community_decision approval has zero ledger side effects', async () => {
    const h = makeHarness();
    seedCommunity(h.db);
    seedMembers(h.db, [['m1', 60n], ['m2', 10n]]);
    const proposalId = await createAndActivate(h, {}, 1);
    await voteAll(h, proposalId, [['m1', 'approve']]);
    await pastEnd(h, proposalId);
    await h.service.end(proposalId);
    expect(h.pendingVersionCalls).toHaveLength(0);
    expect(h.db.rows('tokenPolicyVersion')).toHaveLength(0);
    expect(h.db.rows('tokenMintEvent')).toHaveLength(0);
  });

  it('is idempotent once recorded (second end -> noop)', async () => {
    const h = makeHarness();
    seedCommunity(h.db);
    seedMembers(h.db, [['m1', 60n]]);
    const proposalId = await createAndActivate(h, {}, 1);
    await h.service.castVote({ proposalId, memberId: 'm1', optionId: 'approve' });
    await pastEnd(h, proposalId);
    await h.service.end(proposalId);
    expect(await h.service.end(proposalId)).toEqual({ noop: true });
  });

  it('rejects ending a draft proposal (INVALID_STATUS)', async () => {
    const h = makeHarness();
    seedCommunity(h.db);
    const { proposalId } = await h.service.create(input());
    await expect(h.service.end(proposalId)).rejects.toMatchObject({ code: 'INVALID_STATUS' });
  });
});

describe('proposal-service: Merkle self-consistency', () => {
  it('weightsMerkleRoot verifies a member inclusion proof (fake hash ports)', async () => {
    const h = makeHarness();
    seedCommunity(h.db);
    seedMembers(h.db, [['m1', 30n], ['m2', 0n], ['m3', 70n]]);
    const proposalId = await createAndActivate(h, {});
    const source = h.capturedSources.find((s) => s.kind === 'proposal_snapshot');
    const root = source && 'proposal' in source ? source.proposal.weightsMerkleRoot : undefined;
    expect(root).toBeDefined();
    const snaps = h.db
      .rows('proposalMemberSnapshot')
      .filter((r) => r.proposalId === proposalId)
      .sort((a, b) => ((a.memberId as string) < (b.memberId as string) ? -1 : 1));
    const leaves = snaps.map((r) => hashSnapshotLeaf(fakeHashMemberId(COMMUNITY, r.memberId as string), r.activeGovernanceToken as bigint));
    const idx = snaps.findIndex((r) => r.memberId === 'm3');
    expect(verifyMerkleProof(leaves[idx], buildMerkleProof(leaves, idx), root as Hex32)).toBe(true);
  });

  it('votesMerkleRoot verifies a ballot proof under REAL id-hash (2-arg hashOptionId)', async () => {
    const hashMemberId = (c: string, m: string): Hex32 => realHashMemberId(c, m, PEPPER);
    const hashOptionId = (p: string, o: string): Hex32 => realHashOptionId(p, o);
    const h = makeHarness({ hashMemberId, hashOptionId });
    seedCommunity(h.db);
    seedMembers(h.db, [['m1', 40n], ['m2', 25n], ['m3', 35n]]);
    const proposalId = await createAndActivate(h, {}, 1);
    await h.service.castVote({ proposalId, memberId: 'm1', optionId: 'approve' });
    await h.service.castVote({ proposalId, memberId: 'm2', optionId: 'reject' });
    await h.service.castVote({ proposalId, memberId: 'm3', optionId: 'approve' });
    await pastEnd(h, proposalId);
    await h.service.end(proposalId);
    const source = h.capturedSources.find((s) => s.kind === 'proposal_result');
    const root = source && 'proposal' in source ? source.proposal.votesMerkleRoot : undefined;
    expect(root).toBeDefined();
    const votes = h.db.rows('vote').filter((v) => v.proposalId === proposalId);
    const leaves = votes.map((v) =>
      hashVoteLeaf(hashMemberId(COMMUNITY, v.memberId as string), hashOptionId(proposalId, v.optionId as string), v.activeGovernanceBalanceSnapshot as bigint),
    );
    const idx = votes.findIndex((v) => v.memberId === 'm2');
    expect(verifyMerkleProof(leaves[idx], buildMerkleProof(leaves, idx), root as Hex32)).toBe(true);
  });
});
