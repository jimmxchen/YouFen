// Pure handler for POST /api/token/reverse (W5-5, ARCHITECTURE §token-reversal).
// Admin-only append-only mint reversal. The engine (runtime.reversal.reverseMint)
// owns all balance/supply rollback and the pending PublicRecord; this handler only
// authorizes, wraps the call in the shared Idempotency-Key mechanism, and maps the
// business ALREADY_REVERSED race onto a 200 idempotent replay by re-querying the
// existing reversal event (its own idempotency channel, keyed on originalMintEventId).

import { z } from 'zod';

import { REVERSAL_REASONS, type ReversalReason } from '../../engine/types';
import type { AuthContext, AuthorizeAdminFn } from '../core/auth';
import {
  fail,
  ok,
  mapEngineError,
  withIdempotency,
  zBigIntAmount,
  zId,
  type ApiResult,
  type IdempotencyContext,
  type IdempotencyStore,
} from '../core';

// z.enum needs a non-empty string tuple; the frozen REVERSAL_REASONS tuple supplies it.
const reasonEnum = z.enum(
  REVERSAL_REASONS as unknown as [ReversalReason, ...ReversalReason[]],
);

/** Body schema: originalMintEventId + reason required; amount/proposalId/note optional. */
export const reverseBodySchema = z.object({
  originalMintEventId: zId,
  amount: zBigIntAmount.optional(),
  reason: reasonEnum,
  proposalId: zId.optional(),
  note: z.string().optional(),
});

export type ReverseBody = z.infer<typeof reverseBodySchema>;

/** The reversal-engine surface the handler touches. */
export interface ReversalPort {
  reverseMint(input: {
    originalMintEventId: string;
    amount?: bigint;
    reason: ReversalReason;
    approvedBy: string;
    proposalId?: string;
  }): Promise<{ reversalEventId: string; publicRecordId: string }>;
}

export interface ExistingReversal {
  readonly id: string;
  readonly publicRecordId: string | null;
}

export interface ReverseDeps {
  readonly reversal: ReversalPort;
  readonly findExistingReversal: (
    originalMintEventId: string,
  ) => Promise<ExistingReversal | null>;
  readonly idempotencyStore: IdempotencyStore;
  readonly authorize: AuthorizeAdminFn;
}

/** Duck-typed EngineError code reader (no import of the engine error class needed). */
function engineCode(e: unknown): string | null {
  if (e instanceof Error && 'code' in e) {
    const code = (e as Error & { code: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return null;
}

export async function handleReverse(
  deps: ReverseDeps,
  input: {
    body: ReverseBody;
    ctx: AuthContext;
    idempotency: IdempotencyContext;
  },
): Promise<ApiResult> {
  // Admin gate. defaultAuthorizeAdmin ignores communityId, which we cannot know
  // before touching the engine, so pass the reason-derived empty community scope.
  const allowed = await deps.authorize(input.ctx, '');
  if (!allowed) {
    return fail(403, 'FORBIDDEN', 'Admin authorization required');
  }

  const approvedBy = input.ctx.actorId ?? 'internal';

  return withIdempotency(deps.idempotencyStore, input.idempotency, async () => {
    try {
      const res = await deps.reversal.reverseMint({
        originalMintEventId: input.body.originalMintEventId,
        amount: input.body.amount,
        reason: input.body.reason,
        approvedBy,
        proposalId: input.body.proposalId,
      });
      return ok(
        { reversalEventId: res.reversalEventId, publicRecordId: res.publicRecordId },
        201,
      );
    } catch (error: unknown) {
      if (engineCode(error) === 'ALREADY_REVERSED') {
        const existing = await deps.findExistingReversal(input.body.originalMintEventId);
        if (existing) {
          return ok({ idempotent: true, reversalEventId: existing.id }, 200);
        }
      }
      return mapEngineError(error);
    }
  });
}
