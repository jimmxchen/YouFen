// Blockchain layer facade (BLOCKCHAIN-DESIGN §3). This module is the single
// public entry point: it re-exports every contract type and sub-module factory,
// and assembles them into the InjectiveService facade and the BlockchainRuntime.
// Construction is inert (no network, no Redis) until a query/broadcast is issued,
// so the default assembly is safe to build offline; every layer is DI-overridable.

import type { Queue } from 'bullmq';

import { loadBlockchainConfig } from './config';
import { RecordNotFoundError, TerminalError } from './errors';
import { canonicalize } from './hashing/canonicalize';
import { hashCommunityId, hashMemberId } from './hashing/id-hash';
import { computeRecordHash } from './hashing/record-hash';
import { createContracts, type Contracts } from './injective/contract';
import { createProvider } from './injective/provider';
import { createServerWallet, type ServerWallet } from './injective/wallet';
import { createTxConfirmer, type CreateTxConfirmerDeps } from './injective/confirmer';
import { createTxSubmitter, type WriteContract } from './injective/submitter';
import { createRecordVerifier, type VerifierReadContract } from './injective/verifier';
import { buildEnvelopeForSource } from './payloads';
import { createEnqueue } from './queue/enqueue';
import { makeConfirmEnqueuer } from './queue/confirm-worker';
import { createQueues, type ConnectionLike } from './queue/queues';
import { createPublicRecordService, type PrismaLike } from './records/record-service';
import { createReconciler, type ReconcilerDeps } from './records/reconciler';
import type {
  BlockchainConfig,
  BlockchainRuntime,
  EnqueueFn,
  Hex32,
  InjectiveService,
  PublicRecordService,
  RecordHasher,
  Reconciler,
  SubmittableRecord,
  TxConfirmer,
  TxSubmitter,
  RecordVerifier,
} from './types';

/**
 * Map the read-only contract face (getRecord) into the confirmer's readRecord
 * existence probe (W2-B). Reuses the same getRecord view the verifier binds, so
 * the confirmer's null-receipt fast path consults the exact contract state.
 */
function makeReadRecord(
  read: VerifierReadContract,
): (recordHash: Hex32) => Promise<{ exists: boolean }> {
  return async (recordHash) => {
    const raw = await read.getRecord(recordHash);
    return { exists: raw.exists };
  };
}

// ---- Re-exports: index is the sole outward-facing surface (§3) ----

export * from './types';
export { loadBlockchainConfig } from './config';
export * from './errors';
export { canonicalize } from './hashing/canonicalize';
export { computeRecordHash, keccakUtf8 } from './hashing/record-hash';
export {
  hashCommunityId,
  hashMemberId,
  hashProposalId,
  hashOptionId,
} from './hashing/id-hash';
export { buildEnvelopeForSource } from './payloads';
export { createProvider, getSharedProvider } from './injective/provider';
export { createServerWallet } from './injective/wallet';
export { createContracts } from './injective/contract';
export { createTxSubmitter } from './injective/submitter';
export { createTxConfirmer } from './injective/confirmer';
export { createRecordVerifier } from './injective/verifier';
export { createPublicRecordService } from './records/record-service';
export { createReconciler } from './records/reconciler';
export { createQueues, QUEUE_NAMES } from './queue/queues';
export { createEnqueue } from './queue/enqueue';
export { makeConfirmEnqueuer, processConfirmJob, createConfirmWorker } from './queue/confirm-worker';
export { processSubmitJob, createSubmitWorker } from './queue/submit-worker';
export { scheduleReconcile, createReconcileWorker } from './queue/reconcile-worker';
export {
  getBlockchainRuntime,
  initBlockchainRuntime,
  setBlockchainRuntimeForTesting,
} from './runtime';
export { YOUFEN_RECORDS_ABI } from './abi/youfen-records';

// ---- Pure hasher composition (§3, §4) ----

/** Bind the pure hashing functions into the RecordHasher facade (pepper fixed). */
export function createRecordHasher(pepper: string): RecordHasher {
  return {
    canonicalize,
    computeRecordHash,
    hashCommunityId,
    hashMemberId: (communityId, memberId) => hashMemberId(communityId, memberId, pepper),
  };
}

// ---- InjectiveService facade (§3) ----

/**
 * Assemble the InjectiveService facade. Every field is overridable via `deps`;
 * when all four are supplied no config/provider is constructed, so a fully
 * injected service builds offline. Otherwise the missing pieces are built from
 * the default config chain (config -> provider -> wallet -> contracts -> ...).
 */
export function createInjectiveService(
  deps: Partial<InjectiveService> = {},
): InjectiveService {
  if (deps.submitter && deps.confirmer && deps.verifier && deps.hasher) {
    return {
      submitter: deps.submitter,
      confirmer: deps.confirmer,
      verifier: deps.verifier,
      hasher: deps.hasher,
    };
  }

  const config = loadBlockchainConfig();
  const provider = createProvider(config);
  const wallet = createServerWallet({ provider, privateKey: config.privateKey });
  const contracts = createContracts({
    provider,
    signer: wallet.signer,
    address: config.contractAddress,
  });

  const submitter =
    deps.submitter ??
    createTxSubmitter({ write: contracts.write as unknown as WriteContract, wallet });
  const confirmer =
    deps.confirmer ??
    createTxConfirmer({
      provider: provider as unknown as CreateTxConfirmerDeps['provider'],
      contractAddress: config.contractAddress,
      deployBlock: config.contractDeployBlock,
      confirmations: config.confirmations,
      readRecord: makeReadRecord(contracts.read as unknown as VerifierReadContract),
    });
  const hasher = deps.hasher ?? createRecordHasher(config.pepper);
  const verifier =
    deps.verifier ??
    createRecordVerifier({
      read: contracts.read as unknown as VerifierReadContract,
      confirmer,
      loadRecordWithSource: async () => null,
      buildEnvelope: buildEnvelopeForSource,
      pepper: config.pepper,
      explorerBaseUrl: config.explorerBaseUrl,
    });

  return { submitter, confirmer, verifier, hasher };
}

// ---- Full runtime assembly (§3, §5, §6) ----

/** Structural Prisma surface the runtime needs (records + reconciler reads). */
export type RuntimePrisma = PrismaLike & ReconcilerDeps['prisma'];

/** Overridable pieces for offline / partial assembly of the runtime. */
export interface BlockchainRuntimeOverrides {
  readonly wallet?: ServerWallet;
  readonly contracts?: Contracts;
  readonly submitter?: TxSubmitter;
  readonly confirmer?: TxConfirmer;
  readonly verifier?: RecordVerifier;
  readonly hasher?: RecordHasher;
  readonly enqueue?: EnqueueFn;
  readonly records?: PublicRecordService;
  readonly reconciler?: Reconciler;
  readonly getLatestNonce?: () => Promise<number>;
  readonly enqueueConfirm?: (recordId: string, txHash: string) => Promise<void>;
  readonly buildSubmittable?: (recordId: string) => Promise<SubmittableRecord>;
}

export interface CreateBlockchainRuntimeOptions {
  readonly env?: Record<string, string | undefined>;
  readonly prisma?: RuntimePrisma;
  readonly connection?: ConnectionLike;
  readonly overrides?: BlockchainRuntimeOverrides;
}

/**
 * Richer runtime returned by createBlockchainRuntime. It IS a BlockchainRuntime
 * (the frozen facade the API/workers depend on) plus the extra handles a worker
 * host needs: the shared-nonce wallet, both queues, and the derived worker deps.
 * initBlockchainRuntime narrows this back to BlockchainRuntime per its frozen
 * signature; the worker entry casts to reach the extras.
 */
export interface AssembledBlockchainRuntime extends BlockchainRuntime {
  readonly wallet: ServerWallet;
  readonly submitQueue: Queue;
  readonly confirmQueue: Queue;
  readonly enqueueConfirm: (recordId: string, txHash: string) => Promise<void>;
  readonly buildSubmittable: (recordId: string) => Promise<SubmittableRecord>;
  readonly connection: ConnectionLike;
}

/**
 * Assemble the entire blockchain runtime from config outward. Order (§3):
 * config -> provider/wallet/contracts -> submitter/confirmer -> queues/enqueue ->
 * records -> verifier (needs records.getWithSource) -> reconciler. Queues are
 * built before enqueue and records so there is no forward reference to patch.
 *
 * Red-team wiring: the reconciler's getLatestNonce reads the 'latest' nonce
 * (getTransactionCount(address, 'latest')) — NOT 'pending'. The §5 "nonce was
 * overtaken" judgement compares the row's assignedNonce against the number of
 * MINED transactions; using 'pending' would count still-queued txs and
 * systematically misfire the double-write guard.
 */
export async function createBlockchainRuntime(
  opts: CreateBlockchainRuntimeOptions = {},
): Promise<AssembledBlockchainRuntime> {
  const overrides = opts.overrides ?? {};
  const config = loadBlockchainConfig(opts.env);

  const provider = createProvider(config);
  const wallet = overrides.wallet ?? createServerWallet({ provider, privateKey: config.privateKey });
  const contracts =
    overrides.contracts ??
    createContracts({ provider, signer: wallet.signer, address: config.contractAddress });

  const submitter =
    overrides.submitter ??
    createTxSubmitter({ write: contracts.write as unknown as WriteContract, wallet });
  const confirmer =
    overrides.confirmer ??
    createTxConfirmer({
      provider: provider as unknown as CreateTxConfirmerDeps['provider'],
      contractAddress: config.contractAddress,
      deployBlock: config.contractDeployBlock,
      confirmations: config.confirmations,
      readRecord: makeReadRecord(contracts.read as unknown as VerifierReadContract),
    });
  const hasher = overrides.hasher ?? createRecordHasher(config.pepper);

  const prisma = opts.prisma ?? (await createDefaultPrisma());
  const connection = opts.connection ?? defaultConnection(config);

  const { submitQueue, confirmQueue } = createQueues(connection);
  const enqueue = overrides.enqueue ?? createEnqueue({ submitQueue });
  const enqueueConfirm = overrides.enqueueConfirm ?? makeConfirmEnqueuer(confirmQueue);

  const records = overrides.records ?? createPublicRecordService({ prisma, enqueue });

  const verifier =
    overrides.verifier ??
    createRecordVerifier({
      read: contracts.read as unknown as VerifierReadContract,
      confirmer,
      loadRecordWithSource: (id) => records.getWithSource(id),
      buildEnvelope: buildEnvelopeForSource,
      pepper: config.pepper,
      explorerBaseUrl: config.explorerBaseUrl,
    });

  const getLatestNonce =
    overrides.getLatestNonce ??
    (() => provider.getTransactionCount(wallet.address, 'latest'));

  const reconciler =
    overrides.reconciler ??
    createReconciler({
      prisma,
      records,
      confirmer,
      readChainRecord: (recordHash) => verifier.readChainRecord(recordHash),
      getLatestNonce,
      enqueue,
    });

  const buildSubmittable =
    overrides.buildSubmittable ?? makeBuildSubmittable(records, config.pepper);

  const injective = createInjectiveService({ submitter, confirmer, verifier, hasher });

  return {
    config,
    injective,
    records,
    reconciler,
    enqueueRecordSubmission: enqueue,
    wallet,
    submitQueue,
    confirmQueue,
    enqueueConfirm,
    buildSubmittable,
    connection,
  };
}

/** Load a SubmittableRecord for a record id by rebuilding its envelope. */
export function makeBuildSubmittable(
  records: Pick<PublicRecordService, 'getWithSource'>,
  pepper: string,
): (recordId: string) => Promise<SubmittableRecord> {
  return async (recordId) => {
    const loaded = await records.getWithSource(recordId);
    if (!loaded) {
      throw new RecordNotFoundError(`PublicRecord ${recordId} not found`);
    }
    const built = buildEnvelopeForSource(loaded.source, pepper);
    // Guard against source drift between record creation and submission. The
    // hash rebuilt from the current source row MUST equal the recordHash frozen
    // into the PublicRecord row; otherwise we would broadcast a hash the DB does
    // not know (§ verify step ②). Submitting the drifted hash strands the record
    // forever: confirm-worker reads getRecord(dbHash)=not-exists, reconciler
    // re-enqueues, pre-check hits RECORD_EXISTS, and the loop never terminates.
    // Fail terminally so an operator can investigate the mutated source.
    if (built.recordHash !== loaded.record.recordHash) {
      throw new TerminalError(
        `RECORD_HASH_MISMATCH: PublicRecord ${recordId} stored ${loaded.record.recordHash} ` +
          `but source rebuilds to ${built.recordHash}`,
      );
    }
    return {
      recordId,
      recordType: built.recordType,
      recordHash: built.recordHash,
      chainArgs: built.chainArgs,
    };
  };
}

/**
 * Lazily construct the default PrismaClient (inert until first query). Loaded via
 * dynamic import so pure/offline callers that inject their own prisma never pull
 * in the generated client.
 */
async function createDefaultPrisma(): Promise<RuntimePrisma> {
  const mod = (await import('@prisma/client')) as unknown as {
    PrismaClient: new () => unknown;
  };
  return new mod.PrismaClient() as unknown as RuntimePrisma;
}

/** Default BullMQ connection derived from the configured Redis URL. */
function defaultConnection(config: BlockchainConfig): ConnectionLike {
  return { url: config.redisUrl } as unknown as ConnectionLike;
}
