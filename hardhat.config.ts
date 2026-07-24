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
      // v0.7 YouFenGovernance 的 executeMint/enforcement 局部变量多，用 IR 管线避免 stack-too-deep
      viaIR: true,
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
