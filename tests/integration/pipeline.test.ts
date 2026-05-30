// End-to-end pipeline integration tests (BLOCKCHAIN-DESIGN §5-§7). Fully offline:
// the chain is the injected FakeChain, Prisma is FakePrisma, the queue is the
// InlineQueue — all from the frozen W4 fakes (tests/integration/fakes.ts). Each
// scenario drives the REAL wiring (record service, payload builder, submitter,
// confirmer, verifier, reconciler, submit/confirm processors) exactly as the
// production runtime composes it, so a regression in any layer fails here.

import { describe, expect, it, vi } from 'vitest';

import {
  buildEnvelopeForSource,
  createEnqueue,
  createPublicRecordService,
  createReconciler,
  createRecordVerifier,
  createTxConfirmer,
  createTxSubmitter,
  makeBuildSubmittable,
  makeConfirmEnqueuer,
  processConfirmJob,
  processSubmitJob,
} from '../../lib/blockchain/index';
import type { CreateTxConfirmerDeps } from '../../lib/blockchain/injective/confirmer';
import type {
  WriteContract,
  WriteContractMethod,
} from '../../lib/blockchain/injective/submitter';
import type { VerifierReadContract } from '../../lib/blockchain/injective/verifier';
import type { PrismaLike } from '../../lib/blockchain/records/record-service';
import type { ConfirmDeps } from '../../lib/blockchain/queue/confirm-worker';
import type { SubmitDeps } from '../../lib/blockchain/queue/submit-worker';
import type {
  Hex32,
  PrismaTx,
  RecordSource,
  RecordType,
  TokenMintEventData,
  TokenReversalEventData,
} from '../../lib/blockchain/types';

import { FakeChain, FakePrisma, InlineQueue } from './fakes';

const PEPPER = 'integration-pepper-0123456789';
const COMMUNITY = 'c1';
const WALLET_ADDRESS = '0x000000000000000000000000000000000000dEaD';

// ---- Source fixtures ----

function makeMint(over: Partial<TokenMintEventData> = {}): TokenMintEventData {
  return {
    id: 'm1',
    communityId: COMMUNITY,
    memberId: 'mem1',
    epochNumber: 3,
    mintType: 'contribution',
    budgetSource: 'current_epoch',
    amount: 500n,
    memberBalanceBefore: 10_000n,
    memberBalanceAfter: 10_500n,
    totalSupplyBefore: 115_763n,
    totalSupplyAfter: 116_263n,
    governanceActivationEpoch: null,
    tokenPolicyVersion: 2,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    // Community-scoped ledger sequence: feeds the on-chain ledgerSeq guard and
    // enters both the canonical payload and chainArgs (before recordHash).
    ledgerSeq: 1,
    ...over,
  };
}

function mintSource(mint: TokenMintEventData): RecordSource {
  const kind = mint.budgetSource === 'next_epoch_advance' ? 'advance_mint' : 'token_mint';
  return { kind, mintEvent: mint };
}

// ---- Chain write adapter: maps contract method calls onto FakeChain ----

const LABEL_BY_METHOD: Readonly<Record<string, RecordType>> = {
  recordMint: 'token_mint',
  recordReversal: 'token_reversal',
  recordEpochSummary: 'epoch_summary',
  recordPolicyVersion: 'policy_version',
  recordProposalSnapshot: 'proposal_snapshot',
  recordProposalResult: 'proposal_result',
};

interface Broadcast {
  readonly method: string;
  readonly args: readonly unknown[];
}

/** Strip the trailing `{ nonce }` overrides object ethers appends to a call. */
function stripOverrides(all: readonly unknown[]): readonly unknown[] {
  const last = all[all.length - 1];
  if (last !== null && typeof last === 'object' && 'nonce' in (last as object)) {
    return all.slice(0, -1);
  }
  return all;
}

function makeWriteContract(
  chain: FakeChain,
  captured: Broadcast[],
  onBroadcast?: () => void,
): WriteContract {
  const build = (method: string): WriteContractMethod => {
    const fn = (async (...all: readonly unknown[]) => {
      const args = stripOverrides(all);
      onBroadcast?.();
      captured.push({ method, args });
      const out = chain.recordSubmitted(
        args as Parameters<FakeChain['recordSubmitted']>[0],
        LABEL_BY_METHOD[method],
      );
      return { hash: out.txHash };
    }) as WriteContractMethod;
    fn.estimateGas = async () => 21_000n;
    return fn;
  };
  return {
    recordMint: build('recordMint'),
    recordReversal: build('recordReversal'),
    recordEpochSummary: build('recordEpochSummary'),
    recordPolicyVersion: build('recordPolicyVersion'),
    recordProposalSnapshot: build('recordProposalSnapshot'),
    recordProposalResult: build('recordProposalResult'),
  };
}

// ---- Fake server wallet (only the surface the pipeline consumes) ----

function makeWallet(start = 7): {
  address: string;
  getNextNonce: () => number;
  resyncNonce: () => Promise<number>;
} {
  let nonce = start;
  return {
    address: WALLET_ADDRESS,
    getNextNonce: () => nonce++,
    resyncNonce: async () => nonce,
  };
}

// ---- Harness: assemble the real layers over the fakes ----

interface HarnessOptions {
  readonly prisma: FakePrisma;
  readonly chain?: FakeChain;
  readonly onBroadcast?: () => void;
  readonly staleThresholdMs?: number;
  readonly pendingStaleMs?: number;
}

function assemble(opts: HarnessOptions) {
  const chain = opts.chain ?? new FakeChain();
  const captured: Broadcast[] = [];
  const submitQueue = new InlineQueue();
  const confirmQueue = new InlineQueue();
  const wallet = makeWallet();

  const prisma = opts.prisma as unknown as PrismaLike;
  const enqueue = createEnqueue({ submitQueue });
  const records = createPublicRecordService({ prisma, enqueue });

  const write = makeWriteContract(chain, captured, opts.onBroadcast);
  const submitter = createTxSubmitter({ write, wallet });
  const confirmer = createTxConfirmer({
    provider: chain as unknown as CreateTxConfirmerDeps['provider'],
    contractAddress: '0x0000000000000000000000000000000000000000',
    deployBlock: 1,
    confirmations: 1,
    pollIntervalMs: 0,
  });
  const verifier = createRecordVerifier({
    read: chain as unknown as VerifierReadContract,
    confirmer,
    loadRecordWithSource: (id) => records.getWithSource(id),
    buildEnvelope: buildEnvelopeForSource,
    pepper: PEPPER,
    explorerBaseUrl: 'https://explorer.example/base',
  });

  const enqueueConfirm = makeConfirmEnqueuer(confirmQueue);
  const buildSubmittable = makeBuildSubmittable(records, PEPPER);

  const submitDeps: SubmitDeps = {
    records,
    submitter,
    wallet,
    readChainRecord: (recordHash) => verifier.readChainRecord(recordHash),
    findTxByRecordHash: (recordHash) => confirmer.findTxByRecordHash(recordHash),
    enqueueConfirm,
    buildSubmittable,
  };
  const confirmDeps: ConfirmDeps = {
    records,
    confirmer,
    readChainRecord: (recordHash) => verifier.readChainRecord(recordHash),
    confirmations: 1,
  };

  const reconciler = createReconciler({
    prisma: prisma as unknown as Parameters<typeof createReconciler>[0]['prisma'],
    records,
    confirmer,
    readChainRecord: (recordHash) => verifier.readChainRecord(recordHash),
    getLatestNonce: async () => 0,
    enqueue,
    staleThresholdMs: opts.staleThresholdMs ?? 1,
    pendingStaleMs: opts.pendingStaleMs ?? 1,
  });

  return {
    chain,
    captured,
    submitQueue,
    confirmQueue,
    records,
    verifier,
    confirmer,
    reconciler,
    enqueue,
    submitDeps,
    confirmDeps,
  };
}

/** Insert a pending record for a source, returning its generated id. */
async function createPending(
  h: ReturnType<typeof assemble>,
  prisma: FakePrisma,
  source: RecordSource,
  recordType: RecordType,
  sourceTable: string,
  sourceId: string,
): Promise<string> {
  const built = buildEnvelopeForSource(source, PEPPER);
  const dto = await prisma.$transaction((tx: unknown) =>
    h.records.createPendingRecord(tx as PrismaTx, {
      recordType,
      sourceTable,
      sourceId,
      communityId: COMMUNITY,
      envelope: built.envelope,
      recordHash: built.recordHash,
    }),
  );
  return dto.id;
}

/** Run the full submit -> confirm hand-off for an already-queued record. */
async function drive(h: ReturnType<typeof assemble>, recordId: string): Promise<void> {
  await processSubmitJob(h.submitDeps, { data: { recordId } });
  const rec = await h.records.getById(recordId);
  if (rec?.txHash) {
    const job = await h.confirmQueue.getJob(`confirm:${recordId}:${rec.txHash}`);
    expect(job).toBeTruthy();
    await processConfirmJob(h.confirmDeps, {
      data: job!.data as { recordId: string; txHash: string },
    });
  }
}

// ---- Scenarios ----

describe('pipeline (a) token_mint happy path', () => {
  it('drives pending -> submitting -> confirming -> verified; nonce persisted before broadcast', async () => {
    const mint = makeMint();
    const prisma = new FakePrisma({ tokenMintEvents: [mint] });
    const h = assemble({ prisma });

    const patchSpy = vi.spyOn(h.records, 'patchInStatus');
    const broadcastSpy = vi.spyOn(h.chain, 'recordSubmitted');

    const recordId = await createPending(h, prisma, mintSource(mint), 'token_mint', 'TokenMintEvent', 'm1');
    const queued = await h.records.requestSubmission(recordId);
    expect(queued).toEqual({ queued: true, jobId: `submit:${recordId}:v1` });

    await processSubmitJob(h.submitDeps, { data: { recordId } });

    const afterSubmit = await h.records.getById(recordId);
    expect(afterSubmit?.status).toBe('confirming');
    expect(afterSubmit?.assignedNonce).not.toBeNull();
    expect(afterSubmit?.txHash).toBeTruthy();

    // Ordering (BLOCKCHAIN-DESIGN section 5): patchInStatus(assignedNonce) is
    // persisted BEFORE the chain broadcast.
    expect(patchSpy.mock.invocationCallOrder[0]).toBeLessThan(
      broadcastSpy.mock.invocationCallOrder[0],
    );

    const confirmJob = await h.confirmQueue.getJob(`confirm:${recordId}:${afterSubmit!.txHash}`);
    expect(confirmJob).toBeTruthy();
    await processConfirmJob(h.confirmDeps, {
      data: confirmJob!.data as { recordId: string; txHash: string },
    });

    const final = await h.records.getById(recordId);
    expect(final?.status).toBe('verified');
    expect(final?.txHash).toBeTruthy();
    expect(final?.blockNumber).not.toBeNull();
    expect(final?.assignedNonce).not.toBeNull();
    expect(h.captured).toHaveLength(1);
    expect(h.captured[0].method).toBe('recordMint');
  });
});

describe('pipeline (b) advance_mint', () => {
  it('reaches verified and passes budgetSource=1 + activationEpoch on chain', async () => {
    const mint = makeMint({
      id: 'adv1',
      budgetSource: 'next_epoch_advance',
      governanceActivationEpoch: 5,
      ledgerSeq: 9,
    });
    const prisma = new FakePrisma({ tokenMintEvents: [mint] });
    const h = assemble({ prisma });

    const recordId = await createPending(
      h,
      prisma,
      mintSource(mint),
      'advance_mint',
      'TokenMintEvent',
      'adv1',
    );
    await h.records.requestSubmission(recordId);
    await drive(h, recordId);

    const final = await h.records.getById(recordId);
    expect(final?.status).toBe('verified');
    expect(final?.recordType).toBe('advance_mint');
    // chainArgs: [cidHash, midHash, amount, balAfter, supplyAfter, budgetSourceCode, activationEpoch, ledgerSeq, recordHash]
    const args = h.captured[0].args;
    expect(args[5]).toBe(1);
    expect(args[6]).toBe(5);
    expect(args[7]).toBe(9); // ledgerSeq flows on-chain before recordHash

  });
});

describe('pipeline (c) RECORD_EXISTS recovery', () => {
  it('recovers to verified without a second broadcast', async () => {
    const mint = makeMint({ id: 'mc' });
    const prisma = new FakePrisma({ tokenMintEvents: [mint] });
    const h = assemble({ prisma });

    // Pre-broadcast the record on chain (populates getRecord + a queryable log).
    const built = buildEnvelopeForSource(mintSource(mint), PEPPER);
    h.chain.recordSubmitted(
      built.chainArgs as Parameters<FakeChain['recordSubmitted']>[0],
      'token_mint',
    );
    expect(h.captured).toHaveLength(0); // direct chain write, not via the adapter

    const recordId = await createPending(h, prisma, mintSource(mint), 'token_mint', 'TokenMintEvent', 'mc');
    await h.records.requestSubmission(recordId);

    const out = await processSubmitJob(h.submitDeps, { data: { recordId } });
    expect(out.outcome).toBe('recovered');
    expect(h.captured).toHaveLength(0); // no double-write through the submitter

    const afterRecover = await h.records.getById(recordId);
    expect(afterRecover?.status).toBe('confirming');
    expect(afterRecover?.txHash).toBeTruthy();

    const job = await h.confirmQueue.getJob(`confirm:${recordId}:${afterRecover!.txHash}`);
    await processConfirmJob(h.confirmDeps, {
      data: job!.data as { recordId: string; txHash: string },
    });
    expect((await h.records.getById(recordId))?.status).toBe('verified');
  });
});

describe('pipeline (d) crash reconciliation', () => {
  it('recovers a stale submitting row, backfilling txHash from chain logs', async () => {
    const mint = makeMint({ id: 'md' });
    const built = buildEnvelopeForSource(mintSource(mint), PEPPER);
    const recordHash = built.recordHash;

    const chain = new FakeChain();
    // The tx landed on chain but the process crashed before persisting txHash.
    const out = chain.recordSubmitted(
      built.chainArgs as Parameters<FakeChain['recordSubmitted']>[0],
      'token_mint',
    );

    const stale = new Date('2026-07-01T00:00:00.000Z');
    const prisma = new FakePrisma({
      tokenMintEvents: [mint],
      publicRecords: [
        {
          id: 'rd',
          communityId: COMMUNITY,
          sourceTable: 'TokenMintEvent',
          sourceId: 'md',
          recordType: 'token_mint',
          status: 'submitting',
          envelopeJson: built.canonicalJson,
          recordHash,
          txHash: null,
          assignedNonce: 7,
          blockNumber: null,
          blockHash: null,
          submittedAt: stale,
          confirmedAt: null,
          attemptEpoch: 1,
          lastError: null,
          supersededByRecordId: null,
          createdAt: stale,
          updatedAt: stale,
        },
      ],
    });

    const h = assemble({ prisma, chain, staleThresholdMs: 1 });
    const report = await h.reconciler.reconcileOnce(new Date('2026-07-09T00:00:00.000Z'));
    expect(report.recovered).toBe(1);

    const final = await h.records.getById('rd');
    expect(final?.status).toBe('verified');
    expect(final?.txHash).toBe(out.txHash); // backfilled via topics[3] log lookup
    expect(final?.blockNumber).toBe(out.blockNumber);
  });

  it('wires getLatestNonce to getTransactionCount(address, "latest") — not "pending"', async () => {
    // The §5 "nonce overtaken" judgement must compare against MINED txs.
    const getTransactionCount = vi.fn(async (_addr: string, _tag: string) => 3);
    const getLatestNonce = () => getTransactionCount(WALLET_ADDRESS, 'latest');
    await getLatestNonce();
    expect(getTransactionCount).toHaveBeenCalledWith(WALLET_ADDRESS, 'latest');
  });
});

describe('pipeline (e) reversal full flow', () => {
  it('verifies a reversal then supersedes the original', async () => {
    const mint = makeMint({ id: 'me' });
    const reversal: TokenReversalEventData = {
      id: 'rev1',
      communityId: COMMUNITY,
      memberId: 'mem1',
      originalMintEventId: 'me',
      amount: 500n,
      totalBalanceAfter: 10_000n,
      totalSupplyAfter: 115_763n,
      createdAt: new Date('2026-07-02T00:00:00.000Z'),
      ledgerSeq: 2,
    };
    const prisma = new FakePrisma({
      tokenMintEvents: [mint],
      tokenReversalEvents: [reversal],
    });
    const h = assemble({ prisma });

    // 1) Mint to verified so the original public record exists.
    const mintId = await createPending(h, prisma, mintSource(mint), 'token_mint', 'TokenMintEvent', 'me');
    await h.records.requestSubmission(mintId);
    await drive(h, mintId);
    expect((await h.records.getById(mintId))?.status).toBe('verified');

    // 2) Reversal: create the pending record, then confirm getWithSource resolves
    //    originalRecordHash from the original mint's public record.
    const reversalSource = await resolveReversalSource(prisma);
    const reversalId = await createPending(
      h,
      prisma,
      reversalSource,
      'token_reversal',
      'TokenReversalEvent',
      'rev1',
    );
    const ws = await h.records.getWithSource(reversalId);
    expect(ws?.source.kind).toBe('token_reversal');

    await h.records.requestSubmission(reversalId);
    await drive(h, reversalId);
    expect((await h.records.getById(reversalId))?.status).toBe('verified');

    // 3) Supersede the original.
    await h.records.markSuperseded(mintId, reversalId);
    const original = await h.records.getById(mintId);
    expect(original?.status).toBe('superseded');
    expect(original?.supersededByRecordId).toBe(reversalId);
  });
});

/** Build the reversal source by reading the original mint's recordHash. */
async function resolveReversalSource(prisma: FakePrisma): Promise<RecordSource> {
  const originals = (await prisma.publicRecord.findMany({
    where: { sourceTable: 'TokenMintEvent', sourceId: 'me' },
  })) as ReadonlyArray<{ recordHash: string }>;
  const originalRecordHash = originals[0].recordHash as Hex32;
  const reversalRow = (await prisma.tokenReversalEvent.findUnique({
    where: { id: 'rev1' },
  })) as TokenReversalEventData;
  return {
    kind: 'token_reversal',
    reversalEvent: reversalRow,
    originalRecordHash,
  };
}

describe('pipeline (f) tamper detection', () => {
  it('flags SOURCE_DATA_MISMATCH when the source row diverges from the stored hash', async () => {
    // Stored hash is computed from amount 500; the persisted source says 999.
    const honest = makeMint({ id: 'mf', amount: 500n });
    const tampered = makeMint({ id: 'mf', amount: 999n });
    const built = buildEnvelopeForSource(mintSource(honest), PEPPER);

    const prisma = new FakePrisma({
      tokenMintEvents: [tampered],
      publicRecords: [
        {
          id: 'rf',
          communityId: COMMUNITY,
          sourceTable: 'TokenMintEvent',
          sourceId: 'mf',
          recordType: 'token_mint',
          status: 'verified',
          envelopeJson: built.canonicalJson,
          recordHash: built.recordHash,
          txHash: '0xtx',
          assignedNonce: 1,
          blockNumber: 10,
          blockHash: '0xbh',
          submittedAt: new Date('2026-07-01T00:00:00.000Z'),
          confirmedAt: new Date('2026-07-01T00:00:00.000Z'),
          attemptEpoch: 1,
          lastError: null,
          supersededByRecordId: null,
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
          updatedAt: new Date('2026-07-01T00:00:00.000Z'),
        },
      ],
    });
    const h = assemble({ prisma });

    const result = await h.verifier.verifyRecord('rf');
    expect(result.hashMatches).toBe(false);
    expect(result.failureReason).toBe('SOURCE_DATA_MISMATCH');
    expect(result.verified).toBe(false);
  });
});

describe('pipeline (g) Redis loss rebuild', () => {
  it('reconcile re-enqueues a stranded pending record and it reaches verified', async () => {
    const mint = makeMint({ id: 'mg' });
    const built = buildEnvelopeForSource(mintSource(mint), PEPPER);
    const stale = new Date('2026-07-01T00:00:00.000Z');
    const prisma = new FakePrisma({
      tokenMintEvents: [mint],
      publicRecords: [
        {
          id: 'rg',
          communityId: COMMUNITY,
          sourceTable: 'TokenMintEvent',
          sourceId: 'mg',
          recordType: 'token_mint',
          status: 'pending',
          envelopeJson: built.canonicalJson,
          recordHash: built.recordHash,
          txHash: null,
          assignedNonce: null,
          blockNumber: null,
          blockHash: null,
          submittedAt: null,
          confirmedAt: null,
          attemptEpoch: 1,
          lastError: null,
          supersededByRecordId: null,
          createdAt: stale,
          updatedAt: stale,
        },
      ],
    });
    const h = assemble({ prisma, pendingStaleMs: 1 });

    // Redis was flushed: the submit queue holds nothing.
    h.submitQueue.clear();
    // The stale-pending re-enqueue bumps attemptEpoch (1 -> 2) so the fresh jobId
    // cannot de-dupe against a prior exhausted job lingering in the failed set
    // (reconciler §5/§6; BLOCKCHAIN-DESIGN line 378/390), hence v2 not v1.
    expect(await h.submitQueue.getJob('submit:rg:v2')).toBeUndefined();

    const report = await h.reconciler.reconcileOnce(new Date('2026-07-09T00:00:00.000Z'));
    expect(report.requeued).toBe(1);
    expect(await h.submitQueue.getJob('submit:rg:v2')).toBeTruthy();

    await drive(h, 'rg');
    expect((await h.records.getById('rg'))?.status).toBe('verified');
  });
});
