// Anthropic SDK wrapper (ARCHITECTURE §9). `callClaude` never throws: any
// exception, timeout, or empty response collapses into a degraded result so the
// deterministic layers above always keep control. Model id is env-configurable.

import Anthropic from '@anthropic-ai/sdk';

/** Options every completion call carries. */
export interface ClaudeCompleteOptions {
  readonly maxTokens: number;
  readonly timeoutMs: number;
}

/** The narrow seam the AI modules depend on — trivially fakeable in tests. */
export interface ClaudeClient {
  complete(prompt: string, opts: ClaudeCompleteOptions): Promise<string>;
}

export interface AnthropicClientConfig {
  readonly apiKey: string;
  readonly modelId: string;
}

const DEFAULT_MODEL_ID = 'claude-sonnet-5';
const DEFAULT_MAX_TOKENS = 2_048;
const DEFAULT_TIMEOUT_MS = 30_000;

/** Model id from AI_MODEL_ID, else the frozen default. */
export function resolveModelId(): string {
  const fromEnv = process.env.AI_MODEL_ID;
  return fromEnv !== undefined && fromEnv.length > 0 ? fromEnv : DEFAULT_MODEL_ID;
}

class TimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`AI call timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

/** Reject once the deadline elapses; clears the timer on settle. */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(timeoutMs)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

/** Real client backed by @anthropic-ai/sdk; picks the first text block. */
export function createAnthropicClient(config: AnthropicClientConfig): ClaudeClient {
  const anthropic = new Anthropic({ apiKey: config.apiKey });
  return {
    async complete(prompt, opts): Promise<string> {
      const call = anthropic.messages.create({
        model: config.modelId,
        max_tokens: opts.maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });
      const message = await withTimeout(call, opts.timeoutMs);
      const textBlock = message.content.find(
        (block): block is Anthropic.TextBlock => block.type === 'text',
      );
      return textBlock ? textBlock.text : '';
    },
  };
}

export interface CallClaudeOptions {
  readonly maxTokens?: number;
  readonly timeoutMs?: number;
}

/** Discriminated outcome of a single completion; the error arm never leaks internals. */
export type ClaudeCallResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly code: 'AI_UNAVAILABLE'; readonly message: string };

/**
 * Invoke the client with a hard timeout. Synchronous throws, rejections,
 * timeouts, and empty/whitespace responses all resolve to `ok: false` — this
 * function is contractually non-throwing.
 */
export async function callClaude(
  client: ClaudeClient,
  prompt: string,
  opts: CallClaudeOptions = {},
): Promise<ClaudeCallResult> {
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const text = await withTimeout(client.complete(prompt, { maxTokens, timeoutMs }), timeoutMs);
    if (typeof text !== 'string' || text.trim().length === 0) {
      return { ok: false, code: 'AI_UNAVAILABLE', message: 'empty response from model' };
    }
    return { ok: true, text };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown AI error';
    return { ok: false, code: 'AI_UNAVAILABLE', message };
  }
}

/**
 * Best-effort JSON extraction: strips ```json / ``` fences, then falls back to
 * the widest brace/bracket span embedded in prose. Returns null on failure —
 * never throws.
 */
export function parseJsonLoose(text: string): unknown {
  if (typeof text !== 'string') {
    return null;
  }
  for (const candidate of jsonCandidates(text)) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

function jsonCandidates(text: string): readonly string[] {
  const trimmed = text.trim();
  const candidates: string[] = [];
  const fence = /```(?:json)?\s*\n?([\s\S]*?)\n?```/i.exec(trimmed);
  if (fence && fence[1] !== undefined) {
    candidates.push(fence[1].trim());
  }
  candidates.push(trimmed);
  const sliced = sliceOutermost(trimmed);
  if (sliced !== null) {
    candidates.push(sliced);
  }
  return candidates;
}

/** Widest span from the first '{' or '[' to the matching last '}' or ']'. */
function sliceOutermost(text: string): string | null {
  const firstObj = text.indexOf('{');
  const firstArr = text.indexOf('[');
  const starts = [firstObj, firstArr].filter((i) => i >= 0);
  if (starts.length === 0) {
    return null;
  }
  const start = Math.min(...starts);
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  const end = text.lastIndexOf(close);
  if (end <= start) {
    return null;
  }
  return text.slice(start, end + 1);
}
