// Policy service: immutable TokenPolicyVersion rows + pending-version activation
// at epoch rollover. Constitutional parameters (the three bps + rules) are only
// ever changed through a Proposal — this service exposes no direct bps setter.
//
//   createPendingVersion  — called by the proposal-service settlement callback
//                           inside its transaction (tx passed through). Records a
//                           new immutable version row and arms the policy's
//                           pending pointers; live params stay untouched.
//   activatePendingVersion — the epoch-service step-6 callback. Flips the pending
//                           version live, backfills the version row's
//                           publicRecordId, and emits the two PublicRecords
//                           (on-chain policy_version + DB-only
//                           inflation_rate_change). Zero network IO in-tx.
//
// Read helpers (getCurrentPolicy / listVersions) run non-transactionally.

import { createDbOnlyRecord } from './db-only-records';
import { EngineError } from './errors';
import type { EngineDeps, EngineTx, PolicyRow, PolicyService } from './types';

const BPS_MIN = 0;
const BPS_MAX = 10000;

/** Runtime view of a CommunityTokenPolicy row (findUnique returns unknown). */
interface PolicyDbRow {
  readonly id: string;
  readonly communityId: string;
  readonly policyVersion: number;
  readonly rules: unknown;
  readonly monthlyInflationRateBps: number;
  readonly maxAdvanceRateBps: number;
  readonly memberMintCapRateBps: number;
  readonly epochDurationDays: number;
  readonly pendingPolicyVersionId: string | null | undefined;
  readonly pendingPolicyEffectiveEpoch: number | null | undefined;
}

/** Runtime view of a TokenPolicyVersion row. */
interface PolicyVersionDbRow {
  readonly id: string;
  readonly policyId: string;
  readonly version: number;
  readonly effectiveEpoch: number;
  readonly monthlyInflationRateBps: number;
  readonly maxAdvanceRateBps: number;
  readonly memberMintCapRateBps: number;
  readonly rules: unknown;
  readonly proposalId: string | null;
  readonly publicRecordId: string | null | undefined;
  readonly createdAt: Date | null | undefined;
}

interface EpochDbRow {
  readonly epochNumber: number;
}

/** Prisma unique-violation guard. */
function isP2002(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

/** Every bps must be an integer within [0, 10000]. */
function assertBps(...values: number[]): void {
  for (const v of values) {
    if (!Number.isInteger(v) || v < BPS_MIN || v > BPS_MAX) {
      throw new EngineError('VALIDATION_ERROR', 'bps must be an integer in [0, 10000]');
    }
  }
}

/** Project a policy row into the frozen PolicyRow view (pending fields normalized). */
function toPolicyRow(r: PolicyDbRow): PolicyRow {
  return {
    communityId: r.communityId,
    policyVersion: r.policyVersion,
    rules: r.rules,
    monthlyInflationRateBps: r.monthlyInflationRateBps,
    maxAdvanceRateBps: r.maxAdvanceRateBps,
    memberMintCapRateBps: r.memberMintCapRateBps,
    epochDurationDays: r.epochDurationDays,
    pendingPolicyVersionId: r.pendingPolicyVersionId ?? null,
    pendingPolicyEffectiveEpoch: r.pendingPolicyEffectiveEpoch ?? null,
  };
}

export function createPolicyService(deps: EngineDeps): PolicyService {
  const nowFn = deps.now ?? ((): Date => new Date());

  async function readPolicy(tx: EngineTx, communityId: string): Promise<PolicyDbRow | null> {
    const row = await tx.communityTokenPolicy.findUnique({ where: { communityId } });
    return (row as PolicyDbRow | null) ?? null;
  }

  return {
    createPendingVersion: async (tx, input) => {
      const policy = await readPolicy(tx, input.communityId);
      if (!policy) throw new EngineError('NOT_FOUND', 'policy not found');
      if (policy.pendingPolicyVersionId != null) {
        throw new EngineError('CONFLICT', 'a pending policy version already exists');
      }
      assertBps(
        input.monthlyInflationRateBps,
        input.maxAdvanceRateBps,
        input.memberMintCapRateBps,
      );

      const activeEpoch = (await tx.tokenEpoch.findFirst({
        where: { communityId: input.communityId, status: 'active' },
      })) as EpochDbRow | null;
      if (!activeEpoch) throw new EngineError('EPOCH_NOT_ACTIVE', 'no active epoch');
      const nextEpochNumber = activeEpoch.epochNumber + 1;

      let created: PolicyVersionDbRow;
      try {
        created = (await tx.tokenPolicyVersion.create({
          data: {
            policyId: policy.id,
            version: policy.policyVersion + 1,
            effectiveEpoch: nextEpochNumber,
            monthlyInflationRateBps: input.monthlyInflationRateBps,
            maxAdvanceRateBps: input.maxAdvanceRateBps,
            memberMintCapRateBps: input.memberMintCapRateBps,
            rules: input.rules ?? policy.rules,
            proposalId: input.proposalId,
          },
        })) as PolicyVersionDbRow;
      } catch (err) {
        if (isP2002(err)) {
          throw new EngineError('CONFLICT', 'policy version already exists');
        }
        throw err;
      }

      await tx.communityTokenPolicy.update({
        where: { communityId: input.communityId },
        data: {
          pendingPolicyVersionId: created.id,
          pendingPolicyEffectiveEpoch: nextEpochNumber,
        },
      });

      return { versionId: created.id, version: created.version, effectiveEpoch: nextEpochNumber };
    },

    activatePendingVersion: async (tx, communityId, nextEpochNumber) => {
      const policy = await readPolicy(tx, communityId);
      if (!policy) return null;
      if (policy.pendingPolicyVersionId == null) return null;
      if (policy.pendingPolicyEffectiveEpoch !== nextEpochNumber) return null;

      const version = (await tx.tokenPolicyVersion.findUnique({
        where: { id: policy.pendingPolicyVersionId },
      })) as PolicyVersionDbRow | null;
      if (!version) throw new EngineError('NOT_FOUND', 'pending policy version row missing');

      const from = policy.monthlyInflationRateBps;
      const to = version.monthlyInflationRateBps;

      // 1. Flip live params/rules/version; clear pending pointers.
      await tx.communityTokenPolicy.update({
        where: { communityId },
        data: {
          monthlyInflationRateBps: version.monthlyInflationRateBps,
          maxAdvanceRateBps: version.maxAdvanceRateBps,
          memberMintCapRateBps: version.memberMintCapRateBps,
          rules: version.rules,
          policyVersion: version.version,
          pendingPolicyVersionId: null,
          pendingPolicyEffectiveEpoch: null,
        },
      });

      // 2. On-chain PublicRecord (policy_version) + version-row publicRecordId backfill.
      const built = deps.buildEnvelope({
        kind: 'policy_version',
        policy: {
          id: version.id,
          communityId,
          policyVersion: version.version,
          monthlyInflationRateBps: version.monthlyInflationRateBps,
          maxAdvanceRateBps: version.maxAdvanceRateBps,
          memberMintCapRateBps: version.memberMintCapRateBps,
          effectiveEpoch: version.effectiveEpoch,
          createdAt: version.createdAt ?? nowFn(),
        },
      });
      const policyVersionRecord = await deps.records.createPendingRecord(tx, {
        recordType: 'policy_version',
        sourceTable: 'TokenPolicyVersion',
        sourceId: version.id,
        communityId,
        envelope: built.envelope,
        recordHash: built.recordHash,
      });
      await tx.tokenPolicyVersion.update({
        where: { id: version.id },
        data: { publicRecordId: policyVersionRecord.id },
      });

      // 3. DB-only PublicRecord (inflation_rate_change) — terminal on creation.
      await createDbOnlyRecord(tx, {
        communityId,
        recordType: 'inflation_rate_change',
        sourceTable: 'CommunityTokenPolicy',
        sourceId: policy.id,
        payload: { from, to, effectiveEpoch: nextEpochNumber },
      });

      return {
        monthlyInflationRateBps: version.monthlyInflationRateBps,
        chainRecordIds: [policyVersionRecord.id],
      };
    },

    getCurrentPolicy: async (communityId) => {
      const row = await readPolicy(deps.db, communityId);
      return row ? toPolicyRow(row) : null;
    },

    listVersions: async (communityId) => {
      const policy = await readPolicy(deps.db, communityId);
      if (!policy) return [];
      const versions = (await deps.db.tokenPolicyVersion.findMany({
        where: { policyId: policy.id },
      })) as PolicyVersionDbRow[];
      return [...versions]
        .sort((a, b) => b.version - a.version)
        .map((v) => ({
          communityId,
          policyVersion: v.version,
          rules: v.rules,
          monthlyInflationRateBps: v.monthlyInflationRateBps,
          maxAdvanceRateBps: v.maxAdvanceRateBps,
          memberMintCapRateBps: v.memberMintCapRateBps,
          epochDurationDays: policy.epochDurationDays,
          pendingPolicyVersionId: policy.pendingPolicyVersionId ?? null,
          pendingPolicyEffectiveEpoch: policy.pendingPolicyEffectiveEpoch ?? null,
        }));
    },
  };
}
