// JSON-safe EIP-712 request envelopes (docs/BLOCKCHAIN-DESIGN-v0.7.md §1/§6).
//
// The API sends one of these to the client (browser MemberSigner or an
// approver's device); the client feeds domain+types+message straight into
// `signer.signTypedData(domain, types, message)`. Every uint256 (amount / nonce)
// crosses the JSON boundary as a DECIMAL STRING — never a JS number — which is
// the single rule that prevents a precision leak on large token values. The
// digest is included so the caller can persist/index it without re-encoding.

import type { TypedDataField } from 'ethers';

import type { Hex32 } from '../types';

import {
  ENROLL_TYPES,
  MINT_TYPES,
  PROPOSAL_TYPES,
  REVERSAL_TYPES,
  ROTATE_TYPES,
  VOTE_TYPES,
  enrollDigest,
  mintDigest,
  reversalDigest,
  rotateDigest,
  voteDigest,
  type Eip712Domain,
  type KeyRotation,
  type MemberEnrollment,
  type MintAuthorization,
  type ReversalAuthorization,
  type VoteAuthorization,
} from './typed-data';

/** A fully serialisable EIP-712 signing request (all bigints already stringified). */
export interface Eip712Envelope {
  readonly domain: Eip712Domain;
  readonly types: Record<string, TypedDataField[]>;
  readonly primaryType: string;
  readonly message: Record<string, string | number | boolean>;
  readonly digest: Hex32;
}

/** Convert a struct's bigint fields to decimal strings for the JSON boundary. */
function jsonSafeMessage(
  value: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'bigint') out[k] = v.toString(10);
    else if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') out[k] = v;
    else throw new Error(`EIP712_ENVELOPE_UNSERIALIZABLE_FIELD:${k}`);
  }
  return out;
}

export function mintEnvelope(domain: Eip712Domain, a: MintAuthorization): Eip712Envelope {
  return {
    domain,
    types: MINT_TYPES,
    primaryType: 'MintAuthorization',
    message: jsonSafeMessage(a as unknown as Record<string, unknown>),
    digest: mintDigest(domain, a),
  };
}

export function reversalEnvelope(domain: Eip712Domain, a: ReversalAuthorization): Eip712Envelope {
  return {
    domain,
    types: REVERSAL_TYPES,
    primaryType: 'ReversalAuthorization',
    message: jsonSafeMessage(a as unknown as Record<string, unknown>),
    digest: reversalDigest(domain, a),
  };
}

export function voteEnvelope(domain: Eip712Domain, v: VoteAuthorization): Eip712Envelope {
  return {
    domain,
    types: VOTE_TYPES,
    primaryType: 'VoteAuthorization',
    message: jsonSafeMessage(v as unknown as Record<string, unknown>),
    digest: voteDigest(domain, v),
  };
}

export function enrollEnvelope(domain: Eip712Domain, a: MemberEnrollment): Eip712Envelope {
  return {
    domain,
    types: ENROLL_TYPES,
    primaryType: 'MemberEnrollment',
    message: jsonSafeMessage(a as unknown as Record<string, unknown>),
    digest: enrollDigest(domain, a),
  };
}

export function rotateEnvelope(domain: Eip712Domain, a: KeyRotation): Eip712Envelope {
  return {
    domain,
    types: ROTATE_TYPES,
    primaryType: 'KeyRotation',
    message: jsonSafeMessage(a as unknown as Record<string, unknown>),
    digest: rotateDigest(domain, a),
  };
}

/** Re-export PROPOSAL_TYPES so the proposal-creation flow shares one source. */
export { PROPOSAL_TYPES };
