// Typed contract instances (BLOCKCHAIN-DESIGN §1). Two runner views over the same
// address: `read` is bound to the provider (view calls), `write` is bound to the
// signer (state-changing sends). Both share the frozen YouFenRecords ABI.

import { Contract } from 'ethers';
import type { ContractRunner } from 'ethers';

import { YOUFEN_RECORDS_ABI } from '../abi/youfen-records';

export interface Contracts {
  readonly read: Contract;
  readonly write: Contract;
}

export interface CreateContractsDeps {
  readonly provider: ContractRunner;
  readonly signer: ContractRunner;
  readonly address: string;
}

export function createContracts(deps: CreateContractsDeps): Contracts {
  const read = new Contract(deps.address, YOUFEN_RECORDS_ABI, deps.provider);
  const write = new Contract(deps.address, YOUFEN_RECORDS_ABI, deps.signer);
  return { read, write };
}
