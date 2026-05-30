import { expect } from 'chai';
import { ethers } from 'hardhat';

import type { YouFenRecords } from '../../typechain-types';

// Full-path Hardhat (mocha/chai) tests for the platform's sole records contract.
// Covers: deploy owner/recorder, all six write functions (NOT_RECORDER revert,
// success-path event args, duplicate RECORD_EXISTS revert), recordMint regular
// vs advance branch, recordReversal (ORIGINAL_NOT_FOUND + reversalOf +
// ledger-sequence-guarded snapshot semantics), the out-of-order ledgerSeq guard
// (stale records notarise but never roll back a fresher balance), read
// functions, and setRecorder rotation.
//
// Hard contract asserted throughout: every record event carries recordHash as
// its LAST indexed param, so recordHash === log.topics[3] in every emitted log.
// recordMint/recordReversal now take a uint64 ledgerSeq immediately before
// recordHash (the event signatures are unchanged — ledgerSeq is not indexed).

const H = (label: string): string => ethers.id(label);
const RECORD_HASH_TOPIC_INDEX = 3;

async function deploy() {
  const [owner, recorder, stranger, newRecorder] = await ethers.getSigners();
  const factory = await ethers.getContractFactory('YouFenRecords');
  const contract = (await factory
    .connect(owner)
    .deploy(recorder.address)) as unknown as YouFenRecords;
  await contract.waitForDeployment();
  return { contract, owner, recorder, stranger, newRecorder };
}

// Assert recordHash sits at topics[3] on every record-emitting log of `contract`.
function assertRecordHashTopic(receipt: any, contractAddress: string, recordHash: string): void {
  const logs = receipt.logs.filter(
    (l: any) => l.address.toLowerCase() === contractAddress.toLowerCase(),
  );
  expect(logs.length, 'exactly one record event expected').to.equal(1);
  expect(logs[0].topics[RECORD_HASH_TOPIC_INDEX]).to.equal(recordHash);
}

describe('YouFenRecords', () => {
  describe('deployment', () => {
    it('sets owner to deployer and recorder to constructor arg', async () => {
      const { contract, owner, recorder } = await deploy();
      expect(await contract.owner()).to.equal(owner.address);
      expect(await contract.recorder()).to.equal(recorder.address);
    });

    it('reverts ZERO_ADDRESS when recorder is the zero address', async () => {
      const [owner] = await ethers.getSigners();
      const factory = await ethers.getContractFactory('YouFenRecords');
      await expect(
        factory.connect(owner).deploy(ethers.ZeroAddress),
      ).to.be.revertedWith('ZERO_ADDRESS');
    });
  });

  describe('recordMint', () => {
    const cid = H('community:mint');
    const mid = H('member:mint');

    it('reverts NOT_RECORDER for a non-recorder caller', async () => {
      const { contract, stranger } = await deploy();
      await expect(
        contract
          .connect(stranger)
          .recordMint(cid, mid, 500n, 10500n, 116263n, 0, 0, 1, H('mint:1')),
      ).to.be.revertedWith('NOT_RECORDER');
    });

    it('records a regular mint (budgetSource 0) with recordType MINT (0)', async () => {
      const { contract, recorder } = await deploy();
      const recordHash = H('mint:regular');
      const tx = await contract
        .connect(recorder)
        .recordMint(cid, mid, 500n, 10500n, 116263n, 0, 0, 1, recordHash);
      const receipt = await tx.wait();

      await expect(tx)
        .to.emit(contract, 'TokensMinted')
        .withArgs(cid, mid, 500n, 10500n, 116263n, 0, 0n, recordHash);
      assertRecordHashTopic(receipt, await contract.getAddress(), recordHash);

      const rec = await contract.getRecord(recordHash);
      expect(rec.exists).to.equal(true);
      expect(rec.recordType).to.equal(0); // MINT
      expect(await contract.getBalance(cid, mid)).to.equal(10500n);
      expect(await contract.getTotalSupply(cid)).to.equal(116263n);
      expect(await contract.lastLedgerSeq(cid)).to.equal(1n);
    });

    it('records an advance mint (budgetSource 1, activationEpoch>0) with recordType ADVANCE_MINT (1)', async () => {
      const { contract, recorder } = await deploy();
      const recordHash = H('mint:advance');
      const tx = await contract
        .connect(recorder)
        .recordMint(cid, mid, 300n, 800n, 2000n, 1, 5, 1, recordHash);
      const receipt = await tx.wait();

      await expect(tx)
        .to.emit(contract, 'TokensMinted')
        .withArgs(cid, mid, 300n, 800n, 2000n, 1, 5n, recordHash);
      assertRecordHashTopic(receipt, await contract.getAddress(), recordHash);

      const rec = await contract.getRecord(recordHash);
      expect(rec.recordType).to.equal(1); // ADVANCE_MINT
    });

    it('reverts RECORD_EXISTS on duplicate recordHash', async () => {
      const { contract, recorder } = await deploy();
      const recordHash = H('mint:dup');
      await contract
        .connect(recorder)
        .recordMint(cid, mid, 500n, 10500n, 116263n, 0, 0, 1, recordHash);
      await expect(
        contract
          .connect(recorder)
          .recordMint(cid, mid, 1n, 1n, 1n, 0, 0, 2, recordHash),
      ).to.be.revertedWith('RECORD_EXISTS');
    });
  });

  describe('recordReversal', () => {
    const cid = H('community:rev');
    const mid = H('member:rev');

    async function withOriginal() {
      const ctx = await deploy();
      const original = H('mint:for-reversal');
      await ctx.contract
        .connect(ctx.recorder)
        .recordMint(cid, mid, 500n, 10500n, 116263n, 0, 0, 1, original);
      return { ...ctx, original };
    }

    it('reverts NOT_RECORDER for a non-recorder caller', async () => {
      const { contract, stranger, original } = await withOriginal();
      await expect(
        contract
          .connect(stranger)
          .recordReversal(cid, mid, 500n, 10000n, 115763n, original, 2, H('rev:1')),
      ).to.be.revertedWith('NOT_RECORDER');
    });

    it('reverts ORIGINAL_NOT_FOUND when the referenced record is absent', async () => {
      const { contract, recorder } = await deploy();
      await expect(
        contract
          .connect(recorder)
          .recordReversal(cid, mid, 500n, 10000n, 115763n, H('missing'), 2, H('rev:2')),
      ).to.be.revertedWith('ORIGINAL_NOT_FOUND');
    });

    it('emits TokensReversed, records reversalOf, and snapshots balances', async () => {
      const { contract, recorder, original } = await withOriginal();
      const recordHash = H('rev:success');
      const tx = await contract
        .connect(recorder)
        .recordReversal(cid, mid, 500n, 10000n, 115763n, original, 2, recordHash);
      const receipt = await tx.wait();

      await expect(tx)
        .to.emit(contract, 'TokensReversed')
        .withArgs(cid, mid, 500n, 10000n, 115763n, recordHash);
      assertRecordHashTopic(receipt, await contract.getAddress(), recordHash);

      expect(await contract.reversalOf(recordHash)).to.equal(original);
      const rec = await contract.getRecord(recordHash);
      expect(rec.recordType).to.equal(2); // REVERSAL
      expect(await contract.getBalance(cid, mid)).to.equal(10000n);
      expect(await contract.getTotalSupply(cid)).to.equal(115763n);
    });

    it('uses assignment (snapshot) semantics, not accumulation', async () => {
      const { contract, recorder, original } = await withOriginal();
      // After the original mint (ledgerSeq 1) balance is 10500 / supply 116263.
      // A reversal at seq 2 writes an absolute snapshot; a mint at seq 3
      // overwrites again — each newer ledgerSeq assigns, never accumulates.
      await contract
        .connect(recorder)
        .recordReversal(cid, mid, 500n, 10000n, 115763n, original, 2, H('rev:snap'));
      expect(await contract.getBalance(cid, mid)).to.equal(10000n);

      await contract
        .connect(recorder)
        .recordMint(cid, mid, 999n, 42n, 77n, 0, 0, 3, H('mint:overwrite'));
      // If it accumulated, balance would be 10000+42; assignment => exactly 42.
      expect(await contract.getBalance(cid, mid)).to.equal(42n);
      expect(await contract.getTotalSupply(cid)).to.equal(77n);
    });

    it('reverts RECORD_EXISTS on duplicate reversal recordHash', async () => {
      const { contract, recorder, original } = await withOriginal();
      const recordHash = H('rev:dup');
      await contract
        .connect(recorder)
        .recordReversal(cid, mid, 500n, 10000n, 115763n, original, 2, recordHash);
      await expect(
        contract
          .connect(recorder)
          .recordReversal(cid, mid, 1n, 1n, 1n, original, 3, recordHash),
      ).to.be.revertedWith('RECORD_EXISTS');
    });
  });

  describe('ledgerSeq guard (out-of-order writes)', () => {
    const cid = H('community:seq');
    const mid = H('member:seq');

    it('does not let a stale ledgerSeq overwrite a newer balance snapshot', async () => {
      const { contract, recorder } = await deploy();

      // seq=2 lands first, carrying the newer balances.
      await contract
        .connect(recorder)
        .recordMint(cid, mid, 200n, 200n, 200n, 0, 0, 2, H('seq:new'));
      expect(await contract.getBalance(cid, mid)).to.equal(200n);
      expect(await contract.getTotalSupply(cid)).to.equal(200n);
      expect(await contract.lastLedgerSeq(cid)).to.equal(2n);

      // seq=1 (an older, retried record) arrives late. It MUST still be
      // notarised (meta + event) but MUST NOT roll the mirror back.
      const staleHash = H('seq:old');
      const tx = await contract
        .connect(recorder)
        .recordMint(cid, mid, 100n, 100n, 100n, 0, 0, 1, staleHash);

      await expect(tx)
        .to.emit(contract, 'TokensMinted')
        .withArgs(cid, mid, 100n, 100n, 100n, 0, 0n, staleHash);
      // The record IS registered (notarisation is unconditional)...
      expect((await contract.getRecord(staleHash)).exists).to.equal(true);
      // ...but the balance mirror and the guard are untouched.
      expect(await contract.getBalance(cid, mid)).to.equal(200n);
      expect(await contract.getTotalSupply(cid)).to.equal(200n);
      expect(await contract.lastLedgerSeq(cid)).to.equal(2n);
    });

    it('skips the mirror when ledgerSeq equals lastLedgerSeq (strict >, replay-safe)', async () => {
      const { contract, recorder } = await deploy();
      await contract
        .connect(recorder)
        .recordMint(cid, mid, 500n, 500n, 500n, 0, 0, 5, H('seq:eq-first'));
      // A different record at the SAME seq must not re-apply an equal snapshot.
      await contract
        .connect(recorder)
        .recordMint(cid, mid, 1n, 999n, 999n, 0, 0, 5, H('seq:eq-second'));
      expect(await contract.getBalance(cid, mid)).to.equal(500n);
      expect(await contract.getTotalSupply(cid)).to.equal(500n);
      expect(await contract.lastLedgerSeq(cid)).to.equal(5n);
    });

    it('resumes mirroring once a newer ledgerSeq arrives after a stale one', async () => {
      const { contract, recorder } = await deploy();
      await contract
        .connect(recorder)
        .recordMint(cid, mid, 200n, 200n, 200n, 0, 0, 2, H('seq:r-new'));
      // Stale seq=1 is skipped.
      await contract
        .connect(recorder)
        .recordMint(cid, mid, 100n, 100n, 100n, 0, 0, 1, H('seq:r-stale'));
      expect(await contract.getBalance(cid, mid)).to.equal(200n);
      // seq=3 is strictly newer -> mirror resumes.
      await contract
        .connect(recorder)
        .recordMint(cid, mid, 300n, 300n, 300n, 0, 0, 3, H('seq:r-newer'));
      expect(await contract.getBalance(cid, mid)).to.equal(300n);
      expect(await contract.getTotalSupply(cid)).to.equal(300n);
      expect(await contract.lastLedgerSeq(cid)).to.equal(3n);
    });

    it('guards each community independently', async () => {
      const { contract, recorder } = await deploy();
      const cidA = H('community:seqA');
      const cidB = H('community:seqB');
      // Advance community A to seq 4.
      await contract
        .connect(recorder)
        .recordMint(cidA, mid, 400n, 400n, 400n, 0, 0, 4, H('seqA:1'));
      // Community B still starts at 0, so its seq 1 applies normally.
      await contract
        .connect(recorder)
        .recordMint(cidB, mid, 100n, 100n, 100n, 0, 0, 1, H('seqB:1'));
      expect(await contract.getBalance(cidA, mid)).to.equal(400n);
      expect(await contract.getBalance(cidB, mid)).to.equal(100n);
      expect(await contract.lastLedgerSeq(cidA)).to.equal(4n);
      expect(await contract.lastLedgerSeq(cidB)).to.equal(1n);
    });

    it('notarises a stale reversal without rolling back a newer balance', async () => {
      const { contract, recorder } = await deploy();
      const original = H('seq:rev-orig');
      // Mint at seq 1 (balance 500), then a newer mint at seq 3 (balance 900).
      await contract
        .connect(recorder)
        .recordMint(cid, mid, 500n, 500n, 500n, 0, 0, 1, original);
      await contract
        .connect(recorder)
        .recordMint(cid, mid, 400n, 900n, 900n, 0, 0, 3, H('seq:rev-new'));
      expect(await contract.getBalance(cid, mid)).to.equal(900n);

      // A late reversal carrying seq=2 (older than 3) is notarised (reversalOf +
      // event) but must not roll the balance back to its stale snapshot.
      const revHash = H('seq:rev-stale');
      await contract
        .connect(recorder)
        .recordReversal(cid, mid, 500n, 0n, 0n, original, 2, revHash);
      expect(await contract.reversalOf(revHash)).to.equal(original);
      expect((await contract.getRecord(revHash)).exists).to.equal(true);
      expect(await contract.getBalance(cid, mid)).to.equal(900n); // unchanged
      expect(await contract.getTotalSupply(cid)).to.equal(900n);
      expect(await contract.lastLedgerSeq(cid)).to.equal(3n);
    });

    it('lastLedgerSeq defaults to zero for an untouched community', async () => {
      const { contract } = await deploy();
      expect(await contract.lastLedgerSeq(H('community:never'))).to.equal(0n);
    });
  });

  describe('recordEpochSummary', () => {
    const cid = H('community:epoch');

    it('reverts NOT_RECORDER for a non-recorder caller', async () => {
      const { contract, stranger } = await deploy();
      await expect(
        contract
          .connect(stranger)
          .recordEpochSummary(cid, 3, 1000n, 500n, 400n, 100n, 50n, H('epoch:1')),
      ).to.be.revertedWith('NOT_RECORDER');
    });

    it('emits EpochRecorded and stores recordType EPOCH_SUMMARY (3)', async () => {
      const { contract, recorder } = await deploy();
      const recordHash = H('epoch:success');
      const tx = await contract
        .connect(recorder)
        .recordEpochSummary(cid, 3, 1000n, 500n, 400n, 100n, 50n, recordHash);
      const receipt = await tx.wait();

      await expect(tx)
        .to.emit(contract, 'EpochRecorded')
        .withArgs(cid, 3n, 1000n, 500n, 400n, 100n, 50n, recordHash);
      assertRecordHashTopic(receipt, await contract.getAddress(), recordHash);
      expect((await contract.getRecord(recordHash)).recordType).to.equal(3);
    });

    it('reverts RECORD_EXISTS on duplicate recordHash', async () => {
      const { contract, recorder } = await deploy();
      const recordHash = H('epoch:dup');
      await contract
        .connect(recorder)
        .recordEpochSummary(cid, 3, 1000n, 500n, 400n, 100n, 50n, recordHash);
      await expect(
        contract
          .connect(recorder)
          .recordEpochSummary(cid, 4, 1n, 1n, 1n, 1n, 1n, recordHash),
      ).to.be.revertedWith('RECORD_EXISTS');
    });
  });

  describe('recordPolicyVersion', () => {
    const cid = H('community:policy');

    it('reverts NOT_RECORDER for a non-recorder caller', async () => {
      const { contract, stranger } = await deploy();
      await expect(
        contract
          .connect(stranger)
          .recordPolicyVersion(cid, 2, 100, 3000, 500, 7, H('policy:1')),
      ).to.be.revertedWith('NOT_RECORDER');
    });

    it('emits PolicyVersionRecorded and stores recordType POLICY_VERSION (4)', async () => {
      const { contract, recorder } = await deploy();
      const recordHash = H('policy:success');
      const tx = await contract
        .connect(recorder)
        .recordPolicyVersion(cid, 2, 100, 3000, 500, 7, recordHash);
      const receipt = await tx.wait();

      await expect(tx)
        .to.emit(contract, 'PolicyVersionRecorded')
        .withArgs(cid, 2, 100, 3000, 500, 7n, recordHash);
      assertRecordHashTopic(receipt, await contract.getAddress(), recordHash);
      expect((await contract.getRecord(recordHash)).recordType).to.equal(4);
    });

    it('reverts RECORD_EXISTS on duplicate recordHash', async () => {
      const { contract, recorder } = await deploy();
      const recordHash = H('policy:dup');
      await contract
        .connect(recorder)
        .recordPolicyVersion(cid, 2, 100, 3000, 500, 7, recordHash);
      await expect(
        contract
          .connect(recorder)
          .recordPolicyVersion(cid, 3, 1, 1, 1, 8, recordHash),
      ).to.be.revertedWith('RECORD_EXISTS');
    });
  });

  describe('recordProposalSnapshot', () => {
    const cid = H('community:snap');
    const pid = H('proposal:snap');
    // T3: weightsMerkleRoot is a non-indexed data param immediately before the
    // (still last-indexed) recordHash, so recordHash remains at topics[3].
    const weightsRoot = H('snap:weights-root');

    it('reverts NOT_RECORDER for a non-recorder caller', async () => {
      const { contract, stranger } = await deploy();
      await expect(
        contract
          .connect(stranger)
          .recordProposalSnapshot(cid, pid, 3, 10000n, 8000n, 2, weightsRoot, H('snap:1')),
      ).to.be.revertedWith('NOT_RECORDER');
    });

    it('emits ProposalSnapshotRecorded and stores recordType PROPOSAL_SNAPSHOT (5)', async () => {
      const { contract, recorder } = await deploy();
      const recordHash = H('snap:success');
      const tx = await contract
        .connect(recorder)
        .recordProposalSnapshot(cid, pid, 3, 10000n, 8000n, 2, weightsRoot, recordHash);
      const receipt = await tx.wait();

      await expect(tx)
        .to.emit(contract, 'ProposalSnapshotRecorded')
        .withArgs(cid, pid, 3n, 10000n, 8000n, 2, weightsRoot, recordHash);
      assertRecordHashTopic(receipt, await contract.getAddress(), recordHash);
      expect((await contract.getRecord(recordHash)).recordType).to.equal(5);
    });

    it('emits a zero weightsMerkleRoot when no tree was published', async () => {
      const { contract, recorder } = await deploy();
      const recordHash = H('snap:zero-root');
      await expect(
        contract
          .connect(recorder)
          .recordProposalSnapshot(cid, pid, 3, 10000n, 8000n, 2, ethers.ZeroHash, recordHash),
      )
        .to.emit(contract, 'ProposalSnapshotRecorded')
        .withArgs(cid, pid, 3n, 10000n, 8000n, 2, ethers.ZeroHash, recordHash);
    });

    it('reverts RECORD_EXISTS on duplicate recordHash', async () => {
      const { contract, recorder } = await deploy();
      const recordHash = H('snap:dup');
      await contract
        .connect(recorder)
        .recordProposalSnapshot(cid, pid, 3, 10000n, 8000n, 2, weightsRoot, recordHash);
      await expect(
        contract
          .connect(recorder)
          .recordProposalSnapshot(cid, pid, 4, 1n, 1n, 3, weightsRoot, recordHash),
      ).to.be.revertedWith('RECORD_EXISTS');
    });
  });

  describe('recordProposalResult', () => {
    const cid = H('community:result');
    const pid = H('proposal:result');
    const winning = H('option:winner');
    // T3: votesMerkleRoot is a non-indexed data param immediately before the
    // (still last-indexed) recordHash, so recordHash remains at topics[3].
    const votesRoot = H('result:votes-root');

    it('reverts NOT_RECORDER for a non-recorder caller', async () => {
      const { contract, stranger } = await deploy();
      await expect(
        contract
          .connect(stranger)
          .recordProposalResult(cid, pid, winning, 42, 99999n, votesRoot, H('result:1')),
      ).to.be.revertedWith('NOT_RECORDER');
    });

    it('emits ProposalResultRecorded and stores recordType PROPOSAL_RESULT (6)', async () => {
      const { contract, recorder } = await deploy();
      const recordHash = H('result:success');
      const tx = await contract
        .connect(recorder)
        .recordProposalResult(cid, pid, winning, 42, 99999n, votesRoot, recordHash);
      const receipt = await tx.wait();

      await expect(tx)
        .to.emit(contract, 'ProposalResultRecorded')
        .withArgs(cid, pid, winning, 42, 99999n, votesRoot, recordHash);
      assertRecordHashTopic(receipt, await contract.getAddress(), recordHash);
      expect((await contract.getRecord(recordHash)).recordType).to.equal(6);
    });

    it('emits a zero votesMerkleRoot when no tree was published', async () => {
      const { contract, recorder } = await deploy();
      const recordHash = H('result:zero-root');
      await expect(
        contract
          .connect(recorder)
          .recordProposalResult(cid, pid, winning, 42, 99999n, ethers.ZeroHash, recordHash),
      )
        .to.emit(contract, 'ProposalResultRecorded')
        .withArgs(cid, pid, winning, 42, 99999n, ethers.ZeroHash, recordHash);
    });

    it('reverts RECORD_EXISTS on duplicate recordHash', async () => {
      const { contract, recorder } = await deploy();
      const recordHash = H('result:dup');
      await contract
        .connect(recorder)
        .recordProposalResult(cid, pid, winning, 42, 99999n, votesRoot, recordHash);
      await expect(
        contract
          .connect(recorder)
          .recordProposalResult(cid, pid, winning, 1, 1n, votesRoot, recordHash),
      ).to.be.revertedWith('RECORD_EXISTS');
    });
  });

  describe('read functions', () => {
    it('getRecord returns exists=false for an unknown recordHash', async () => {
      const { contract } = await deploy();
      const rec = await contract.getRecord(H('never-written'));
      expect(rec.exists).to.equal(false);
      expect(rec.recordType).to.equal(0);
      expect(rec.blockNumber).to.equal(0n);
      expect(rec.timestamp).to.equal(0n);
    });

    it('getBalance / getTotalSupply default to zero', async () => {
      const { contract } = await deploy();
      expect(await contract.getBalance(H('c'), H('m'))).to.equal(0n);
      expect(await contract.getTotalSupply(H('c'))).to.equal(0n);
    });
  });

  describe('setRecorder', () => {
    it('reverts NOT_OWNER for a non-owner caller', async () => {
      const { contract, recorder, newRecorder } = await deploy();
      await expect(
        contract.connect(recorder).setRecorder(newRecorder.address),
      ).to.be.revertedWith('NOT_OWNER');
    });

    it('reverts ZERO_ADDRESS for the zero address', async () => {
      const { contract, owner } = await deploy();
      await expect(
        contract.connect(owner).setRecorder(ethers.ZeroAddress),
      ).to.be.revertedWith('ZERO_ADDRESS');
    });

    it('emits RecorderChanged and rotates authority', async () => {
      const { contract, owner, recorder, newRecorder } = await deploy();
      const cid = H('community:rotate');
      const mid = H('member:rotate');

      await expect(contract.connect(owner).setRecorder(newRecorder.address))
        .to.emit(contract, 'RecorderChanged')
        .withArgs(recorder.address, newRecorder.address);
      expect(await contract.recorder()).to.equal(newRecorder.address);

      // Old recorder loses write authority.
      await expect(
        contract
          .connect(recorder)
          .recordMint(cid, mid, 1n, 1n, 1n, 0, 0, 1, H('after:old')),
      ).to.be.revertedWith('NOT_RECORDER');

      // New recorder can write.
      await expect(
        contract
          .connect(newRecorder)
          .recordMint(cid, mid, 1n, 1n, 1n, 0, 0, 1, H('after:new')),
      ).to.emit(contract, 'TokensMinted');
    });
  });
});
