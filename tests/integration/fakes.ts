// Offline integration fakes for the blockchain pipeline (W4). Three doubles the
// end-to-end tests drive the REAL wiring against: FakeChain (chain provider +
// read/write contract faces), FakePrisma (structural PublicRecord store + source
// tables + $transaction), and InlineQueue (a Pick<Queue,'add'|'getJob'> double
// with a synchronous flush). No network, no Redis, no Postgres — every effect is
// an in-memory, deterministic mutation returning fresh objects.

import type { Job, JobsOptions, Queue } from 'bullmq';

import { EVENT_TOPICS, type RecordEventName } from '../../lib/blockchain/abi/youfen-records';
import type {
  Hex32,
  ProposalData,
  PublicRecordDTO,
  RecordType,
  TokenEpochData,
  TokenMintEventData,
  TokenPolicyData,
  TokenReversalEventData,
  VerificationStatus,
} from '../../lib/blockchain/types';

// ---- Shared constants ----

/** Contract RecordType enum ordinals (contracts/YouFenRecords.sol §enum). */
const RECORD_TYPE_CODE: Readonly<Record<RecordType, number>> = {
  token_mint: 0,
  advance_mint: 1,
  token_reversal: 2,
  epoch_summary: 3,
  policy_version: 4,
  proposal_snapshot: 5,
  proposal_result: 6,
};

/** Emitting event (topic0) per record type; mints share TokensMinted. */
const EVENT_NAME_BY_RECORD_TYPE: Readonly<Record<RecordType, RecordEventName>> = {
  token_mint: 'TokensMinted',
  advance_mint: 'TokensMinted',
  token_reversal: 'TokensReversed',
  epoch_summary: 'EpochRecorded',
  policy_version: 'PolicyVersionRecorded',
  proposal_snapshot: 'ProposalSnapshotRecorded',
  proposal_result: 'ProposalResultRecorded',
};

/** Default deployed contract address (matches the harness confirmer). */
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ZERO_TOPIC = `0x${'0'.repeat(64)}`;
const BASE_TIMESTAMP = 1_700_000_000;

/** Format an incrementing counter as a lowercase 0x 32-byte hash. */
function toHash(n: number): string {
  return `0x${n.toString(16).padStart(64, '0')}`;
}

/** Coerce an indexed chain arg into a topic string (only [0]/[3] are asserted). */
function coerceTopic(v: Hex32 | bigint | number): string {
  if (typeof v === 'string') {
    return v.toLowerCase();
  }
  try {
    return `0x${BigInt(v).toString(16).padStart(64, '0')}`;
  } catch {
    return ZERO_TOPIC;
  }
}

/** Build an ethers-v6-shaped revert (reason + shortMessage) for a failed send. */
function ethersRevert(reason: string): Error {
  const err = new Error(`execution reverted: ${reason}`) as Error & {
    reason: string;
    shortMessage: string;
    code: string;
  };
  err.reason = reason;
  err.shortMessage = `execution reverted: ${reason}`;
  err.code = 'CALL_EXCEPTION';
  return err;
}

// ---- FakeChain ----

export interface FakeChainOptions {
  readonly startBlock?: number;
  readonly address?: string;
}

export interface FakeBroadcastResult {
  readonly status: number;
  readonly blockNumber: number;
  readonly txHash: string;
}

interface FakeGetRecordResult {
  readonly exists: boolean;
  readonly recordType: number;
  readonly blockNumber: number;
  readonly timestamp: number;
}

interface FakeReceipt {
  readonly status: number;
  readonly blockNumber: number;
  readonly blockHash: string;
}

interface FakeTransaction {
  readonly hash: string;
  readonly blockNumber: number;
}

interface FakeLog {
  readonly transactionHash: string;
  readonly blockNumber: number;
  readonly address: string;
  readonly topics: readonly string[];
}

interface GetLogsFilter {
  readonly address?: string;
  readonly fromBlock?: number;
  readonly toBlock?: number;
  readonly topics?: readonly (string | null)[];
}

/**
 * In-memory stand-in for the injected provider plus the read/write contract
 * faces. `recordSubmitted` is synchronous (the write adapter awaits nothing);
 * every read (`getRecord`, `getLogs`, receipts) is async to mirror ethers.
 */
export class FakeChain {
  private readonly address: string;
  private block: number;
  private txSeq = 0;
  private failNext = false;
  private revertNext = false;
  private readonly records = new Map<string, FakeGetRecordResult>();
  private readonly receipts = new Map<string, FakeReceipt>();
  private readonly txs = new Map<string, FakeTransaction>();
  private readonly logs: FakeLog[] = [];

  constructor(opts: FakeChainOptions = {}) {
    this.address = (opts.address ?? ZERO_ADDRESS).toLowerCase();
    this.block = opts.startBlock ?? 0;
  }

  /** Simulate a broadcast + inclusion. Records on-chain state and emits a log. */
  recordSubmitted(
    args: readonly (Hex32 | bigint | number)[],
    recordType: RecordType,
  ): FakeBroadcastResult {
    if (this.failNext) {
      this.failNext = false;
      throw ethersRevert('RECORD_EXISTS');
    }

    this.block += 1;
    const blockNumber = this.block;
    const txHash = toHash(++this.txSeq);
    const blockHash = toHash(1_000_000 + blockNumber);
    this.txs.set(txHash, { hash: txHash, blockNumber });

    if (this.revertNext) {
      this.revertNext = false;
      this.receipts.set(txHash, { status: 0, blockNumber, blockHash });
      return { status: 0, blockNumber, txHash };
    }

    const recordHash = String(args[args.length - 1]).toLowerCase();
    this.records.set(recordHash, {
      exists: true,
      recordType: RECORD_TYPE_CODE[recordType],
      blockNumber,
      timestamp: BASE_TIMESTAMP + blockNumber,
    });
    this.receipts.set(txHash, { status: 1, blockNumber, blockHash });
    this.logs.push({
      transactionHash: txHash,
      blockNumber,
      address: this.address,
      topics: [
        EVENT_TOPICS[EVENT_NAME_BY_RECORD_TYPE[recordType]],
        coerceTopic(args[0]),
        coerceTopic(args[1]),
        recordHash,
      ],
    });
    return { status: 1, blockNumber, txHash };
  }

  /** Seed an existing on-chain record without a tx/log (RECORD_EXISTS recovery). */
  presetRecord(
    recordHash: Hex32,
    recordType: RecordType,
    meta: { readonly blockNumber: number; readonly timestamp: number },
  ): void {
    this.records.set(recordHash.toLowerCase(), {
      exists: true,
      recordType: RECORD_TYPE_CODE[recordType],
      blockNumber: meta.blockNumber,
      timestamp: meta.timestamp,
    });
  }

  /** Make the next `recordSubmitted` throw an ethers-style RECORD_EXISTS revert. */
  failNextBroadcast(): void {
    this.failNext = true;
  }

  /** Make the next `recordSubmitted` mine a status-0 receipt without state. */
  revertNextReceipt(): void {
    this.revertNext = true;
  }

  async getBlockNumber(): Promise<number> {
    return this.block;
  }

  async getRecord(recordHash: Hex32): Promise<FakeGetRecordResult> {
    const meta = this.records.get(recordHash.toLowerCase());
    return meta ? { ...meta } : { exists: false, recordType: 0, blockNumber: 0, timestamp: 0 };
  }

  async getTransactionReceipt(txHash: string): Promise<FakeReceipt | null> {
    const receipt = this.receipts.get(txHash);
    return receipt ? { ...receipt } : null;
  }

  async getTransaction(txHash: string): Promise<FakeTransaction | null> {
    const tx = this.txs.get(txHash);
    return tx ? { ...tx } : null;
  }

  async getLogs(filter: GetLogsFilter): Promise<readonly FakeLog[]> {
    const fromBlock = filter.fromBlock ?? 0;
    const toBlock = filter.toBlock ?? this.block;
    const address = filter.address?.toLowerCase();
    const topics = filter.topics;
    return this.logs
      .filter((log) => {
        if (address !== undefined && log.address !== address) {
          return false;
        }
        if (log.blockNumber < fromBlock || log.blockNumber > toBlock) {
          return false;
        }
        if (topics) {
          for (let i = 0; i < topics.length; i += 1) {
            const want = topics[i];
            if (want !== null && want !== undefined) {
              if ((log.topics[i] ?? '').toLowerCase() !== want.toLowerCase()) {
                return false;
              }
            }
          }
        }
        return true;
      })
      .map((log) => ({ ...log }));
  }
}

// ---- FakePrisma ----

interface PublicRecordCreateInput {
  readonly communityId: string;
  readonly recordType: RecordType;
  readonly envelopeJson: string;
  readonly recordHash: string;
  readonly sourceTable: string;
  readonly sourceId: string;
  readonly status?: VerificationStatus;
  readonly attemptEpoch?: number;
  readonly id?: string;
  readonly chainEligible?: boolean;
}

interface PublicRecordDelegateFake {
  create(args: { data: PublicRecordCreateInput }): Promise<PublicRecordDTO>;
  findUnique(args: { where: { id?: string; recordHash?: string } }): Promise<PublicRecordDTO | null>;
  findMany(args: { where: Record<string, unknown> }): Promise<PublicRecordDTO[]>;
  updateMany(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<PublicRecordDTO>;
}

interface FindByIdFake<T> {
  findUnique(args: { where: { id: string } }): Promise<T | null>;
}

export interface FakePrismaOptions {
  readonly publicRecords?: readonly PublicRecordDTO[];
  readonly tokenMintEvents?: readonly TokenMintEventData[];
  readonly tokenReversalEvents?: readonly TokenReversalEventData[];
  readonly tokenEpochs?: readonly TokenEpochData[];
  readonly communityTokenPolicies?: readonly TokenPolicyData[];
  readonly proposals?: readonly ProposalData[];
  readonly now?: () => Date;
}

/** Comparable projection for range operators (Date -> ms). */
function comparable(v: unknown): number {
  return v instanceof Date ? v.getTime() : (v as number);
}

/** Match a single where value against a scalar or an {in}/{lt} operator object. */
function matchCond(value: unknown, cond: unknown): boolean {
  if (cond === null) {
    return value === null;
  }
  if (typeof cond === 'object' && !(cond instanceof Date)) {
    const c = cond as Record<string, unknown>;
    if ('in' in c) {
      return (c.in as readonly unknown[]).includes(value);
    }
    if ('lt' in c) {
      return comparable(value) < comparable(c.lt);
    }
    return false;
  }
  return value === cond;
}

function p2002(): Error {
  const err = new Error('Unique constraint failed on the fields: (`recordHash`)') as Error & {
    code: string;
  };
  err.code = 'P2002';
  return err;
}

/**
 * Structural Prisma double for the PublicRecord delegate + read-only source
 * tables. Where-matching supports scalar equality, `{ in }` and `{ lt }`; writes
 * support scalar assignment and `{ increment }`, always refreshing updatedAt from
 * the injected clock. Rows are never mutated in place — updates replace the entry.
 */
export class FakePrisma {
  private readonly records: Map<string, PublicRecordDTO>;
  private readonly mints: Map<string, TokenMintEventData>;
  private readonly reversals: Map<string, TokenReversalEventData>;
  private readonly epochs: Map<string, TokenEpochData>;
  private readonly policies: Map<string, TokenPolicyData>;
  private readonly proposalRows: Map<string, ProposalData>;
  private readonly clock: () => Date;
  private seq = 0;

  readonly publicRecord: PublicRecordDelegateFake;
  readonly tokenMintEvent: FindByIdFake<TokenMintEventData>;
  readonly tokenReversalEvent: FindByIdFake<TokenReversalEventData>;
  readonly tokenEpoch: FindByIdFake<TokenEpochData>;
  readonly communityTokenPolicy: FindByIdFake<TokenPolicyData>;
  readonly proposal: FindByIdFake<ProposalData>;

  constructor(opts: FakePrismaOptions = {}) {
    this.clock = opts.now ?? (() => new Date());
    // Model Prisma's `chainEligible @default(true)`: seeded rows that omit the
    // column read back as chain-eligible, exactly as the real DB stores them.
    this.records = new Map(
      (opts.publicRecords ?? []).map((r) => [r.id, { ...r, chainEligible: r.chainEligible ?? true }]),
    );
    this.mints = new Map((opts.tokenMintEvents ?? []).map((r) => [r.id, r]));
    this.reversals = new Map((opts.tokenReversalEvents ?? []).map((r) => [r.id, r]));
    this.epochs = new Map((opts.tokenEpochs ?? []).map((r) => [r.id, r]));
    this.policies = new Map((opts.communityTokenPolicies ?? []).map((r) => [r.id, r]));
    this.proposalRows = new Map((opts.proposals ?? []).map((r) => [r.id, r]));

    this.publicRecord = {
      create: (args) => this.createRecord(args.data),
      findUnique: (args) => this.findUniqueRecord(args.where),
      findMany: (args) => Promise.resolve(this.findManyRecords(args.where)),
      updateMany: (args) => Promise.resolve(this.updateManyRecords(args.where, args.data)),
      update: (args) => this.updateRecord(args.where.id, args.data),
    };
    this.tokenMintEvent = { findUnique: (a) => Promise.resolve(this.mints.get(a.where.id) ?? null) };
    this.tokenReversalEvent = {
      findUnique: (a) => Promise.resolve(this.reversals.get(a.where.id) ?? null),
    };
    this.tokenEpoch = { findUnique: (a) => Promise.resolve(this.epochs.get(a.where.id) ?? null) };
    this.communityTokenPolicy = {
      findUnique: (a) => Promise.resolve(this.policies.get(a.where.id) ?? null),
    };
    this.proposal = {
      findUnique: (a) => Promise.resolve(this.proposalRows.get(a.where.id) ?? null),
    };
  }

  /** Pass-through interactive transaction: the callback runs against `this`. */
  async $transaction<T>(fn: (tx: FakePrisma) => Promise<T> | T): Promise<T> {
    return fn(this);
  }

  private matchWhere(row: PublicRecordDTO, where: Record<string, unknown>): boolean {
    return Object.entries(where).every(([key, cond]) =>
      matchCond((row as unknown as Record<string, unknown>)[key], cond),
    );
  }

  private applyData(row: PublicRecordDTO, data: Record<string, unknown>): PublicRecordDTO {
    const next = { ...row } as Record<string, unknown>;
    for (const [key, value] of Object.entries(data)) {
      if (
        value !== null &&
        typeof value === 'object' &&
        !(value instanceof Date) &&
        'increment' in (value as object)
      ) {
        const current = (row as unknown as Record<string, unknown>)[key];
        next[key] = ((current as number) ?? 0) + (value as { increment: number }).increment;
      } else {
        next[key] = value;
      }
    }
    next.updatedAt = this.clock();
    return next as unknown as PublicRecordDTO;
  }

  private async createRecord(data: PublicRecordCreateInput): Promise<PublicRecordDTO> {
    const wanted = data.recordHash.toLowerCase();
    for (const existing of this.records.values()) {
      if (existing.recordHash.toLowerCase() === wanted) {
        throw p2002();
      }
    }
    const now = this.clock();
    const id = data.id ?? `pr_${(this.seq += 1)}`;
    const row: PublicRecordDTO = {
      id,
      communityId: data.communityId,
      sourceTable: data.sourceTable,
      sourceId: data.sourceId,
      recordType: data.recordType,
      status: data.status ?? 'pending',
      envelopeJson: data.envelopeJson,
      recordHash: data.recordHash as Hex32,
      chainEligible: data.chainEligible ?? true,
      txHash: null,
      assignedNonce: null,
      blockNumber: null,
      blockHash: null,
      submittedAt: null,
      confirmedAt: null,
      attemptEpoch: data.attemptEpoch ?? 1,
      lastError: null,
      supersededByRecordId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(id, row);
    return row;
  }

  private async findUniqueRecord(where: {
    id?: string;
    recordHash?: string;
  }): Promise<PublicRecordDTO | null> {
    if (where.id !== undefined) {
      return this.records.get(where.id) ?? null;
    }
    if (where.recordHash !== undefined) {
      const wanted = where.recordHash.toLowerCase();
      for (const row of this.records.values()) {
        if (row.recordHash.toLowerCase() === wanted) {
          return row;
        }
      }
    }
    return null;
  }

  private findManyRecords(where: Record<string, unknown>): PublicRecordDTO[] {
    return [...this.records.values()].filter((row) => this.matchWhere(row, where));
  }

  private updateManyRecords(
    where: Record<string, unknown>,
    data: Record<string, unknown>,
  ): { count: number } {
    let count = 0;
    for (const [id, row] of this.records) {
      if (this.matchWhere(row, where)) {
        this.records.set(id, this.applyData(row, data));
        count += 1;
      }
    }
    return { count };
  }

  private async updateRecord(
    id: string,
    data: Record<string, unknown>,
  ): Promise<PublicRecordDTO> {
    const row = this.records.get(id);
    if (!row) {
      throw new Error(`PublicRecord ${id} not found`);
    }
    const next = this.applyData(row, data);
    this.records.set(id, next);
    return next;
  }
}

// ---- InlineQueue ----

interface RecordedJob {
  readonly id: string;
  readonly name: string;
  readonly data: unknown;
  readonly opts: JobsOptions;
}

export interface FlushResult {
  readonly id: string;
  readonly result: unknown;
}

type JobProcessor = (job: RecordedJob) => Promise<unknown>;

/**
 * A BullMQ Queue double covering the frozen queue-layer surface
 * (Pick<Queue,'add'|'getJob'>): jobId de-duplication plus a synchronous `flush`
 * that runs a registered processor over recorded jobs in insertion order. No
 * Redis and no Worker — the pipeline invokes the DI processors directly.
 */
export class InlineQueue {
  private readonly jobs = new Map<string, RecordedJob>();
  private processor: JobProcessor | null = null;
  private seq = 0;

  async add(name: string, data: unknown, opts?: JobsOptions): Promise<Job> {
    const id = opts?.jobId ?? `auto:${(this.seq += 1)}`;
    const existing = this.jobs.get(id);
    if (existing) {
      return existing as unknown as Job;
    }
    const job: RecordedJob = { id, name, data, opts: opts ?? {} };
    this.jobs.set(id, job);
    return job as unknown as Job;
  }

  async getJob(jobId: string): Promise<Job | undefined> {
    const job = this.jobs.get(jobId);
    return job ? (job as unknown as Job) : undefined;
  }

  /** Register the processor a later `flush` will run over recorded jobs. */
  process(processor: JobProcessor): void {
    this.processor = processor;
  }

  /** Run every recorded job through the processor in insertion order. */
  async flush(): Promise<readonly FlushResult[]> {
    if (!this.processor) {
      return [];
    }
    const out: FlushResult[] = [];
    for (const job of this.jobs.values()) {
      const result = await this.processor(job);
      out.push({ id: job.id, result });
    }
    return out;
  }

  /** Drop all recorded jobs to simulate a Redis flush. */
  clear(): void {
    this.jobs.clear();
  }
}
