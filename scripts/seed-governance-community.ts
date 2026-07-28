// Seed the AdventureX demo community on the deployed YouFenGovernance contract
// (docs/PRD.md §29.1 + docs/BLOCKCHAIN-DESIGN-v0.7.md §2). Uses the config relayer
// wallet: the relayer becomes the community `owner` so it can subsequently call
// the owner-only `setApprover`. Fully IDEMPOTENT — createCommunity is skipped if
// the community already exists (read via the on-chain reader), and each approver
// is skipped if already registered.
//
// Env (fail-fast): CONTRACT_ADDRESS, BLOCKCHAIN_PRIVATE_KEY, INJECTIVE_RPC_URL,
//   RECORD_HASH_PEPPER, ... (all validated by loadBlockchainConfig), plus:
//   DEMO_COMMUNITY_ID       (optional, default "adventurex")
//   DEMO_APPROVER_ADDRESSES (REQUIRED, comma-separated 0x addresses of demo admins)
//   DEMO_APPROVER_THRESHOLD (optional, default 1)
//   DEMO_MIN_VOTER          (optional, default 1)
//
// Run: set -a; source .env; set +a; npx tsx scripts/seed-governance-community.ts

import { Contract, JsonRpcProvider, Wallet, getAddress, isAddress } from 'ethers';

import { YOUFEN_GOVERNANCE_ABI } from '../lib/blockchain/abi/youfen-governance';
import { loadBlockchainConfig } from '../lib/blockchain/config';
import { hashCommunityId } from '../lib/blockchain/hashing/id-hash';
import { createGovernanceRuntime } from '../lib/blockchain/relay/governance-runtime';

// AdventureX Token params (PRD §29.1). genesis 100000, inflation 5% (500 bps) ->
// base 5000; maxAdvance 30% (3000 bps) -> per-tx advance cap 1500; member cap 20%
// (2000 bps) -> 1000. (The cumulative advance ceiling is a contract constant 25%.)
const GENESIS_OPENING_SUPPLY = 100_000n;
const INFLATION_RATE_BPS = 500;
const MAX_ADVANCE_RATE_BPS = 3000;
const MEMBER_MINT_CAP_RATE_BPS = 2000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required env ${name}`);
  }
  return value;
}

function optInt(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value.length === 0) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`${name} must be a positive integer, got: ${value}`);
  }
  return n;
}

function parseApprovers(raw: string): string[] {
  const addrs = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (addrs.length === 0) {
    throw new Error('DEMO_APPROVER_ADDRESSES contained no addresses');
  }
  for (const a of addrs) {
    if (!isAddress(a)) throw new Error(`DEMO_APPROVER_ADDRESSES has invalid address: ${a}`);
  }
  // de-dup (checksummed)
  return Array.from(new Set(addrs.map((a) => getAddress(a))));
}

async function main(): Promise<void> {
  const config = loadBlockchainConfig();
  const communityId = process.env.DEMO_COMMUNITY_ID ?? 'adventurex';
  const approvers = parseApprovers(requireEnv('DEMO_APPROVER_ADDRESSES'));
  const approverThreshold = optInt('DEMO_APPROVER_THRESHOLD', 1);
  const minVoterCount = optInt('DEMO_MIN_VOTER', 1);

  const provider = new JsonRpcProvider(config.rpcUrl, config.chainId);
  const relayer = new Wallet(config.privateKey, provider);
  const gov = new Contract(config.contractAddress, YOUFEN_GOVERNANCE_ABI, relayer);
  const reader = createGovernanceRuntime().reader;

  const cidHash = hashCommunityId(communityId);

  // eslint-disable-next-line no-console
  console.log(`Contract:  ${config.contractAddress}  (chainId ${config.chainId})`);
  // eslint-disable-next-line no-console
  console.log(`Relayer:   ${relayer.address}  (community owner)`);
  // eslint-disable-next-line no-console
  console.log(`Community: "${communityId}" -> ${cidHash}`);

  // --- createCommunity (idempotent) ---
  const existing = await reader.communities(cidHash);
  if (existing.exists) {
    // eslint-disable-next-line no-console
    console.log(
      `[skip] community already exists (owner ${existing.owner}, epoch ${existing.currentEpochNumber}, supply ${existing.currentTotalSupply}).`,
    );
  } else {
    // eslint-disable-next-line no-console
    console.log(
      `[send] createCommunity(threshold ${approverThreshold}, inflation ${INFLATION_RATE_BPS}bps, ` +
        `maxAdvance ${MAX_ADVANCE_RATE_BPS}bps, memberCap ${MEMBER_MINT_CAP_RATE_BPS}bps, ` +
        `minVoter ${minVoterCount}, genesis ${GENESIS_OPENING_SUPPLY})`,
    );
    const tx = await gov.createCommunity(
      cidHash,
      relayer.address,
      approverThreshold,
      INFLATION_RATE_BPS,
      MAX_ADVANCE_RATE_BPS,
      MEMBER_MINT_CAP_RATE_BPS,
      minVoterCount,
      GENESIS_OPENING_SUPPLY,
    );
    const receipt = await tx.wait(config.confirmations);
    // eslint-disable-next-line no-console
    console.log(`       confirmed in block ${receipt?.blockNumber} (tx ${tx.hash})`);
  }

  // --- setApprover for each demo admin (idempotent, owner-only) ---
  for (const account of approvers) {
    const already = await reader.isApprover(cidHash, account);
    if (already) {
      // eslint-disable-next-line no-console
      console.log(`[skip] approver already set: ${account}`);
      continue;
    }
    // eslint-disable-next-line no-console
    console.log(`[send] setApprover(${account}, true)`);
    const tx = await gov.setApprover(cidHash, account, true);
    const receipt = await tx.wait(config.confirmations);
    // eslint-disable-next-line no-console
    console.log(`       confirmed in block ${receipt?.blockNumber} (tx ${tx.hash})`);
  }

  // eslint-disable-next-line no-console
  console.log('\nSeed complete. Verify enforcement with scripts/demo-attacks.ts');
  await provider.destroy();
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('seed failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
