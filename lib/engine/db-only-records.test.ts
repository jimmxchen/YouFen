import { describe, expect, it } from 'vitest';

import { canonicalize } from '../blockchain/hashing/canonicalize';
import { keccakUtf8 } from '../blockchain/hashing/record-hash';
import { createDbOnlyRecord, type DbOnlyRecordType } from './db-only-records';
import { makeFakeEngineDb } from './testing/fake-engine-db';

describe('createDbOnlyRecord', () => {
  it('creates a terminal recorded, chain-ineligible PublicRecord', async () => {
    const db = makeFakeEngineDb();
    const { id } = await createDbOnlyRecord(db, {
      communityId: 'c1',
      recordType: 'epoch_budget_created',
      sourceTable: 'TokenEpoch',
      sourceId: 'e1',
      payload: { epochNumber: 2, baseMintBudget: '1000' },
    });
    const rec = db.rows('publicRecord').find((r) => r.id === id);
    expect(rec).toBeDefined();
    expect(rec?.status).toBe('recorded');
    expect(rec?.chainEligible).toBe(false);
    expect(rec?.recordType).toBe('epoch_budget_created');
    expect(rec?.sourceTable).toBe('TokenEpoch');
    expect(rec?.sourceId).toBe('e1');
  });

  it('recordHash is recomputable from the stored envelopeJson', async () => {
    const db = makeFakeEngineDb();
    const { id } = await createDbOnlyRecord(db, {
      communityId: 'c1',
      recordType: 'inflation_rate_change',
      sourceTable: 'CommunityTokenPolicy',
      sourceId: 'pol1',
      payload: { rateBps: 250, effectiveEpoch: 3 },
    });
    const rec = db.rows('publicRecord').find((r) => r.id === id);
    const envelopeJson = rec?.envelopeJson as string;
    expect(rec?.recordHash).toBe(keccakUtf8(envelopeJson));
  });

  it('envelopeJson is the canonical form with the dbrecord schema tag', async () => {
    const db = makeFakeEngineDb();
    const payload = { note: 'x', amount: '5' };
    const { id } = await createDbOnlyRecord(db, {
      communityId: 'c1',
      recordType: 'budget_advance',
      sourceTable: 'TokenAdvanceRequest',
      sourceId: 'adv1',
      payload,
    });
    const rec = db.rows('publicRecord').find((r) => r.id === id);
    const expected = canonicalize({
      schema: 'youfen.dbrecord.v1',
      type: 'budget_advance',
      payload,
    } as never);
    expect(rec?.envelopeJson).toBe(expected);
  });

  it('accepts all five DB-only record types', async () => {
    const db = makeFakeEngineDb();
    const types: DbOnlyRecordType[] = [
      'epoch_budget_created',
      'budget_advance',
      'advance_debt_repayment',
      'inflation_rate_change',
      'proposal_created',
    ];
    for (const [i, t] of types.entries()) {
      const { id } = await createDbOnlyRecord(db, {
        communityId: 'c1',
        recordType: t,
        sourceTable: 'X',
        sourceId: `s${i}`,
        payload: { seq: i },
      });
      expect(id).toBeTruthy();
    }
    expect(db.rows('publicRecord')).toHaveLength(5);
    expect(db.rows('publicRecord').every((r) => r.status === 'recorded')).toBe(true);
    expect(db.rows('publicRecord').every((r) => r.chainEligible === false)).toBe(true);
  });
});
