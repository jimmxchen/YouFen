import { expect } from 'chai';
import { ethers } from 'hardhat';

import type { YouFenGovernance } from '../../typechain-types';
import {
  buildDomain,
  domainSeparator,
  mintDigest,
  type MintAuthorization,
} from '../../lib/blockchain/signing/typed-data';
import { mintEnvelope } from '../../lib/blockchain/signing/auth-envelope';
import { recoverMintSigner } from '../../lib/blockchain/signing/recover';

// GOLDEN-VECTOR LOCK (Phase-0 freeze, I1–I3): the off-chain typed-data module in
// lib/blockchain/signing/* must produce the EXACT digest the on-chain contract
// computes. If a field, its order, or the domain (name/version/chainId) ever
// drifts between contract and TS, every signature would silently fail to verify
// on-chain — this suite catches that drift at build time instead.

const ZERO32 = '0x' + '00'.repeat(32);

async function deploy() {
  const [deployer, approver] = await ethers.getSigners();
  const factory = await ethers.getContractFactory('YouFenGovernance');
  const gov = (await factory.connect(deployer).deploy()) as unknown as YouFenGovernance;
  await gov.waitForDeployment();
  const { chainId } = await ethers.provider.getNetwork();
  const domain = buildDomain(Number(chainId), await gov.getAddress());
  return { gov, approver, domain };
}

const sampleMint = (): MintAuthorization => ({
  communityId: ethers.id('community:adventurex') as `0x${string}`,
  memberIdHash: ethers.id('member:alice') as `0x${string}`,
  contributionId: ethers.id('contribution:42') as `0x${string}`,
  ruleVersion: 1,
  epochNumber: 1,
  regularAmount: 800n,
  advanceAmount: 0n,
  relatedParty: false,
  proposalId: ZERO32 as `0x${string}`,
  evidenceHash: ethers.id('evidence:bundle') as `0x${string}`,
  recordHash: ethers.id('record:1') as `0x${string}`,
  nonce: 7n,
  deadline: 9999999999n,
});

describe('EIP-712 golden vectors (TS module == on-chain contract)', () => {
  it('domain separator matches the contract', async () => {
    const { gov, domain } = await deploy();
    expect(domainSeparator(domain)).to.equal(await gov.domainSeparator());
  });

  it('MintAuthorization digest matches the contract for a large uint256', async () => {
    const { gov, domain } = await deploy();
    const a = sampleMint();
    a.regularAmount = 2n ** 200n; // well beyond int64 — proves no precision loss
    expect(mintDigest(domain, a)).to.equal(await gov.hashMintAuthorization(a));
  });

  it('a digest signed off-chain recovers to the same approver on-chain and in TS', async () => {
    const { gov, approver, domain } = await deploy();
    const a = sampleMint();
    // client signs the frozen typed data
    const sig = await approver.signTypedData(domain, { MintAuthorization: mintEnvelope(domain, a).types.MintAuthorization }, a);
    // TS recovery
    expect(recoverMintSigner(domain, a, sig)).to.equal(approver.address);
    // the digest the contract would verify equals what we signed
    expect(mintDigest(domain, a)).to.equal(await gov.hashMintAuthorization(a));
  });

  it('the JSON-safe envelope (decimal-string amounts) yields the same digest', async () => {
    const { gov, domain } = await deploy();
    const a = sampleMint();
    a.regularAmount = 123456789012345678901234567890n;
    const env = mintEnvelope(domain, a);
    // amounts crossed the JSON boundary as strings
    expect(env.message.regularAmount).to.equal('123456789012345678901234567890');
    // yet the digest is identical to the bigint-typed one and to the contract
    expect(env.digest).to.equal(await gov.hashMintAuthorization(a));
  });
});
