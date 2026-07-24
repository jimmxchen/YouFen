import { expect } from 'chai';
import { ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';

import type { YouFenGovernance } from '../../typechain-types';

// ===================================================================================
// Adversarial acceptance suite for the v0.7 enforcement contract.
//
// The headline claim of v0.7 is "the strongest proof of on-chain value is not a
// successful op, but an over-privileged op getting reverted." These tests assert
// exactly that: every over-reach reverts with the frozen revert string, and the
// legitimate governance path succeeds. Signatures are client-held EIP-712 — the
// relayer (msg.sender) is never an authorization input.
// ===================================================================================

const ZERO32 = '0x' + '00'.repeat(32);
const CID = ethers.id('community:adventurex');
const ALICE = ethers.id('member:alice');
const BOB = ethers.id('member:bob');
const EVI = ethers.id('evidence:bundle');
const APPROVE = ethers.id('approve');
const REJECT = ethers.id('reject');

// EIP-712 type definitions — field order MUST match the contract typehashes byte-for-byte.
const MINT_TYPES = {
  MintAuthorization: [
    { name: 'communityId', type: 'bytes32' },
    { name: 'memberIdHash', type: 'bytes32' },
    { name: 'contributionId', type: 'bytes32' },
    { name: 'ruleVersion', type: 'uint32' },
    { name: 'epochNumber', type: 'uint64' },
    { name: 'regularAmount', type: 'uint256' },
    { name: 'advanceAmount', type: 'uint256' },
    { name: 'relatedParty', type: 'bool' },
    { name: 'proposalId', type: 'bytes32' },
    { name: 'evidenceHash', type: 'bytes32' },
    { name: 'recordHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};
const VOTE_TYPES = {
  VoteAuthorization: [
    { name: 'communityId', type: 'bytes32' },
    { name: 'proposalId', type: 'bytes32' },
    { name: 'memberIdHash', type: 'bytes32' },
    { name: 'optionId', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};
const ENROLL_TYPES = {
  MemberEnrollment: [
    { name: 'communityId', type: 'bytes32' },
    { name: 'memberIdHash', type: 'bytes32' },
    { name: 'signerAddress', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};
const PROPOSAL_TYPES = {
  ProposalCreation: [
    { name: 'communityId', type: 'bytes32' },
    { name: 'proposalId', type: 'bytes32' },
    { name: 'kind', type: 'uint8' },
    { name: 'optionsHash', type: 'bytes32' },
    { name: 'endTime', type: 'uint64' },
    { name: 'minVoterCount', type: 'uint32' },
    { name: 'targetMemberIdHash', type: 'bytes32' },
    { name: 'pInflationRateBps', type: 'uint32' },
    { name: 'pMaxAdvanceRateBps', type: 'uint32' },
    { name: 'pMemberMintCapRateBps', type: 'uint32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

let seed = 0;
const uniq = (): string => ethers.id('u' + seed++);

async function deploy() {
  const [deployer, owner, approver1, approver2, alice, bob, relayer] = await ethers.getSigners();
  const factory = await ethers.getContractFactory('YouFenGovernance');
  const gov = (await factory.connect(deployer).deploy()) as unknown as YouFenGovernance;
  await gov.waitForDeployment();

  // community: genesis 100000, inflation 5% -> base 5000; member cap 20% -> 1000; maxAdvance 30% -> 1500
  await gov
    .connect(deployer)
    .createCommunity(CID, owner.address, 1, 500, 3000, 2000, 1, 100000n);
  await gov.connect(owner).setApprover(CID, approver1.address, true);
  await gov.connect(owner).setApprover(CID, approver2.address, true);

  const { chainId } = await ethers.provider.getNetwork();
  const domain = { name: 'YouFen', version: '0.7', chainId, verifyingContract: await gov.getAddress() };

  return { gov, deployer, owner, approver1, approver2, alice, bob, relayer, domain };
}

type MintAuth = YouFenGovernance.MintAuthorizationStruct;

// Build a MintAuthorization with sane defaults; override any field.
async function buildMint(over: Partial<MintAuth> = {}): Promise<MintAuth> {
  const deadline = BigInt((await time.latest()) + 3600);
  return {
    communityId: CID,
    memberIdHash: ALICE,
    contributionId: uniq(),
    ruleVersion: 1,
    epochNumber: 1,
    regularAmount: 800n,
    advanceAmount: 0n,
    relatedParty: false,
    proposalId: ZERO32,
    evidenceHash: EVI,
    recordHash: uniq(),
    nonce: BigInt(seed++),
    deadline,
    ...over,
  };
}

async function enroll(gov: YouFenGovernance, domain: any, member: any, memberIdHash: string, approver: any) {
  const a = {
    communityId: CID,
    memberIdHash,
    signerAddress: member.address,
    nonce: BigInt(seed++),
    deadline: BigInt((await time.latest()) + 3600),
  };
  const memberSig = await member.signTypedData(domain, ENROLL_TYPES, a);
  const authSig = await approver.signTypedData(domain, ENROLL_TYPES, a);
  await gov.enrollMember(a, memberSig, authSig);
}

describe('YouFenGovernance — v0.7 enforcement', () => {
  // -------------------------------------------------------------------------------
  // demo(a): a normal mint succeeds with a single approver signature
  // -------------------------------------------------------------------------------
  it('demo(a): normal mint within budget/cap succeeds with one approver', async () => {
    const { gov, approver1, domain } = await deploy();
    const a = await buildMint({ regularAmount: 800n });
    const sig = await approver1.signTypedData(domain, MINT_TYPES, a);
    await expect(gov.executeMint(a, [sig])).to.emit(gov, 'MintExecuted');
    expect(await gov.balanceOf(CID, ALICE)).to.equal(800n);
    expect(await gov.totalSupplyOf(CID)).to.equal(100800n);
  });

  // -------------------------------------------------------------------------------
  // demo(b): minting over the member epoch cap reverts, even when validly signed
  // -------------------------------------------------------------------------------
  it('demo(b): over member-cap reverts MEMBER_EPOCH_CAP_EXCEEDED (authority != override)', async () => {
    const { gov, approver1, domain } = await deploy();
    const a = await buildMint({ regularAmount: 1500n }); // cap is 1000
    const sig = await approver1.signTypedData(domain, MINT_TYPES, a);
    await expect(gov.executeMint(a, [sig])).to.be.revertedWith('MEMBER_EPOCH_CAP_EXCEEDED');
  });

  // -------------------------------------------------------------------------------
  // demo(c): a single advance over the 25% cumulative cap reverts
  // -------------------------------------------------------------------------------
  it('demo(c): advance over the 25% cumulative cap reverts ADVANCE_LIMIT_EXCEEDED', async () => {
    const { gov, approver1, approver2, domain } = await deploy();
    // base 5000; 25% = 1250. 1300 > 1250 -> revert (per-request cap 1500 would otherwise allow it)
    const a = await buildMint({ regularAmount: 0n, advanceAmount: 1300n });
    const s1 = await approver1.signTypedData(domain, MINT_TYPES, a);
    const s2 = await approver2.signTypedData(domain, MINT_TYPES, a);
    await expect(gov.executeMint(a, [s1, s2])).to.be.revertedWith('ADVANCE_LIMIT_EXCEEDED');
  });

  it('split-order advance cannot bypass the cumulative gate', async () => {
    const { gov, approver1, approver2, domain } = await deploy();
    // first advance 500 (cumBps 1000 -> DUAL) succeeds
    const a1 = await buildMint({ regularAmount: 0n, advanceAmount: 500n });
    await gov.executeMint(a1, [
      await approver1.signTypedData(domain, MINT_TYPES, a1),
      await approver2.signTypedData(domain, MINT_TYPES, a1),
    ]);
    // second advance 800 -> cumulative (500+800)/5000 = 26% > 25% -> revert
    const a2 = await buildMint({ regularAmount: 0n, advanceAmount: 800n, memberIdHash: BOB });
    await expect(
      gov.executeMint(a2, [
        await approver1.signTypedData(domain, MINT_TYPES, a2),
        await approver2.signTypedData(domain, MINT_TYPES, a2),
      ]),
    ).to.be.revertedWith('ADVANCE_LIMIT_EXCEEDED');
  });

  it('advance <= 10% requires TWO distinct approvers (DUAL)', async () => {
    const { gov, approver1, domain } = await deploy();
    const a = await buildMint({ regularAmount: 0n, advanceAmount: 500n }); // cumBps 1000 -> DUAL
    const s1 = await approver1.signTypedData(domain, MINT_TYPES, a);
    await expect(gov.executeMint(a, [s1])).to.be.revertedWith('APPROVER_THRESHOLD_NOT_MET');
  });

  // -------------------------------------------------------------------------------
  // demo(d): inflation cannot change without a passed policy proposal
  // -------------------------------------------------------------------------------
  it('demo(d): there is NO direct policy setter on the ABI (NO_DIRECT_POLICY_EDIT)', async () => {
    const { gov } = await deploy();
    const iface = gov.interface;
    for (const bad of ['setInflationRate', 'setPolicy', 'adminMint', 'setBalance', 'seize']) {
      expect(iface.fragments.some((f: any) => f.name === bad), bad).to.equal(false);
    }
  });

  it('demo(d): executing an unpassed TOKEN_POLICY_CHANGE reverts POLICY_PROPOSAL_REQUIRED and leaves policy unchanged', async () => {
    const { gov, approver1, domain } = await deploy();
    const pid = ethers.id('prop:policy1');
    const endTime = (await time.latest()) + 3600;
    const optionsHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(['bytes32[]'], [[APPROVE, REJECT]]),
    );
    const creation = {
      communityId: CID, proposalId: pid, kind: 1, optionsHash, endTime,
      minVoterCount: 5, targetMemberIdHash: ZERO32,
      pInflationRateBps: 800, pMaxAdvanceRateBps: 3000, pMemberMintCapRateBps: 2000,
      nonce: 0n, deadline: BigInt(endTime),
    };
    const creatorSig = await approver1.signTypedData(domain, PROPOSAL_TYPES, creation);
    await gov.createProposal(pid, CID, 1, [APPROVE, REJECT], endTime, 5, ZERO32, 800, 3000, 2000, creatorSig);
    // no votes -> not approved
    await time.increaseTo(endTime + 1);
    await gov.finalizeProposal(pid);
    await expect(gov.executeProposal(pid)).to.be.revertedWith('POLICY_PROPOSAL_REQUIRED');
    const c = await gov.communities(CID);
    expect(c.inflationRateBps).to.equal(500); // unchanged
  });

  // -------------------------------------------------------------------------------
  // demo(e): a mint AFTER the snapshot does not change an active proposal's weight
  // -------------------------------------------------------------------------------
  it('demo(e): mint after proposal snapshot does not change the voting weight', async () => {
    const { gov, approver1, alice, domain } = await deploy();
    // Alice earns 800 (govSeq 1), enroll her vote key
    const m1 = await buildMint({ regularAmount: 800n });
    await gov.executeMint(m1, [await approver1.signTypedData(domain, MINT_TYPES, m1)]);
    await enroll(gov, domain, alice, ALICE, approver1);

    // create proposal — snapshot freezes at govSeq 1
    const pid = ethers.id('prop:decision');
    const endTime = (await time.latest()) + 3600;
    const optionsHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(['bytes32[]'], [[APPROVE, REJECT]]),
    );
    const creation = {
      communityId: CID, proposalId: pid, kind: 0, optionsHash, endTime,
      minVoterCount: 1, targetMemberIdHash: ZERO32,
      pInflationRateBps: 0, pMaxAdvanceRateBps: 0, pMemberMintCapRateBps: 0,
      nonce: 0n, deadline: BigInt(endTime),
    };
    await gov.createProposal(
      pid, CID, 0, [APPROVE, REJECT], endTime, 1, ZERO32, 0, 0, 0,
      await approver1.signTypedData(domain, PROPOSAL_TYPES, creation),
    );

    // AFTER snapshot: Alice earns another 200 (govSeq 2) — must NOT count toward this vote
    const m2 = await buildMint({ regularAmount: 200n });
    await gov.executeMint(m2, [await approver1.signTypedData(domain, MINT_TYPES, m2)]);
    expect(await gov.balanceOf(CID, ALICE)).to.equal(1000n);

    // Alice votes: weight must be the frozen 800, not 1000
    const vote = {
      communityId: CID, proposalId: pid, memberIdHash: ALICE, optionId: APPROVE,
      nonce: BigInt(seed++), deadline: BigInt(endTime),
    };
    const vsig = await alice.signTypedData(domain, VOTE_TYPES, vote);
    await expect(gov.castVote(vote, vsig))
      .to.emit(gov, 'VoteCast')
      .withArgs(CID, pid, ALICE, APPROVE, 800n);
  });

  // -------------------------------------------------------------------------------
  // demo(f): the relayer cannot forge a member's vote
  // -------------------------------------------------------------------------------
  it('demo(f): a vote not signed by the member key reverts INVALID_MEMBER_SIGNATURE', async () => {
    const { gov, approver1, alice, bob, relayer, domain } = await deploy();
    const m1 = await buildMint({ regularAmount: 800n });
    await gov.executeMint(m1, [await approver1.signTypedData(domain, MINT_TYPES, m1)]);
    await enroll(gov, domain, alice, ALICE, approver1);

    const pid = ethers.id('prop:forge');
    const endTime = (await time.latest()) + 3600;
    const optionsHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(['bytes32[]'], [[APPROVE, REJECT]]),
    );
    const creation = {
      communityId: CID, proposalId: pid, kind: 0, optionsHash, endTime, minVoterCount: 1,
      targetMemberIdHash: ZERO32, pInflationRateBps: 0, pMaxAdvanceRateBps: 0, pMemberMintCapRateBps: 0,
      nonce: 0n, deadline: BigInt(endTime),
    };
    await gov.createProposal(
      pid, CID, 0, [APPROVE, REJECT], endTime, 1, ZERO32, 0, 0, 0,
      await approver1.signTypedData(domain, PROPOSAL_TYPES, creation),
    );

    // relayer signs a vote claiming to be Alice
    const vote = {
      communityId: CID, proposalId: pid, memberIdHash: ALICE, optionId: APPROVE,
      nonce: BigInt(seed++), deadline: BigInt(endTime),
    };
    const forged = await relayer.signTypedData(domain, VOTE_TYPES, vote);
    await expect(gov.castVote(vote, forged)).to.be.revertedWith('INVALID_MEMBER_SIGNATURE');
    // even bob's real key can't vote as Alice
    const bobSig = await bob.signTypedData(domain, VOTE_TYPES, vote);
    await expect(gov.castVote(vote, bobSig)).to.be.revertedWith('INVALID_MEMBER_SIGNATURE');
  });

  // -------------------------------------------------------------------------------
  // notary + replay + envelope guards
  // -------------------------------------------------------------------------------
  it('duplicate recordHash reverts RECORD_EXISTS', async () => {
    const { gov, approver1, domain } = await deploy();
    const rec = uniq();
    const a1 = await buildMint({ regularAmount: 100n, recordHash: rec });
    await gov.executeMint(a1, [await approver1.signTypedData(domain, MINT_TYPES, a1)]);
    const a2 = await buildMint({ regularAmount: 100n, recordHash: rec, memberIdHash: BOB });
    await expect(
      gov.executeMint(a2, [await approver1.signTypedData(domain, MINT_TYPES, a2)]),
    ).to.be.revertedWith('RECORD_EXISTS');
  });

  it('reused contributionId reverts CONTRIBUTION_ALREADY_MINTED', async () => {
    const { gov, approver1, domain } = await deploy();
    const cont = uniq();
    const a1 = await buildMint({ regularAmount: 100n, contributionId: cont });
    await gov.executeMint(a1, [await approver1.signTypedData(domain, MINT_TYPES, a1)]);
    const a2 = await buildMint({ regularAmount: 100n, contributionId: cont });
    await expect(
      gov.executeMint(a2, [await approver1.signTypedData(domain, MINT_TYPES, a2)]),
    ).to.be.revertedWith('CONTRIBUTION_ALREADY_MINTED');
  });

  it('replayed approver nonce reverts BAD_NONCE', async () => {
    const { gov, approver1, domain } = await deploy();
    const n = BigInt(seed++);
    const a1 = await buildMint({ regularAmount: 100n, nonce: n });
    await gov.executeMint(a1, [await approver1.signTypedData(domain, MINT_TYPES, a1)]);
    const a2 = await buildMint({ regularAmount: 100n, nonce: n }); // same signer + nonce
    await expect(
      gov.executeMint(a2, [await approver1.signTypedData(domain, MINT_TYPES, a2)]),
    ).to.be.revertedWith('BAD_NONCE');
  });

  it('expired deadline reverts SIG_EXPIRED', async () => {
    const { gov, approver1, domain } = await deploy();
    const past = BigInt((await time.latest()) - 1);
    const a = await buildMint({ regularAmount: 100n, deadline: past });
    await expect(
      gov.executeMint(a, [await approver1.signTypedData(domain, MINT_TYPES, a)]),
    ).to.be.revertedWith('SIG_EXPIRED');
  });

  it('stale policy version reverts POLICY_VERSION_STALE', async () => {
    const { gov, approver1, domain } = await deploy();
    const a = await buildMint({ regularAmount: 100n, ruleVersion: 2 });
    await expect(
      gov.executeMint(a, [await approver1.signTypedData(domain, MINT_TYPES, a)]),
    ).to.be.revertedWith('POLICY_VERSION_STALE');
  });

  it('a non-approver signature does not authorize a mint', async () => {
    const { gov, relayer, domain } = await deploy();
    const a = await buildMint({ regularAmount: 100n });
    await expect(
      gov.executeMint(a, [await relayer.signTypedData(domain, MINT_TYPES, a)]),
    ).to.be.revertedWith('INVALID_APPROVER_SIGNATURE');
  });

  it('duplicate approver signature reverts DUPLICATE_APPROVER', async () => {
    const { gov, approver1, domain } = await deploy();
    const a = await buildMint({ regularAmount: 0n, advanceAmount: 500n }); // DUAL needs 2 distinct
    const s1 = await approver1.signTypedData(domain, MINT_TYPES, a);
    await expect(gov.executeMint(a, [s1, s1])).to.be.revertedWith('DUPLICATE_APPROVER');
  });

  // -------------------------------------------------------------------------------
  // governance-authorized over-cap special mint (the legitimate path)
  // -------------------------------------------------------------------------------
  it('a passed SPECIAL_MINT proposal authorizes an over-cap mint', async () => {
    const { gov, approver1, alice, domain } = await deploy();
    // give Alice weight + a vote key so the proposal can reach quorum
    const seedMint = await buildMint({ regularAmount: 500n });
    await gov.executeMint(seedMint, [await approver1.signTypedData(domain, MINT_TYPES, seedMint)]);
    await enroll(gov, domain, alice, ALICE, approver1);

    const pid = ethers.id('prop:special');
    const endTime = (await time.latest()) + 3600;
    const optionsHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(['bytes32[]'], [[APPROVE, REJECT]]),
    );
    const creation = {
      communityId: CID, proposalId: pid, kind: 3, optionsHash, endTime, minVoterCount: 1,
      targetMemberIdHash: ALICE, pInflationRateBps: 0, pMaxAdvanceRateBps: 0, pMemberMintCapRateBps: 0,
      nonce: 0n, deadline: BigInt(endTime),
    };
    await gov.createProposal(
      pid, CID, 3, [APPROVE, REJECT], endTime, 1, ALICE, 0, 0, 0,
      await approver1.signTypedData(domain, PROPOSAL_TYPES, creation),
    );
    // Alice votes approve, reach quorum, finalize + execute
    const vote = { communityId: CID, proposalId: pid, memberIdHash: ALICE, optionId: APPROVE, nonce: BigInt(seed++), deadline: BigInt(endTime) };
    await gov.castVote(vote, await alice.signTypedData(domain, VOTE_TYPES, vote));
    await time.increaseTo(endTime + 1);
    await gov.finalizeProposal(pid);
    await gov.executeProposal(pid);

    // now an over-cap mint (1500 > cap 1000) bound to that proposal succeeds
    const over = await buildMint({ regularAmount: 1500n, proposalId: pid });
    await expect(gov.executeMint(over, [await approver1.signTypedData(domain, MINT_TYPES, over)])).to.emit(
      gov,
      'MintExecuted',
    );
    expect(await gov.balanceOf(CID, ALICE)).to.equal(2000n); // 500 + 1500
  });

  it('executeProposal on an unpassed non-policy proposal reverts QUORUM_NOT_MET', async () => {
    const { gov, approver1, domain } = await deploy();
    const pid = ethers.id('prop:noquorum');
    const endTime = (await time.latest()) + 3600;
    const optionsHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(['bytes32[]'], [[APPROVE, REJECT]]),
    );
    const creation = {
      communityId: CID, proposalId: pid, kind: 3, optionsHash, endTime, minVoterCount: 5,
      targetMemberIdHash: ALICE, pInflationRateBps: 0, pMaxAdvanceRateBps: 0, pMemberMintCapRateBps: 0,
      nonce: 0n, deadline: BigInt(endTime),
    };
    await gov.createProposal(
      pid, CID, 3, [APPROVE, REJECT], endTime, 5, ALICE, 0, 0, 0,
      await approver1.signTypedData(domain, PROPOSAL_TYPES, creation),
    );
    await time.increaseTo(endTime + 1);
    await gov.finalizeProposal(pid);
    await expect(gov.executeProposal(pid)).to.be.revertedWith('QUORUM_NOT_MET');
  });

  // -------------------------------------------------------------------------------
  // policy change through governance actually takes effect next epoch
  // -------------------------------------------------------------------------------
  it('a passed TOKEN_POLICY_CHANGE activates only at the next epoch roll', async () => {
    const { gov, approver1, alice, domain } = await deploy();
    const seedMint = await buildMint({ regularAmount: 500n });
    await gov.executeMint(seedMint, [await approver1.signTypedData(domain, MINT_TYPES, seedMint)]);
    await enroll(gov, domain, alice, ALICE, approver1);

    const pid = ethers.id('prop:policy2');
    const endTime = (await time.latest()) + 3600;
    const optionsHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(['bytes32[]'], [[APPROVE, REJECT]]),
    );
    const creation = {
      communityId: CID, proposalId: pid, kind: 1, optionsHash, endTime, minVoterCount: 1,
      targetMemberIdHash: ZERO32, pInflationRateBps: 800, pMaxAdvanceRateBps: 3000, pMemberMintCapRateBps: 2000,
      nonce: 0n, deadline: BigInt(endTime),
    };
    await gov.createProposal(
      pid, CID, 1, [APPROVE, REJECT], endTime, 1, ZERO32, 800, 3000, 2000,
      await approver1.signTypedData(domain, PROPOSAL_TYPES, creation),
    );
    const vote = { communityId: CID, proposalId: pid, memberIdHash: ALICE, optionId: APPROVE, nonce: BigInt(seed++), deadline: BigInt(endTime) };
    await gov.castVote(vote, await alice.signTypedData(domain, VOTE_TYPES, vote));
    await time.increaseTo(endTime + 1);
    await gov.finalizeProposal(pid);
    await gov.executeProposal(pid);

    // still epoch 1 -> unchanged
    expect((await gov.communities(CID)).inflationRateBps).to.equal(500);
    // roll -> pending activates
    await gov.rollEpoch(CID);
    expect((await gov.communities(CID)).inflationRateBps).to.equal(800);
    expect((await gov.communities(CID)).activePolicyVersion).to.equal(2);
  });

  // -------------------------------------------------------------------------------
  // epoch roll budget conservation (debt carry-over)
  // -------------------------------------------------------------------------------
  it('rollEpoch derives next budget and carries advance debt', async () => {
    const { gov, approver1, approver2, domain } = await deploy();
    // regular 800 + advance 500 in epoch 1
    const reg = await buildMint({ regularAmount: 800n });
    await gov.executeMint(reg, [await approver1.signTypedData(domain, MINT_TYPES, reg)]);
    const adv = await buildMint({ regularAmount: 0n, advanceAmount: 500n, memberIdHash: BOB });
    await gov.executeMint(adv, [
      await approver1.signTypedData(domain, MINT_TYPES, adv),
      await approver2.signTypedData(domain, MINT_TYPES, adv),
    ]);

    const supplyBefore = await gov.totalSupplyOf(CID); // 100000 + 800 + 500 = 101300
    await gov.rollEpoch(CID);
    const e2 = await gov.getEpoch(CID, 2);
    // next base = 101300 * 5% = 5065 ; nextDebt = advanceMinted 500 ; effective = 5065 - 500 = 4565
    expect(e2.openingSupply).to.equal(supplyBefore);
    expect(e2.baseMintBudget).to.equal(5065n);
    expect(e2.advanceDebtFromPrev).to.equal(500n);
    expect(e2.effectiveRegularBudget).to.equal(4565n);
    expect(e2.active).to.equal(true);
  });

  it('rollEpoch resets the per-member cap accumulator (no O(n) loop)', async () => {
    const { gov, approver1, domain } = await deploy();
    const m1 = await buildMint({ regularAmount: 1000n }); // exactly at cap
    await gov.executeMint(m1, [await approver1.signTypedData(domain, MINT_TYPES, m1)]);
    await gov.rollEpoch(CID);
    // epoch 2: fresh cap. base2 = 101000*5% = 5050 ; cap2 = 5050*20% = 1010
    const m2 = await buildMint({ regularAmount: 1000n, epochNumber: 2 });
    await expect(gov.executeMint(m2, [await approver1.signTypedData(domain, MINT_TYPES, m2)])).to.emit(
      gov,
      'MintExecuted',
    );
  });

  // -------------------------------------------------------------------------------
  // structural invariants (guaranteed by absence)
  // -------------------------------------------------------------------------------
  it('is non-transferable: no transfer/approve/allowance on the ABI', async () => {
    const { gov } = await deploy();
    const names = new Set(gov.interface.fragments.map((f: any) => f.name).filter(Boolean));
    for (const bad of ['transfer', 'transferFrom', 'approve', 'allowance']) {
      expect(names.has(bad), bad).to.equal(false);
    }
  });

  it('paused blocks new mints but never reads', async () => {
    const { gov, deployer, approver1, domain } = await deploy();
    await gov.connect(deployer).pause();
    const a = await buildMint({ regularAmount: 100n });
    await expect(
      gov.executeMint(a, [await approver1.signTypedData(domain, MINT_TYPES, a)]),
    ).to.be.revertedWith('PAUSED');
    // reads still work
    expect(await gov.totalSupplyOf(CID)).to.equal(100000n);
  });
});
