import { describe, expect, it } from 'vitest';
import type { ClaudeClient } from './call-claude';
import { generateTokenRules } from './generate-rules';

function fakeClient(text: string): ClaudeClient {
  return { complete: async () => text };
}

function throwingClient(): ClaudeClient {
  return {
    complete: async () => {
      throw new Error('network down');
    },
  };
}

function rule(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Help other members',
    description: 'Assist another member with their work',
    tokenAmount: 50,
    evidenceRequired: true,
    abuseRisk: 'low',
    reasoning: 'peer support is core to the community',
    ...overrides,
  };
}

const input = { communityType: 'hackathon', communityGoal: 'ship projects' };

describe('generateTokenRules', () => {
  it('returns the validated rules from a JSON array', async () => {
    const rules = [
      rule({ name: 'A' }),
      rule({ name: 'B', tokenAmount: 300 }),
      rule({ name: 'C', tokenAmount: 10 }),
    ];
    const result = await generateTokenRules(fakeClient(JSON.stringify(rules)), input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(3);
      expect(result.data[0]?.name).toBe('A');
    }
  });

  it('accepts rules wrapped in a { rules: [...] } object', async () => {
    const payload = { rules: [rule({ name: 'X' }), rule({ name: 'Y' })] };
    const result = await generateTokenRules(fakeClient(JSON.stringify(payload)), input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(2);
    }
  });

  it('parses a fenced JSON block', async () => {
    const text = '```json\n' + JSON.stringify([rule()]) + '\n```';
    const result = await generateTokenRules(fakeClient(text), input);
    expect(result.ok).toBe(true);
  });

  it('drops individually invalid rules and keeps the valid ones', async () => {
    const rules = [
      rule({ name: 'good' }),
      rule({ name: 'too-big', tokenAmount: 9999 }),
      rule({ name: 'too-small', tokenAmount: 1 }),
      rule({ name: 'missing-evidence', evidenceRequired: undefined }),
    ];
    const result = await generateTokenRules(fakeClient(JSON.stringify(rules)), input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.name).toBe('good');
    }
  });

  it('degrades with null data when no valid rules survive', async () => {
    const rules = [rule({ tokenAmount: 5000 })];
    const result = await generateTokenRules(fakeClient(JSON.stringify(rules)), input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.degraded).toBe(true);
      expect(result.data).toBeNull();
    }
  });

  it('degrades when the LLM call fails', async () => {
    const result = await generateTokenRules(throwingClient(), input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('AI_UNAVAILABLE');
      expect(result.data).toBeNull();
    }
  });

  it('degrades on unparseable output', async () => {
    const result = await generateTokenRules(fakeClient('sorry, cannot help'), input);
    expect(result.ok).toBe(false);
  });
});
