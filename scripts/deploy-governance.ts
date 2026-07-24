import { ethers, network } from 'hardhat';

// Deploys YouFenGovernance (v0.7 enforcement contract) to the configured network.
// The constructor takes no arguments; the deployer becomes the immutable
// `pauseGuardian` (the only account that may pause/unpause — reads/history are
// never blocked). Write-only: run it via
//   hardhat run scripts/deploy-governance.ts --network injectiveTestnet
// after funding the deployer from the Injective testnet faucet
// (BLOCKCHAIN_PRIVATE_KEY). It prints the deployed address AND the deploy block
// so both can be backfilled into the worker env as CONTRACT_ADDRESS /
// CONTRACT_DEPLOY_BLOCK, then suggests a Blockscout verification command.

async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error('No deployer signer available. Set BLOCKCHAIN_PRIVATE_KEY.');
  }

  const balance = await ethers.provider.getBalance(deployer.address);
  // eslint-disable-next-line no-console
  console.log(`Network:  ${network.name}`);
  // eslint-disable-next-line no-console
  console.log(`Deployer: ${deployer.address} (balance ${ethers.formatEther(balance)} INJ)`);
  // eslint-disable-next-line no-console
  console.log('Deploying YouFenGovernance (constructor sets pauseGuardian = deployer)...');

  const factory = await ethers.getContractFactory('YouFenGovernance');
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();
  const receipt = deployTx ? await deployTx.wait() : null;
  const deployBlock = receipt?.blockNumber ?? null;

  // eslint-disable-next-line no-console
  console.log('\nYouFenGovernance deployed.');
  // eslint-disable-next-line no-console
  console.log(`  CONTRACT_ADDRESS=${address}`);
  // eslint-disable-next-line no-console
  console.log(`  CONTRACT_DEPLOY_BLOCK=${deployBlock ?? '<check explorer>'}`);
  // eslint-disable-next-line no-console
  console.log(`  pauseGuardian=${deployer.address}`);
  // eslint-disable-next-line no-console
  console.log('\nBackfill both values into your worker env (.env), then verify:');
  // eslint-disable-next-line no-console
  console.log(`  npx hardhat verify --network ${network.name} ${address}`);
  // eslint-disable-next-line no-console
  console.log('\nNext: seed the demo community with scripts/seed-governance-community.ts');
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
