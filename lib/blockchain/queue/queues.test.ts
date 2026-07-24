import { describe, it, expect } from 'vitest';

import {
  QUEUE_NAMES,
  SUBMIT_JOB_OPTIONS,
  CONFIRM_JOB_OPTIONS,
  RECONCILE_REPEAT,
  SUBMIT_CONCURRENCY,
  CONFIRM_CONCURRENCY,
} from './queues';

// Constant-only assertions (§6): the queue layer is never instantiated in tests.
describe('queue constants (§6)', () => {
  it('pins the three queue names', () => {
    expect(QUEUE_NAMES).toEqual({
      submit: 'chain-submit',
      confirm: 'chain-confirm',
      reconcile: 'chain-reconcile',
    });
  });

  it('pins chain-submit retry policy: 5 attempts, exponential 5s, retention', () => {
    expect(SUBMIT_JOB_OPTIONS).toEqual({
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 604800 },
    });
  });

  it('pins chain-confirm retry policy: 30 attempts, fixed 10s, retention', () => {
    expect(CONFIRM_JOB_OPTIONS).toEqual({
      attempts: 30,
      backoff: { type: 'fixed', delay: 10000 },
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 604800 },
    });
  });

  it('pins the reconcile repeat cadence at 120s', () => {
    expect(RECONCILE_REPEAT).toEqual({ every: 120000 });
  });

  it('pins concurrency: submit serial, confirm fanned out', () => {
    expect(SUBMIT_CONCURRENCY).toBe(1);
    expect(CONFIRM_CONCURRENCY).toBe(4);
  });
});
