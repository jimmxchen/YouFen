// GET /api/public-records/:id/proof — public, read-only. Returns the tx/log
// coordinates (txHash, blockNumber, logIndex) from the ChainEvent carrying this
// recordHash, plus the contract address and a clearly-labeled non-authoritative
// merkle field (docs/BLOCKCHAIN-DESIGN-v0.7.md §6 #17). Thin adapter over the
// pure handler; key-free read path (BLOCKCHAIN-DESIGN §8).

import { NextResponse } from 'next/server';

import { resolvePublicRecordsV07Deps } from '../../../../../lib/api/public-records-v07/deps';
import { handleProofV07 } from '../../../../../lib/api/public-records-v07/handlers';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const deps = resolvePublicRecordsV07Deps();
  const result = await handleProofV07(
    {
      prisma: deps.prisma,
      contractAddress: deps.contractAddress,
      explorerBaseUrl: deps.explorerBaseUrl,
    },
    { recordId: id },
  );
  return NextResponse.json(result.body, { status: result.status });
}
