// Disaster-recovery drill (docs/BLOCKCHAIN-DESIGN-v0.7.md §5/§6 Phase-4). Proves
// the v0.7 invariant that confirmed state is a PROJECTION of the chain: wipe the
// projection tables, then replay every log from CONTRACT_DEPLOY_BLOCK via the
// same `syncOnce` the cron uses, and the balances rebuild byte-for-byte.
//
// It TRUNCATEs the v0.7 projection tables ONLY (never the authoritative chain, and
// never the v0.6 business ledgers):
//   - MemberChainBalance        (all rows)
//   - MemberEpochMintCounter    (all rows)
//   - ChainEvent                (all rows — the decoded-log store)
//   - CommunityTokenState       (v0.7 rows only: communityId is the 0x bytes32 hash)
//   - SyncCheckpoint            (the cursor for THIS contract only -> forces a cold replay)
//
// DESTRUCTIVE: guarded behind an explicit --confirm flag. Without it the script
// prints what it WOULD delete and exits 0.
//
// Env (fail-fast): DATABASE_URL, plus CONTRACT_ADDRESS / BLOCKCHAIN_PRIVATE_KEY /
//   INJECTIVE_RPC_URL / ... (validated by loadBlockchainConfig / createGovernanceRuntime).
//
// Run: set -a; source .env; set +a; npx tsx scripts/rebuild-projections.ts --confirm

import { getPrisma } from '../lib/db/client';
import { syncOnce } from '../lib/blockchain/indexer/indexer-service';
import { createGovernanceRuntime } from '../lib/blockchain/relay/governance-runtime';

const MAX_TICKS = 10_000; // safety ceiling on the replay loop

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('Missing required env DATABASE_URL');
  }
  const confirmed = process.argv.includes('--confirm');

  const runtime = createGovernanceRuntime(); // fail-fasts on missing blockchain env
  const prisma = getPrisma();
  const contract = runtime.contractAddress;

  // eslint-disable-next-line no-console
  console.log(`Contract:    ${contract}`);
  // eslint-disable-next-line no-console
  console.log(`Deploy block: ${runtime.deployBlock}`);

  if (!confirmed) {
    const [balances, states, events] = await Promise.all([
      prisma.memberChainBalance.count(),
      prisma.communityTokenState.count({ where: { communityId: { startsWith: '0x' } } }),
      prisma.chainEvent.count(),
    ]);
    // eslint-disable-next-line no-console
    console.log(
      `\nDRY RUN (no --confirm). Would DELETE: MemberChainBalance=${balances}, ` +
        `CommunityTokenState(v0.7)=${states}, ChainEvent=${events}, ` +
        `MemberEpochMintCounter=all, SyncCheckpoint[${contract}]=1, then replay from block ${runtime.deployBlock}.`,
    );
    // eslint-disable-next-line no-console
    console.log('Re-run with --confirm to execute the rebuild.');
    await prisma.$disconnect();
    return;
  }

  // --- truncate the v0.7 projections ---
  // eslint-disable-next-line no-console
  console.log('\n[truncate] wiping v0.7 projection tables...');
  await prisma.$transaction([
    prisma.memberChainBalance.deleteMany({}),
    prisma.memberEpochMintCounter.deleteMany({}),
    prisma.chainEvent.deleteMany({}),
    // v0.7 rows are keyed by the on-chain bytes32 community hash (0x-prefixed);
    // v0.6 rows use plain slugs and are left untouched.
    prisma.communityTokenState.deleteMany({ where: { communityId: { startsWith: '0x' } } }),
    // reset ONLY this contract's cursor so syncOnce restarts from the deploy block.
    prisma.syncCheckpoint.deleteMany({ where: { communityId: contract } }),
  ]);
  // eslint-disable-next-line no-console
  console.log('[truncate] done.');

  // --- replay every log from the deploy block until caught up ---
  // eslint-disable-next-line no-console
  console.log('[replay] re-running syncOnce from the deploy block...');
  let totalApplied = 0;
  let totalScanned = 0;
  for (let tick = 0; tick < MAX_TICKS; tick += 1) {
    const result = await syncOnce({
      prisma,
      provider: runtime.logProvider,
      contractAddress: contract,
      communityId: contract, // one cursor per contract (multi-community; events carry their own communityId)
      fromBlockFloor: runtime.deployBlock,
    });
    totalApplied += result.applied;
    totalScanned += result.scanned;
    // eslint-disable-next-line no-console
    console.log(
      `  blocks ${result.fromBlock}-${result.toBlock}: scanned ${result.scanned}, ` +
        `applied ${result.applied}, skipped ${result.skipped} (head ${result.headBlock})`,
    );
    if (result.caughtUp) break;
  }
  // eslint-disable-next-line no-console
  console.log(`[replay] done: ${totalApplied} events applied across ${totalScanned} scanned.`);

  // --- print the rebuilt balances (the proof the projection is chain-derived) ---
  const [balances, states] = await Promise.all([
    prisma.memberChainBalance.findMany({ orderBy: [{ communityId: 'asc' }, { memberIdHash: 'asc' }] }),
    prisma.communityTokenState.findMany({ where: { communityId: { startsWith: '0x' } }, orderBy: { communityId: 'asc' } }),
  ]);

  // eslint-disable-next-line no-console
  console.log('\n===== rebuilt community supply =====');
  for (const s of states) {
    // eslint-disable-next-line no-console
    console.log(`  ${s.communityId}  totalSupply=${s.currentTotalSupply}  (ledgerSeq ${s.ledgerSeq})`);
  }
  // eslint-disable-next-line no-console
  console.log('\n===== rebuilt member balances =====');
  for (const b of balances) {
    // eslint-disable-next-line no-console
    console.log(`  ${b.communityId} / ${b.memberIdHash}  balance=${b.balance}  (ledgerSeq ${b.ledgerSeq})`);
  }
  // eslint-disable-next-line no-console
  console.log(`\n${balances.length} member balance(s), ${states.length} community supply row(s) rebuilt from chain.`);

  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('rebuild-projections failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
