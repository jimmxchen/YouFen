// Blockchain runtime singleton (BLOCKCHAIN-DESIGN §3). The three exported
// signatures are permanently frozen (W5-api depends on them verbatim); wave 5
// replaces only the body of initBlockchainRuntime with the real assembly.
//
//   getBlockchainRuntime()          -> synchronous accessor, throws if unset
//   initBlockchainRuntime(opts?)    -> async, idempotent; builds once then caches
//   setBlockchainRuntimeForTesting  -> test seam; an injected runtime always wins
//
// A runtime injected via setBlockchainRuntimeForTesting takes priority over auto
// assembly: initBlockchainRuntime returns it untouched and never calls
// createBlockchainRuntime (route smoke tests inject a fake and must not build a
// real provider/queue stack).

import { createBlockchainRuntime, type CreateBlockchainRuntimeOptions } from './index';
import type { BlockchainRuntime } from './types';

let singleton: BlockchainRuntime | null = null;

/** Synchronous accessor. Throws if the runtime has not been initialised yet. */
export function getBlockchainRuntime(): BlockchainRuntime {
  if (singleton === null) {
    throw new Error('BLOCKCHAIN_RUNTIME_NOT_INITIALIZED');
  }
  return singleton;
}

/**
 * Idempotent initialiser. Returns the existing singleton when one is already set
 * (including one injected via setBlockchainRuntimeForTesting); otherwise builds
 * the real runtime via createBlockchainRuntime, caches it and returns it.
 */
export async function initBlockchainRuntime(opts?: unknown): Promise<BlockchainRuntime> {
  if (singleton !== null) {
    return singleton;
  }
  singleton = await createBlockchainRuntime(
    opts as CreateBlockchainRuntimeOptions | undefined,
  );
  return singleton;
}

/** Test-only seam to set or clear the singleton (e.g. route smoke tests). */
export function setBlockchainRuntimeForTesting(rt: BlockchainRuntime | null): void {
  singleton = rt;
}
