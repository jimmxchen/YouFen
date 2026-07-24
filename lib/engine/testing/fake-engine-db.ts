// In-memory EngineDb fake for offline engine tests (W2-A). Never touches a real
// DB/Redis/chain. Two responsibilities:
//   1. Prisma-style model delegates over Map-backed tables, enforcing the frozen
//      @@unique constraints (P2002 on violation) and snapshot-rollback
//      transactions (serial model — one tx at a time).
//   2. A raw-SQL recognizer that matches EXACTLY the fixed statement set emitted
//      by sql.ts / ledger-seq.ts / db-locks.ts (the single source of truth).
//      Any statement outside that set throws a clear error, so a stray inline
//      $executeRaw in service code is caught in tests.
//
// bigint fields are stored as bigint; ledger/lock queries return raw stored rows
// (db-locks.ts normalizes). Immutability: rows handed out are shallow clones.

import type {
  EngineDb,
  EngineDelegate,
  EngineTx,
} from '../types';

type Row = Record<string, unknown>;

/** All model tables the fake serves. 15 EngineTx delegates + idempotencyKey
 *  (the [endpoint,key] unique the spec requires; used by W1-C). */
const TABLE_NAMES = [
  'member',
  'community',
  'contribution',
  'tokenMintEvent',
  'tokenReversalEvent',
  'memberTokenBalance',
  'communityTokenState',
  'communityTokenPolicy',
  'tokenPolicyVersion',
  'tokenAdvanceRequest',
  'tokenEpoch',
  'proposal',
  'proposalMemberSnapshot',
  'vote',
  'publicRecord',
  'idempotencyKey',
] as const;

type TableName = (typeof TABLE_NAMES)[number];

/** Composite/simple @@unique constraints per table (frozen contract). A row
 *  with any null component is exempt (Postgres NULLs never collide). */
const UNIQUE_SPECS: Partial<Record<TableName, ReadonlyArray<ReadonlyArray<string>>>> = {
  tokenMintEvent: [['contributionId', 'budgetSource']],
  vote: [['proposalId', 'memberId']],
  proposalMemberSnapshot: [['proposalId', 'memberId']],
  publicRecord: [['recordHash']],
  memberTokenBalance: [['communityId', 'memberId']],
  tokenPolicyVersion: [['policyId', 'version']],
  tokenEpoch: [['communityId', 'epochNumber']],
  idempotencyKey: [['endpoint', 'key']],
  tokenReversalEvent: [['originalMintEventId']],
  communityTokenPolicy: [['communityId']],
  communityTokenState: [['communityId']],
};

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

function clone(row: Row): Row {
  return { ...row };
}

/** Prisma-shaped unique-violation error. */
function p2002(table: TableName, fields: ReadonlyArray<string>): Error {
  const err = new Error(
    `Unique constraint failed on ${table}(${fields.join(',')})`,
  ) as Error & { code: string; meta: { target: string[] } };
  err.code = 'P2002';
  err.meta = { target: fields.map((f) => f) };
  return err;
}

/** Prisma-shaped not-found error, thrown by update/delete when the target row
 *  does not exist. Distinct from P2002 (unique violation) so callers that use
 *  isP2002 to detect duplicates never misclassify a genuine miss. */
function p2025(): Error {
  const err = new Error(
    'An operation failed because it depends on one or more records that were required but not found.',
  ) as Error & { code: string; meta: { cause: string } };
  err.code = 'P2025';
  err.meta = { cause: 'Record to update not found.' };
  return err;
}

/** Prisma filter operators supported by the fake's `matchesWhere`. */
const FILTER_OPERATORS = ['equals', 'not', 'in', 'notIn', 'gt', 'gte', 'lt', 'lte'] as const;

/** True when `obj` is a Prisma filter-operator object (every key is a known
 *  operator), e.g. `{ gte: 2, lt: 5 }` — as opposed to a nested composite-key
 *  locator like `{ communityId_memberId: { ... } }` whose keys are columns. */
function isOperatorObject(obj: Record<string, unknown>): boolean {
  const keys = Object.keys(obj);
  if (keys.length === 0) return false;
  return keys.every((k) => (FILTER_OPERATORS as ReadonlyArray<string>).includes(k));
}

/** Ordered comparison for scalar values (bigint/number/string/Date). Returns a
 *  negative/zero/positive number like Array.sort's comparator. */
function compareScalar(a: unknown, b: unknown): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'bigint' && typeof b === 'bigint') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  // Mixed bigint/number (Prisma stores counts as either) — compare numerically.
  if (
    (typeof a === 'bigint' || typeof a === 'number') &&
    (typeof b === 'bigint' || typeof b === 'number')
  ) {
    const an = Number(a);
    const bn = Number(b);
    return an - bn;
  }
  return 0;
}

/** Evaluate a single field's Prisma filter-operator object against `actual`. */
function matchesOperators(actual: unknown, ops: Record<string, unknown>): boolean {
  for (const [op, operand] of Object.entries(ops)) {
    switch (op) {
      case 'equals':
        if (!valueEquals(actual, operand)) return false;
        break;
      case 'not':
        if (valueEquals(actual, operand)) return false;
        break;
      case 'in':
        if (!(operand as unknown[]).some((v) => valueEquals(actual, v))) return false;
        break;
      case 'notIn':
        if ((operand as unknown[]).some((v) => valueEquals(actual, v))) return false;
        break;
      case 'gt':
        if (!(compareScalar(actual, operand) > 0)) return false;
        break;
      case 'gte':
        if (!(compareScalar(actual, operand) >= 0)) return false;
        break;
      case 'lt':
        if (!(compareScalar(actual, operand) < 0)) return false;
        break;
      case 'lte':
        if (!(compareScalar(actual, operand) <= 0)) return false;
        break;
      default:
        throw new Error(`Unsupported Prisma filter operator in fake-engine-db: ${op}`);
    }
  }
  return true;
}

/** Match `row` against a Prisma `where`. Supports: scalar equality; nested
 *  composite-unique locators ({ communityId_memberId: { ... } }); and per-field
 *  filter-operator objects ({ in, notIn, not, gt, gte, lt, lte, equals }).
 *  bigint/number/string/boolean/Date compared by value. */
function matchesWhere(row: Row, where: Row): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond)) {
      const obj = cond as Record<string, unknown>;
      if (isOperatorObject(obj)) {
        // Per-field filter, e.g. { epochNumber: { gte: 2 } }.
        if (!matchesOperators(row[key], obj)) return false;
      } else {
        // Composite unique locator, e.g. { communityId_memberId: { ... } }.
        if (!matchesWhere(row, obj as Row)) return false;
      }
      continue;
    }
    if (!valueEquals(row[key], cond)) return false;
  }
  return true;
}

function valueEquals(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

/** Apply Prisma orderBy (single `{ field: 'asc'|'desc' }` or an array of them)
 *  then a `take` limit, returning a new array (no in-place mutation). */
function orderAndTake(rows: Row[], args: { orderBy?: unknown; take?: unknown }): Row[] {
  let out = rows;
  const { orderBy, take } = args;
  if (orderBy !== undefined && orderBy !== null) {
    const clauses = (Array.isArray(orderBy) ? orderBy : [orderBy]) as Array<Record<string, unknown>>;
    out = [...out].sort((a, b) => {
      for (const clause of clauses) {
        for (const [field, dir] of Object.entries(clause)) {
          const cmp = compareScalar(a[field], b[field]);
          if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
        }
      }
      return 0;
    });
  }
  if (typeof take === 'number') out = out.slice(0, take);
  return out;
}

/** Apply a Prisma-style data patch (scalar set or {increment}/{decrement}/{set}). */
function applyData(row: Row, data: Row): Row {
  const next: Row = { ...row };
  for (const [key, val] of Object.entries(data)) {
    if (val !== null && typeof val === 'object' && !(val instanceof Date) && !Array.isArray(val)) {
      const op = val as Record<string, unknown>;
      if ('increment' in op) {
        next[key] = (next[key] as bigint) + (op.increment as bigint);
      } else if ('decrement' in op) {
        next[key] = (next[key] as bigint) - (op.decrement as bigint);
      } else if ('set' in op) {
        next[key] = op.set;
      } else {
        next[key] = val;
      }
    } else {
      next[key] = val;
    }
  }
  return next;
}

interface RawHandler {
  test(norm: string): boolean;
  run(values: unknown[], tables: Map<TableName, Map<string, Row>>): unknown;
}

/** Rows of a table as an array (insertion order preserved by Map). */
function tableRows(tables: Map<TableName, Map<string, Row>>, name: TableName): Row[] {
  return [...(tables.get(name) as Map<string, Row>).values()];
}

/** The fixed raw-SQL statement set. Recognized by distinctive anchors so the
 *  fake stays robust to whitespace while still rejecting any unknown statement. */
const RAW_HANDLERS: ReadonlyArray<RawHandler> = [
  // --- sql.ts: incrementRegularMintedGuarded (values: [amount, epochId, amount])
  {
    test: (n) =>
      n.includes('"TokenEpoch"') &&
      n.includes('"regularMintedAmount"') &&
      n.includes('"effectiveRegularBudget"'),
    run: (values, tables) => {
      const amount = values[0] as bigint;
      const epochId = values[1] as string;
      const row = tableRows(tables, 'tokenEpoch').find((r) => r.id === epochId);
      if (!row) return 0;
      if ((row.regularMintedAmount as bigint) + amount <= (row.effectiveRegularBudget as bigint)) {
        row.regularMintedAmount = (row.regularMintedAmount as bigint) + amount;
        return 1;
      }
      return 0;
    },
  },
  // --- sql.ts: incrementAdvancedMintedGuarded (values: [amount, epochId, amount])
  {
    test: (n) =>
      n.includes('"TokenEpoch"') &&
      n.includes('"advancedMintedAmount"') &&
      n.includes('"maxAdvanceAmount"'),
    run: (values, tables) => {
      const amount = values[0] as bigint;
      const epochId = values[1] as string;
      const row = tableRows(tables, 'tokenEpoch').find((r) => r.id === epochId);
      if (!row) return 0;
      if ((row.advancedMintedAmount as bigint) + amount <= (row.maxAdvanceAmount as bigint)) {
        row.advancedMintedAmount = (row.advancedMintedAmount as bigint) + amount;
        return 1;
      }
      return 0;
    },
  },
  // --- sql.ts: activatePendingGovernance (values: [communityId])
  {
    test: (n) =>
      n.includes('"MemberTokenBalance"') &&
      n.includes('"activeGovernanceBalance"') &&
      n.includes('"pendingGovernanceBalance"') &&
      n.includes('SET'),
    run: (values, tables) => {
      const communityId = values[0] as string;
      let count = 0;
      for (const row of tableRows(tables, 'memberTokenBalance')) {
        if (row.communityId === communityId && (row.pendingGovernanceBalance as bigint) > 0n) {
          row.activeGovernanceBalance =
            (row.activeGovernanceBalance as bigint) + (row.pendingGovernanceBalance as bigint);
          row.pendingGovernanceBalance = 0n;
          count += 1;
        }
      }
      return count;
    },
  },
  // --- sql.ts: endProposalIfDue (values: [proposalId, now]) — check BEFORE the
  //     generic transition handler since both target "Proposal".
  {
    test: (n) =>
      n.includes('"Proposal"') && n.includes("'ended'") && n.includes('"endTime"'),
    run: (values, tables) => {
      const proposalId = values[0] as string;
      const now = values[1] as Date;
      const row = tableRows(tables, 'proposal').find((r) => r.id === proposalId);
      if (!row || row.status !== 'active') return 0;
      const endTime = row.endTime as Date | null;
      if (endTime !== null && endTime.getTime() <= now.getTime()) {
        row.status = 'ended';
        return 1;
      }
      return 0;
    },
  },
  // --- sql.ts: transitionProposalStatus (values: [to, proposalId, from])
  {
    test: (n) => n.includes('"Proposal"') && n.includes('SET') && n.includes('"status"'),
    run: (values, tables) => {
      const to = values[0] as string;
      const proposalId = values[1] as string;
      const from = values[2] as string;
      const row = tableRows(tables, 'proposal').find((r) => r.id === proposalId);
      if (!row || row.status !== from) return 0;
      row.status = to;
      return 1;
    },
  },
  // --- ledger-seq.ts: allocateLedgerSeq (values: [communityId]) — UPDATE ... RETURNING
  {
    test: (n) =>
      n.includes('"CommunityTokenState"') &&
      n.includes('"ledgerSeq"') &&
      n.includes('RETURNING'),
    run: (values, tables) => {
      const communityId = values[0] as string;
      const row = tableRows(tables, 'communityTokenState').find(
        (r) => r.communityId === communityId,
      );
      if (!row) return [];
      row.ledgerSeq = (row.ledgerSeq as bigint) + 1n;
      return [{ ledgerSeq: row.ledgerSeq }];
    },
  },
  // --- db-locks.ts: lockActiveEpoch (values: [communityId]) — SELECT, status='active'
  {
    test: (n) =>
      n.includes('SELECT') && n.includes('"TokenEpoch"') && n.includes("'active'"),
    run: (values, tables) => {
      const communityId = values[0] as string;
      return tableRows(tables, 'tokenEpoch')
        .filter((r) => r.communityId === communityId && r.status === 'active')
        .map(clone);
    },
  },
  // --- db-locks.ts: lockEpochById (values: [epochId]) — SELECT by id only
  {
    test: (n) => n.includes('SELECT') && n.includes('"TokenEpoch"'),
    run: (values, tables) => {
      const epochId = values[0] as string;
      return tableRows(tables, 'tokenEpoch')
        .filter((r) => r.id === epochId)
        .map(clone);
    },
  },
  // --- db-locks.ts: lockBalance (values: [communityId, memberId])
  {
    test: (n) => n.includes('SELECT') && n.includes('"MemberTokenBalance"'),
    run: (values, tables) => {
      const communityId = values[0] as string;
      const memberId = values[1] as string;
      return tableRows(tables, 'memberTokenBalance')
        .filter((r) => r.communityId === communityId && r.memberId === memberId)
        .map(clone);
    },
  },
  // --- db-locks.ts: lockState (values: [communityId]) — SELECT (no RETURNING)
  {
    test: (n) => n.includes('SELECT') && n.includes('"CommunityTokenState"'),
    run: (values, tables) => {
      const communityId = values[0] as string;
      return tableRows(tables, 'communityTokenState')
        .filter((r) => r.communityId === communityId)
        .map(clone);
    },
  },
  // --- db-locks.ts: lockMintEvent (values: [id])
  {
    test: (n) => n.includes('SELECT') && n.includes('"TokenMintEvent"'),
    run: (values, tables) => {
      const id = values[0] as string;
      return tableRows(tables, 'tokenMintEvent')
        .filter((r) => r.id === id)
        .map(clone);
    },
  },
  // --- db-locks.ts: lockProposal (values: [proposalId]) — SELECT by id, FOR
  //     UPDATE. Distinct from the endProposalIfDue / transitionProposalStatus
  //     UPDATEs above (those carry SET), so this SELECT-only anchor is unambiguous.
  {
    test: (n) => n.includes('SELECT') && n.includes('"Proposal"'),
    run: (values, tables) => {
      const id = values[0] as string;
      return tableRows(tables, 'proposal')
        .filter((r) => r.id === id)
        .map(clone);
    },
  },
];

function normalizeSql(strings: TemplateStringsArray): string {
  return strings.join(' ? ').replace(/\s+/g, ' ').trim();
}

/** The concrete fake: the 15 EngineDb delegates + idempotencyKey ([endpoint,key]
 *  unique the spec requires, consumed by W1-C) + raw surface + seed helpers. */
export interface FakeEngineDb extends EngineDb {
  readonly idempotencyKey: EngineDelegate;
  /** Test-only snapshot of a table's current rows (clones). */
  rows(table: TableName): Row[];
  seedCommunity(row: Partial<Row> & { id?: string }): Row;
  seedMember(row: Partial<Row> & { id?: string; communityId: string }): Row;
  seedEpoch(row: Partial<Row> & { id?: string; communityId: string }): Row;
  seedBalance(row: Partial<Row> & { communityId: string; memberId: string }): Row;
  seedPolicy(row: Partial<Row> & { communityId: string }): Row;
  seedState(row: Partial<Row> & { communityId: string }): Row;
  seedContribution(row: Partial<Row> & { id?: string; communityId: string }): Row;
  seedAdvanceRequest(row: Partial<Row> & { id?: string; communityId: string }): Row;
}

export function makeFakeEngineDb(): FakeEngineDb {
  const tables = new Map<TableName, Map<string, Row>>();
  for (const name of TABLE_NAMES) tables.set(name, new Map());

  /** Throw P2002 if inserting `row` violates any unique constraint on `table`. */
  function assertUnique(table: TableName, row: Row, ignoreId?: string): void {
    const specs = UNIQUE_SPECS[table];
    if (!specs) return;
    for (const fields of specs) {
      if (fields.some((f) => row[f] === null || row[f] === undefined)) continue;
      for (const existing of (tables.get(table) as Map<string, Row>).values()) {
        if (existing.id === ignoreId) continue;
        if (fields.every((f) => valueEquals(existing[f], row[f]))) {
          throw p2002(table, fields);
        }
      }
    }
  }

  function makeDelegate(table: TableName): EngineDelegate {
    const store = tables.get(table) as Map<string, Row>;
    // All methods are async so synchronous validation throws (P2002) surface as
    // promise rejections, matching Prisma's contract.
    return {
      create: async (args: unknown): Promise<unknown> => {
        const { data } = args as { data: Row };
        const row: Row = { ...data };
        if (row.id === undefined) row.id = nextId(table);
        assertUnique(table, row);
        store.set(row.id as string, row);
        return clone(row);
      },
      createMany: async (args: unknown): Promise<unknown> => {
        const { data } = args as { data: Row[] };
        let count = 0;
        for (const d of data) {
          const row: Row = { ...d };
          if (row.id === undefined) row.id = nextId(table);
          assertUnique(table, row);
          store.set(row.id as string, row);
          count += 1;
        }
        return { count };
      },
      findUnique: async (args: unknown): Promise<unknown> => {
        const { where } = args as { where: Row };
        const hit = [...store.values()].find((r) => matchesWhere(r, where));
        return hit ? clone(hit) : null;
      },
      findFirst: async (args: unknown): Promise<unknown> => {
        const { where, orderBy } = (args ?? {}) as { where?: Row; orderBy?: unknown };
        const matched = [...store.values()].filter((r) => (where ? matchesWhere(r, where) : true));
        const hit = orderAndTake(matched, { orderBy, take: 1 })[0];
        return hit ? clone(hit) : null;
      },
      findMany: async (args: unknown): Promise<unknown> => {
        const { where, orderBy, take } = (args ?? {}) as {
          where?: Row;
          orderBy?: unknown;
          take?: unknown;
        };
        const matched = [...store.values()].filter((r) => (where ? matchesWhere(r, where) : true));
        return orderAndTake(matched, { orderBy, take }).map(clone);
      },
      update: async (args: unknown): Promise<unknown> => {
        const { where, data } = args as { where: Row; data: Row };
        const target = [...store.values()].find((r) => matchesWhere(r, where));
        // Prisma throws P2025 (not P2002) when the target row is not found.
        if (!target) throw p2025();
        const updated = applyData(target, data);
        assertUnique(table, updated, target.id as string);
        store.set(target.id as string, updated);
        return clone(updated);
      },
      updateMany: async (args: unknown): Promise<unknown> => {
        const { where, data } = args as { where?: Row; data: Row };
        let count = 0;
        for (const target of [...store.values()]) {
          if (where && !matchesWhere(target, where)) continue;
          const updated = applyData(target, data);
          store.set(target.id as string, updated);
          count += 1;
        }
        return { count };
      },
    };
  }

  function runRaw(strings: TemplateStringsArray, values: unknown[]): unknown {
    const norm = normalizeSql(strings);
    const handler = RAW_HANDLERS.find((h) => h.test(norm));
    if (!handler) {
      throw new Error(`Unregistered SQL statement in fake-engine-db: ${norm}`);
    }
    return handler.run(values, tables);
  }

  const delegates = {} as Record<TableName, EngineDelegate>;
  for (const name of TABLE_NAMES) delegates[name] = makeDelegate(name);

  function seed(table: TableName, defaults: Row, row: Row): Row {
    const merged: Row = { ...defaults, ...row };
    if (merged.id === undefined) merged.id = nextId(table);
    assertUnique(table, merged);
    (tables.get(table) as Map<string, Row>).set(merged.id as string, merged);
    return clone(merged);
  }

  const txSurface: EngineTx = {
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]): Promise<number> =>
      runRaw(strings, values) as number,
    $queryRaw: async <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T> =>
      runRaw(strings, values) as T,
    member: delegates.member,
    community: delegates.community,
    contribution: delegates.contribution,
    tokenMintEvent: delegates.tokenMintEvent,
    tokenReversalEvent: delegates.tokenReversalEvent,
    memberTokenBalance: delegates.memberTokenBalance,
    communityTokenState: delegates.communityTokenState,
    communityTokenPolicy: delegates.communityTokenPolicy,
    tokenPolicyVersion: delegates.tokenPolicyVersion,
    tokenAdvanceRequest: delegates.tokenAdvanceRequest,
    tokenEpoch: delegates.tokenEpoch,
    proposal: delegates.proposal,
    proposalMemberSnapshot: delegates.proposalMemberSnapshot,
    vote: delegates.vote,
    publicRecord: delegates.publicRecord,
  };

  function snapshot(): Map<TableName, Map<string, Row>> {
    const copy = new Map<TableName, Map<string, Row>>();
    for (const [name, store] of tables) {
      const inner = new Map<string, Row>();
      for (const [id, row] of store) inner.set(id, { ...row });
      copy.set(name, inner);
    }
    return copy;
  }

  function restore(snap: Map<TableName, Map<string, Row>>): void {
    for (const [name, store] of snap) tables.set(name, store);
  }

  const fake: FakeEngineDb = {
    ...txSurface,
    idempotencyKey: delegates.idempotencyKey,
    $transaction: async <T>(fn: (tx: EngineTx) => Promise<T>): Promise<T> => {
      const snap = snapshot();
      try {
        return await fn(fake);
      } catch (err) {
        restore(snap);
        throw err;
      }
    },
    rows: (table: TableName): Row[] => tableRows(tables, table).map(clone),
    seedCommunity: (row) =>
      seed('community', { slug: nextId('slug'), name: 'C', isPublic: true }, row),
    seedMember: (row) =>
      seed('member', { displayName: 'M', role: 'member', contributionCount: 0 }, row),
    seedEpoch: (row) =>
      seed(
        'tokenEpoch',
        {
          epochNumber: 1,
          openingSupply: 0n,
          baseMintBudget: 0n,
          advanceDebtFromPreviousEpoch: 0n,
          effectiveRegularBudget: 0n,
          maxAdvanceAmount: 0n,
          regularMintedAmount: 0n,
          advancedMintedAmount: 0n,
          unusedRegularBudget: 0n,
          inflationRateBps: 0,
          status: 'active',
          startTime: null,
          endTime: null,
        },
        row,
      ),
    seedBalance: (row) =>
      seed(
        'memberTokenBalance',
        {
          // BalanceRow (W1-B) field names — lockBalance normalizes these.
          totalBalance: 0n,
          activeGovernanceBalance: 0n,
          pendingGovernanceBalance: 0n,
          tokensEarnedCurrentEpoch: 0n,
          tokensEarnedLifetime: 0n,
          tokensReversedLifetime: 0n,
        },
        row,
      ),
    seedPolicy: (row) =>
      seed(
        'communityTokenPolicy',
        {
          tokenName: 'T',
          tokenSymbol: 'T',
          initialSupply: 0n,
          currentTotalSupply: 0n,
          epochDurationDays: 30,
          monthlyInflationRateBps: 0,
          maxAdvanceRateBps: 0,
          memberMintCapRateBps: 0,
          policyVersion: 1,
          effectiveEpoch: 1,
          rules: [],
        },
        row,
      ),
    seedState: (row) =>
      seed('communityTokenState', { currentTotalSupply: 0n, ledgerSeq: 0n }, row),
    seedContribution: (row) =>
      seed(
        'contribution',
        {
          description: 'c',
          suggestedTokenAmount: 0n,
          status: 'pending',
          submittedBy: 'u',
        },
        row,
      ),
    seedAdvanceRequest: (row) =>
      seed(
        'tokenAdvanceRequest',
        {
          epochId: 'e',
          memberId: 'm',
          requestedAmount: 0n,
          advanceRateBps: 0,
          reason: 'r',
          status: 'draft',
          requestedBy: 'u',
        },
        row,
      ),
  };

  return fake;
}

// ================================================================
// Fake ports (RecordsPort + BuildEnvelopePort) for engine service tests
// ================================================================

import type { BuildEnvelopePort, Hex32, RecordsPort } from '../types';

export interface FakeRecordsPort extends RecordsPort {
  /** Ordered log of requestSubmission(recordId) calls. */
  readonly submissions: string[];
  readonly created: Array<{ id: string; recordHash: string; status: string }>;
}

/** In-memory RecordsPort: records createPendingRecord rows and the exact
 *  sequence of requestSubmission calls (records.requestSubmission ordering is
 *  asserted by W3 service tests). */
export function makeFakeRecordsPort(): FakeRecordsPort {
  const created: Array<{ id: string; recordHash: string; status: string }> = [];
  const submissions: string[] = [];
  let seq = 0;
  return {
    submissions,
    created,
    createPendingRecord: (_tx, input) => {
      seq += 1;
      const id = `rec_${seq}`;
      created.push({ id, recordHash: input.recordHash, status: 'pending' });
      return Promise.resolve({ id });
    },
    requestSubmission: (recordId: string) => {
      submissions.push(recordId);
      return Promise.resolve({ queued: true, jobId: `job_${recordId}` });
    },
    markSuperseded: () => Promise.resolve(),
    getById: (id: string) => {
      const hit = created.find((c) => c.id === id);
      return Promise.resolve(hit ? { id: hit.id, status: hit.status, recordHash: hit.recordHash } : null);
    },
  };
}

/** Deterministic BuildEnvelopePort: monotonically increasing hashes so tests
 *  need not compute keccak. */
export function makeFakeBuildEnvelope(): BuildEnvelopePort {
  let n = 0;
  return (source) => {
    n += 1;
    const suffix = n.toString(16).padStart(64, '0');
    return {
      envelope: { schema: 'youfen.record.v1', type: source.kind, payload: {} },
      recordHash: (`0x${suffix}`) as Hex32,
    };
  };
}
