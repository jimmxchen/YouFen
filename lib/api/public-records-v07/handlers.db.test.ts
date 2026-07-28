// Integration test for the v0.7 public-records verification handlers. Needs a
// live Postgres with the v0.7 tables; skipped by default, run with RUN_DB_TESTS=1.
// Exercises the happy path (payload / proof / verify-v07 all green) plus the
// public-endpoint guards (rate-limit 429, unknown-record 404).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getPrisma } from '../../db/client';
import { canonicalize } from '../../blockchain/hashing/canonicalize';
import { computeRecordHash } from '../../blockchain/hashing/record-hash';
import type { RecordEnvelope } from '../../blockchain/types';
import type { RateLimiter } from '../public-records/rate-limit';

import {
  handlePayloadV07,
  handleProofV07,
  handleVerifyV07,
  type RecordExistsReader,
} from './handlers';

const RUN = process.env.RUN_DB_TESTS === '1';

const prisma = getPrisma();

const COMMUNITY = 'c_v07_pubrec_it';
const MEMBER_HASH = `0x${'aa'.repeat(32)}`;
const TX_HASH = `0x${'cd'.repeat(32)}`;
const CONTRACT = '0x4309ba5d47fbc45d980988b0d5b0202b8ac7db33';
const EXPLORER = 'https://explorer.test';

const envelope: RecordEnvelope = {
  schema: 'youfen.record.v1',
  type: 'token_mint',
  payload: { communityId: COMMUNITY, memberId: 'm_1', amount: '1000', epochNumber: 1 },
};
const ENVELOPE_JSON = canonicalize(envelope);
const RECORD_HASH = computeRecordHash(envelope);

const allowAll: RateLimiter = { allow: () => true };
const denyAll: RateLimiter = { allow: () => false };
const onChainReader: RecordExistsReader = { async recordExists() { return true; } };

let recordId = '';

async function cleanup(): Promise<void> {
  await prisma.chainEvent.deleteMany({ where: { recordHash: RECORD_HASH } });
  await prisma.publicRecord.deleteMany({ where: { recordHash: RECORD_HASH } });
  await prisma.memberChainBalance.deleteMany({ where: { communityId: COMMUNITY } });
  await prisma.communityTokenState.deleteMany({ where: { communityId: COMMUNITY } });
}

describe.skipIf(!RUN)('public-records-v07 handlers (integration)', () => {
  beforeAll(async () => {
    await cleanup();
    const rec = await prisma.publicRecord.create({
      data: {
        communityId: COMMUNITY,
        recordType: 'token_mint',
        status: 'verified',
        envelopeJson: ENVELOPE_JSON,
        recordHash: RECORD_HASH,
        sourceTable: 'TokenMintEvent',
        sourceId: 'mint_it_1',
        txHash: TX_HASH,
        blockNumber: 42,
      },
    });
    recordId = rec.id;

    await prisma.chainEvent.create({
      data: {
        communityId: COMMUNITY,
        eventName: 'MintExecuted',
        blockNumber: 42,
        logIndex: 3,
        txHash: TX_HASH,
        recordHash: RECORD_HASH,
        memberIdHash: MEMBER_HASH,
        ledgerSeq: 5n,
        appliedAt: new Date(),
        args: {
          memberBalanceAfter: '1000',
          totalSupplyAfter: '1000',
          epochNumber: 1,
          regularAmount: '1000',
        },
      },
    });

    await prisma.memberChainBalance.create({
      data: { communityId: COMMUNITY, memberIdHash: MEMBER_HASH, balance: '1000', ledgerSeq: 5n },
    });
    await prisma.communityTokenState.create({
      data: { communityId: COMMUNITY, currentTotalSupply: 1000n, ledgerSeq: 5n },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('payload returns the canonical hash preimage verbatim', async () => {
    const r = await handlePayloadV07({ prisma }, { recordId });
    expect(r.status).toBe(200);
    const data = (r.body as { data: Record<string, unknown> }).data;
    expect(data.canonicalPayload).toBe(ENVELOPE_JSON);
    expect(data.recordHash).toBe(RECORD_HASH);
    expect(data.schema).toBe('youfen.record.v1');
  });

  it('proof returns tx/log coordinates + contract address', async () => {
    const r = await handleProofV07(
      { prisma, contractAddress: CONTRACT, explorerBaseUrl: EXPLORER },
      { recordId },
    );
    expect(r.status).toBe(200);
    const data = (r.body as { data: Record<string, unknown> }).data;
    expect(data.contractAddress).toBe(CONTRACT);
    const coords = data.chainCoordinates as Record<string, unknown>;
    expect(coords.txHash).toBe(TX_HASH);
    expect(coords.blockNumber).toBe(42);
    expect(coords.logIndex).toBe(3);
    expect(data.nonAuthoritativeMerkle).toBeDefined();
  });

  it('verify-v07 reports hashMatches + onChain + enforcementMatches all true', async () => {
    const r = await handleVerifyV07(
      { prisma, reader: onChainReader, rateLimiter: allowAll, explorerBaseUrl: EXPLORER },
      { recordId, clientKey: 'ip:test' },
    );
    expect(r.status).toBe(200);
    const data = (r.body as { data: Record<string, unknown> }).data;
    expect(data.hashMatches).toBe(true);
    expect(data.onChain).toBe(true);
    expect(data.enforcementMatches).toBe(true);
    expect(data.verified).toBe(true);
  });

  it('verify-v07 rejects an over-budget caller with 429 (rate-limit guard)', async () => {
    const r = await handleVerifyV07(
      { prisma, reader: onChainReader, rateLimiter: denyAll, explorerBaseUrl: EXPLORER },
      { recordId, clientKey: 'ip:flood' },
    );
    expect(r.status).toBe(429);
  });

  it('verify-v07 returns 404 for an unknown record', async () => {
    const r = await handleVerifyV07(
      { prisma, reader: onChainReader, rateLimiter: allowAll, explorerBaseUrl: EXPLORER },
      { recordId: 'does-not-exist', clientKey: 'ip:test' },
    );
    expect(r.status).toBe(404);
  });
});
