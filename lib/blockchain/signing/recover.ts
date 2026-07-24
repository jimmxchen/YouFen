// EIP-712 signature recovery for YouFenGovernance v0.7 authorizations.
//
// Mirrors the contract's ecrecover: an invalid / malformed signature yields
// null (the contract yields address(0) and reverts). The recovered address is
// checksummed. The server uses this to (a) verify an approver's signature before
// collecting it and (b) fail fast before wasting a relayer submission, but the
// on-chain contract remains the sole authority — the server can never mint or
// vote on a member's behalf because it never holds a private key.

import { getAddress, verifyTypedData } from 'ethers';

import {
  ENROLL_TYPES,
  MINT_TYPES,
  REVERSAL_TYPES,
  ROTATE_TYPES,
  VOTE_TYPES,
  type Eip712Domain,
  type KeyRotation,
  type MemberEnrollment,
  type MintAuthorization,
  type ReversalAuthorization,
  type VoteAuthorization,
} from './typed-data';

function safeRecover(recover: () => string): string | null {
  try {
    return getAddress(recover());
  } catch {
    return null;
  }
}

export function recoverMintSigner(
  domain: Eip712Domain,
  a: MintAuthorization,
  signature: string,
): string | null {
  return safeRecover(() => verifyTypedData(domain, MINT_TYPES, a, signature));
}

export function recoverReversalSigner(
  domain: Eip712Domain,
  a: ReversalAuthorization,
  signature: string,
): string | null {
  return safeRecover(() => verifyTypedData(domain, REVERSAL_TYPES, a, signature));
}

export function recoverVoteSigner(
  domain: Eip712Domain,
  v: VoteAuthorization,
  signature: string,
): string | null {
  return safeRecover(() => verifyTypedData(domain, VOTE_TYPES, v, signature));
}

export function recoverEnrollSigner(
  domain: Eip712Domain,
  a: MemberEnrollment,
  signature: string,
): string | null {
  return safeRecover(() => verifyTypedData(domain, ENROLL_TYPES, a, signature));
}

export function recoverRotateSigner(
  domain: Eip712Domain,
  a: KeyRotation,
  signature: string,
): string | null {
  return safeRecover(() => verifyTypedData(domain, ROTATE_TYPES, a, signature));
}

/** True iff `signature` was produced by `expected` over the mint authorization. */
export function isMintSignedBy(
  domain: Eip712Domain,
  a: MintAuthorization,
  signature: string,
  expected: string,
): boolean {
  const recovered = recoverMintSigner(domain, a, signature);
  return recovered !== null && recovered === getAddress(expected);
}
