import { Prisma } from '@prisma/client';

// Ledger immutability guard (ARCHITECTURE §append-only ledgers).
//
// The append-only ledgers — TokenMintEvent, TokenReversalEvent,
// TokenPolicyVersion, Vote, ProposalMemberSnapshot — are never mutated except
// for a tiny, explicit whitelist:
//   - TokenMintEvent: governanceStatus flip + publicRecordId backfill
//   - TokenReversalEvent / TokenPolicyVersion: publicRecordId backfill
//   - Vote / ProposalMemberSnapshot: fully immutable (no updates at all)
// and they can never be deleted.
//
// PublicRecord is not append-only but its business columns are immutable; only
// the on-chain lifecycle fields may change. It may still be deleted (not a
// ledger row), so delete is not intercepted for it.
//
// This module exports the pure core, `assertLedgerMutation`, so the rules can
// be unit-tested without a database, plus the Prisma client extension that
// wires the core into every query.

/** Append-only ledger models: delete/deleteMany are always forbidden. */
const LEDGER_MODELS: ReadonlySet<string> = new Set([
  'TokenMintEvent',
  'TokenReversalEvent',
  'TokenPolicyVersion',
  'Vote',
  'ProposalMemberSnapshot',
]);

/**
 * Per-model whitelist of fields that MAY be updated. A model absent from this
 * map is unguarded (arbitrary updates allowed). An empty array means the model
 * is fully immutable — no field may be updated.
 */
const UPDATE_WHITELIST: Readonly<Record<string, readonly string[]>> = {
  TokenMintEvent: ['governanceStatus', 'publicRecordId'],
  TokenReversalEvent: ['publicRecordId'],
  TokenPolicyVersion: ['publicRecordId'],
  Vote: [],
  ProposalMemberSnapshot: [],
  PublicRecord: [
    'status',
    'txHash',
    'blockNumber',
    'blockHash',
    'assignedNonce',
    'submittedAt',
    'confirmedAt',
    'attemptEpoch',
    'supersededByRecordId',
    'lastError',
  ],
};

const UPDATE_OPERATIONS: ReadonlySet<string> = new Set([
  'update',
  'updateMany',
  'upsert',
]);

const DELETE_OPERATIONS: ReadonlySet<string> = new Set(['delete', 'deleteMany']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Assert that a mutation against a (possibly guarded) model is permitted.
 *
 * @param model     Prisma model name (e.g. 'TokenMintEvent').
 * @param operation Prisma operation name (update/updateMany/upsert/delete/deleteMany/...).
 * @param data      For update-like operations, the object whose keys are the
 *                  fields being written. The extension passes `args.data` for
 *                  update/updateMany and `args.update` for upsert. Ignored for
 *                  delete-like operations.
 * @throws Error when the mutation violates the append-only / whitelist rules.
 */
export function assertLedgerMutation(
  model: string,
  operation: string,
  data: unknown,
): void {
  if (DELETE_OPERATIONS.has(operation)) {
    if (LEDGER_MODELS.has(model)) {
      throw new Error(
        `Ledger model ${model} is append-only: ${operation} is forbidden.`,
      );
    }
    return;
  }

  if (!UPDATE_OPERATIONS.has(operation)) {
    return;
  }

  const whitelist = UPDATE_WHITELIST[model];
  if (whitelist === undefined) {
    return;
  }

  if (!isRecord(data)) {
    return;
  }

  const violating = Object.keys(data).filter((key) => !whitelist.includes(key));
  if (violating.length > 0) {
    const allowed = whitelist.length > 0 ? whitelist.join(', ') : 'none';
    throw new Error(
      `Ledger model ${model} forbids ${operation} of field(s) [${violating.join(', ')}]. ` +
        `Allowed: [${allowed}].`,
    );
  }
}

function extractUpdateData(operation: string, args: unknown): unknown {
  if (!isRecord(args)) {
    return undefined;
  }
  if (operation === 'update' || operation === 'updateMany') {
    return args['data'];
  }
  if (operation === 'upsert') {
    return args['update'];
  }
  return undefined;
}

/**
 * Prisma client extension enforcing {@link assertLedgerMutation} on every query
 * across all models. Attach via `new PrismaClient().$extends(immutableGuardExtension)`.
 */
export const immutableGuardExtension = Prisma.defineExtension({
  name: 'immutable-guard',
  query: {
    $allModels: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async $allOperations({ model, operation, args, query }) {
        assertLedgerMutation(model, operation, extractUpdateData(operation, args));
        return query(args);
      },
    },
  },
});
