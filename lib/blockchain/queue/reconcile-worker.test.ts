import { describe, it, expect, vi } from 'vitest';
import type { Queue } from 'bullmq';

import { scheduleReconcile, RECONCILE_JOB_ID } from './reconcile-worker';
import { RECONCILE_REPEAT } from './queues';

describe('scheduleReconcile', () => {
  it('registers a single repeatable reconcile job by fixed jobId', async () => {
    const add = vi.fn().mockResolvedValue({});

    await scheduleReconcile({ add } as unknown as Pick<Queue, 'add'>);

    expect(add).toHaveBeenCalledWith(
      'reconcile',
      {},
      { repeat: RECONCILE_REPEAT, jobId: RECONCILE_JOB_ID },
    );
    expect(RECONCILE_JOB_ID).toBe('chain-reconcile-singleton');
  });
});
