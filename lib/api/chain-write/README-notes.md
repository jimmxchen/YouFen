# chain-write Foundation — shared shapes

Scaffolding every v0.7 write-endpoint group (mint / reversal / proposal / vote /
member-enroll / rotate / relay) builds on. Do **not** re-implement services or
the runtime — compose these. Handlers stay **pure** (`deps + ctx in → ApiResult
out`); routes stay thin (`parse → resolve*Deps → handler → NextResponse.json`).

## Deps (`deps.ts`)

```ts
resolveChainWriteDeps(): ChainWriteDeps
setChainWriteDepsForTesting(deps: ChainWriteDeps | null): void

interface ChainWriteDeps {
  readonly prisma: PrismaClient;
  readonly runtime: GovernanceRuntime;   // relay/governance-runtime
  readonly authEnv: AuthEnv;             // core/auth
  readonly config: BlockchainConfig;     // .pepper, .confirmations, .explorerBaseUrl …
}
```

Intersect this base with any group-specific field. `config.pepper` is the only
sanctioned source of the member pepper — pass it to `resolveMemberIdHash`, never
read env in a handler.

## Runtime reader (`relay/governance-runtime.ts`)

`runtime.reader: GovernanceReader` — typed on-chain READ surface (no signing, no
gas). bytes32 args are 0x-hex; uint256/uint64 → `bigint`, uint32 → `number`.

```ts
reader.getEpoch(communityIdHash, epochNumber): Promise<EpochView>
reader.communities(communityIdHash): Promise<CommunityView>
reader.balanceOf(communityIdHash, memberIdHash): Promise<bigint>
reader.governanceBalanceAt(communityIdHash, memberIdHash, snapSeq, snapEpoch): Promise<bigint>
reader.recordExists(recordHash): Promise<boolean>
reader.memberSignerOf(communityIdHash, memberIdHash): Promise<string>   // address, 0x0 if unenrolled
reader.isApprover(communityIdHash, account): Promise<boolean>
```

`CommunityView` = `{ exists, currentEpochNumber, currentTotalSupply,
activePolicyVersion, inflationRateBps, maxAdvanceRateBps, memberMintCapRateBps,
minVoterCount, approverThreshold, owner }`.

`EpochView` = `{ active, epochNumber, openingSupply, inflationRateBps,
baseMintBudget, advanceDebtFromPrev, effectiveRegularBudget, maxAdvanceAmount,
regularMinted, advanceMinted }`.

Tests inject a fake runtime via `setGovernanceRuntimeForTesting` (or pass a fake
`ChainWriteDeps` to `setChainWriteDepsForTesting`) — supply a `reader` stub with
these methods. See `lib/api/chain/handlers.db.test.ts` for a literal.

## Context helpers (`context.ts`)

```ts
resolveCommunityContext(runtime, communityId): Promise<CommunityContext>  // throws NOT_FOUND (→404) if community absent
resolveMemberIdHash(communityId, memberId, pepper): Hex32                 // peppered; pepper = deps.config.pepper
freshNonce(): bigint                                                      // random uint256
deadline(ttlSeconds: number): bigint                                     // now + ttl, unix seconds

interface CommunityContext {
  readonly communityIdHash: Hex32;      // hashCommunityId(communityId) — the on-chain bytes32 key
  readonly approverThreshold: number;
  readonly activePolicyVersion: number;
  readonly currentEpochNumber: bigint;
  readonly baseMintBudget: bigint;
  readonly epochAdvanceMinted: bigint;
  readonly domain: Eip712Domain;        // sign against this
}
```

## Conventions (recap, authoritative in the task brief)

- **Server never signs member/approver authorizations.** `sign` endpoints RECEIVE
  a signature in the body → `recover*` (lib/blockchain/signing/recover) → verify
  role/identity → `addSignature` (signatures/signature-request-service).
- Amounts / uint256 cross JSON as **decimal strings**; validate with
  `zBigIntAmount` (core/validation). Never a JS number.
- Mutating endpoints support `Idempotency-Key` via `withIdempotency` +
  `createPrismaIdempotencyStore` (core/idempotency).
- Internal endpoints: `requireInternal`. Approver / second-approver identity:
  `requireVerifiedActor` (core/auth) — a forgeable header must never satisfy
  separation of duties. Community-admin: `resolveAuthFromHeaders` + admin check.
- Build the EIP-712 envelope with `mintEnvelope` / `reversalEnvelope` /
  `voteEnvelope` / `enrollEnvelope` / `rotateEnvelope` (signing/auth-envelope);
  persist via `createSignatureRequest`.
- Each group: pure handlers in `lib/api/<group>/handlers.ts`, a deps resolver
  reusing `resolveChainWriteDeps`, thin routes under `app/api/...`, and one
  `RUN_DB_TESTS`-gated `*.db.test.ts` (`describe.skipIf(process.env.RUN_DB_TESTS!=='1')`).
