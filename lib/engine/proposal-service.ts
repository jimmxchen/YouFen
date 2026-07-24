// Proposal engine service (W3-5): six-type creation, activation with a frozen
// dual-Merkle snapshot, snapshot-bound voting, and decision-is-statement result
// settlement. Business-condition UPDATE / row locks go through sql.ts /
// db-locks.ts (no raw SQL here). Vote weight is read ONLY from the frozen
// per-proposal snapshot row — never a live balance — sealing the snapshot
// against mid-vote minting attacks.

import { buildMerkleRoot, hashSnapshotLeaf, hashVoteLeaf } from '../blockchain/hashing/merkle';
import type { ProposalData } from '../blockchain/types';

import { lockActiveEpoch, lockProposal, lockState } from './db-locks';
import { createDbOnlyRecord } from './db-only-records';
import { EngineError } from './errors';
import { endProposalIfDue, transitionProposalStatus } from './sql';
import type {
  EngineDeps,
  EngineTx,
  Hex32,
  PolicyService,
  ProposalCreateInput,
  ProposalService,
  ProposalType,
} from './types';

// prettier-ignore
const PROPOSAL_TYPES: readonly ProposalType[] = ['community_decision', 'token_policy_change', 'budget_advance', 'special_mint', 'related_party_mint', 'token_reversal'];

/** Default voting window when a proposal carries no explicit endTime. */
const VOTE_WINDOW_MS = 72 * 60 * 60 * 1000;

/** Both hash ports are mandatory + 2-arg (red-team): no self-made defaults.
 *  Production binds them to hashing/id-hash (peppered memberId, tagged optionId). */
export interface ProposalServiceDeps extends EngineDeps {
  readonly policy: Pick<PolicyService, 'createPendingVersion'>;
  readonly hashMemberId: (communityId: string, memberId: string) => Hex32;
  readonly hashOptionId: (proposalId: string, optionId: string) => Hex32;
}

interface ProposalRow {
  readonly id: string;
  readonly communityId: string;
  readonly status: string;
  readonly type: string | null;
  readonly options: unknown;
  readonly endTime: Date | null;
  readonly createdAt: Date;
  readonly epochNumberSnapshot: number | null;
  readonly totalSupplySnapshot: bigint | null;
  readonly activeGovernanceSupplySnapshot: bigint | null;
  readonly tokenPolicyVersionSnapshot: number | null;
  readonly snapshotAt: Date | null;
  readonly minimumVoterCount: number;
  readonly policyChangePayload: unknown;
}

interface BalanceLite {
  readonly memberId: string;
  readonly activeGovernanceBalance: bigint;
  readonly totalBalance: bigint;
}

interface VoteRow {
  readonly id: string;
  readonly memberId: string;
  readonly optionId: string;
  readonly activeGovernanceBalanceSnapshot: bigint;
}

interface ProposalMetadata {
  readonly policyChangePayload?: Record<string, unknown>;
  readonly advanceAmount?: bigint;
  readonly specialMintRecipientId?: string;
  readonly specialMintAmount?: bigint;
  readonly relatedPartyNote?: string;
  // W5-3 API fields persisted onto the Proposal's own columns (dropping them
  // silently forced minimumVoterCount=3 and the 72h endTime window).
  readonly description?: string;
  readonly minimumVoterCount?: number;
  readonly endTime?: string | Date;
}

/** The frozen snapshot columns of a ProposalData envelope source. */
type SnapshotFields = Omit<
  ProposalData,
  'endedAt' | 'winningOptionId' | 'voterCount' | 'totalVoteWeight' | 'weightsMerkleRoot' | 'votesMerkleRoot'
>;

function fail(code: EngineError['code'], message?: string): never {
  throw new EngineError(code, message);
}

function isP2002(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

function asMetadata(value: unknown): ProposalMetadata {
  return value !== null && typeof value === 'object' ? (value as ProposalMetadata) : {};
}

function optionIds(options: unknown): string[] {
  return Array.isArray(options) ? options.map((o) => (o as { id: string }).id) : [];
}

function need(ok: boolean, message: string): void {
  if (!ok) fail('VALIDATION_ERROR', message);
}

/** Coerce a metadata endTime (ISO string or Date) to a Date, failing fast on a bad value. */
function parseEndTime(value: string | Date): Date {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) fail('VALIDATION_ERROR', 'endTime is not a valid date');
  return d;
}

/** Build the type-specific Proposal insert data, validating required extras. */
function buildCreateData(input: ProposalCreateInput, meta: ProposalMetadata): Record<string, unknown> {
  const base: Record<string, unknown> = {
    communityId: input.communityId,
    title: input.title,
    type: input.type,
    status: 'draft',
    createdBy: input.createdBy,
    options: input.options,
    // Persist creator governance params; omit when absent so Prisma defaults
    // (minimumVoterCount=3, endTime -> 72h window) still apply.
    ...(typeof meta.description === 'string' ? { description: meta.description } : {}),
    ...(typeof meta.minimumVoterCount === 'number' ? { minimumVoterCount: meta.minimumVoterCount } : {}),
    ...(meta.endTime !== undefined ? { endTime: parseEndTime(meta.endTime) } : {}),
  };
  const num = (v: unknown): boolean => typeof v === 'number';
  const p = meta.policyChangePayload;
  switch (input.type) {
    case 'community_decision':
      return base;
    case 'token_policy_change':
      need(!!p && num(p.monthlyInflationRateBps) && num(p.maxAdvanceRateBps) && num(p.memberMintCapRateBps), 'token_policy_change requires rate payload');
      return { ...base, policyChangePayload: p };
    case 'budget_advance':
      need(typeof meta.advanceAmount === 'bigint' && !!p && typeof p.advanceRequestId === 'string', 'budget_advance requires advanceAmount + advanceRequestId');
      return { ...base, advanceAmount: meta.advanceAmount, policyChangePayload: p };
    case 'special_mint':
      need(typeof meta.specialMintRecipientId === 'string' && typeof meta.specialMintAmount === 'bigint', 'special_mint requires recipient + amount');
      return { ...base, specialMintRecipientId: meta.specialMintRecipientId, specialMintAmount: meta.specialMintAmount };
    case 'related_party_mint':
      need(typeof meta.specialMintRecipientId === 'string' && typeof meta.specialMintAmount === 'bigint' && typeof meta.relatedPartyNote === 'string', 'related_party_mint requires recipient + amount + note');
      return { ...base, specialMintRecipientId: meta.specialMintRecipientId, specialMintAmount: meta.specialMintAmount, relatedPartyNote: meta.relatedPartyNote };
    case 'token_reversal':
      need(!!p && typeof p.targetMintEventId === 'string', 'token_reversal requires targetMintEventId');
      return { ...base, policyChangePayload: p };
    default:
      return fail('VALIDATION_ERROR', 'unknown proposal type');
  }
}

/** The computed result columns layered onto a snapshot to form a ProposalData. */
type ResultFields = Pick<
  ProposalData,
  'endedAt' | 'winningOptionId' | 'voterCount' | 'totalVoteWeight' | 'weightsMerkleRoot' | 'votesMerkleRoot'
>;

/** SnapshotFields + computed ResultFields = a complete ProposalData envelope source. */
function toProposalData(row: SnapshotFields, extra: ResultFields): ProposalData {
  return { ...row, ...extra };
}

/** Tally votes by option; resolve the winner (tie -> null) and total weight. */
function tallyVotes(votes: readonly VoteRow[]): { winningOptionId: string | null; totalVoteWeight: bigint } {
  const byOption = new Map<string, bigint>();
  let total = 0n;
  for (const v of votes) {
    total += v.activeGovernanceBalanceSnapshot;
    byOption.set(v.optionId, (byOption.get(v.optionId) ?? 0n) + v.activeGovernanceBalanceSnapshot);
  }
  let winner: string | null = null;
  let max = -1n;
  let tie = false;
  for (const [opt, weight] of byOption) {
    if (weight > max) {
      max = weight;
      winner = opt;
      tie = false;
    } else if (weight === max) {
      tie = true;
    }
  }
  return { winningOptionId: tie ? null : winner, totalVoteWeight: total };
}

/** Status-quo fallback when no option reaches a plurality (spec ids: approve, reject). */
const REJECT_OPTION_ID = 'reject';

/** Resolve a recordable (non-null) winner. A tie / zero-vote ballot has no
 *  plurality, so it fails to 'reject' (last option if 'reject' is absent — never
 *  'approve', so a non-decision can never settle). A null winner would make the
 *  frozen result builder throw RESULT_INCOMPLETE, rolling end() back and
 *  stranding the proposal 'active'; matching the DB/return winner to the recorded
 *  one keeps ledger and chain in lockstep. */
function resolveOutcome(
  votes: readonly VoteRow[],
  options: unknown,
): { winningOptionId: string; totalVoteWeight: bigint } {
  const { winningOptionId, totalVoteWeight } = tallyVotes(votes);
  if (winningOptionId !== null) return { winningOptionId, totalVoteWeight };
  const ids = optionIds(options);
  const fallback = ids.includes(REJECT_OPTION_ID) ? REJECT_OPTION_ID : ids[ids.length - 1] ?? REJECT_OPTION_ID;
  return { winningOptionId: fallback, totalVoteWeight };
}

export function createProposalService(deps: ProposalServiceDeps): ProposalService {
  const clock = (): Date => deps.now?.() ?? new Date();

  /** buildEnvelope + createPendingRecord for a proposal source; returns record id. */
  async function emit(
    tx: EngineTx,
    kind: 'proposal_snapshot' | 'proposal_result',
    source: ProposalData,
    communityId: string,
  ): Promise<string> {
    const built = deps.buildEnvelope({ kind, proposal: source });
    const rec = await deps.records.createPendingRecord(tx, {
      recordType: kind,
      sourceTable: 'Proposal',
      sourceId: source.id,
      communityId,
      envelope: built.envelope,
      recordHash: built.recordHash,
    });
    return rec.id;
  }

  async function create(input: ProposalCreateInput): Promise<{ proposalId: string }> {
    if (!PROPOSAL_TYPES.includes(input.type)) fail('VALIDATION_ERROR', `invalid proposal type: ${String(input.type)}`);
    if (!input.options || input.options.length < 2) fail('VALIDATION_ERROR', 'a proposal needs at least two options');
    const data = buildCreateData(input, asMetadata(input.metadata));
    const optionCount = input.options.length;
    return deps.db.$transaction(async (tx) => {
      const created = (await tx.proposal.create({ data })) as { id: string };
      await createDbOnlyRecord(tx, {
        communityId: input.communityId,
        recordType: 'proposal_created',
        sourceTable: 'Proposal',
        sourceId: created.id,
        payload: { type: input.type, title: input.title, optionCount },
      });
      return { proposalId: created.id };
    });
  }

  async function activate(id: string): Promise<{ snapshotRecordId: string } | { noop: true }> {
    const now = clock();
    const result = await deps.db.$transaction<{ recordId: string } | { noop: true }>(async (tx) => {
      const proposal = (await tx.proposal.findUnique({ where: { id } })) as ProposalRow | null;
      if (!proposal) fail('NOT_FOUND', 'proposal not found');
      const moved = await transitionProposalStatus(tx, id, 'draft', 'active');
      if (moved === 0) {
        if (proposal.status === 'active') return { noop: true };
        fail('INVALID_STATUS', `cannot activate proposal in status ${proposal.status}`);
      }
      const communityId = proposal.communityId;
      const policy = (await tx.communityTokenPolicy.findUnique({ where: { communityId } })) as { policyVersion: number } | null;
      // Acquire row locks in the canonical engine order (epoch -> state, matching
      // the mint path's epoch -> state -> balance). Locking state before epoch
      // here would invert the order versus a concurrent mint and let Postgres
      // deadlock (40P01) on the epoch/state pair.
      const epoch = await lockActiveEpoch(tx, communityId);
      if (!epoch) fail('EPOCH_NOT_ACTIVE', 'no active epoch to snapshot against');
      const state = await lockState(tx, communityId);

      const members = ((await tx.memberTokenBalance.findMany({ where: { communityId } })) as BalanceLite[])
        .slice()
        .sort((a, b) => (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0));
      const govSupply = members.reduce((sum, m) => sum + m.activeGovernanceBalance, 0n);
      const weightsMerkleRoot = buildMerkleRoot(
        members.map((m) => hashSnapshotLeaf(deps.hashMemberId(communityId, m.memberId), m.activeGovernanceBalance)),
      );
      if (members.length > 0) {
        await tx.proposalMemberSnapshot.createMany({
          data: members.map((m) => ({ proposalId: id, memberId: m.memberId, activeGovernanceToken: m.activeGovernanceBalance })),
        });
      }
      // Snapshot columns reused for both the DB write and the envelope source.
      const snapCols = {
        communityId,
        epochNumberSnapshot: epoch.epochNumber,
        totalSupplySnapshot: state?.currentTotalSupply ?? 0n,
        activeGovernanceSupplySnapshot: govSupply,
        tokenPolicyVersionSnapshot: policy?.policyVersion ?? 0,
        snapshotAt: now,
      };
      await tx.proposal.update({
        where: { id },
        data: {
          ...snapCols,
          epochIdSnapshot: epoch.id,
          startTime: now,
          endTime: proposal.endTime ?? new Date(now.getTime() + VOTE_WINDOW_MS),
          // 必须持久化：提交时 buildSubmittable 从源行重建信封，缺列会导致
          // RECORD_HASH_MISMATCH（真链集成实测），链上提交永久失败。
          weightsMerkleRoot,
        },
      });
      const source = toProposalData(
        { id, createdAt: proposal.createdAt, ...snapCols },
        { endedAt: null, winningOptionId: null, voterCount: null, totalVoteWeight: null, weightsMerkleRoot },
      );
      const recordId = await emit(tx, 'proposal_snapshot', source, communityId);
      await tx.proposal.update({ where: { id }, data: { snapshotPublicRecordId: recordId } });
      return { recordId };
    });
    if ('noop' in result) return { noop: true };
    await deps.records.requestSubmission(result.recordId);
    return { snapshotRecordId: result.recordId };
  }

  async function castVote(input: { proposalId: string; memberId: string; optionId: string }): Promise<{ voteId: string; idempotent?: boolean }> {
    const now = clock();
    return deps.db.$transaction(async (tx) => {
      // Lock the Proposal row (FOR UPDATE) BEFORE reading status: this serializes
      // a deadline-boundary ballot against end()'s status CAS, so a late vote
      // either commits before end() locks (and is tallied) or blocks until end()
      // commits and is then rejected below (status='ended') — never counted in the
      // DB yet excluded from the Merkle root.
      const locked = await lockProposal(tx, input.proposalId);
      if (!locked) fail('NOT_FOUND', 'proposal not found');
      // Typed re-read (Prisma maps bigint columns); the held lock observes the latest commit.
      const proposal = (await tx.proposal.findUnique({ where: { id: input.proposalId } })) as ProposalRow | null;
      if (!proposal) fail('NOT_FOUND', 'proposal not found');
      const endTime = proposal.endTime;
      if (proposal.status !== 'active' || (endTime != null && now.getTime() > endTime.getTime())) fail('INVALID_STATUS', 'proposal is not open for voting');
      if (!optionIds(proposal.options).includes(input.optionId)) fail('VALIDATION_ERROR', `option ${input.optionId} is not on the ballot`);
      const snapshot = (await tx.proposalMemberSnapshot.findUnique({
        where: { proposalId_memberId: { proposalId: input.proposalId, memberId: input.memberId } },
      })) as { activeGovernanceToken: bigint } | null;
      // No snapshot row => not eligible. A member minted AFTER activation has no
      // row, so mid-vote minting can never buy voting power.
      if (!snapshot) fail('FORBIDDEN', 'member is not in the voting snapshot');

      const locator = { proposalId_memberId: { proposalId: input.proposalId, memberId: input.memberId } };
      const existing = (await tx.vote.findUnique({ where: locator })) as { id: string } | null;
      if (existing) return { voteId: existing.id, idempotent: true };

      const balance = (await tx.memberTokenBalance.findUnique({
        where: { communityId_memberId: { communityId: proposal.communityId, memberId: input.memberId } },
      })) as BalanceLite | null;
      // totalTokenBalanceSnapshot is display-only (live read); it NEVER counts.
      const totalTokenBalanceSnapshot = balance?.totalBalance ?? 0n;
      // activeGovernanceBalanceSnapshot is the sole tally weight, read from the
      // frozen snapshot row — never from a live balance.
      const activeGovernanceBalanceSnapshot = snapshot.activeGovernanceToken;
      const denominator = proposal.activeGovernanceSupplySnapshot || 1n;
      try {
        const vote = (await tx.vote.create({
          data: {
            proposalId: input.proposalId,
            memberId: input.memberId,
            optionId: input.optionId,
            totalTokenBalanceSnapshot,
            activeGovernanceBalanceSnapshot,
            totalSupplySnapshot: proposal.totalSupplySnapshot ?? 0n,
            governancePercentageSnapshot: Number(activeGovernanceBalanceSnapshot) / Number(denominator),
          },
        })) as { id: string };
        return { voteId: vote.id };
      } catch (err) {
        if (isP2002(err)) {
          const raced = (await tx.vote.findUnique({ where: locator })) as { id: string } | null;
          if (raced) return { voteId: raced.id, idempotent: true };
        }
        throw err;
      }
    });
  }

  async function end(id: string): Promise<
    | { winningOptionId: string | null; voterCount: number; totalVoteWeight: bigint; resultRecordId: string; quorumMet: boolean }
    | { noop: true }
  > {
    const now = clock();
    const result = await deps.db.$transaction<
      | { winningOptionId: string | null; voterCount: number; totalVoteWeight: bigint; quorumMet: boolean; recordId: string }
      | { noop: true }
    >(async (tx) => {
      const proposal = (await tx.proposal.findUnique({ where: { id } })) as ProposalRow | null;
      if (!proposal) fail('NOT_FOUND', 'proposal not found');
      const moved = await endProposalIfDue(tx, id, now);
      if (moved === 0) {
        if (proposal.status === 'recorded') return { noop: true };
        fail('INVALID_STATUS', `cannot end proposal in status ${proposal.status}`);
      }
      const communityId = proposal.communityId;
      const votes = (await tx.vote.findMany({ where: { proposalId: id } })) as VoteRow[];
      const voterCount = votes.length;
      const quorumMet = voterCount >= proposal.minimumVoterCount;
      // resolveOutcome guarantees a non-null winner (tie/zero-vote -> 'reject') so
      // the frozen result builder never throws RESULT_INCOMPLETE and roll the
      // whole end() transaction back, leaving the proposal stuck in 'active'.
      const { winningOptionId, totalVoteWeight } = resolveOutcome(votes, proposal.options);
      const votesMerkleRoot = buildMerkleRoot(
        votes.map((v) =>
          hashVoteLeaf(
            deps.hashMemberId(communityId, v.memberId),
            deps.hashOptionId(id, v.optionId),
            v.activeGovernanceBalanceSnapshot,
          ),
        ),
      );
      // Decision-is-statement: fire the type callback only when 'approve' wins
      // with quorum; otherwise the recorded result stands with no side effect.
      if (quorumMet && winningOptionId === 'approve') {
        await settle(tx, proposal, communityId, now);
      }
      // ProposalRow structurally supplies every SnapshotFields column.
      const source = toProposalData(proposal, { endedAt: now, winningOptionId, voterCount, totalVoteWeight, votesMerkleRoot });
      const recordId = await emit(tx, 'proposal_result', source, communityId);
      await tx.proposal.update({
        where: { id },
        // votesMerkleRoot 同 weightsMerkleRoot：不持久化则结果记录的重建哈希漂移。
        data: { endedAt: now, winningOptionId, voterCount, totalVoteWeight, votesMerkleRoot, status: 'recorded', resultPublicRecordId: recordId },
      });
      return { winningOptionId, voterCount, totalVoteWeight, quorumMet, recordId };
    });
    if ('noop' in result) return { noop: true };
    await deps.records.requestSubmission(result.recordId);
    const { recordId, ...summary } = result;
    return { ...summary, resultRecordId: recordId };
  }

  /** Type-dispatched settlement (only when approve wins quorum). */
  async function settle(tx: EngineTx, proposal: ProposalRow, communityId: string, now: Date): Promise<void> {
    if (proposal.type === 'token_policy_change') {
      const p = proposal.policyChangePayload as { monthlyInflationRateBps: number; maxAdvanceRateBps: number; memberMintCapRateBps: number; rules?: unknown };
      await deps.policy.createPendingVersion(tx, { communityId, proposalId: proposal.id, ...p });
      return;
    }
    if (proposal.type === 'budget_advance') {
      const p = proposal.policyChangePayload as { advanceRequestId: string };
      await tx.tokenAdvanceRequest.updateMany({
        where: { id: p.advanceRequestId, status: 'pending_proposal' },
        data: { status: 'approved', approvedAt: now },
      });
      return;
    }
    // special_mint / related_party_mint / token_reversal only authorize the
    // downstream engine action (which re-checks proposalId); community_decision
    // has no side effect. All are intentional no-ops here.
  }

  return { create, activate, castVote, end };
}
