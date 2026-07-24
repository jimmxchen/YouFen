import { describe, expect, it } from 'vitest';

import { EngineError } from './errors';
import { allocateLedgerSeq } from './ledger-seq';
import { makeFakeEngineDb } from './testing/fake-engine-db';

describe('allocateLedgerSeq', () => {
  it('increments monotonically per community and returns the new number', async () => {
    const db = makeFakeEngineDb();
    db.seedState({ communityId: 'c1', ledgerSeq: 0n });
    expect(await allocateLedgerSeq(db, 'c1')).toBe(1);
    expect(await allocateLedgerSeq(db, 'c1')).toBe(2);
    expect(await allocateLedgerSeq(db, 'c1')).toBe(3);
    expect(db.rows('communityTokenState')[0].ledgerSeq).toBe(3n);
  });

  it('is scoped per community', async () => {
    const db = makeFakeEngineDb();
    db.seedState({ communityId: 'c1', ledgerSeq: 5n });
    db.seedState({ communityId: 'c2', ledgerSeq: 0n });
    expect(await allocateLedgerSeq(db, 'c1')).toBe(6);
    expect(await allocateLedgerSeq(db, 'c2')).toBe(1);
  });

  it('throws EngineError NOT_FOUND when the community has no state row', async () => {
    const db = makeFakeEngineDb();
    await expect(allocateLedgerSeq(db, 'missing')).rejects.toMatchObject({
      name: 'EngineError',
      code: 'NOT_FOUND',
    });
    await expect(allocateLedgerSeq(db, 'missing')).rejects.toBeInstanceOf(EngineError);
  });
});
