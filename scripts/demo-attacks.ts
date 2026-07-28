// Adversarial enforcement demo against the LIVE deployed YouFenGovernance
// (docs/BLOCKCHAIN-DESIGN-v0.7.md §0/§2 + contracts/test/YouFenGovernance.test.ts).
//
// The headline claim of v0.7 is: "the strongest proof of on-chain value is not a
// successful op, but an over-privileged op getting reverted." This script proves
// it on a real testnet by running the six headline demos and printing PASS/FAIL:
//   (a) normal mint succeeds
//   (b) over member-cap             -> MEMBER_EPOCH_CAP_EXCEEDED
//   (c) advance over 25% cumulative -> ADVANCE_LIMIT_EXCEEDED
//   (d) policy change without a passed vote -> POLICY_PROPOSAL_REQUIRED
//   (e) mint AFTER a proposal snapshot does NOT change the frozen voting weight
//   (f) relayer/other key forging a member vote -> INVALID_MEMBER_SIGNATURE
//
// Every signature is client-held EIP-712 (built with ephemeral test wallets); the
// relayer (msg.sender) is NEVER an authorization input — it only pays gas. Each
// run creates a FRESH community (timestamped id) so the demos are collision-free
// and idempotent across runs. Only the relayer needs INJ; approver/member wallets
// just sign.
//
// Env (fail-fast): CONTRACT_ADDRESS, BLOCKCHAIN_PRIVATE_KEY, INJECTIVE_RPC_URL,
//   RECORD_HASH_PEPPER, CHAIN_ID, ... (validated by loadBlockchainConfig). Plus:
//   DEMO_POLICY_WAIT_SECONDS (optional, default 20 — how long the demo(d) proposal
//   stays open before finalize; must elapse in real time on a live chain).
//
// Run: set -a; source .env; set +a; npx tsx scripts/demo-attacks.ts

import {
  AbiCoder,
  Contract,
  JsonRpcProvider,
  Wallet,
  hexlify,
  id,
  keccak256,
  randomBytes,
  type TransactionResponse,
} from 'ethers';

import { YOUFEN_GOVERNANCE_ABI } from '../lib/blockchain/abi/youfen-governance';
import { loadBlockchainConfig } from '../lib/blockchain/config';
import { hashCommunityId, hashMemberId } from '../lib/blockchain/hashing/id-hash';
import {
  ENROLL_TYPES,
  MINT_TYPES,
  PROPOSAL_TYPES,
  VOTE_TYPES,
  buildDomain,
  type Eip712Domain,
} from '../lib/blockchain/signing/typed-data';

const ZERO32 = '0x' + '00'.repeat(32);
const APPROVE = id('approve');
const REJECT = id('reject');

// Fresh community derived from these params: genesis 100000, inflation 5% -> base
// 5000; member cap 20% -> 1000; per-tx advance cap 30% -> 1500; cumulative advance
// ceiling is the contract constant 25% -> 1250.
const GENESIS = 100_000n;
const INFLATION_BPS = 500;
const MAX_ADVANCE_BPS = 3000;
const MEMBER_CAP_BPS = 2000;
const APPROVER_THRESHOLD = 1;
const MIN_VOTER = 1;

const randBytes32 = (): string => hexlify(randomBytes(32));
const randNonce = (): bigint => BigInt(hexlify(randomBytes(16)));

interface DemoResult {
  readonly label: string;
  readonly pass: boolean;
  readonly detail: string;
}

/** Extract the Solidity `require(_, "MSG")` revert string from an ethers error. */
function revertReasonOf(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const e = error as { reason?: unknown; revert?: { args?: unknown[] }; shortMessage?: unknown };
    if (typeof e.reason === 'string' && e.reason.length > 0) return e.reason;
    const arg0 = e.revert?.args?.[0];
    if (typeof arg0 === 'string' && arg0.length > 0) return arg0;
    if (typeof e.shortMessage === 'string') return e.shortMessage;
  }
  return String(error);
}

async function send(txPromise: Promise<TransactionResponse>, confirmations: number): Promise<void> {
  const tx = await txPromise;
  await tx.wait(confirmations);
}

async function waitUntilChainTime(provider: JsonRpcProvider, targetUnix: number): Promise<void> {
  for (;;) {
    const block = await provider.getBlock('latest');
    const now = block?.timestamp ?? Math.floor(Date.now() / 1000);
    if (now > targetUnix) return;
    await new Promise((r) => setTimeout(r, 3_000));
  }
}

async function main(): Promise<void> {
  const config = loadBlockchainConfig();
  const policyWaitSeconds = Number(process.env.DEMO_POLICY_WAIT_SECONDS ?? '20');
  const confirmations = config.confirmations;

  const provider = new JsonRpcProvider(config.rpcUrl, config.chainId);
  const relayer = new Wallet(config.privateKey, provider);
  const gov = new Contract(config.contractAddress, YOUFEN_GOVERNANCE_ABI, relayer);
  const domain: Eip712Domain = buildDomain(config.chainId, config.contractAddress);

  // Ephemeral client-held keys — they only SIGN; the relayer submits + pays gas.
  const approver1 = Wallet.createRandom();
  const approver2 = Wallet.createRandom();
  const alice = Wallet.createRandom();

  const stamp = Date.now();
  const communityId = `demo-${stamp}`;
  const aliceMemberId = `alice-${stamp}`;
  const cidHash = hashCommunityId(communityId);
  const aliceHash = hashMemberId(communityId, aliceMemberId, config.pepper);
  const evidenceHash = id(`evidence-${stamp}`);

  // eslint-disable-next-line no-console
  console.log(`Contract:  ${config.contractAddress}  (chainId ${config.chainId})`);
  // eslint-disable-next-line no-console
  console.log(`Relayer:   ${relayer.address}`);
  // eslint-disable-next-line no-console
  console.log(`Community: "${communityId}" -> ${cidHash}\n`);

  // --- setup: fresh community (relayer=owner), two approvers, enroll alice ---
  // eslint-disable-next-line no-console
  console.log('[setup] createCommunity + setApprover x2 + enrollMember(alice)...');
  await send(
    gov.createCommunity(
      cidHash,
      relayer.address,
      APPROVER_THRESHOLD,
      INFLATION_BPS,
      MAX_ADVANCE_BPS,
      MEMBER_CAP_BPS,
      MIN_VOTER,
      GENESIS,
    ),
    confirmations,
  );
  await send(gov.setApprover(cidHash, approver1.address, true), confirmations);
  await send(gov.setApprover(cidHash, approver2.address, true), confirmations);

  const enrollAuth = {
    communityId: cidHash,
    memberIdHash: aliceHash,
    signerAddress: alice.address,
    nonce: randNonce(),
    deadline: BigInt(stamp / 1000 | 0) + 86_400n,
  };
  const enrollMemberSig = await alice.signTypedData(domain, ENROLL_TYPES, enrollAuth);
  const enrollAuthSig = await relayer.signTypedData(domain, ENROLL_TYPES, enrollAuth); // owner authorizes
  await send(gov.enrollMember(enrollAuth, enrollMemberSig, enrollAuthSig), confirmations);
  // eslint-disable-next-line no-console
  console.log('[setup] done.\n');

  const nowSec = async (): Promise<number> => {
    const b = await provider.getBlock('latest');
    return b?.timestamp ?? Math.floor(Date.now() / 1000);
  };

  // Resolve one deadline (chain time + 1h) reused by every mint in this run.
  const deadline = BigInt((await nowSec()) + 3_600);
  const mintOf = (over: Record<string, unknown>): Record<string, unknown> => ({
    communityId: cidHash,
    memberIdHash: aliceHash,
    contributionId: randBytes32(),
    ruleVersion: 1,
    epochNumber: 1n,
    regularAmount: 0n,
    advanceAmount: 0n,
    relatedParty: false,
    proposalId: ZERO32,
    evidenceHash,
    recordHash: randBytes32(),
    nonce: randNonce(),
    deadline,
    ...over,
  });

  const results: DemoResult[] = [];

  // -------------------------------------------------------------------------
  // demo(a): a normal mint within budget/cap succeeds with one approver
  // -------------------------------------------------------------------------
  try {
    const a = mintOf({ regularAmount: 800n });
    const sig = await approver1.signTypedData(domain, MINT_TYPES, a);
    await send(gov.executeMint(a, [sig]), confirmations);
    const bal = await gov.balanceOf(cidHash, aliceHash);
    const pass = bal === 800n;
    results.push({ label: 'demo(a) normal mint succeeds', pass, detail: `balanceOf(alice)=${bal} (expected 800)` });
  } catch (error) {
    results.push({ label: 'demo(a) normal mint succeeds', pass: false, detail: `unexpected revert: ${revertReasonOf(error)}` });
  }

  // -------------------------------------------------------------------------
  // demo(b): minting over the member epoch cap reverts (authority != override)
  // -------------------------------------------------------------------------
  results.push(
    await expectRevert('demo(b) over member-cap -> MEMBER_EPOCH_CAP_EXCEEDED', 'MEMBER_EPOCH_CAP_EXCEEDED', async () => {
      const a = mintOf({ regularAmount: 1500n }); // cap is 1000
      const sig = await approver1.signTypedData(domain, MINT_TYPES, a);
      await gov.executeMint.staticCall(a, [sig]);
    }),
  );

  // -------------------------------------------------------------------------
  // demo(c): a single advance over the 25% cumulative cap reverts
  // -------------------------------------------------------------------------
  results.push(
    await expectRevert('demo(c) advance > 25% -> ADVANCE_LIMIT_EXCEEDED', 'ADVANCE_LIMIT_EXCEEDED', async () => {
      // base 5000; 25% = 1250. 1300 > 1250 -> revert (per-tx cap 1500 would allow it)
      const a = mintOf({ regularAmount: 0n, advanceAmount: 1300n, memberIdHash: aliceHash });
      const s1 = await approver1.signTypedData(domain, MINT_TYPES, a);
      const s2 = await approver2.signTypedData(domain, MINT_TYPES, a);
      await gov.executeMint.staticCall(a, [s1, s2]);
    }),
  );

  // -------------------------------------------------------------------------
  // demo(d): a policy change cannot take effect without a passed vote
  // -------------------------------------------------------------------------
  try {
    // structural half: NO direct policy setter exists on the ABI.
    const forbidden = ['setInflationRate', 'setPolicy', 'adminMint', 'setBalance', 'seize'];
    const leaked = forbidden.filter((n) => gov.interface.fragments.some((f) => (f as { name?: string }).name === n));
    if (leaked.length > 0) throw new Error(`ABI leaked direct policy setter(s): ${leaked.join(', ')}`);

    // behavioural half: an UNPASSED TOKEN_POLICY_CHANGE (kind 1) reverts on execute.
    const pid = id(`prop:policy-${stamp}`);
    const endTime = (await nowSec()) + policyWaitSeconds;
    const optionsHash = keccak256(AbiCoder.defaultAbiCoder().encode(['bytes32[]'], [[APPROVE, REJECT]]));
    const creation = {
      communityId: cidHash,
      proposalId: pid,
      kind: 1,
      optionsHash,
      endTime,
      minVoterCount: 5, // deliberately unreachable -> no quorum
      targetMemberIdHash: ZERO32,
      pInflationRateBps: 800,
      pMaxAdvanceRateBps: MAX_ADVANCE_BPS,
      pMemberMintCapRateBps: MEMBER_CAP_BPS,
      nonce: 0n,
      deadline: BigInt(endTime),
    };
    const creatorSig = await approver1.signTypedData(domain, PROPOSAL_TYPES, creation);
    await send(
      gov.createProposal(pid, cidHash, 1, [APPROVE, REJECT], endTime, 5, ZERO32, 800, MAX_ADVANCE_BPS, MEMBER_CAP_BPS, creatorSig),
      confirmations,
    );
    // eslint-disable-next-line no-console
    console.log(`[demo(d)] proposal open for ~${policyWaitSeconds}s; waiting for it to close...`);
    await waitUntilChainTime(provider, endTime);
    await send(gov.finalizeProposal(pid), confirmations);

    const r = await expectRevert('demo(d) policy without vote -> POLICY_PROPOSAL_REQUIRED', 'POLICY_PROPOSAL_REQUIRED', async () => {
      await gov.executeProposal.staticCall(pid);
    });
    const c = await gov.communities(cidHash);
    const unchanged = Number(c.inflationRateBps) === INFLATION_BPS;
    results.push({
      label: r.label,
      pass: r.pass && unchanged,
      detail: `${r.detail}; inflationRateBps=${c.inflationRateBps} (unchanged=${unchanged})`,
    });
  } catch (error) {
    results.push({ label: 'demo(d) policy without vote -> POLICY_PROPOSAL_REQUIRED', pass: false, detail: `setup error: ${revertReasonOf(error)}` });
  }

  // -------------------------------------------------------------------------
  // demo(e): a mint AFTER the snapshot does not change an active proposal weight
  // -------------------------------------------------------------------------
  try {
    // alice already holds 800 (govSeq 1 from demo(a)); create a decision proposal
    // -> snapshot freezes at govSeq 1.
    const pid = id(`prop:decision-${stamp}`);
    const endTime = (await nowSec()) + 3_600;
    const optionsHash = keccak256(AbiCoder.defaultAbiCoder().encode(['bytes32[]'], [[APPROVE, REJECT]]));
    const creation = {
      communityId: cidHash,
      proposalId: pid,
      kind: 0,
      optionsHash,
      endTime,
      minVoterCount: 1,
      targetMemberIdHash: ZERO32,
      pInflationRateBps: 0,
      pMaxAdvanceRateBps: 0,
      pMemberMintCapRateBps: 0,
      nonce: 0n,
      deadline: BigInt(endTime),
    };
    const creatorSig = await approver1.signTypedData(domain, PROPOSAL_TYPES, creation);
    await send(gov.createProposal(pid, cidHash, 0, [APPROVE, REJECT], endTime, 1, ZERO32, 0, 0, 0, creatorSig), confirmations);

    // AFTER snapshot: alice earns +200 (govSeq 2) -> must NOT count toward this vote
    const m2 = mintOf({ regularAmount: 200n });
    await send(gov.executeMint(m2, [await approver1.signTypedData(domain, MINT_TYPES, m2)]), confirmations);
    const liveBal = await gov.balanceOf(cidHash, aliceHash); // 1000

    // alice votes: the on-chain recorded weight must be the frozen 800, not 1000
    const vote = { communityId: cidHash, proposalId: pid, memberIdHash: aliceHash, optionId: APPROVE, nonce: randNonce(), deadline: BigInt(endTime) };
    const vsig = await alice.signTypedData(domain, VOTE_TYPES, vote);
    const tx = await gov.castVote(vote, vsig);
    const receipt = await tx.wait(confirmations);
    const weight = extractVoteWeight(gov, receipt);
    const pass = weight === 800n && liveBal === 1000n;
    results.push({
      label: 'demo(e) mint after snapshot keeps weight frozen',
      pass,
      detail: `VoteCast weight=${weight} (expected 800); live balance=${liveBal} (expected 1000)`,
    });
  } catch (error) {
    results.push({ label: 'demo(e) mint after snapshot keeps weight frozen', pass: false, detail: `setup error: ${revertReasonOf(error)}` });
  }

  // -------------------------------------------------------------------------
  // demo(f): the relayer cannot forge a member's vote
  // -------------------------------------------------------------------------
  try {
    const pid = id(`prop:forge-${stamp}`);
    const endTime = (await nowSec()) + 3_600;
    const optionsHash = keccak256(AbiCoder.defaultAbiCoder().encode(['bytes32[]'], [[APPROVE, REJECT]]));
    const creation = {
      communityId: cidHash,
      proposalId: pid,
      kind: 0,
      optionsHash,
      endTime,
      minVoterCount: 1,
      targetMemberIdHash: ZERO32,
      pInflationRateBps: 0,
      pMaxAdvanceRateBps: 0,
      pMemberMintCapRateBps: 0,
      nonce: 0n,
      deadline: BigInt(endTime),
    };
    const creatorSig = await approver1.signTypedData(domain, PROPOSAL_TYPES, creation);
    await send(gov.createProposal(pid, cidHash, 0, [APPROVE, REJECT], endTime, 1, ZERO32, 0, 0, 0, creatorSig), confirmations);

    // relayer signs a vote claiming to be alice -> recovers to the relayer key, not
    // alice's registered signer -> INVALID_MEMBER_SIGNATURE.
    const vote = { communityId: cidHash, proposalId: pid, memberIdHash: aliceHash, optionId: APPROVE, nonce: randNonce(), deadline: BigInt(endTime) };
    const forged = await relayer.signTypedData(domain, VOTE_TYPES, vote);
    results.push(
      await expectRevert('demo(f) forged vote -> INVALID_MEMBER_SIGNATURE', 'INVALID_MEMBER_SIGNATURE', async () => {
        await gov.castVote.staticCall(vote, forged);
      }),
    );
  } catch (error) {
    results.push({ label: 'demo(f) forged vote -> INVALID_MEMBER_SIGNATURE', pass: false, detail: `setup error: ${revertReasonOf(error)}` });
  }

  // --- summary ---
  // eslint-disable-next-line no-console
  console.log('\n===== enforcement demo results =====');
  let failed = 0;
  for (const r of results) {
    if (!r.pass) failed += 1;
    // eslint-disable-next-line no-console
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.label}\n          ${r.detail}`);
  }
  // eslint-disable-next-line no-console
  console.log(`\n${results.length - failed}/${results.length} demos passed.`);
  await provider.destroy();
  process.exit(failed === 0 ? 0 : 1);
}

/** Run a thunk expected to revert; PASS iff it reverts with `expectedReason`. */
async function expectRevert(label: string, expectedReason: string, thunk: () => Promise<unknown>): Promise<DemoResult> {
  try {
    await thunk();
    return { label, pass: false, detail: `expected revert "${expectedReason}" but the call SUCCEEDED` };
  } catch (error) {
    const reason = revertReasonOf(error);
    const pass = reason.includes(expectedReason);
    return { label, pass, detail: pass ? `reverted "${reason}"` : `reverted "${reason}" (expected "${expectedReason}")` };
  }
}

/** Parse the VoteCast log from a receipt and return its `weight` argument. */
function extractVoteWeight(gov: Contract, receipt: unknown): bigint | null {
  const logs = (receipt as { logs?: readonly { topics: readonly string[]; data: string }[] })?.logs ?? [];
  for (const log of logs) {
    try {
      const parsed = gov.interface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name === 'VoteCast') return BigInt(parsed.args.weight);
    } catch {
      // not one of our events — ignore
    }
  }
  return null;
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('demo-attacks failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
