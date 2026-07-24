// Blockchain worker host (BLOCKCHAIN-DESIGN §6). A long-lived process — it must
// run on a persistent host (Railway / Fly), NEVER a Vercel serverless function,
// because BullMQ workers hold an open Redis connection and poll continuously.
//
// Boot sequence: initBlockchainRuntime() -> ioredis connection
// (maxRetriesPerRequest: null, required by BullMQ blocking commands) ->
// submit/confirm/reconcile workers -> schedule the repeatable reconcile job.
// SIGINT/SIGTERM trigger a graceful shutdown (drain workers, close queues, quit
// Redis). The startup banner prints only non-sensitive config — the private key
// is never logged.

import { pathToFileURL } from 'node:url';

import { Queue } from 'bullmq';
import IORedis from 'ioredis';

import { loadBlockchainConfig } from '../lib/blockchain/config';
import { initBlockchainRuntime } from '../lib/blockchain/runtime';
import type { AssembledBlockchainRuntime } from '../lib/blockchain/index';
import {
  createConfirmWorker,
  type ConfirmDeps,
} from '../lib/blockchain/queue/confirm-worker';
import { QUEUE_NAMES } from '../lib/blockchain/queue/queues';
import {
  createReconcileWorker,
  scheduleReconcile,
  type ReconcileDeps,
} from '../lib/blockchain/queue/reconcile-worker';
import {
  createSubmitWorker,
  type SubmitDeps,
} from '../lib/blockchain/queue/submit-worker';

/* eslint-disable no-console */

function log(message: string): void {
  console.log(`[chain-worker] ${message}`);
}

async function main(): Promise<void> {
  const config = loadBlockchainConfig();

  // BullMQ requires maxRetriesPerRequest: null on the connection it uses for
  // blocking commands (BRPOPLPUSH); a finite value makes workers crash on it.
  const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

  // initBlockchainRuntime returns the frozen BlockchainRuntime; the concrete
  // object is the richer assembly, so we widen it back to reach wallet/queues.
  const runtime = (await initBlockchainRuntime({
    connection,
  })) as unknown as AssembledBlockchainRuntime;

  const submitDeps: SubmitDeps = {
    records: runtime.records,
    submitter: runtime.injective.submitter,
    wallet: runtime.wallet,
    readChainRecord: (recordHash) => runtime.injective.verifier.readChainRecord(recordHash),
    findTxByRecordHash: (recordHash) =>
      runtime.injective.confirmer.findTxByRecordHash(recordHash),
    enqueueConfirm: runtime.enqueueConfirm,
    buildSubmittable: runtime.buildSubmittable,
  };

  const confirmDeps: ConfirmDeps = {
    records: runtime.records,
    confirmer: runtime.injective.confirmer,
    readChainRecord: (recordHash) => runtime.injective.verifier.readChainRecord(recordHash),
    confirmations: runtime.config.confirmations,
  };

  const reconcileDeps: ReconcileDeps = { reconciler: runtime.reconciler };

  const submitWorker = createSubmitWorker(connection, submitDeps);
  const confirmWorker = createConfirmWorker(connection, confirmDeps);
  const reconcileWorker = createReconcileWorker(connection, reconcileDeps);

  // createQueues builds only submit + confirm; the reconcile schedule needs its
  // own queue handle to register the repeatable job.
  const reconcileQueue = new Queue(QUEUE_NAMES.reconcile, { connection });
  await scheduleReconcile(reconcileQueue);

  const rpcHost = safeHost(runtime.config.rpcUrl);
  log('started');
  log(`chainId=${runtime.config.chainId} rpc=${rpcHost}`);
  log(`contract=${runtime.config.contractAddress}`);
  log(`explorer=${runtime.config.explorerBaseUrl} confirmations=${runtime.config.confirmations}`);
  log(
    `queues: ${QUEUE_NAMES.submit}, ${QUEUE_NAMES.confirm}, ${QUEUE_NAMES.reconcile}`,
  );

  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    log(`${signal} received, draining workers...`);
    try {
      await submitWorker.close();
      await confirmWorker.close();
      await reconcileWorker.close();
      await runtime.submitQueue.close();
      await runtime.confirmQueue.close();
      await reconcileQueue.close();
      await connection.quit();
      log('shutdown complete');
      process.exit(0);
    } catch (error: unknown) {
      console.error('[chain-worker] shutdown error', error);
      process.exit(1);
    }
  }

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

/** Reduce an RPC URL to host only so no credentials leak into the banner. */
function safeHost(rpcUrl: string): string {
  try {
    return new URL(rpcUrl).host;
  } catch {
    return '<invalid-rpc-url>';
  }
}

// Only run when invoked directly (tsx scripts/worker.ts), never on import — the
// vitest suite collects *.test.ts only, but this guard makes the intent explicit.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error('[chain-worker] fatal', error);
    process.exit(1);
  });
}

/* eslint-enable no-console */
