// 真链端到端冒烟（BLOCKCHAIN-DESIGN 全链路）：
//   种子源行 → createPendingRecord → requestSubmission 入队
//   → 真实 worker（scripts/worker.ts，须已启动）签名/广播/确认
//   → 轮询 PublicRecord 至 verified → verifier 重算哈希 + 链上比对
// 前提：.env 指向真实 RPC/合约/私钥 + 本地 Postgres/Redis。
// 运行：set -a; source .env; set +a; npx tsx scripts/smoke-e2e.ts

import { PrismaClient } from '@prisma/client';

import { loadBlockchainConfig } from '../lib/blockchain/config';
import { buildMintPayload } from '../lib/blockchain/payloads/build-mint-payload';
import { initBlockchainRuntime } from '../lib/blockchain/runtime';

const POLL_MS = 3_000;
const TIMEOUT_MS = 180_000;

async function main(): Promise<void> {
  const cfg = loadBlockchainConfig();
  const prisma = new PrismaClient();
  const rt = await initBlockchainRuntime();

  const stamp = Date.now();
  const communityId = `smoke-${stamp}`;
  const memberId = `member-${stamp}`;

  // 业务事务：源行 + 待上链 PublicRecord 原子落库（§26.1 的最小冒烟版）
  const record = await prisma.$transaction(async (tx) => {
    await tx.community.create({
      data: { id: communityId, slug: communityId, name: 'Smoke Community' },
    });
    const mint = await tx.tokenMintEvent.create({
      data: {
        communityId,
        memberId,
        epochId: `epoch-${stamp}`,
        epochNumber: 1,
        mintType: 'contribution',
        budgetSource: 'current_epoch',
        amount: 500n,
        governanceActivationEpoch: null,
        memberBalanceBefore: 0n,
        memberBalanceAfter: 500n,
        totalSupplyBefore: 100_000n,
        totalSupplyAfter: 100_500n,
        tokenPolicyVersion: 1,
        reason: 'real-chain E2E smoke',
        approvedBy: 'smoke-script',
        ledgerSeq: 1,
      },
    });
    const built = buildMintPayload(
      {
        id: mint.id,
        communityId,
        memberId,
        epochNumber: 1,
        mintType: 'contribution',
        budgetSource: 'current_epoch',
        amount: 500n,
        memberBalanceBefore: 0n,
        memberBalanceAfter: 500n,
        totalSupplyBefore: 100_000n,
        totalSupplyAfter: 100_500n,
        governanceActivationEpoch: null,
        tokenPolicyVersion: 1,
        createdAt: mint.createdAt,
        ledgerSeq: 1,
      },
      cfg.pepper,
    );
    return rt.records.createPendingRecord(tx, {
      recordType: built.recordType,
      sourceTable: 'TokenMintEvent',
      sourceId: mint.id,
      communityId,
      envelope: built.envelope,
      recordHash: built.recordHash,
    });
  });

  console.log(`[1/4] PublicRecord 已创建: ${record.id} (${record.recordHash})`);

  const { jobId } = await rt.records.requestSubmission(record.id);
  console.log(`[2/4] 已入队 chain-submit: ${jobId}（由 worker 进程消费）`);

  const started = Date.now();
  let last = '';
  for (;;) {
    const dto = await rt.records.getById(record.id);
    if (!dto) throw new Error('record vanished');
    if (dto.status !== last) {
      last = dto.status;
      console.log(`      状态 → ${dto.status}${dto.txHash ? `  tx=${dto.txHash}` : ''}`);
    }
    if (dto.status === 'verified') {
      console.log(`[3/4] ✅ 已上链并确认  区块=${dto.blockNumber}  tx=${dto.txHash}`);
      console.log(`      浏览器: ${cfg.explorerBaseUrl}/tx/${dto.txHash}`);
      break;
    }
    if (dto.status === 'failed') {
      throw new Error(`记录进入 failed: ${dto.lastError ?? 'unknown'}`);
    }
    if (Date.now() - started > TIMEOUT_MS) {
      throw new Error(`超时（${TIMEOUT_MS}ms）仍未 verified，当前=${dto.status}`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  const verdict = await rt.injective.verifier.verifyRecord(record.id);
  console.log(
    `[4/4] verifier: verified=${verdict.verified} hashMatches=${verdict.hashMatches} onChain=${verdict.onChain}`,
  );
  if (!verdict.verified) {
    throw new Error(`verifier 未通过: ${JSON.stringify(verdict)}`);
  }
  console.log('\n🎉 真链端到端冒烟通过：DB 事务 → 队列 → 签名广播 → 链上确认 → 独立复验 全链路打通');
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error('冒烟失败:', e);
  process.exit(1);
});
