import { describe, expect, it } from 'vitest';

import { TerminalError } from '../errors';
import type {
  BuiltRecord,
  ProposalData,
  RecordSource,
  TokenEpochData,
  TokenMintEventData,
  TokenPolicyData,
  TokenReversalEventData,
} from '../types';

import { buildMintPayload, toPayloadInt } from './build-mint-payload';
import { buildReversalPayload } from './build-reversal-payload';
import { buildEpochPayload } from './build-epoch-payload';
import { buildPolicyPayload } from './build-policy-payload';
import {
  buildProposalResultPayload,
  buildProposalSnapshotPayload,
} from './build-proposal-payload';
import { buildEnvelopeForSource } from './index';
import fixtures from './__fixtures__/payload-vectors.json';

// ---- Fixture decoding (JSON-safe → typed) -------------------------------

const PEPPER = fixtures.pepper;

type BigintTag = { readonly $bigint: string };
type ChainArgFixture = string | number | BigintTag;

const toBig = (value: string): bigint => BigInt(value);
const toDate = (ms: number): Date => new Date(ms);

function decodeChainArg(entry: ChainArgFixture): string | number | bigint {
  if (typeof entry === 'object' && entry !== null && '$bigint' in entry) {
    return BigInt(entry.$bigint);
  }
  return entry;
}

function decodeChainArgs(
  entries: readonly ChainArgFixture[],
): readonly (string | number | bigint)[] {
  return entries.map(decodeChainArg);
}

// The fixture stores bigints as decimal strings and dates as unix-ms integers.
type SourceRecord = Record<string, unknown>;

function readMint(src: SourceRecord): TokenMintEventData {
  return {
    id: src.id as string,
    communityId: src.communityId as string,
    memberId: src.memberId as string,
    epochNumber: src.epochNumber as number,
    mintType: src.mintType as string,
    budgetSource: src.budgetSource as TokenMintEventData['budgetSource'],
    amount: toBig(src.amount as string),
    memberBalanceBefore: toBig(src.memberBalanceBefore as string),
    memberBalanceAfter: toBig(src.memberBalanceAfter as string),
    totalSupplyBefore: toBig(src.totalSupplyBefore as string),
    totalSupplyAfter: toBig(src.totalSupplyAfter as string),
    governanceActivationEpoch: src.governanceActivationEpoch as number | null,
    tokenPolicyVersion: src.tokenPolicyVersion as number,
    createdAt: toDate(src.createdAt as number),
    // Additive ledger-sequence guard input; absent in pre-existing vectors.
    ...(src.ledgerSeq != null ? { ledgerSeq: src.ledgerSeq as number } : {}),
  };
}

function readReversal(src: SourceRecord): TokenReversalEventData {
  return {
    id: src.id as string,
    communityId: src.communityId as string,
    memberId: src.memberId as string,
    originalMintEventId: src.originalMintEventId as string,
    amount: toBig(src.amount as string),
    totalBalanceAfter: toBig(src.totalBalanceAfter as string),
    totalSupplyAfter: toBig(src.totalSupplyAfter as string),
    createdAt: toDate(src.createdAt as number),
    // Additive ledger-sequence guard input; absent in pre-existing vectors.
    ...(src.ledgerSeq != null ? { ledgerSeq: src.ledgerSeq as number } : {}),
  };
}

function readEpoch(src: SourceRecord): TokenEpochData {
  return {
    id: src.id as string,
    communityId: src.communityId as string,
    epochNumber: src.epochNumber as number,
    openingSupply: toBig(src.openingSupply as string),
    baseMintBudget: toBig(src.baseMintBudget as string),
    regularMintedAmount: toBig(src.regularMintedAmount as string),
    advancedMintedAmount: toBig(src.advancedMintedAmount as string),
    advanceDebtFromPreviousEpoch: toBig(
      src.advanceDebtFromPreviousEpoch as string,
    ),
    closedAt: src.closedAt === null ? null : toDate(src.closedAt as number),
    createdAt: toDate(src.createdAt as number),
  };
}

function readPolicy(src: SourceRecord): TokenPolicyData {
  return {
    id: src.id as string,
    communityId: src.communityId as string,
    policyVersion: src.policyVersion as number,
    monthlyInflationRateBps: src.monthlyInflationRateBps as number,
    maxAdvanceRateBps: src.maxAdvanceRateBps as number,
    memberMintCapRateBps: src.memberMintCapRateBps as number,
    effectiveEpoch: src.effectiveEpoch as number,
    createdAt: toDate(src.createdAt as number),
  };
}

function readProposal(src: SourceRecord): ProposalData {
  const bigOrNull = (v: unknown): bigint | null =>
    v === null ? null : toBig(v as string);
  const dateOrNull = (v: unknown): Date | null =>
    v === null ? null : toDate(v as number);
  return {
    id: src.id as string,
    communityId: src.communityId as string,
    epochNumberSnapshot: src.epochNumberSnapshot as number | null,
    totalSupplySnapshot: bigOrNull(src.totalSupplySnapshot),
    activeGovernanceSupplySnapshot: bigOrNull(
      src.activeGovernanceSupplySnapshot,
    ),
    tokenPolicyVersionSnapshot: src.tokenPolicyVersionSnapshot as number | null,
    snapshotAt: dateOrNull(src.snapshotAt),
    endedAt: dateOrNull(src.endedAt),
    winningOptionId: src.winningOptionId as string | null,
    voterCount: src.voterCount as number | null,
    totalVoteWeight: bigOrNull(src.totalVoteWeight),
    createdAt: toDate(src.createdAt as number),
    // Additive Merkle-root guards (T3); absent in pre-existing proposal vectors.
    ...(src.weightsMerkleRoot != null
      ? { weightsMerkleRoot: src.weightsMerkleRoot as `0x${string}` }
      : {}),
    ...(src.votesMerkleRoot != null
      ? { votesMerkleRoot: src.votesMerkleRoot as `0x${string}` }
      : {}),
  };
}

function sourceFromVector(vector: {
  kind: string;
  source: SourceRecord;
  originalRecordHash?: string;
}): RecordSource {
  const src = vector.source;
  switch (vector.kind) {
    case 'token_mint':
    case 'advance_mint':
      return { kind: vector.kind, mintEvent: readMint(src) };
    case 'token_reversal':
      return {
        kind: 'token_reversal',
        reversalEvent: readReversal(src),
        originalRecordHash: vector.originalRecordHash as `0x${string}`,
      };
    case 'epoch_summary':
      return { kind: 'epoch_summary', epoch: readEpoch(src) };
    case 'policy_version':
      return { kind: 'policy_version', policy: readPolicy(src) };
    case 'proposal_snapshot':
    case 'proposal_result':
      return { kind: vector.kind, proposal: readProposal(src) };
    default:
      throw new Error(`unknown fixture kind: ${vector.kind}`);
  }
}

// ---- Golden vectors ------------------------------------------------------

describe('buildEnvelopeForSource — golden vectors', () => {
  for (const vector of fixtures.vectors) {
    const built: BuiltRecord = buildEnvelopeForSource(
      sourceFromVector(vector),
      PEPPER,
    );

    it(`locks recordType for ${vector.name}`, () => {
      expect(built.recordType).toBe(vector.expectedType);
    });

    it(`locks canonicalJson for ${vector.name}`, () => {
      expect(built.canonicalJson).toBe(vector.canonicalJson);
    });

    it(`locks recordHash for ${vector.name}`, () => {
      expect(built.recordHash).toBe(vector.recordHash);
    });

    it(`locks chainArgs for ${vector.name}`, () => {
      expect(built.chainArgs).toEqual(
        decodeChainArgs(vector.chainArgs as ChainArgFixture[]),
      );
    });

    it(`recordHash is a lowercase 66-char bytes32 for ${vector.name}`, () => {
      expect(built.recordHash).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it(`chainArgs last element is the recordHash for ${vector.name}`, () => {
      expect(built.chainArgs[built.chainArgs.length - 1]).toBe(
        built.recordHash,
      );
    });
  }
});

// ---- Determinism ---------------------------------------------------------

describe('buildEnvelopeForSource — determinism', () => {
  for (const vector of fixtures.vectors) {
    it(`produces deep-equal output on repeat for ${vector.name}`, () => {
      const a = buildEnvelopeForSource(sourceFromVector(vector), PEPPER);
      const b = buildEnvelopeForSource(sourceFromVector(vector), PEPPER);
      expect(a).toEqual(b);
      expect(a.canonicalJson).toBe(b.canonicalJson);
      expect(a.recordHash).toBe(b.recordHash);
    });
  }
});

// ---- advance / normal divergence ----------------------------------------

describe('mint payload — advance vs normal divergence', () => {
  const normal = buildEnvelopeForSource(
    sourceFromVector(fixtures.vectors.find((v) => v.name === 'token_mint')!),
    PEPPER,
  );
  const advance = buildEnvelopeForSource(
    sourceFromVector(fixtures.vectors.find((v) => v.name === 'advance_mint')!),
    PEPPER,
  );

  it('omits the activationEpoch key entirely for a normal mint', () => {
    expect('activationEpoch' in normal.envelope.payload).toBe(false);
    expect(normal.canonicalJson).not.toContain('activationEpoch');
  });

  it('includes activationEpoch in payload for an advance mint', () => {
    expect(advance.envelope.payload.activationEpoch).toBe(5);
  });

  it('encodes budgetSourceCode 0 for normal and 1 for advance in chainArgs', () => {
    // chainArgs index 5 is budgetSourceCode for recordMint.
    expect(normal.chainArgs[5]).toBe(0);
    expect(advance.chainArgs[5]).toBe(1);
  });

  it('encodes activationEpoch chainArg 0 for normal and >0 for advance', () => {
    // chainArgs index 6 is activationEpoch for recordMint.
    expect(normal.chainArgs[6]).toBe(0);
    expect(advance.chainArgs[6]).toBe(5);
  });
});

// ---- ledgerSeq guard input (additive) -----------------------------------

describe('mint/reversal payload — ledgerSeq guard input', () => {
  const baseMint = readMint(
    fixtures.vectors.find((v) => v.name === 'token_mint')!.source,
  );
  const baseReversal = readReversal(
    fixtures.vectors.find((v) => v.name === 'token_reversal')!.source,
  );
  const ORIGINAL =
    '0xb4bca464f4428db2f6ea7929acecff6c5cc4a785348fdba7f60c6c1227708fe7' as `0x${string}`;

  it('omits ledgerSeq from payload and chainArgs when absent (byte-identical preimage)', () => {
    const built = buildMintPayload(baseMint, PEPPER);
    expect('ledgerSeq' in built.envelope.payload).toBe(false);
    expect(built.canonicalJson).not.toContain('ledgerSeq');
    // Without ledgerSeq the recordHash is the trailing chainArg (index 7).
    expect(built.chainArgs).toHaveLength(8);
    expect(built.chainArgs[built.chainArgs.length - 1]).toBe(built.recordHash);
  });

  it('adds ledgerSeq to the mint payload and as the last chainArg before recordHash', () => {
    const built = buildMintPayload({ ...baseMint, ledgerSeq: 7 }, PEPPER);
    expect(built.envelope.payload.ledgerSeq).toBe(7);
    expect(built.chainArgs).toHaveLength(9);
    expect(built.chainArgs[7]).toBe(7);
    expect(built.chainArgs[8]).toBe(built.recordHash);
  });

  it('adds ledgerSeq to the reversal payload and as the last chainArg before recordHash', () => {
    const built = buildReversalPayload(
      { reversalEvent: { ...baseReversal, ledgerSeq: 9 }, originalRecordHash: ORIGINAL },
      PEPPER,
    );
    expect(built.envelope.payload.ledgerSeq).toBe(9);
    expect(built.chainArgs).toHaveLength(8);
    expect(built.chainArgs[6]).toBe(9);
    expect(built.chainArgs[7]).toBe(built.recordHash);
  });

  it('changes the recordHash when ledgerSeq is present (it is part of the preimage)', () => {
    const without = buildMintPayload(baseMint, PEPPER);
    const withSeq = buildMintPayload({ ...baseMint, ledgerSeq: 7 }, PEPPER);
    expect(withSeq.recordHash).not.toBe(without.recordHash);
  });
});

// ---- proposal Merkle-root guard input (additive) ------------------------

describe('proposal payload — Merkle root guard input', () => {
  const baseSnapshot = readProposal(
    fixtures.vectors.find((v) => v.name === 'proposal_snapshot')!.source,
  );
  const baseResult = readProposal(
    fixtures.vectors.find((v) => v.name === 'proposal_result')!.source,
  );
  const ROOT = `0x${'ab'.repeat(32)}` as `0x${string}`;

  it('omits weightsMerkleRoot from snapshot payload and chainArgs when absent', () => {
    const built = buildProposalSnapshotPayload(baseSnapshot, PEPPER);
    expect('weightsMerkleRoot' in built.envelope.payload).toBe(false);
    expect(built.canonicalJson).not.toContain('weightsMerkleRoot');
    // Without the root the recordHash is the trailing chainArg (index 6).
    expect(built.chainArgs).toHaveLength(7);
    expect(built.chainArgs[built.chainArgs.length - 1]).toBe(built.recordHash);
  });

  it('adds weightsMerkleRoot to the snapshot payload and as the last chainArg before recordHash', () => {
    const built = buildProposalSnapshotPayload(
      { ...baseSnapshot, weightsMerkleRoot: ROOT },
      PEPPER,
    );
    expect(built.envelope.payload.weightsMerkleRoot).toBe(ROOT);
    expect(built.chainArgs).toHaveLength(8);
    expect(built.chainArgs[6]).toBe(ROOT);
    expect(built.chainArgs[7]).toBe(built.recordHash);
  });

  it('omits votesMerkleRoot from result payload and chainArgs when absent', () => {
    const built = buildProposalResultPayload(baseResult, PEPPER);
    expect('votesMerkleRoot' in built.envelope.payload).toBe(false);
    expect(built.canonicalJson).not.toContain('votesMerkleRoot');
    expect(built.chainArgs).toHaveLength(6);
    expect(built.chainArgs[built.chainArgs.length - 1]).toBe(built.recordHash);
  });

  it('adds votesMerkleRoot to the result payload and as the last chainArg before recordHash', () => {
    const built = buildProposalResultPayload(
      { ...baseResult, votesMerkleRoot: ROOT },
      PEPPER,
    );
    expect(built.envelope.payload.votesMerkleRoot).toBe(ROOT);
    expect(built.chainArgs).toHaveLength(7);
    expect(built.chainArgs[5]).toBe(ROOT);
    expect(built.chainArgs[6]).toBe(built.recordHash);
  });

  it('changes the recordHash when a Merkle root is present (part of the preimage)', () => {
    const withoutSnap = buildProposalSnapshotPayload(baseSnapshot, PEPPER);
    const withSnap = buildProposalSnapshotPayload(
      { ...baseSnapshot, weightsMerkleRoot: ROOT },
      PEPPER,
    );
    expect(withSnap.recordHash).not.toBe(withoutSnap.recordHash);
  });
});

// ---- TerminalError branches ---------------------------------------------

describe('mint payload — terminal errors', () => {
  const base: TokenMintEventData = readMint(
    fixtures.vectors.find((v) => v.name === 'advance_mint')!.source,
  );

  it('throws ADVANCE_WITHOUT_ACTIVATION_EPOCH when advance lacks activation', () => {
    const bad: TokenMintEventData = {
      ...base,
      governanceActivationEpoch: null,
    };
    expect(() => buildMintPayload(bad, PEPPER)).toThrowError(TerminalError);
    expect(() => buildMintPayload(bad, PEPPER)).toThrowError(
      /ADVANCE_WITHOUT_ACTIVATION_EPOCH/,
    );
  });

  it('throws ADVANCE_WITHOUT_ACTIVATION_EPOCH when activationEpoch is 0', () => {
    const bad: TokenMintEventData = { ...base, governanceActivationEpoch: 0 };
    expect(() => buildMintPayload(bad, PEPPER)).toThrowError(
      /ADVANCE_WITHOUT_ACTIVATION_EPOCH/,
    );
  });
});

describe('reversal payload — terminal errors', () => {
  const rev: TokenReversalEventData = readReversal(
    fixtures.vectors.find((v) => v.name === 'token_reversal')!.source,
  );

  it('throws MISSING_ORIGINAL_RECORD_HASH when absent', () => {
    expect(() =>
      buildReversalPayload(
        { reversalEvent: rev, originalRecordHash: undefined as never },
        PEPPER,
      ),
    ).toThrowError(/MISSING_ORIGINAL_RECORD_HASH/);
  });

  it('throws MISSING_ORIGINAL_RECORD_HASH when not 66-char hex', () => {
    expect(() =>
      buildReversalPayload(
        { reversalEvent: rev, originalRecordHash: '0xdeadbeef' as never },
        PEPPER,
      ),
    ).toThrowError(TerminalError);
  });
});

describe('proposal payloads — terminal errors', () => {
  const complete = readProposal(
    fixtures.vectors.find((v) => v.name === 'proposal_snapshot')!.source,
  );
  const result = readProposal(
    fixtures.vectors.find((v) => v.name === 'proposal_result')!.source,
  );

  it('throws SNAPSHOT_INCOMPLETE when a snapshot field is null', () => {
    const bad: ProposalData = { ...complete, totalSupplySnapshot: null };
    expect(() => buildProposalSnapshotPayload(bad, PEPPER)).toThrowError(
      /SNAPSHOT_INCOMPLETE/,
    );
  });

  it('throws RESULT_INCOMPLETE when a result field is null', () => {
    const bad: ProposalData = { ...result, winningOptionId: null };
    expect(() => buildProposalResultPayload(bad, PEPPER)).toThrowError(
      /RESULT_INCOMPLETE/,
    );
  });
});

describe('buildEnvelopeForSource — KIND_MISMATCH', () => {
  it('throws when kind advance_mint but budgetSource is current_epoch', () => {
    const mint = readMint(
      fixtures.vectors.find((v) => v.name === 'token_mint')!.source,
    );
    const source: RecordSource = { kind: 'advance_mint', mintEvent: mint };
    expect(() => buildEnvelopeForSource(source, PEPPER)).toThrowError(
      /KIND_MISMATCH/,
    );
  });

  it('throws when kind token_mint but budgetSource is next_epoch_advance', () => {
    const adv = readMint(
      fixtures.vectors.find((v) => v.name === 'advance_mint')!.source,
    );
    const source: RecordSource = { kind: 'token_mint', mintEvent: adv };
    expect(() => buildEnvelopeForSource(source, PEPPER)).toThrowError(
      /KIND_MISMATCH/,
    );
  });
});

// ---- toPayloadInt boundaries --------------------------------------------

describe('toPayloadInt', () => {
  it('returns a number for values <= 2^53 - 1', () => {
    const max = BigInt(Number.MAX_SAFE_INTEGER); // 2^53 - 1
    expect(toPayloadInt(max)).toBe(Number.MAX_SAFE_INTEGER);
    expect(typeof toPayloadInt(max)).toBe('number');
    expect(toPayloadInt(0n)).toBe(0);
    expect(toPayloadInt(500n)).toBe(500);
  });

  it('returns a decimal string for values > 2^53 - 1', () => {
    const over = BigInt(Number.MAX_SAFE_INTEGER) + 1n; // 2^53
    expect(toPayloadInt(over)).toBe('9007199254740992');
    expect(typeof toPayloadInt(over)).toBe('string');
    const huge = 123456789012345678901234567890n;
    expect(toPayloadInt(huge)).toBe('123456789012345678901234567890');
  });
});

// ---- Privacy red line (PRD §28.4) ---------------------------------------

describe('privacy — no PII or plaintext ids in any payload', () => {
  const FORBIDDEN = [
    'reason',
    'evidenceUrls',
    'approvedBy',
    'memberId',
    'communityId',
  ];

  for (const vector of fixtures.vectors) {
    it(`payload for ${vector.name} contains no forbidden keys`, () => {
      const built = buildEnvelopeForSource(sourceFromVector(vector), PEPPER);
      const keys = Object.keys(built.envelope.payload);
      for (const forbidden of FORBIDDEN) {
        expect(keys).not.toContain(forbidden);
      }
      // Hashed forms are the only member/community references allowed.
      expect(keys).toContain('communityIdHash');
    });
  }
});
