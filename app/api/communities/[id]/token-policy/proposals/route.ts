// POST /api/communities/:id/token-policy/proposals — admin-only token-policy
// change proposal (PRD §21, W5-4). Thin adapter: resolve Next 15 async params,
// derive the AuthContext from headers, parse the JSON body (400 on malformed),
// delegate to the pure handler, and pass the ApiResult envelope through.

import { NextResponse } from 'next/server';

import { resolveAuthFromHeaders } from '../../../../../../lib/api/core/auth';
import {
  resolveCommunitiesDeps,
  resolveAuthEnv,
} from '../../../../../../lib/api/communities/deps';
import { handleCreatePolicyProposal } from '../../../../../../lib/api/communities/handlers';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
      { status: 400 },
    );
  }

  const auth = resolveAuthFromHeaders(req.headers, resolveAuthEnv());
  const deps = await resolveCommunitiesDeps();
  const result = await handleCreatePolicyProposal(deps, { communityId: id, body, auth });
  return NextResponse.json(result.body, { status: result.status });
}
