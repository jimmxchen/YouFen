// recordHash computation (BLOCKCHAIN-DESIGN §4). Pure and IO-free.
//
// Keccak-256 comes exclusively from ethers (Ethereum Keccak-256). Node's crypto
// 'sha3-256' is NIST SHA3 and produces different digests — never use it here.

import { keccak256, toUtf8Bytes } from 'ethers';

import type { Hex32, RecordEnvelope } from '../types';

import { canonicalize } from './canonicalize';

/** keccak256 over the UTF-8 bytes of a string, as a lowercase 0x bytes32. */
export function keccakUtf8(value: string): Hex32 {
  return keccak256(toUtf8Bytes(value)) as Hex32;
}

/** recordHash = keccak256(utf8(canonicalize(envelope))), lowercase 0x bytes32. */
export function computeRecordHash(envelope: RecordEnvelope): Hex32 {
  return keccakUtf8(canonicalize(envelope));
}
