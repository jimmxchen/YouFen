import '@nomicfoundation/hardhat-toolbox';
import type { HardhatUserConfig } from 'hardhat/config';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    sources: './contracts',
    tests: './contracts/test',
  },
  networks: {
    injectiveTestnet: {
      url:
        process.env.INJECTIVE_RPC_URL ??
        'https://k8s.testnet.json-rpc.injective.network/',
      chainId: 1439,
      accounts: process.env.BLOCKCHAIN_PRIVATE_KEY
        ? [process.env.BLOCKCHAIN_PRIVATE_KEY]
        : [],
    },
  },
};

export default config;
