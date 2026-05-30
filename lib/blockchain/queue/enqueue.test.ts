import { describe, it, expect, vi } from 'vitest';
import type { Job, Queue } from 'bullmq';

import { createEnqueue } from './enqueue';
import { SUBMIT_JOB_OPTIONS } from './queues';

function makeQueue() {
  const add = vi.fn().mockResolvedValue({});
  const getJob = vi.fn();
  const submitQueue = { add, getJob } as unknown as Pick<Queue, 'add' | 'getJob'>;
  return { add, getJob, submitQueue };
}

/** A fake Job exposing only the surface the enqueuer inspects (getState/remove). */
function makeJob(state: string) {
  const remove = vi.fn().mockResolvedValue(undefined);
  const getState = vi.fn().mockResolvedValue(state);
  return { remove, getState, job: { getState, remove } as unknown as Job };
}

describe('createEnqueue', () => {
  it('builds jobId submit:${id}:v${attemptEpoch}, adds recordId-only payload, queued:true when new', async () => {
    const { add, getJob, submitQueue } = makeQueue();
    getJob.mockResolvedValue(undefined);

    const enqueue = createEnqueue({ submitQueue });
    const result = await enqueue({ id: 'pr_1', attemptEpoch: 1 });

    expect(result).toEqual({ queued: true, jobId: 'submit:pr_1:v1' });
    expect(getJob).toHaveBeenCalledWith('submit:pr_1:v1');
    expect(add).toHaveBeenCalledWith(
      'submit',
      { recordId: 'pr_1' },
      { ...SUBMIT_JOB_OPTIONS, jobId: 'submit:pr_1:v1' },
    );
    // Payload carries ONLY recordId (data is always re-read from the DB).
    expect(Object.keys(add.mock.calls[0][1])).toEqual(['recordId']);
  });

  it('bumps the jobId version with attemptEpoch', async () => {
    const { add, getJob, submitQueue } = makeQueue();
    getJob.mockResolvedValue(undefined);

    const result = await createEnqueue({ submitQueue })({ id: 'pr_9', attemptEpoch: 4 });

    expect(result.jobId).toBe('submit:pr_9:v4');
    expect(add.mock.calls[0][2]).toMatchObject({ jobId: 'submit:pr_9:v4' });
  });

  it('returns queued:false and does NOT add when an active job already holds the id', async () => {
    const { add, getJob, submitQueue } = makeQueue();
    const { job, remove } = makeJob('active');
    getJob.mockResolvedValue(job);

    const result = await createEnqueue({ submitQueue })({ id: 'pr_2', attemptEpoch: 3 });

    expect(result).toEqual({ queued: false, jobId: 'submit:pr_2:v3' });
    expect(add).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it.each(['waiting', 'delayed', 'waiting-children', 'prioritized', 'unknown'])(
    'treats non-terminal state %s as still-queued (queued:false, no add)',
    async (state) => {
      const { add, getJob, submitQueue } = makeQueue();
      const { job } = makeJob(state);
      getJob.mockResolvedValue(job);

      const result = await createEnqueue({ submitQueue })({ id: 'pr_5', attemptEpoch: 2 });

      expect(result).toEqual({ queued: false, jobId: 'submit:pr_5:v2' });
      expect(add).not.toHaveBeenCalled();
    },
  );

  // Red-team fix: a retained failed job (removeOnFail age 604800 = 7 days) must NOT
  // masquerade as in-flight work. The reconciler re-enqueues stale pending rows with
  // the SAME attemptEpoch (same jobId), so a lingering failed job would swallow the
  // re-enqueue and strand the record for up to 7 days. Remove it and add fresh.
  it('removes a retained failed job and enqueues fresh (queued:true)', async () => {
    const { add, getJob, submitQueue } = makeQueue();
    const { job, remove } = makeJob('failed');
    getJob.mockResolvedValue(job);

    const result = await createEnqueue({ submitQueue })({ id: 'pr_3', attemptEpoch: 2 });

    expect(remove).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ queued: true, jobId: 'submit:pr_3:v2' });
    expect(add).toHaveBeenCalledWith(
      'submit',
      { recordId: 'pr_3' },
      { ...SUBMIT_JOB_OPTIONS, jobId: 'submit:pr_3:v2' },
    );
  });

  // Same hazard for a retained completed job (removeOnComplete age 86400 = 1 day).
  it('removes a retained completed job and enqueues fresh (queued:true)', async () => {
    const { add, getJob, submitQueue } = makeQueue();
    const { job, remove } = makeJob('completed');
    getJob.mockResolvedValue(job);

    const result = await createEnqueue({ submitQueue })({ id: 'pr_4', attemptEpoch: 1 });

    expect(remove).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ queued: true, jobId: 'submit:pr_4:v1' });
    expect(add).toHaveBeenCalledOnce();
  });
});
