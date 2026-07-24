// GET /api/public-records/:id/payload — public, read-only. Returns the canonical
// `youfen.record.v1` JSON (the exact recordHash preimage) for a v0.7 governance
// record (docs/BLOCKCHAIN-DESIGN-v0.7.md §6 #16). Thin adapter: resolve Next 15
// async params, resolve key-free read deps, delegate to the pure handler.
//
// This path is key-free by design — it never builds the relayer wallet
// (BLOCKCHAIN-DESIGN §8; see lib/api/public-records-v07/deps.ts).

import { NextResponse } from 'next/server';

import { resolvePublicRecordsV07Deps } from '../../../../../lib/api/public-records-v07/deps';
import { handlePayloadV07 } from '../../../../../lib/api/public-records-v07/handlers';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const deps = resolvePublicRecordsV07Deps();
  const result = await handlePayloadV07({ prisma: deps.prisma }, { recordId: id });
  return NextResponse.json(result.body, { status: result.status });
}
