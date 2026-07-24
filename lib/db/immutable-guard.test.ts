import { describe, it, expect } from 'vitest';
import { assertLedgerMutation } from './immutable-guard';

// Pure-function coverage for the ledger immutability guard. No DB required:
// assertLedgerMutation is the extracted core the Prisma $extends hook calls.
describe('assertLedgerMutation', () => {
  describe('TokenMintEvent (append-only, whitelist { governanceStatus, publicRecordId })', () => {
    it('allows updating governanceStatus', () => {
      expect(() =>
        assertLedgerMutation('TokenMintEvent', 'update', { governanceStatus: 'pending' }),
      ).not.toThrow();
    });

    it('allows updating publicRecordId', () => {
      expect(() =>
        assertLedgerMutation('TokenMintEvent', 'update', { publicRecordId: 'rec_1' }),
      ).not.toThrow();
    });

    it('allows updating both whitelisted fields together', () => {
      expect(() =>
        assertLedgerMutation('TokenMintEvent', 'update', {
          governanceStatus: 'active',
          publicRecordId: 'rec_2',
        }),
      ).not.toThrow();
    });

    it('rejects updating a non-whitelisted field (amount)', () => {
      expect(() =>
        assertLedgerMutation('TokenMintEvent', 'update', { amount: 10n }),
      ).toThrow(/amount/);
    });

    it('rejects updates mixing a whitelisted and a forbidden field', () => {
      expect(() =>
        assertLedgerMutation('TokenMintEvent', 'update', {
          governanceStatus: 'active',
          reason: 'nope',
        }),
      ).toThrow(/reason/);
    });

    it('rejects delete', () => {
      expect(() => assertLedgerMutation('TokenMintEvent', 'delete', undefined)).toThrow();
    });

    it('rejects deleteMany', () => {
      expect(() => assertLedgerMutation('TokenMintEvent', 'deleteMany', undefined)).toThrow();
    });
  });

  describe('TokenReversalEvent / TokenPolicyVersion (whitelist { publicRecordId })', () => {
    it('allows TokenReversalEvent publicRecordId backfill', () => {
      expect(() =>
        assertLedgerMutation('TokenReversalEvent', 'update', { publicRecordId: 'r' }),
      ).not.toThrow();
    });

    it('rejects TokenReversalEvent updating other fields', () => {
      expect(() =>
        assertLedgerMutation('TokenReversalEvent', 'update', { reason: 'x' }),
      ).toThrow(/reason/);
    });

    it('allows TokenPolicyVersion publicRecordId backfill', () => {
      expect(() =>
        assertLedgerMutation('TokenPolicyVersion', 'update', { publicRecordId: 'r' }),
      ).not.toThrow();
    });

    it('rejects TokenPolicyVersion updating rules', () => {
      expect(() =>
        assertLedgerMutation('TokenPolicyVersion', 'update', { rules: [] }),
      ).toThrow(/rules/);
    });

    it('rejects TokenReversalEvent delete', () => {
      expect(() =>
        assertLedgerMutation('TokenReversalEvent', 'delete', undefined),
      ).toThrow();
    });
  });

  describe('Vote / ProposalMemberSnapshot (fully immutable)', () => {
    it('rejects any Vote update', () => {
      expect(() =>
        assertLedgerMutation('Vote', 'update', { optionId: 'approve' }),
      ).toThrow();
    });

    it('rejects any ProposalMemberSnapshot update', () => {
      expect(() =>
        assertLedgerMutation('ProposalMemberSnapshot', 'update', {
          activeGovernanceToken: 1n,
        }),
      ).toThrow();
    });

    it('rejects Vote deleteMany', () => {
      expect(() => assertLedgerMutation('Vote', 'deleteMany', undefined)).toThrow();
    });

    it('rejects ProposalMemberSnapshot delete', () => {
      expect(() =>
        assertLedgerMutation('ProposalMemberSnapshot', 'delete', undefined),
      ).toThrow();
    });
  });

  describe('PublicRecord (restricted update whitelist, delete allowed)', () => {
    it('allows updating status', () => {
      expect(() =>
        assertLedgerMutation('PublicRecord', 'update', { status: 'verified' }),
      ).not.toThrow();
    });

    it('allows updating the full lifecycle field set', () => {
      expect(() =>
        assertLedgerMutation('PublicRecord', 'update', {
          status: 'confirming',
          txHash: '0xabc',
          blockNumber: 1,
          blockHash: '0xdef',
          assignedNonce: 2,
          submittedAt: new Date(),
          confirmedAt: new Date(),
          attemptEpoch: 3,
          supersededByRecordId: 'r2',
          lastError: 'boom',
        }),
      ).not.toThrow();
    });

    it('rejects updating an immutable field (recordHash)', () => {
      expect(() =>
        assertLedgerMutation('PublicRecord', 'update', { recordHash: '0x00' }),
      ).toThrow(/recordHash/);
    });

    it('rejects updating envelopeJson', () => {
      expect(() =>
        assertLedgerMutation('PublicRecord', 'update', { envelopeJson: '{}' }),
      ).toThrow(/envelopeJson/);
    });
  });

  describe('non-ledger models pass through', () => {
    it('allows arbitrary Contribution update', () => {
      expect(() =>
        assertLedgerMutation('Contribution', 'update', { status: 'approved', approvedTokenAmount: 5n }),
      ).not.toThrow();
    });

    it('allows Community delete', () => {
      expect(() => assertLedgerMutation('Community', 'delete', undefined)).not.toThrow();
    });

    it('allows MemberTokenBalance update of any field', () => {
      expect(() =>
        assertLedgerMutation('MemberTokenBalance', 'update', { totalBalance: 99n }),
      ).not.toThrow();
    });
  });

  describe('upsert update clause is guarded', () => {
    it('rejects an upsert whose update clause touches a forbidden field', () => {
      expect(() =>
        assertLedgerMutation('TokenMintEvent', 'upsert', { amount: 1n }),
      ).toThrow(/amount/);
    });

    it('allows an upsert whose update clause is whitelisted', () => {
      expect(() =>
        assertLedgerMutation('TokenMintEvent', 'upsert', { governanceStatus: 'active' }),
      ).not.toThrow();
    });
  });
});
