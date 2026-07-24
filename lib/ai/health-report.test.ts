import { describe, expect, it } from 'vitest';
import type { ClaudeClient } from './call-claude';
import { generateHealthReport } from './health-report';
import type { EpochHealthInput } from './types';

function fakeClient(text: string): ClaudeClient {
  return { complete: async () => text };
}

function throwingClient(): ClaudeClient {
  return {
    complete: async () => {
      throw new Error('offline');
    },
  };
}

function input(overrides: Partial<EpochHealthInput> = {}): EpochHealthInput {
  return {
    communityName: 'AdventureX',
    epochNumber: 4,
    openingSupply: 100_000n,
    regularMintedAmount: 4_600n,
    advancedMintedAmount: 500n,
    advanceDebt: 500n,
    inflationRateBps: 500,
    distribution: [
      { label: 'volunteer', amount: 3_500n },
      { label: 'mentor', amount: 2_800n },
      { label: 'contributor', amount: 2_700n },
      { label: 'manager', amount: 1_000n },
    ],
    topThreeConcentrationBps: 3_140,
    previousTopThreeConcentrationBps: 3_820,
    ...overrides,
  };
}

describe('generateHealthReport', () => {
  it('computes deterministic metrics and uses the LLM narrative on success', async () => {
    const client = fakeClient(JSON.stringify({ reportText: 'LLM crafted narrative' }));
    const result = await generateHealthReport(client, input());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.degraded).toBe(false);
      expect(result.data.reportText).toBe('LLM crafted narrative');
      const m = result.data.metrics;
      expect(m.regularInflationBps).toBe(460);
      expect(m.advancedInflationBps).toBe(50);
      expect(m.totalSupplyGrowthBps).toBe(510);
      expect(m.usedFutureBudget).toBe(true);
    }
  });

  it('computes distribution shares in bps from the ledger amounts', async () => {
    const client = fakeClient(JSON.stringify({ reportText: 'ok' }));
    const result = await generateHealthReport(client, input());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const shares = result.data.metrics.distribution;
      const total = shares.reduce((sum, s) => sum + s.percentageBps, 0);
      // 3500/10000, 2800/10000, 2700/10000, 1000/10000 -> 3500+2800+2700+1000 = 10000 bps
      expect(total).toBe(10_000);
      expect(shares[0]).toEqual({ label: 'volunteer', percentageBps: 3_500 });
    }
  });

  it('degrades but keeps metrics and a deterministic report when the LLM fails', async () => {
    const result = await generateHealthReport(throwingClient(), input());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.degraded).toBe(true);
      expect(result.data).not.toBeNull();
      expect(result.data?.metrics.totalSupplyGrowthBps).toBe(510);
      expect(result.data?.reportText).toContain('AdventureX');
      expect(result.data?.reportText.length).toBeGreaterThan(0);
    }
  });

  it('degrades to the deterministic template on invalid JSON', async () => {
    const result = await generateHealthReport(fakeClient('just prose, no json'), input());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.data?.reportText).toContain('AdventureX');
    }
  });

  it('reports usedFutureBudget false and no debt risk when nothing was advanced', async () => {
    const client = fakeClient(JSON.stringify({ reportText: 'clean epoch' }));
    const result = await generateHealthReport(
      client,
      input({ advancedMintedAmount: 0n, advanceDebt: 0n }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.metrics.usedFutureBudget).toBe(false);
      expect(result.data.metrics.advancedInflationBps).toBe(0);
    }
  });
});
