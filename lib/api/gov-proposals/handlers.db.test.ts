// Integration tests for the governance-proposal endpoints (§6 #11-#15). Needs a
// live Postgres with the v0.7 tables; skipped by default, run with RUN_DB_TESTS=1.
// The chain is faked via a GovernanceRuntime stub (no RPC); the approver/member
// EIP-712 signatures are produced by real ethers Wallets so recovery is exercised
// end-to-end against the same frozen domain + typed data the contract verifies.

import { Wallet } from 'ethers';
import { afterAll, describe, expect, it } from 'vitest';

import { getPrisma } from '../../db/client';
import {
  buildDomain,
  PROPOSAL_TYPES,
  VOTE_TYPES,
  type VoteAuthorization,
} from '../../blockchain/signing/typed-data';
import { hashCommunityId, hashMemberId, hashOptionId, hashProposalId } from '../../blockchain/hashing/id-hash';
import type { GovernanceRuntime } from '../../blockchain/relay/governance-runtime';
import type { BlockchainConfig } from '../../blockchain/types';
import { createPrismaIdempotencyStore } from '../core';
import type { PrismaIdempotencyDb } from '../core';
import type { HeaderReader } from '../core/auth';

import { computeOptionsHash } from './proposal-signing';
import type { GovProposalsDeps } from './deps';
import {
  handleActivateProposal,
  handleFinalizeProposal,
  handleVoteAuthorization,
  handleVotesRelay,
} from './handlers';

const RUN = process.env.RUN_DB_TESTS === '1';

const prisma = getPrisma();
const CONTRACT = '0x4309ba5d47fbc45d980988b0d5b0202b8ac7db33';
const INTERNAL_TOKEN = 'test-internal-token-1234567890';
const PEPPER = 'test-pepper-0123456789abcdef';
const DOMAIN = buildDomain(1439, CONTRACT);

const approver = new Wallet('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const voter = new Wallet('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');

const fakeRuntime: GovernanceRuntime = {
  sender: { async send() { return { txHash: '0x' + '11'.repeat(32), nonce: 0 }; }, async getReceipt() { return null; } },
  logProvider: { async getBlockNumber() { return 6; }, async getLogs() { return []; } },
  reader: {
    async getEpoch() {
      return {
        active: true, epochNumber: 0n, openingSupply: 0n, inflationRateBps: 0,
        baseMintBudget: 0n, advanceDebtFromPrev: 0n, effectiveRegularBudget: 0n,
        maxAdvanceAmount: 0n, regularMinted: 0n, advanceMinted: 0n,
      };
    },
    async communities() {
      return {
        exists: true, currentEpochNumber: 0n, currentTotalSupply: 0n, activePolicyVersion: 1,
        inflationRateBps: 0, maxAdvanceRateBps: 0, memberMintCapRateBps: 0, minVoterCount: 0,
        approverThreshold: 1, owner: '0x0000000000000000000000000000000000000000',
      };
    },
    async balanceOf() { return 0n; },
    async governanceBalanceAt() { return 0n; },
    async recordExists() { return false; },
    async memberSignerOf() { return voter.address; },
    async isApprover() { return true; },
  },
  contractAddress: CONTRACT,
  chainId: 1439,
  domain: DOMAIN,
  deployBlock: 0,
  relayerAddress: '0x1111111111111111111111111111111111111111',
  async balanceOfRelayer() { return 1000n; },
  async headBlock() { return 6; },
};

const config: BlockchainConfig = {
  rpcUrl: 'http://localhost:8545',
  chainId: 1439,
  contractAddress: CONTRACT,
  privateKey: '0x' + '22'.repeat(32),
  pepper: PEPPER,
  confirmations: 2,
  explorerBaseUrl: 'http://localhost',
  contractDeployBlock: 0,
  redisUrl: 'redis://localhost:6379',
  internalApiToken: INTERNAL_TOKEN,
};

const deps: GovProposalsDeps = {
  prisma,
  runtime: fakeRuntime,
  authEnv: { internalApiToken: INTERNAL_TOKEN, cronSecret: null },
  config,
  idempotency: createPrismaIdempotencyStore(prisma as unknown as PrismaIdempotencyDb),
};

const headers = (opts: { auth?: string; idem?: string }): HeaderReader => ({
  get: (n: string) => {
    const k = n.toLowerCase();
    if (k === 'authorization') return opts.auth ?? null;
    if (k === 'idempotency-key') return opts.idem ?? null;
    return null;
  },
});

const bearer = `Bearer ${INTERNAL_TOKEN}`;

describe.skipIf(!RUN)('gov-proposals handlers (integration)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('activate rejects a caller without admin/internal auth (403)', async () => {
    const r = await handleActivateProposal(deps, {
      headers: headers({}),
      proposalId: 'p-x',
      body: {},
    });
    expect(r.status).to.equal(403);
  });

  it('activate recovers the approver signature and queues a create_proposal action (202)', async () => {
    const proposalId = `p-activate-${Date.now()}`;
    const optionLabels = ['approve', 'reject'];
    const endTime = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const optionIds = optionLabels.map((l) => hashOptionId(proposalId, l));
    const struct = {
      communityId: hashCommunityId('comm-1'),
      proposalId: hashProposalId(proposalId),
      kind: 0,
      optionsHash: computeOptionsHash(optionIds),
      endTime,
      minVoterCount: 0,
      targetMemberIdHash: `0x${'00'.repeat(32)}`,
      pInflationRateBps: 0,
      pMaxAdvanceRateBps: 0,
      pMemberMintCapRateBps: 0,
      nonce: 0n,
      deadline: endTime,
    };
    const creatorSig = await approver.signTypedData(DOMAIN, PROPOSAL_TYPES, struct);

    const r = await handleActivateProposal(deps, {
      headers: headers({ auth: bearer, idem: `activate-${proposalId}` }),
      proposalId,
      body: {
        communityId: 'comm-1',
        kind: 0,
        optionIds: optionLabels,
        endTime: endTime.toString(),
        minVoterCount: 0,
        creatorSig,
      },
    });

    expect(r.status).to.equal(202);
    const data = (r.body as { data?: { creator?: string; chainActionId?: string } }).data;
    expect(data?.creator).to.equal(approver.address);
    expect(data?.chainActionId).to.be.a('string');

    const row = await prisma.chainAction.findFirst({ where: { proposalId: hashProposalId(proposalId) } });
    expect(row?.kind).to.equal('create_proposal');
  });

  it('activate rejects a signature from a non-approver (403)', async () => {
    const rt: GovernanceRuntime = {
      ...fakeRuntime,
      reader: { ...fakeRuntime.reader, async isApprover() { return false; } },
    };
    const localDeps: GovProposalsDeps = { ...deps, runtime: rt };
    const proposalId = `p-noappr-${Date.now()}`;
    const endTime = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const optionIds = ['approve', 'reject'].map((l) => hashOptionId(proposalId, l));
    const struct = {
      communityId: hashCommunityId('comm-1'),
      proposalId: hashProposalId(proposalId),
      kind: 0,
      optionsHash: computeOptionsHash(optionIds),
      endTime,
      minVoterCount: 0,
      targetMemberIdHash: `0x${'00'.repeat(32)}`,
      pInflationRateBps: 0,
      pMaxAdvanceRateBps: 0,
      pMemberMintCapRateBps: 0,
      nonce: 0n,
      deadline: endTime,
    };
    const creatorSig = await approver.signTypedData(DOMAIN, PROPOSAL_TYPES, struct);
    const r = await handleActivateProposal(localDeps, {
      headers: headers({ auth: bearer, idem: `noappr-${proposalId}` }),
      proposalId,
      body: {
        communityId: 'comm-1', kind: 0, optionIds: ['approve', 'reject'],
        endTime: endTime.toString(), minVoterCount: 0, creatorSig,
      },
    });
    expect(r.status).to.equal(403);
  });

  it('vote-authorization returns a signable VoteAuthorization envelope (200)', async () => {
    const proposalId = `p-voteauth-${Date.now()}`;
    const r = await handleVoteAuthorization(deps, {
      // review fix: this endpoint is now auth-gated (it returns a peppered
      // memberIdHash, so an open endpoint is a de-anonymization oracle).
      headers: headers({ auth: bearer }),
      proposalId,
      body: { communityId: 'comm-1', memberId: 'member-1', optionId: 'approve' },
    });
    expect(r.status).to.equal(200);
    const data = r.body.data as { primaryType?: string; digest?: string; message?: Record<string, string> };
    expect(data.primaryType).to.equal('VoteAuthorization');
    expect(data.digest).to.match(/^0x[0-9a-f]{64}$/i);
    expect(data.message?.communityId).to.equal(hashCommunityId('comm-1'));
    expect(data.message?.memberIdHash).to.equal(hashMemberId('comm-1', 'member-1', PEPPER));
  });

  it('vote-authorization is gated: no peppered memberIdHash without admin/internal auth (403)', async () => {
    const r = await handleVoteAuthorization(deps, {
      headers: headers({}),
      proposalId: `p-voteauth-guard-${Date.now()}`,
      body: { communityId: 'comm-1', memberId: 'member-1', optionId: 'approve' },
    });
    expect(r.status).to.equal(403);
  });

  it('votes-relay keeps a valid member vote and queues relay_votes (202)', async () => {
    const proposalId = `p-relay-${Date.now()}`;
    const endTime = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const v: VoteAuthorization = {
      communityId: hashCommunityId('comm-1'),
      proposalId: hashProposalId(proposalId),
      memberIdHash: hashMemberId('comm-1', 'member-1', PEPPER),
      optionId: hashOptionId(proposalId, 'approve'),
      nonce: 1n,
      deadline: endTime,
    };
    const signature = await voter.signTypedData(DOMAIN, VOTE_TYPES, v);

    const r = await handleVotesRelay(deps, {
      headers: headers({ auth: bearer, idem: `relay-${proposalId}` }),
      proposalId,
      body: {
        communityId: 'comm-1',
        votes: [
          {
            voteAuthorization: {
              communityId: v.communityId,
              proposalId: v.proposalId,
              memberIdHash: v.memberIdHash,
              optionId: v.optionId,
              nonce: '1',
              deadline: endTime.toString(),
            },
            signature,
          },
        ],
      },
    });

    expect(r.status).to.equal(202);
    const data = r.body.data as { includedVotes?: number; droppedVotes?: number };
    expect(data.includedVotes).to.equal(1);
    expect(data.droppedVotes).to.equal(0);
  });

  it('votes-relay drops a vote whose signer is not the memberSigner (400 NO_VALID_VOTES)', async () => {
    const rt: GovernanceRuntime = {
      ...fakeRuntime,
      reader: {
        ...fakeRuntime.reader,
        async memberSignerOf() { return '0x9999999999999999999999999999999999999999'; },
      },
    };
    const localDeps: GovProposalsDeps = { ...deps, runtime: rt };
    const proposalId = `p-relaybad-${Date.now()}`;
    const endTime = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const v: VoteAuthorization = {
      communityId: hashCommunityId('comm-1'),
      proposalId: hashProposalId(proposalId),
      memberIdHash: hashMemberId('comm-1', 'member-1', PEPPER),
      optionId: hashOptionId(proposalId, 'approve'),
      nonce: 2n,
      deadline: endTime,
    };
    const signature = await voter.signTypedData(DOMAIN, VOTE_TYPES, v);
    const r = await handleVotesRelay(localDeps, {
      headers: headers({ auth: bearer, idem: `relaybad-${proposalId}` }),
      proposalId,
      body: {
        communityId: 'comm-1',
        votes: [{
          voteAuthorization: {
            communityId: v.communityId, proposalId: v.proposalId, memberIdHash: v.memberIdHash,
            optionId: v.optionId, nonce: '2', deadline: endTime.toString(),
          },
          signature,
        }],
      },
    });
    expect(r.status).to.equal(400);
    expect((r.body.error as { code?: string }).code).to.equal('NO_VALID_VOTES');
  });

  it('finalize requires an Idempotency-Key (400) then queues finalize_proposal (202)', async () => {
    const proposalId = `p-finalize-${Date.now()}`;

    const missingKey = await handleFinalizeProposal(deps, {
      headers: headers({ auth: bearer }),
      proposalId,
      body: { communityId: 'comm-1' },
    });
    expect(missingKey.status).to.equal(400);

    const r = await handleFinalizeProposal(deps, {
      headers: headers({ auth: bearer, idem: `finalize-${proposalId}` }),
      proposalId,
      body: { communityId: 'comm-1' },
    });
    expect(r.status).to.equal(202);
    const row = await prisma.chainAction.findFirst({ where: { proposalId: hashProposalId(proposalId) } });
    expect(row?.kind).to.equal('finalize_proposal');
  });
});
