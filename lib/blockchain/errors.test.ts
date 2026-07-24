import { describe, it, expect } from 'vitest';

import {
  ChainError,
  RetryableError,
  TerminalError,
  AlreadyRecordedError,
  NonceError,
  ChainUnavailableError,
  InvalidTransitionError,
  RecordNotFoundError,
  InvalidStatusError,
  CanonicalizationError,
  classifyUnknownError,
} from './errors';

describe('ChainError hierarchy', () => {
  it('exposes stable code + retryable flags per class', () => {
    expect(new RetryableError('x').code).toBe('RETRYABLE');
    expect(new RetryableError('x').retryable).toBe(true);

    expect(new TerminalError('x').code).toBe('TERMINAL');
    expect(new TerminalError('x').retryable).toBe(false);

    expect(new AlreadyRecordedError('x').code).toBe('RECORD_EXISTS');
    expect(new AlreadyRecordedError('x').retryable).toBe(false);

    expect(new NonceError('x').code).toBe('NONCE_ERROR');
    expect(new NonceError('x').retryable).toBe(true);

    expect(new ChainUnavailableError('x').code).toBe('CHAIN_UNAVAILABLE');
    expect(new ChainUnavailableError('x').retryable).toBe(true);

    expect(new InvalidTransitionError('x').code).toBe('INVALID_TRANSITION');
    expect(new InvalidTransitionError('x').retryable).toBe(false);

    expect(new RecordNotFoundError('x').code).toBe('RECORD_NOT_FOUND');
    expect(new RecordNotFoundError('x').retryable).toBe(false);

    expect(new InvalidStatusError('x').code).toBe('INVALID_STATUS');
    expect(new InvalidStatusError('x').retryable).toBe(false);

    expect(new CanonicalizationError('x').code).toBe('CANONICALIZATION_ERROR');
    expect(new CanonicalizationError('x').retryable).toBe(false);
  });

  it('preserves the message and Error-ness', () => {
    const err = new NonceError('nonce too low');
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('nonce too low');
    expect(err.name).toBe('NonceError');
  });

  it('models the correct instanceof lineage', () => {
    expect(new NonceError('x')).toBeInstanceOf(RetryableError);
    expect(new NonceError('x')).toBeInstanceOf(ChainError);
    expect(new ChainUnavailableError('x')).toBeInstanceOf(RetryableError);
    expect(new ChainUnavailableError('x')).toBeInstanceOf(ChainError);

    expect(new InvalidTransitionError('x')).toBeInstanceOf(TerminalError);
    expect(new InvalidTransitionError('x')).toBeInstanceOf(ChainError);
    expect(new RecordNotFoundError('x')).toBeInstanceOf(TerminalError);
    expect(new InvalidStatusError('x')).toBeInstanceOf(TerminalError);
    expect(new CanonicalizationError('x')).toBeInstanceOf(TerminalError);

    expect(new AlreadyRecordedError('x')).toBeInstanceOf(ChainError);
    expect(new AlreadyRecordedError('x')).not.toBeInstanceOf(RetryableError);
    expect(new AlreadyRecordedError('x')).not.toBeInstanceOf(TerminalError);

    // Retryable and Terminal are disjoint branches.
    expect(new RetryableError('x')).not.toBeInstanceOf(TerminalError);
    expect(new TerminalError('x')).not.toBeInstanceOf(RetryableError);
  });
});

describe('classifyUnknownError', () => {
  it('returns an existing ChainError unchanged (identity)', () => {
    const original = new TerminalError('boom');
    expect(classifyUnknownError(original)).toBe(original);

    const nonce = new NonceError('again');
    expect(classifyUnknownError(nonce)).toBe(nonce);
  });

  it('maps RECORD_EXISTS to AlreadyRecordedError (highest priority)', () => {
    expect(classifyUnknownError(new Error('execution reverted: RECORD_EXISTS')))
      .toBeInstanceOf(AlreadyRecordedError);
    expect(classifyUnknownError({ reason: 'RECORD_EXISTS' }))
      .toBeInstanceOf(AlreadyRecordedError);
    expect(classifyUnknownError({ shortMessage: 'RECORD_EXISTS' }))
      .toBeInstanceOf(AlreadyRecordedError);
  });

  it('maps any nonce mention (case-insensitive) to NonceError', () => {
    expect(classifyUnknownError(new Error('nonce too low'))).toBeInstanceOf(NonceError);
    expect(classifyUnknownError(new Error('Nonce has already been used')))
      .toBeInstanceOf(NonceError);
    expect(classifyUnknownError({ reason: 'NONCE_EXPIRED' })).toBeInstanceOf(NonceError);
  });

  it('maps ethers network codes to ChainUnavailableError', () => {
    expect(classifyUnknownError({ code: 'NETWORK_ERROR', message: 'boom' }))
      .toBeInstanceOf(ChainUnavailableError);
    expect(classifyUnknownError({ code: 'TIMEOUT', message: 'boom' }))
      .toBeInstanceOf(ChainUnavailableError);
    expect(classifyUnknownError({ code: 'SERVER_ERROR', message: 'boom' }))
      .toBeInstanceOf(ChainUnavailableError);
  });

  it('maps connection-level messages to ChainUnavailableError', () => {
    expect(classifyUnknownError(new Error('connect ECONNREFUSED 127.0.0.1:8545')))
      .toBeInstanceOf(ChainUnavailableError);
    expect(classifyUnknownError(new Error('ETIMEDOUT')))
      .toBeInstanceOf(ChainUnavailableError);
    expect(classifyUnknownError(new Error('fetch failed')))
      .toBeInstanceOf(ChainUnavailableError);
  });

  it('maps explicit contract reverts to TerminalError', () => {
    expect(classifyUnknownError(new Error('ORIGINAL_NOT_FOUND')))
      .toBeInstanceOf(TerminalError);
    expect(classifyUnknownError(new Error('NOT_RECORDER')))
      .toBeInstanceOf(TerminalError);
  });

  it('maps CALL_EXCEPTION WITH revert evidence to TerminalError', () => {
    // reason present -> revert evidence
    expect(classifyUnknownError({ code: 'CALL_EXCEPTION', reason: 'some revert' }))
      .toBeInstanceOf(TerminalError);
    // message says execution reverted -> revert evidence
    expect(
      classifyUnknownError({ code: 'CALL_EXCEPTION', message: 'execution reverted' }),
    ).toBeInstanceOf(TerminalError);
  });

  it('maps CALL_EXCEPTION WITHOUT revert evidence to RetryableError', () => {
    const classified = classifyUnknownError({
      code: 'CALL_EXCEPTION',
      message: 'missing revert data',
    });
    expect(classified).toBeInstanceOf(RetryableError);
    expect(classified).not.toBeInstanceOf(TerminalError);
  });

  it('defaults everything else to RetryableError', () => {
    expect(classifyUnknownError(new Error('who knows'))).toBeInstanceOf(RetryableError);
    expect(classifyUnknownError('a string')).toBeInstanceOf(RetryableError);
    expect(classifyUnknownError(undefined)).toBeInstanceOf(RetryableError);
    expect(classifyUnknownError(null)).toBeInstanceOf(RetryableError);
    expect(classifyUnknownError({ code: 'UNKNOWN_CODE' })).toBeInstanceOf(RetryableError);
  });
});
