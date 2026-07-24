import { afterEach, describe, expect, it } from 'vitest';
import {
  callClaude,
  createAnthropicClient,
  parseJsonLoose,
  resolveModelId,
  type ClaudeClient,
} from './call-claude';

/** Programmable fake — never touches the network. */
function fakeClient(behavior: () => Promise<string>): ClaudeClient {
  return { complete: () => behavior() };
}

describe('resolveModelId', () => {
  const original = process.env.AI_MODEL_ID;
  afterEach(() => {
    if (original === undefined) {
      delete process.env.AI_MODEL_ID;
    } else {
      process.env.AI_MODEL_ID = original;
    }
  });

  it('defaults to claude-sonnet-5 when env is unset', () => {
    delete process.env.AI_MODEL_ID;
    expect(resolveModelId()).toBe('claude-sonnet-5');
  });

  it('honors the AI_MODEL_ID env override', () => {
    process.env.AI_MODEL_ID = 'claude-opus-test';
    expect(resolveModelId()).toBe('claude-opus-test');
  });
});

describe('callClaude', () => {
  it('returns ok with the model text on a normal response', async () => {
    const client = fakeClient(async () => 'hello world');
    const result = await callClaude(client, 'prompt');
    expect(result).toEqual({ ok: true, text: 'hello world' });
  });

  it('degrades on an empty response', async () => {
    const client = fakeClient(async () => '');
    const result = await callClaude(client, 'prompt');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('AI_UNAVAILABLE');
    }
  });

  it('degrades on a whitespace-only response', async () => {
    const client = fakeClient(async () => '   \n\t ');
    const result = await callClaude(client, 'prompt');
    expect(result.ok).toBe(false);
  });

  it('never throws when the client rejects', async () => {
    const client = fakeClient(async () => {
      throw new Error('boom');
    });
    const result = await callClaude(client, 'prompt');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('boom');
    }
  });

  it('never throws when the client throws synchronously', async () => {
    const client: ClaudeClient = {
      complete: () => {
        throw new Error('sync failure');
      },
    };
    const result = await callClaude(client, 'prompt');
    expect(result.ok).toBe(false);
  });

  it('degrades on timeout when the client hangs', async () => {
    const client = fakeClient(() => new Promise<string>(() => {}));
    const result = await callClaude(client, 'prompt', { timeoutMs: 10 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('AI_UNAVAILABLE');
    }
  });
});

describe('parseJsonLoose', () => {
  it('parses plain JSON', () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses a ```json fenced block', () => {
    const text = '```json\n{"a":2}\n```';
    expect(parseJsonLoose(text)).toEqual({ a: 2 });
  });

  it('parses a bare ``` fenced block', () => {
    const text = '```\n[1,2,3]\n```';
    expect(parseJsonLoose(text)).toEqual([1, 2, 3]);
  });

  it('extracts a JSON object embedded in surrounding prose', () => {
    const text = 'Here you go:\n{"a":3}\nHope that helps.';
    expect(parseJsonLoose(text)).toEqual({ a: 3 });
  });

  it('returns null for unparseable text', () => {
    expect(parseJsonLoose('not json at all')).toBeNull();
  });
});

describe('createAnthropicClient', () => {
  it('builds a client without performing any network call', () => {
    const client = createAnthropicClient({ apiKey: 'sk-test', modelId: 'claude-sonnet-5' });
    expect(typeof client.complete).toBe('function');
  });
});
