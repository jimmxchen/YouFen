import { expect } from 'chai';
import { ethers } from 'hardhat';

// Smoke test proving the Hardhat + TypeScript mocha/chai pipeline is wired up.
// Deploys Sanity and asserts its constant return value.
describe('Sanity', () => {
  it('returns the constant answer from a deployed contract', async () => {
    const factory = await ethers.getContractFactory('Sanity');
    const sanity = await factory.deploy();
    await sanity.waitForDeployment();

    const value = await sanity.getFunction('answer').staticCall();

    expect(value).to.equal(42n);
  });
});
