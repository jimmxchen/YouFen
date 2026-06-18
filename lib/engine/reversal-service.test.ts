// W3-4 tests: reversal-service. Offline only — the in-memory FakeEngineDb (W2-A)
// plus hand-rolled RecordsPort / BuildEnvelopePort spies. Never touches a real
// DB/Redis/chain. Covers the six legal reversal paths, balance/supply/governance
// conservation, idempotency (incl. P2002), proposal gating, negative-balance
// rollback, ledgerSeq monotonicity, originalRecordHash flow, and supersede.

import { describe, expect, it } from 'vitest';
import { EngineError } from './errors';
import { createReversalService } from './reversal-service';
import {
  makeFakeEngineDb,
  type FakeEngineDb,
} from './testing/fake-engine-db';
import type {
  BuildEnvelopePort,
  EngineDeps,
  Hex32,
  RecordsPort,
  ReversalReason,
} from './types';
import type { RecordSource } from '../blockchain/types';

const COMMUNITY = 'c1';
const MEMBER = 'm1';
const ORIG_HASH = ('0x' + 'ab'.repeat(32)) as Hex32;

// ---- capturing BuildEnvelopePort ----
interface CapturingEnvelope {
  port: BuildEnvelopePort;
  readonly sources: RecordSource[];
}
function makeCapturingEnvelope(): CapturingEnvelope {
  const sources: RecordSource[] = [];
  let n = 0;
  const port: BuildEnvelopePort = (source) => {
    sources.push(source);
    n += 1;
    return {
      envelope: { schema: 'youfen.record.v1', type: source.kind, payload: {} },
      recordHash: (`0x${n.toString(16).padStart(64, '0')}`) as Hex32,
    };
  };
  return { port, sources };
}

// ---- controllable RecordsPort spy ----
interface SpyRecords extends RecordsPort {
  readonly created: Array<{ id: string; recordHash: string }>;
  readonly submissions: string[];
  readonly superseded: Array<{ originalId: string; byId: string }>;
  statusOf: Map<string, string>;
}
function makeSpyRecords(): SpyRecords {
  const created: Array<{ id: string; recordHash: string }> = [];
  const submissions: string[] = [];
  const superseded: Array<{ originalId: string; byId: string }> = [];
  const statusOf = new Map<string, string>();
  let seq = 0;
  return {
    created,
    submissions,
    superseded,
    statusOf,
    createPendingRecord: (_tx, input) => {
      seq += 1;
      const id = `rec_${seq}`;
      created.push({ id, recordHash: input.recordHash });
      statusOf.set(id, 'pending');
      return Promise.resolve({ id });
    },
    requestSubmission: (recordId: string) => {
      submissions.push(recordId);
      return Promise.resolve({ queued: true, jobId: `job_${recordId}` });
    },
    markSuperseded: (originalId: string, byId: string) => {
      superseded.push({ originalId, byId });
      return Promise.resolve();
    },
    getById: (id: string) => {
      const status = statusOf.get(id);
      if (status === undefined) return Promise.resolve(null);
      const rec = created.find((c) => c.id === id);
      return Promise.resolve({ id, status, recordHash: rec?.recordHash ?? '0x' });
    },
  };
}

interface Harness {
  fake: FakeEngineDb;
  records: SpyRecords;
  envelope: CapturingEnvelope;
  deps: EngineDeps;
}
function makeHarness(): Harness {
  const fake = makeFakeEngineDb();
  const records = makeSpyRecords();
  const envelope = makeCapturingEnvelope();
  const deps: EngineDeps = {
    db: fake,
    records,
    buildEnvelope: envelope.port,
    now: () => new Date('2026-01-01T00:00:00.000Z'),
  };
  return { fake, records, envelope, deps };
}

interface MintOverrides {
  id?: string;
  amount?: bigint;
  governanceStatus?: string;
  relatedParty?: boolean;
  publicRecordId?: string | null;
}
function seedMint(fake: FakeEngineDb, o: MintOverrides = {}): string {
  const id = o.id ?? 'mint1';
  void fake.tokenMintEvent.create({
    data: {
      id,
      communityId: COMMUNITY,
      memberId: MEMBER,
      epochId: 'e1',
      epochNumber: 1,
      mintType: 'contribution',
      budgetSource: 'current_epoch',
      amount: o.amount ?? 100n,
      governanceActivationEpoch: null,
      governanceStatus: o.governanceStatus ?? 'active',
      memberBalanceBefore: 0n,
      memberBalanceAfter: o.amount ?? 100n,
      totalSupplyBefore: 0n,
      totalSupplyAfter: o.amount ?? 100n,
      tokenPolicyVersion: 1,
      reason: 'r',
      approvedBy: 'admin',
      advanceRequestId: null,
      publicRecordId: o.publicRecordId === undefined ? 'rec_orig' : o.publicRecordId,
      relatedParty: o.relatedParty ?? false,
      ledgerSeq: 1,
      createdAt: new Date('2025-12-01T00:00:00.000Z'),
    },
  });
  return id;
}

function seedOriginalRecord(fake: FakeEngineDb, id = 'rec_orig'): void {
  void fake.publicRecord.create({
    data: {
      id,
      communityId: COMMUNITY,
      recordType: 'token_mint',
      status: 'verified',
      chainEligible: true,
      envelopeJson: '{}',
      recordHash: ORIG_HASH,
      sourceTable: 'TokenMintEvent',
      sourceId: 'mint1',
    },
  });
}

interface BalanceOverrides {
  totalBalance?: bigint;
  activeGovernanceBalance?: bigint;
  pendingGovernanceBalance?: bigint;
  tokensReversedLifetime?: bigint;
}
function seedFixture(fake: FakeEngineDb, b: BalanceOverrides = {}): void {
  fake.seedState({
    communityId: COMMUNITY,
    currentTotalSupply: 1000n,
    ledgerSeq: 0n,
  });
  fake.seedBalance({
    communityId: COMMUNITY,
    memberId: MEMBER,
    totalBalance: b.totalBalance ?? 100n,
    activeGovernanceBalance: b.activeGovernanceBalance ?? 100n,
    pendingGovernanceBalance: b.pendingGovernanceBalance ?? 0n,
    tokensReversedLifetime: b.tokensReversedLifetime ?? 0n,
  });
  seedOriginalRecord(fake);
}

function rawBalance(fake: FakeEngineDb): Record<string, unknown> {
  return fake.rows('memberTokenBalance')[0];
}
function rawState(fake: FakeEngineDb): Record<string, unknown> {
  return fake.rows('communityTokenState')[0];
}

describe('createReversalService.reverseMint', () => {
  it('full reversal conserves balance + governance + supply (three-way) and accrues reversedLifetime', async () => {
    const h = makeHarness();
    seedFixture(h.fake, { totalBalance: 100n, activeGovernanceBalance: 100n });
    const mintId = seedMint(h.fake, { amount: 100n, governanceStatus: 'active' });
    const svc = createReversalService(h.deps);

    const out = await svc.reverseMint({
      originalMintEventId: mintId,
      reason: 'entry_error',
      approvedBy: 'admin',
    });

    expect(out.reversalEventId).toBeTruthy();
    expect(out.publicRecordId).toBe('rec_1');

    const bal = rawBalance(h.fake);
    expect(bal.totalBalance).toBe(0n);
    expect(bal.activeGovernanceBalance).toBe(0n);
    expect(bal.pendingGovernanceBalance).toBe(0n);
    expect(bal.tokensReversedLifetime).toBe(100n);
    expect(rawState(h.fake).currentTotalSupply).toBe(900n);

    const rev = h.fake.rows('tokenReversalEvent')[0];
    expect(rev.amount).toBe(100n);
    expect(rev.totalBalanceAfter).toBe(0n);
    expect(rev.activeGovernanceBalanceAfter).toBe(0n);
    expect(rev.pendingGovernanceBalanceAfter).toBe(0n);
    expect(rev.totalSupplyAfter).toBe(900n);
    expect(rev.publicRecordId).toBe('rec_1');
    // requestSubmission strictly after the transaction commit.
    expect(h.records.submissions).toEqual(['rec_1']);
  });

  it('partial reversal deducts only the requested amount', async () => {
    const h = makeHarness();
    seedFixture(h.fake, { totalBalance: 100n, activeGovernanceBalance: 100n });
    const mintId = seedMint(h.fake, { amount: 100n, governanceStatus: 'active' });
    const svc = createReversalService(h.deps);

    await svc.reverseMint({
      originalMintEventId: mintId,
      amount: 30n,
      reason: 'entry_error',
      approvedBy: 'admin',
    });

    const bal = rawBalance(h.fake);
    expect(bal.totalBalance).toBe(70n);
    expect(bal.activeGovernanceBalance).toBe(70n);
    expect(bal.tokensReversedLifetime).toBe(30n);
    expect(rawState(h.fake).currentTotalSupply).toBe(970n);
    expect(h.fake.rows('tokenReversalEvent')[0].amount).toBe(30n);
  });

  it('active mint deducts only the active governance balance', async () => {
    const h = makeHarness();
    seedFixture(h.fake, {
      totalBalance: 100n,
      activeGovernanceBalance: 100n,
      pendingGovernanceBalance: 40n,
    });
    const mintId = seedMint(h.fake, { amount: 60n, governanceStatus: 'active' });
    const svc = createReversalService(h.deps);

    await svc.reverseMint({
      originalMintEventId: mintId,
      reason: 'duplicate_claim',
      approvedBy: 'admin',
    });

    const bal = rawBalance(h.fake);
    expect(bal.activeGovernanceBalance).toBe(40n);
    expect(bal.pendingGovernanceBalance).toBe(40n); // untouched
    expect(bal.totalBalance).toBe(40n);
  });

  it('pending mint deducts only the pending governance balance', async () => {
    const h = makeHarness();
    seedFixture(h.fake, {
      totalBalance: 100n,
      activeGovernanceBalance: 60n,
      pendingGovernanceBalance: 40n,
    });
    const mintId = seedMint(h.fake, { amount: 40n, governanceStatus: 'pending' });
    const svc = createReversalService(h.deps);

    await svc.reverseMint({
      originalMintEventId: mintId,
      reason: 'duplicate_claim',
      approvedBy: 'admin',
    });

    const bal = rawBalance(h.fake);
    expect(bal.activeGovernanceBalance).toBe(60n); // untouched
    expect(bal.pendingGovernanceBalance).toBe(0n);
    expect(bal.totalBalance).toBe(60n);
  });

  it('rejects a reason outside REVERSAL_REASONS with INVALID_REASON', async () => {
    const h = makeHarness();
    seedFixture(h.fake);
    const mintId = seedMint(h.fake);
    const svc = createReversalService(h.deps);

    await expect(
      svc.reverseMint({
        originalMintEventId: mintId,
        reason: 'not_a_real_reason' as ReversalReason,
        approvedBy: 'admin',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_REASON' });
    // Nothing written.
    expect(h.fake.rows('tokenReversalEvent')).toHaveLength(0);
  });

  it('throws NOT_FOUND when the mint event does not exist', async () => {
    const h = makeHarness();
    seedFixture(h.fake);
    const svc = createReversalService(h.deps);

    await expect(
      svc.reverseMint({
        originalMintEventId: 'ghost',
        reason: 'entry_error',
        approvedBy: 'admin',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects an out-of-range amount with VALIDATION_ERROR', async () => {
    const h = makeHarness();
    seedFixture(h.fake);
    const mintId = seedMint(h.fake, { amount: 100n });
    const svc = createReversalService(h.deps);

    await expect(
      svc.reverseMint({
        originalMintEventId: mintId,
        amount: 101n,
        reason: 'entry_error',
        approvedBy: 'admin',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      svc.reverseMint({
        originalMintEventId: mintId,
        amount: 0n,
        reason: 'entry_error',
        approvedBy: 'admin',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('idempotency: a second reversal of the same mint throws ALREADY_REVERSED', async () => {
    const h = makeHarness();
    seedFixture(h.fake, { totalBalance: 100n, activeGovernanceBalance: 100n });
    const mintId = seedMint(h.fake, { amount: 100n });
    const svc = createReversalService(h.deps);

    await svc.reverseMint({
      originalMintEventId: mintId,
      reason: 'entry_error',
      approvedBy: 'admin',
    });
    await expect(
      svc.reverseMint({
        originalMintEventId: mintId,
        reason: 'entry_error',
        approvedBy: 'admin',
      }),
    ).rejects.toMatchObject({ code: 'ALREADY_REVERSED' });
    expect(h.fake.rows('tokenReversalEvent')).toHaveLength(1);
  });

  it('idempotency: a create-time P2002 unique clash maps to ALREADY_REVERSED', async () => {
    const h = makeHarness();
    seedFixture(h.fake, { totalBalance: 100n, activeGovernanceBalance: 100n });
    const mintId = seedMint(h.fake, { amount: 100n });
    // Pre-plant the reversal row directly to force a P2002 at create() time
    // while defeating the findFirst pre-check by inserting after service call
    // begins is impossible; instead insert a row that the pre-check will catch.
    // To specifically exercise the P2002 branch, stub findFirst to miss once.
    const originalFindFirst = h.fake.tokenReversalEvent.findFirst.bind(
      h.fake.tokenReversalEvent,
    );
    void h.fake.tokenReversalEvent.create({
      data: {
        communityId: COMMUNITY,
        memberId: MEMBER,
        originalMintEventId: mintId,
        amount: 100n,
        reason: 'entry_error',
        totalBalanceAfter: 0n,
        totalSupplyAfter: 900n,
        approvedBy: 'admin',
      },
    });
    // Force the pre-check to report "not found" so control reaches create().
    (h.fake.tokenReversalEvent as { findFirst: unknown }).findFirst = () =>
      Promise.resolve(null);

    await expect(
      svc().reverseMint({
        originalMintEventId: mintId,
        reason: 'entry_error',
        approvedBy: 'admin',
      }),
    ).rejects.toMatchObject({ code: 'ALREADY_REVERSED' });

    (h.fake.tokenReversalEvent as { findFirst: unknown }).findFirst = originalFindFirst;
    function svc() {
      return createReversalService(h.deps);
    }
  });

  it('requires a recorded token_reversal proposal for a related-party mint', async () => {
    const h = makeHarness();
    seedFixture(h.fake, { totalBalance: 100n, activeGovernanceBalance: 100n });
    const mintId = seedMint(h.fake, { amount: 100n, relatedParty: true });
    const svc = createReversalService(h.deps);

    await expect(
      svc.reverseMint({
        originalMintEventId: mintId,
        reason: 'entry_error',
        approvedBy: 'admin',
      }),
    ).rejects.toMatchObject({ code: 'PROPOSAL_REQUIRED' });
  });

  it('requires a recorded token_reversal proposal for community_proposal reason', async () => {
    const h = makeHarness();
    seedFixture(h.fake, { totalBalance: 100n, activeGovernanceBalance: 100n });
    const mintId = seedMint(h.fake, { amount: 100n });
    const svc = createReversalService(h.deps);

    // Wrong proposal type -> still rejected.
    void h.fake.proposal.create({
      data: {
        id: 'p_bad',
        communityId: COMMUNITY,
        title: 't',
        type: 'community_decision',
        status: 'recorded',
      },
    });
    await expect(
      svc.reverseMint({
        originalMintEventId: mintId,
        reason: 'community_proposal',
        approvedBy: 'admin',
        proposalId: 'p_bad',
      }),
    ).rejects.toMatchObject({ code: 'PROPOSAL_REQUIRED' });
  });

  it('accepts a related-party reversal when a passed token_reversal proposal targets this mint', async () => {
    const h = makeHarness();
    seedFixture(h.fake, { totalBalance: 100n, activeGovernanceBalance: 100n });
    const mintId = seedMint(h.fake, { amount: 100n, relatedParty: true });
    void h.fake.proposal.create({
      data: {
        id: 'p_ok',
        communityId: COMMUNITY,
        title: 't',
        type: 'token_reversal',
        status: 'recorded',
        winningOptionId: 'approve',
        voterCount: 5,
        minimumVoterCount: 3,
        policyChangePayload: { targetMintEventId: mintId },
      },
    });
    const svc = createReversalService(h.deps);

    const out = await svc.reverseMint({
      originalMintEventId: mintId,
      reason: 'multi_account_abuse',
      approvedBy: 'admin',
      proposalId: 'p_ok',
    });
    expect(out.reversalEventId).toBeTruthy();
    expect(h.fake.rows('tokenReversalEvent')[0].proposalId).toBe('p_ok');
  });

  // ---- governance-bypass repro: a 'recorded' status alone must not authorize
  // a reversal. Rejected / below-quorum / wrong-target / wrong-community
  // proposals all end up 'recorded' but grant no reversal authority (PRD §551).
  function seedReversalProposal(
    h: Harness,
    over: Record<string, unknown> = {},
  ): void {
    void h.fake.proposal.create({
      data: {
        id: 'p1',
        communityId: COMMUNITY,
        title: 't',
        type: 'token_reversal',
        status: 'recorded',
        winningOptionId: 'approve',
        voterCount: 5,
        minimumVoterCount: 3,
        policyChangePayload: { targetMintEventId: 'mint1' },
        ...over,
      },
    });
  }

  it('rejects a reversal when the token_reversal proposal was voted down (winningOptionId=reject)', async () => {
    const h = makeHarness();
    seedFixture(h.fake, { totalBalance: 100n, activeGovernanceBalance: 100n });
    const mintId = seedMint(h.fake, { amount: 100n });
    // Rejected proposal that (maliciously) points at a different mint.
    seedReversalProposal(h, {
      winningOptionId: 'reject',
      policyChangePayload: { targetMintEventId: 'some_other_mint' },
    });
    const svc = createReversalService(h.deps);

    await expect(
      svc.reverseMint({
        originalMintEventId: mintId,
        reason: 'community_proposal',
        approvedBy: 'admin',
        proposalId: 'p1',
      }),
    ).rejects.toMatchObject({ code: 'PROPOSAL_REQUIRED' });
    // No append, no side effects.
    expect(h.fake.rows('tokenReversalEvent')).toHaveLength(0);
    expect(h.records.submissions).toHaveLength(0);
  });

  it('rejects a reversal when the token_reversal proposal did not reach quorum', async () => {
    const h = makeHarness();
    seedFixture(h.fake, { totalBalance: 100n, activeGovernanceBalance: 100n });
    const mintId = seedMint(h.fake, { amount: 100n });
    seedReversalProposal(h, { voterCount: 2, minimumVoterCount: 3 });
    const svc = createReversalService(h.deps);

    await expect(
      svc.reverseMint({
        originalMintEventId: mintId,
        reason: 'community_proposal',
        approvedBy: 'admin',
        proposalId: 'p1',
      }),
    ).rejects.toMatchObject({ code: 'PROPOSAL_REQUIRED' });
    expect(h.fake.rows('tokenReversalEvent')).toHaveLength(0);
  });

  it('rejects a reversal when the proposal targets a different mint event', async () => {
    const h = makeHarness();
    seedFixture(h.fake, { totalBalance: 100n, activeGovernanceBalance: 100n });
    const mintId = seedMint(h.fake, { amount: 100n });
    seedReversalProposal(h, {
      policyChangePayload: { targetMintEventId: 'a_totally_different_mint' },
    });
    const svc = createReversalService(h.deps);

    await expect(
      svc.reverseMint({
        originalMintEventId: mintId,
        reason: 'community_proposal',
        approvedBy: 'admin',
        proposalId: 'p1',
      }),
    ).rejects.toMatchObject({ code: 'PROPOSAL_REQUIRED' });
    expect(h.fake.rows('tokenReversalEvent')).toHaveLength(0);
  });

  it('rejects a reversal when the proposal belongs to a different community', async () => {
    const h = makeHarness();
    seedFixture(h.fake, { totalBalance: 100n, activeGovernanceBalance: 100n });
    const mintId = seedMint(h.fake, { amount: 100n });
    seedReversalProposal(h, { communityId: 'other_community' });
    const svc = createReversalService(h.deps);

    await expect(
      svc.reverseMint({
        originalMintEventId: mintId,
        reason: 'community_proposal',
        approvedBy: 'admin',
        proposalId: 'p1',
      }),
    ).rejects.toMatchObject({ code: 'PROPOSAL_REQUIRED' });
    expect(h.fake.rows('tokenReversalEvent')).toHaveLength(0);
  });

  it('accepts a community_proposal reversal when a passed proposal targets this mint', async () => {
    const h = makeHarness();
    seedFixture(h.fake, { totalBalance: 100n, activeGovernanceBalance: 100n });
    const mintId = seedMint(h.fake, { amount: 100n });
    seedReversalProposal(h, { policyChangePayload: { targetMintEventId: mintId } });
    const svc = createReversalService(h.deps);

    const out = await svc.reverseMint({
      originalMintEventId: mintId,
      reason: 'community_proposal',
      approvedBy: 'admin',
      proposalId: 'p1',
    });
    expect(out.reversalEventId).toBeTruthy();
    expect(h.fake.rows('tokenReversalEvent')[0].proposalId).toBe('p1');
  });

  it('rejects and rolls back when a balance would go negative (CONFLICT)', async () => {
    const h = makeHarness();
    // active balance smaller than mint amount -> active deduct would go negative.
    seedFixture(h.fake, { totalBalance: 100n, activeGovernanceBalance: 10n });
    const mintId = seedMint(h.fake, { amount: 50n, governanceStatus: 'active' });
    const svc = createReversalService(h.deps);

    await expect(
      svc.reverseMint({
        originalMintEventId: mintId,
        reason: 'entry_error',
        approvedBy: 'admin',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    // Fully rolled back: no reversal row, balances + supply + ledgerSeq intact.
    expect(h.fake.rows('tokenReversalEvent')).toHaveLength(0);
    const bal = rawBalance(h.fake);
    expect(bal.totalBalance).toBe(100n);
    expect(bal.activeGovernanceBalance).toBe(10n);
    expect(rawState(h.fake).currentTotalSupply).toBe(1000n);
    expect(rawState(h.fake).ledgerSeq).toBe(0n);
  });

  it('rolls back writes when the original record hash is missing (CONFLICT)', async () => {
    const h = makeHarness();
    seedFixture(h.fake, { totalBalance: 100n, activeGovernanceBalance: 100n });
    // mint points at a publicRecordId that does not exist -> lookup fails AFTER writes.
    const mintId = seedMint(h.fake, {
      amount: 100n,
      publicRecordId: 'rec_missing',
    });
    const svc = createReversalService(h.deps);

    await expect(
      svc.reverseMint({
        originalMintEventId: mintId,
        reason: 'entry_error',
        approvedBy: 'admin',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    // Transaction restore reverted the balance decrement, supply, and rev row.
    expect(h.fake.rows('tokenReversalEvent')).toHaveLength(0);
    expect(rawBalance(h.fake).totalBalance).toBe(100n);
    expect(rawState(h.fake).currentTotalSupply).toBe(1000n);
    expect(rawState(h.fake).ledgerSeq).toBe(0n);
    expect(h.records.submissions).toHaveLength(0);
  });

  it('assigns a strictly increasing ledgerSeq across reversals', async () => {
    const h = makeHarness();
    seedFixture(h.fake, { totalBalance: 200n, activeGovernanceBalance: 200n });
    seedMint(h.fake, { id: 'mintA', amount: 50n });
    void h.fake.publicRecord.create({
      data: {
        id: 'rec_a',
        communityId: COMMUNITY,
        recordType: 'token_mint',
        status: 'verified',
        chainEligible: true,
        envelopeJson: '{}',
        recordHash: ('0x' + 'cd'.repeat(32)) as Hex32,
        sourceTable: 'TokenMintEvent',
        sourceId: 'mintA',
      },
    });
    void h.fake.tokenMintEvent.update({
      where: { id: 'mintA' },
      data: { publicRecordId: 'rec_a' },
    });
    seedMint(h.fake, { id: 'mintB', amount: 50n, publicRecordId: 'rec_a' });
    const svc = createReversalService(h.deps);

    await svc.reverseMint({ originalMintEventId: 'mintA', reason: 'entry_error', approvedBy: 'admin' });
    await svc.reverseMint({ originalMintEventId: 'mintB', reason: 'entry_error', approvedBy: 'admin' });

    const seqs = h.fake
      .rows('tokenReversalEvent')
      .map((r) => Number(r.ledgerSeq))
      .sort((a, b) => a - b);
    expect(seqs).toEqual([1, 2]);
    expect(Number(rawState(h.fake).ledgerSeq)).toBe(2);
  });

  it('passes the original record hash and ledgerSeq into buildEnvelope', async () => {
    const h = makeHarness();
    seedFixture(h.fake, { totalBalance: 100n, activeGovernanceBalance: 100n });
    const mintId = seedMint(h.fake, { amount: 100n });
    const svc = createReversalService(h.deps);

    await svc.reverseMint({
      originalMintEventId: mintId,
      reason: 'entry_error',
      approvedBy: 'admin',
    });

    expect(h.envelope.sources).toHaveLength(1);
    const src = h.envelope.sources[0];
    expect(src.kind).toBe('token_reversal');
    if (src.kind !== 'token_reversal') throw new Error('unreachable');
    expect(src.originalRecordHash).toBe(ORIG_HASH);
    expect(src.reversalEvent.ledgerSeq).toBe(1);
    expect(src.reversalEvent.amount).toBe(100n);
    expect(src.reversalEvent.originalMintEventId).toBe(mintId);
  });
});

describe('createReversalService.finalizeSupersede', () => {
  async function reverseOnce(h: Harness): Promise<string> {
    seedFixture(h.fake, { totalBalance: 100n, activeGovernanceBalance: 100n });
    const mintId = seedMint(h.fake, { amount: 100n });
    const svc = createReversalService(h.deps);
    const out = await svc.reverseMint({
      originalMintEventId: mintId,
      reason: 'entry_error',
      approvedBy: 'admin',
    });
    return out.reversalEventId;
  }

  it('returns false and does not supersede while the reversal record is unverified', async () => {
    const h = makeHarness();
    const revId = await reverseOnce(h);
    const svc = createReversalService(h.deps);

    const result = await svc.finalizeSupersede(revId);
    expect(result).toBe(false);
    expect(h.records.superseded).toHaveLength(0);
  });

  it('marks the original record superseded once the reversal record is verified', async () => {
    const h = makeHarness();
    const revId = await reverseOnce(h);
    const svc = createReversalService(h.deps);

    // Flip the reversal record to verified.
    h.records.statusOf.set('rec_1', 'verified');
    const result = await svc.finalizeSupersede(revId);

    expect(result).toBe(true);
    expect(h.records.superseded).toEqual([
      { originalId: 'rec_orig', byId: 'rec_1' },
    ]);
  });

  it('throws NOT_FOUND for an unknown reversal event id', async () => {
    const h = makeHarness();
    const svc = createReversalService(h.deps);
    await expect(svc.finalizeSupersede('ghost')).rejects.toBeInstanceOf(EngineError);
  });
});

describe('createReversalService.reverseMint cross-service lock ordering', () => {
  // Deadlock avoidance: mint-service locks epoch -> state -> balance, so state
  // is acquired strictly before balance. reverseMint must honor the SAME
  // state-before-balance order or concurrent mint/reversal on the same
  // community+member can form a lock cycle (Postgres aborts one side, 40P01).
  // The fake DB has no real row-lock semantics, so we assert the *acquisition
  // order* of the FOR UPDATE reads instead.
  function captureLockOrder(fake: FakeEngineDb): string[] {
    const order: string[] = [];
    const original = fake.$queryRaw.bind(fake);
    // Wrap the raw surface used inside the transaction to record which table
    // each FOR UPDATE read targets, in call order.
    (fake as unknown as { $queryRaw: typeof fake.$queryRaw }).$queryRaw =
      (async <T = unknown>(
        strings: TemplateStringsArray,
        ...values: unknown[]
      ): Promise<T> => {
        const sql = strings.join(' ');
        if (sql.includes('FOR UPDATE')) {
          if (sql.includes('"CommunityTokenState"')) order.push('state');
          else if (sql.includes('"MemberTokenBalance"')) order.push('balance');
          else if (sql.includes('"TokenMintEvent"')) order.push('mintEvent');
        }
        return original(strings, ...values) as Promise<T>;
      }) as typeof fake.$queryRaw;
    return order;
  }

  it('acquires the CommunityTokenState lock before the MemberTokenBalance lock', async () => {
    const h = makeHarness();
    seedFixture(h.fake, { totalBalance: 100n, activeGovernanceBalance: 100n });
    const mintId = seedMint(h.fake, { amount: 100n, governanceStatus: 'active' });
    const order = captureLockOrder(h.fake);
    const svc = createReversalService(h.deps);

    await svc.reverseMint({
      originalMintEventId: mintId,
      reason: 'entry_error',
      approvedBy: 'admin',
    });

    const stateIdx = order.indexOf('state');
    const balanceIdx = order.indexOf('balance');
    expect(stateIdx).toBeGreaterThanOrEqual(0);
    expect(balanceIdx).toBeGreaterThanOrEqual(0);
    // state must be locked before balance to match mint-service ordering.
    expect(stateIdx).toBeLessThan(balanceIdx);
  });
});
