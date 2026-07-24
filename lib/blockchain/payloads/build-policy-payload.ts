// Policy version payload builder (BLOCKCHAIN-DESIGN §1, §4.4). Pure and IO-free.
// All rate fields are bps integers (uint32) and map straight to numbers.

import { hashCommunityId } from '../hashing/id-hash';
import type { BuiltRecord, Hex32, TokenPolicyData } from '../types';

import { finalizeBuilt, unixSeconds } from './build-mint-payload';

/** Build a policy_version BuiltRecord from a community token policy row. */
export function buildPolicyPayload(
  policy: TokenPolicyData,
  _pepper: string,
): BuiltRecord {
  const communityIdHash = hashCommunityId(policy.communityId);

  const payload = {
    communityIdHash,
    createdAt: unixSeconds(policy.createdAt),
    effectiveEpoch: policy.effectiveEpoch,
    inflationRateBps: policy.monthlyInflationRateBps,
    maxAdvanceRateBps: policy.maxAdvanceRateBps,
    memberMintCapRateBps: policy.memberMintCapRateBps,
    policyId: policy.id,
    policyVersion: policy.policyVersion,
  };

  const chainArgsHead: readonly (Hex32 | bigint | number)[] = [
    communityIdHash,
    policy.policyVersion,
    policy.monthlyInflationRateBps,
    policy.maxAdvanceRateBps,
    policy.memberMintCapRateBps,
    policy.effectiveEpoch,
  ];

  return finalizeBuilt('policy_version', payload, chainArgsHead);
}
