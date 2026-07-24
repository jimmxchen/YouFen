// v0.7 chain cron handlers (docs/BLOCKCHAIN-DESIGN-v0.7.md §6, endpoints #19-#21
// + health). Internal-only, idempotent, pull-based — driven by Vercel Cron every
// minute (no persistent worker). Pure handlers: deps + a header reader in, an
// {status, body} ApiResult out. Route adapters stay thin.

import type { PrismaClient } from '@prisma/client';

import { ok, fail, type ApiResult } from '../core/respond';
import { resolveAuthFromHeaders, type AuthEnv, type HeaderReader } from '../core/auth';

import { confirmPending, submitReady } from '../../blockchain/relay/submitter';
import { syncOnce } from '../../blockchain/indexer/indexer-service';
import { getCursor } from '../../blockchain/indexer/sync-checkpoint';
import type { GovernanceRuntime } from '../../blockchain/relay/governance-runtime';

export interface ChainHandlerDeps {
  readonly prisma: PrismaClient;
  readonly runtime: GovernanceRuntime;
  readonly authEnv: AuthEnv;
}

export interface ChainRequestCtx {
  readonly headers: HeaderReader;
  readonly limit?: number;
}

function guardInternal(deps: ChainHandlerDeps, ctx: ChainRequestCtx): ApiResult | null {
  const auth = resolveAuthFromHeaders(ctx.headers, deps.authEnv);
  if (!auth.isInternal) return fail(403, 'FORBIDDEN', 'Internal authorization required');
  return null;
}

/** POST /api/internal/chain-actions/submit — broadcast ready ChainActions. */
export async function handleChainSubmit(deps: ChainHandlerDeps, ctx: ChainRequestCtx): Promise<ApiResult> {
  const denied = guardInternal(deps, ctx);
  if (denied !== null) return denied;
  const summary = await submitReady({ prisma: deps.prisma, sender: deps.runtime.sender, limit: ctx.limit });
  return ok(summary);
}

/** POST /api/internal/chain-actions/confirm — check receipts (revert detection). */
export async function handleChainConfirm(deps: ChainHandlerDeps, ctx: ChainRequestCtx): Promise<ApiResult> {
  const denied = guardInternal(deps, ctx);
  if (denied !== null) return denied;
  const summary = await confirmPending({ prisma: deps.prisma, sender: deps.runtime.sender, limit: ctx.limit });
  return ok(summary);
}

/** POST /api/internal/chain/sync — getLogs -> ChainEvent -> fold projections. */
export async function handleChainSync(deps: ChainHandlerDeps, ctx: ChainRequestCtx): Promise<ApiResult> {
  const denied = guardInternal(deps, ctx);
  if (denied !== null) return denied;
  const { runtime, prisma } = deps;
  // one cursor per CONTRACT (multi-community contract; each event carries its own communityId)
  const result = await syncOnce({
    prisma,
    provider: runtime.logProvider,
    contractAddress: runtime.contractAddress,
    communityId: runtime.contractAddress,
    fromBlockFloor: runtime.deployBlock,
  });
  return ok(result);
}

/** GET /api/internal/chain/health — RPC head, relayer balance, sync lag. */
export async function handleChainHealth(deps: ChainHandlerDeps, ctx: ChainRequestCtx): Promise<ApiResult> {
  const denied = guardInternal(deps, ctx);
  if (denied !== null) return denied;
  const { runtime, prisma } = deps;
  const [head, balance, cursor] = await Promise.all([
    runtime.headBlock(),
    runtime.balanceOfRelayer(),
    getCursor(prisma, runtime.contractAddress),
  ]);
  return ok({
    chainId: runtime.chainId,
    contract: runtime.contractAddress,
    relayer: runtime.relayerAddress,
    relayerBalanceWei: balance.toString(10),
    rpcHead: head,
    lastSyncedBlock: cursor.lastBlock,
    syncLag: Math.max(0, head - cursor.lastBlock),
  });
}
