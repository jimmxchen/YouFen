// Chain error taxonomy. Every error crossing the blockchain layer boundary must
// be a ChainError subclass; classifyUnknownError normalises unknowns at the edge.

export abstract class ChainError extends Error {
  abstract readonly code: string;
  abstract readonly retryable: boolean;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Transient failures: BullMQ should re-throw so the job is retried. */
export class RetryableError extends ChainError {
  readonly code: string = 'RETRYABLE';
  readonly retryable: boolean = true;
}

/** Permanent failures: the record moves to `failed` and waits for manual retry. */
export class TerminalError extends ChainError {
  readonly code: string = 'TERMINAL';
  readonly retryable: boolean = false;
}

/**
 * The contract already holds this recordHash. Not a failure: the submit worker
 * recovers via findTxByRecordHash and the job completes successfully.
 */
export class AlreadyRecordedError extends ChainError {
  readonly code: string = 'RECORD_EXISTS';
  readonly retryable: boolean = false;
}

/** Nonce too low / already used — resync and retry. */
export class NonceError extends RetryableError {
  readonly code: string = 'NONCE_ERROR';
}

/** RPC unreachable / timed out / 5xx — retry once the chain is back. */
export class ChainUnavailableError extends RetryableError {
  readonly code: string = 'CHAIN_UNAVAILABLE';
}

export class InvalidTransitionError extends TerminalError {
  readonly code: string = 'INVALID_TRANSITION';
}

export class RecordNotFoundError extends TerminalError {
  readonly code: string = 'RECORD_NOT_FOUND';
}

export class InvalidStatusError extends TerminalError {
  readonly code: string = 'INVALID_STATUS';
}

export class CanonicalizationError extends TerminalError {
  readonly code: string = 'CANONICALIZATION_ERROR';
}

const NETWORK_CODES: readonly string[] = ['NETWORK_ERROR', 'TIMEOUT', 'SERVER_ERROR'];

function readString(obj: Record<string, unknown>, key: string): string {
  const value = obj[key];
  return typeof value === 'string' ? value : '';
}

/**
 * Normalise any thrown value into a ChainError. Rules run in order:
 * 1. already a ChainError -> return as-is;
 * 2. message/shortMessage/reason contains 'RECORD_EXISTS' -> AlreadyRecordedError;
 * 3. contains 'nonce' (case-insensitive) -> NonceError;
 * 4. ethers network class (code in NETWORK_ERROR/TIMEOUT/SERVER_ERROR, or
 *    ECONNREFUSED/ETIMEDOUT/'fetch failed') -> ChainUnavailableError;
 * 5. contains 'ORIGINAL_NOT_FOUND'/'NOT_RECORDER', or CALL_EXCEPTION with revert
 *    evidence (non-empty reason, or 'execution reverted') -> TerminalError;
 * 6. CALL_EXCEPTION with no revert evidence (RPC jitter) -> RetryableError;
 * 7. everything else -> RetryableError.
 */
export function classifyUnknownError(e: unknown): ChainError {
  if (e instanceof ChainError) {
    return e;
  }

  const obj: Record<string, unknown> =
    typeof e === 'object' && e !== null ? (e as Record<string, unknown>) : {};
  const message = e instanceof Error ? e.message : readString(obj, 'message');
  const shortMessage = readString(obj, 'shortMessage');
  const reason = readString(obj, 'reason');
  const code = readString(obj, 'code');

  const combined = `${message} ${shortMessage} ${reason}`;
  const lower = combined.toLowerCase();

  if (combined.includes('RECORD_EXISTS')) {
    return new AlreadyRecordedError(message || 'RECORD_EXISTS');
  }

  if (lower.includes('nonce')) {
    return new NonceError(message || 'nonce error');
  }

  if (
    NETWORK_CODES.includes(code) ||
    combined.includes('ECONNREFUSED') ||
    combined.includes('ETIMEDOUT') ||
    lower.includes('fetch failed')
  ) {
    return new ChainUnavailableError(message || 'chain unavailable');
  }

  if (combined.includes('ORIGINAL_NOT_FOUND') || combined.includes('NOT_RECORDER')) {
    return new TerminalError(message || 'terminal revert');
  }

  if (code === 'CALL_EXCEPTION') {
    const hasRevertEvidence = reason.length > 0 || lower.includes('execution reverted');
    if (hasRevertEvidence) {
      return new TerminalError(message || 'execution reverted');
    }
    return new RetryableError(message || 'missing revert data');
  }

  return new RetryableError(message || 'unclassified error');
}
