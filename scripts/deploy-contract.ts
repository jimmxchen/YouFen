import { ethers, network } from 'hardhat';

// Deploys YouFenRecords to the configured network. The recorder defaults to the
// deployer address, or env RECORDER_ADDRESS if provided. Write-only: run it via
//   hardhat run scripts/deploy-contract.ts --network injectiveTestnet
// after funding the deployer from the Injective testnet faucet. It prints the
// contract address and deploy block for backfilling CONTRACT_ADDRESS /
// CONTRACT_DEPLOY_BLOCK, then suggests a Blockscout verification command.

async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error('No deployer signer available. Set BLOCKCHAIN_PRIVATE_KEY.');
  }

  const recorder = process.env.RECORDER_ADDRESS ?? deployer.address;
  if (!ethers.isAddress(recorder)) {
    throw new Error(`RECORDER_ADDRESS is not a valid address: ${recorder}`);
  }

  const balance = await ethers.provider.getBalance(deployer.address);
  // eslint-disable-next-line no-console
  console.log(`Network:  ${network.name}`);
  // eslint-disable-next-line no-console
  console.log(`Deployer: ${deployer.address} (balance ${ethers.formatEther(balance)} INJ)`);
  // eslint-disable-next-line no-console
  console.log(`Recorder: ${recorder}`);

  const factory = await ethers.getContractFactory('YouFenRecords');
  const contract = await factory.deploy(recorder);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();
  const receipt = deployTx ? await deployTx.wait() : null;
  const deployBlock = receipt?.blockNumber ?? null;

  // eslint-disable-next-line no-console
  console.log('\nYouFenRecords deployed.');
  // eslint-disable-next-line no-console
  console.log(`  CONTRACT_ADDRESS=${address}`);
  // eslint-disable-next-line no-console
  console.log(`  CONTRACT_DEPLOY_BLOCK=${deployBlock ?? '<check explorer>'}`);
  // eslint-disable-next-line no-console
  console.log('\nBackfill both values into your worker env (.env), then verify:');
  // eslint-disable-next-line no-console
  console.log(
    `  npx hardhat verify --network ${network.name} ${address} ${recorder}`,
  );
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
