// Server wallet with explicit nonce management (BLOCKCHAIN-DESIGN §6). We never
// use ethers NonceManager: its in-memory counter is lost on restart. Instead the
// local nonce is seeded from getTransactionCount(address, 'pending') and resynced
// on demand whenever the chain view drifts (nonce errors, reorgs, restarts).
//
// Two correctness guards live here:
//   * Self-heal: the startup seed is best-effort, so if it fails (a single RPC
//     blip) getNextNonce would strand the wallet uninitialised forever — the
//     submit worker reads the nonce OUTSIDE its try/catch, so its NonceError
//     recovery path is unreachable. To break that, getNextNonce reschedules a
//     background reseed while uninitialised (single-flight) so a later retry
//     finds the nonce seeded once the RPC recovers — no manual restart needed.
//   * Stale-resync guard: a slow in-flight resync must never overwrite a fresher
//     chain view or already-consumed nonces. Each resync is stamped with a
//     monotonic sequence and only applies its result if it is still the latest
//     one started, so a superseded (e.g. startup) resync becomes inert.

import { Wallet } from 'ethers';
import type { Provider } from 'ethers';

import { NonceError } from '../errors';

/** Minimal provider surface the wallet depends on (structural, DI-friendly). */
export interface NonceProvider {
  getTransactionCount(address: string, blockTag?: string): Promise<number>;
}

export interface ServerWallet {
  readonly address: string;
  readonly signer: Wallet;
  /** Return the current nonce and advance the local counter by one. */
  getNextNonce(): number;
  /** Read the current nonce without advancing it. */
  peekNonce(): number;
  /** Reseed the local nonce from the chain's pending transaction count. */
  resyncNonce(): Promise<number>;
  /** True once the local nonce has been initialised at least once. */
  started(): boolean;
}

export interface CreateServerWalletDeps {
  readonly provider: NonceProvider;
  readonly privateKey: string;
}

const UNINITIALISED = 'Server wallet nonce not initialised; call resyncNonce first';

export function createServerWallet(deps: CreateServerWalletDeps): ServerWallet {
  const signer = new Wallet(deps.privateKey, deps.provider as unknown as Provider);
  const address = signer.address;
  let localNonce: number | null = null;
  // Monotonic id stamped on each resync when it STARTS; only the latest applies.
  let resyncSeq = 0;
  // Single in-flight self-heal reseed, so uninitialised getNextNonce calls
  // coalesce onto one request instead of fanning out into a resync storm.
  let healing: Promise<number> | null = null;

  async function resyncNonce(): Promise<number> {
    const seq = (resyncSeq += 1);
    const next = await deps.provider.getTransactionCount(address, 'pending');
    // Drop the result if a newer resync started while we were awaiting: a stale
    // in-flight resync must not clobber a fresher view or consumed nonces.
    if (seq === resyncSeq) {
      localNonce = next;
    }
    return next;
  }

  // Start (or reuse) a single background reseed. Failures clear the slot so the
  // next uninitialised getNextNonce can retry once the RPC recovers.
  function startHealingResync(): Promise<number> {
    if (healing !== null) {
      return healing;
    }
    const pending = resyncNonce();
    healing = pending;
    const clear = (): void => {
      if (healing === pending) {
        healing = null;
      }
    };
    pending.then(clear, clear);
    return pending;
  }

  function getNextNonce(): number {
    if (localNonce === null) {
      // Not seeded yet (startup seed failed or is still pending). Kick a
      // background reseed so the wallet self-heals, then surface the retryable
      // NonceError to the caller as before.
      void startHealingResync().catch(() => {});
      throw new NonceError(UNINITIALISED);
    }
    const current = localNonce;
    localNonce = current + 1;
    return current;
  }

  function peekNonce(): number {
    if (localNonce === null) {
      throw new NonceError(UNINITIALISED);
    }
    return localNonce;
  }

  function started(): boolean {
    return localNonce !== null;
  }

  // Seed the local nonce eagerly through the single-flight healer; callers may
  // still await resyncNonce for determinism. A failed seed no longer strands the
  // wallet: the next uninitialised getNextNonce reschedules the reseed.
  void startHealingResync().catch(() => {
    // Swallow: recovery is driven by getNextNonce, not by this startup attempt.
  });

  return { address, signer, getNextNonce, peekNonce, resyncNonce, started };
}
