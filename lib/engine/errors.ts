// Engine error taxonomy (frozen contract). Every error crossing an engine
// service boundary is an EngineError carrying one of the 19 canonical codes.
// The API layer (lib/api/core/respond.ts) maps these codes to HTTP statuses.

/** The 19 canonical engine error codes. Additive-only after freeze. */
export type EngineErrorCode =
  | 'NOT_APPROVED'
  | 'ALREADY_MINTED'
  | 'EPOCH_NOT_ACTIVE'
  | 'RULE_VIOLATION'
  | 'MEMBER_CAP_EXCEEDED'
  | 'INSUFFICIENT_BUDGET'
  | 'ADVANCE_CAP_EXCEEDED'
  | 'ROLLING_ADVANCE_FORBIDDEN'
  | 'ADVANCE_RATE_EXCEEDED'
  | 'PROPOSAL_REQUIRED'
  | 'SECOND_APPROVER_REQUIRED'
  | 'INVALID_STATUS'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'QUORUM_NOT_MET'
  | 'INVALID_REASON'
  | 'ALREADY_REVERSED'
  | 'VALIDATION_ERROR';

/**
 * Structured engine error. `code` is machine-readable and drives HTTP mapping;
 * `message` defaults to the code so an unset message never leaks internals.
 */
export class EngineError extends Error {
  readonly code: EngineErrorCode;

  constructor(code: EngineErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'EngineError';
    this.code = code;
  }
}
