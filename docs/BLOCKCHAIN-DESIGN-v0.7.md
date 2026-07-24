# YouFen v0.7 — 区块链层实现权威（Protocol-Enforced Community Ownership）

**状态**：Phase 0（冻结）✅ · Phase 1（合约 + 对抗测试）✅ · Phase 2–4（后端/API/端到端）待实现
**合约**：`contracts/YouFenGovernance.sol`（Solidity 0.8.24，viaIR）· 测试 `contracts/test/YouFenGovernance.test.ts`（23 项对抗性验收全绿）
**取代**：v0.6 的存证合约 `YouFenRecords.sol`（notary）。v0.6 仍有效的部分（canonical JSON / keccak256 recordHash / Injective RPC 事实）见 `docs/BLOCKCHAIN-DESIGN.md`，本文档取代其**合约 / 授权 / 签名模型**。

> 本文档是四份设计草案（合约 / 签名-Relayer / 数据-API / 威胁模型）经**对抗性一致性审查**后的单一事实源。四份草案曾在 26 处漂移（EIP-712 domain version 三个值、mint 结构四份互不相同、三套互斥的治理快照机制……），全部裁决冻结于此。凡代码与本文档冲突，即为 bug，而非设计选择。

---

## 0. 核心思想

v0.6 的信任模型是「平台判断 → 平台钱包签一切 → 写进链」，链只证明「记录写入后未被改」——这是**存证**，不是**规则执行**。v0.7 把链变成**权威**：

```
社区链下判断贡献是否真实
  ↓
管理员（approver）用各自的客户端私钥 EIP-712 签名授权
  ↓
YouFen 只做 Relayer：代付 gas、提交交易，零业务权限
  ↓
YouFenGovernance 合约验证签名 + 强制执行预算 / 成员上限 / 预支比例 / 治理门禁
  ↓
任何超预算、超权限、违反快照的操作直接 Revert
```

**唯一不可动摇的不变量**（四份草案一致，不再重议）：成员/审批人私钥**客户端持有**，服务端永不接触；`msg.sender`（Relayer）**永不是授权输入**；权限 = 从 EIP-712 签名恢复出的签名者。这就是「YouFen 不能替成员投票 / 铸币」为真的根据。

---

## 1. 冻结 EIP-712 domain + 类型化数据（逐字节——每一层签名/验证/存储必须完全一致）

```
EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)
  name = "YouFen"   version = "0.7"   chainId = 1439 (Injective testnet; 本地测试用运行时 chainId)
  verifyingContract = address(YouFenGovernance)
```

单合约多社区：全局 domain separator，`communityId` 是**每个结构体内部的字段**（跨社区重放隔离），`chainId` 在 domain 内（跨链重放隔离）。Digest = `keccak256("\x19\x01" ‖ DOMAIN_SEPARATOR ‖ hashStruct)`。**任何结构体都不含被签名的后置状态或派生值**——合约从链上状态重算预算、上限、累计预支、激活 Epoch、投票权重。

| 结构体 | 字段（顺序即 typehash 顺序） | 签名方 |
|---|---|---|
| `MintAuthorization` | communityId, memberIdHash, contributionId, ruleVersion(u32), epochNumber(u64), regularAmount, advanceAmount, relatedParty(bool), proposalId, evidenceHash, recordHash, nonce, deadline | **approver(s)** |
| `ReversalAuthorization` | communityId, memberIdHash, originalRecordHash, amount, proposalId, evidenceHash, recordHash, nonce, deadline | approver(s) |
| `VoteAuthorization` | communityId, proposalId, memberIdHash, optionId, nonce, deadline（**无 weight** 字段） | **成员本人** |
| `MemberEnrollment` | communityId, memberIdHash, signerAddress, nonce, deadline | 成员(持有证明) + approver/owner(共同授权) |
| `KeyRotation` | communityId, memberIdHash, newSignerAddress, nonce, deadline | 当前注册密钥（MVP；guardian M-of-N 为后续） |
| `ProposalCreation` | communityId, proposalId, kind(u8), optionsHash, endTime(u64), minVoterCount(u32), targetMemberIdHash, pInflationRateBps, pMaxAdvanceRateBps, pMemberMintCapRateBps, nonce, deadline | approver（创建者） |

要点：mint 结构体是**双腿**（`regularAmount` + `advanceAmount`，split = 两者皆 > 0），**无 recipientSigner 地址**、**无 ruleId**、**无 policyVersion 之外的 ruleVersion 语义**；余额与治理状态一律以 `memberIdHash`（加盐脱敏）为键，地址只出现在 `memberSigner[community][memberIdHash]`。

---

## 2. 冻结合约函数 + executeMint 强制顺序

```solidity
// 社区 / approver / 生命周期
createCommunity(communityId, owner, approverThreshold, inflationRateBps, maxAdvanceRateBps, memberMintCapRateBps, minVoterCount, genesisOpeningSupply)
setApprover(communityId, account, bool)                         // owner-only；非经济
// 成员密钥注册（客户端持钥）
enrollMember(MemberEnrollment a, bytes memberSig, bytes authSig)
rotateKey(KeyRotation a, bytes[] rotationSigs)
// 强制执行核心（approver 签名；msg.sender 永不授权）
executeMint(MintAuthorization a, bytes[] approverSigs)          // regular + advance 双腿
executeReversal(ReversalAuthorization a, bytes[] approverSigs)
// 治理
createProposal(...)                                            // 冻结 snapshotSeq + snapshotEpoch
castVote(VoteAuthorization v, bytes memberSig)                 // 成员本人签名；链上计票
relayVotes(VoteAuthorization[] vs, bytes[] sigs)              // 批量；skip-invalid，返回 acceptedCount
finalizeProposal(proposalId)                                  // endTime 后；计票 + 状态
executeProposal(proposalId)                                   // 未过则 revert QUORUM_NOT_MET / POLICY_PROPOSAL_REQUIRED
// Epoch（无需权限）
rollEpoch(communityId)                                        // 任何人可调；只推进派生状态
// pause（只挡新操作，永不挡读取/历史）
pause() / unpause()                                           // pauseGuardian-only
// 视图（无需权限；全量重建 + 校验）
governanceBalanceAt(communityId, memberIdHash, seq, epoch)    // O(log n)
balanceOf / totalSupplyOf / getEpoch / memberSignerOf
```

**executeMint 强制顺序（fail-closed，全部链上重算）：**

1. `block.timestamp <= deadline`（`SIG_EXPIRED`）；社区存在（`COMMUNITY_UNKNOWN`）；`epochNumber == currentEpochNumber`（`EPOCH_MISMATCH`）；epoch active（`EPOCH_NOT_ACTIVE`）；`ruleVersion == activePolicyVersion`（`POLICY_VERSION_STALE`）。
2. 单次执行守卫：`!contributionConsumed`（`CONTRIBUTION_ALREADY_MINTED`）；`!recordExists[recordHash]`（`RECORD_EXISTS`）。
3. `amount = regularAmount + advanceAmount > 0`（`ZERO_AMOUNT`）。
4. **成员 Epoch 上限（硬）**：`memberRegularMintedEpoch + regularAmount <= base*memberMintCapRateBps/10000` 否则 `MEMBER_EPOCH_CAP_EXCEEDED`。超额**只能**经已通过的 `SPECIAL_MINT` 提案豁免（`proposalId` 引用之）。
5. **预支腿**：若 `advanceAmount>0`：`advanceDebtFromPrev==0` 否则 `ROLLING_ADVANCE_FORBIDDEN`；`base>0`；单笔 `advanceAmount<=maxAdvanceAmount` 否则 `ADVANCE_CAP_EXCEEDED`；**累计（split-order 防绕过）** `(advanceMinted+advanceAmount)*10000/base <= 2500` 否则 `ADVANCE_LIMIT_EXCEEDED`。
6. **预算充足**：`regularAmount <= effectiveRegularBudget - regularMinted` 否则 `INSUFFICIENT_BUDGET`。
7. **审批分层**（只算恢复出的 approver；去重；拒 addr(0)/自审批）：`tierFloor` = 1；`0<累计预支<=1000bps` 或 `relatedParty` ⇒ 2；`累计预支>1000bps` 或 special/related 超额 或 reversal ⇒ 需已通过 `proposalId`（`PROPOSAL_REQUIRED`）。`distinctApprovers >= max(approverThreshold, tierFloor)` 否则 `APPROVER_THRESHOLD_NOT_MET`；proposal 门禁校验 FINALIZED+approved+quorum+target 匹配+单次使用。
8. **Effects**：置 `contributionConsumed`/`recordExists`/`usedNonce[signer][nonce]`（每 approver）；`balances +=`、`totalSupply +=`、`regularMinted += regular`、`advancedMinted += advance`、`memberRegularMintedEpoch += regular`；`seq = ++govSeq`；push 治理 checkpoint（regular@seq 立即生效 / advance@seq 于 epoch+1 成熟）；`emit MintExecuted(...含全量后置状态..., activationEpoch, seq)`。

**治理快照读路径 `governanceBalanceAt`（O(log n)，快照稳定）**：per-member 的 `RegCheckpoint[]`（`{seq, cumRegularGov}`）+ `AdvanceGrant[]`（`{seq, activationEpoch, cumAdvancePrefix}`）。读 = 两次二分：regular 取 `seq<=snapSeq` 的最大前缀；advance 取 `seq<=snapSeq` **且** `activationEpoch<=snapEpoch` 两前缀之 `min`。Epoch 切换对这两个数组**零操作**（成熟由读时谓词表达，无 O(n) 遍历）。快照后新增的 mint 追加在 `seq>snapshotSeq`，二分自动排除——**投票前突击增发买不到当前票权**。

**rollEpoch 债务守恒**（逐字节移植 `lib/engine/calc.ts`）：`carriedOver = max(0, prevDebt - base)`；`nextDebt = advanceMinted + carriedOver`；`nextBase = openingSupply*inflationRateBps/10000`；`nextEffective = max(0, nextBase - nextDebt)`；`nextMaxAdv = nextBase*maxAdvanceRateBps/10000`。债务 > 预算的边界：`nextEffective=0`，余债 `advanceDebtFromPrev` 持续，`ROLLING_ADVANCE_FORBIDDEN` 阻断新预支，余债只能靠后续 roll 收缩，**绝不静默免除**。pending policy 只在 `effectiveEpoch <= nextN` 时生效。成员上限累加器按 `epochNumber` 键，切 epoch 自动归零（无 O(n) 循环）。

---

## 3. 冻结事件（每个 DB 投影列都在某条 log 里 → getLogs 可全量重建 DB）

`recordHash` 是 mint/reversal 事件的**最后一个 indexed topic（topics[3]）**（保留 v0.6 崩溃重建不变量）。事件集：`CommunityCreated` · `ApproverSet` · `MemberEnrolled` · `MemberKeyRotated` · `MintExecuted`(communityId/memberIdHash/recordHash indexed + 全量后置状态 + activationEpoch + govSeqAfter + approvalTier) · `ReversalExecuted` · `ProposalCreated`(snapshotSeq/snapshotEpoch/activeGovSupplySnapshot/optionsHash) · `VoteCast`(weight) · `ProposalFinalized`(quorumMet/approved) · `ProposalExecuted` · `EpochRolled`(全量预算) · `PolicyPending` · `PolicyActivated` · `Paused` · `Unpaused`。

---

## 4. 冻结 revert 常量（单一权威集——验收测试的拼写为准）

```
SIG_EXPIRED  BAD_NONCE  INVALID_MEMBER_SIGNATURE  INVALID_APPROVER_SIGNATURE  APPROVER_THRESHOLD_NOT_MET
DUPLICATE_APPROVER  SELF_APPROVAL  MEMBER_EPOCH_CAP_EXCEEDED  INSUFFICIENT_BUDGET  ADVANCE_CAP_EXCEEDED
ADVANCE_LIMIT_EXCEEDED  ROLLING_ADVANCE_FORBIDDEN  PROPOSAL_REQUIRED  POLICY_PROPOSAL_REQUIRED
EPOCH_MISMATCH  EPOCH_NOT_ACTIVE  POLICY_VERSION_STALE  ZERO_AMOUNT  CONTRIBUTION_ALREADY_MINTED  RECORD_EXISTS
VOTING_CLOSED  VOTING_OPEN  PROPOSAL_NOT_OPEN  PROPOSAL_NOT_FINALIZED  PROPOSAL_EXISTS  ALREADY_VOTED
NOT_IN_SNAPSHOT  QUORUM_NOT_MET  BAD_OPTION  BAD_OPTIONS  COMMUNITY_MISMATCH  COMMUNITY_UNKNOWN  COMMUNITY_EXISTS
ORIGINAL_NOT_FOUND  ALREADY_REVERSED  INSUFFICIENT_BALANCE  SIGNER_ALREADY_ACTIVE  ENROLLMENT_NOT_AUTHORIZED
ROTATION_NOT_AUTHORIZED  MEMBER_NOT_ENROLLED  ZERO_ADDRESS  NOT_REGISTRAR  NOT_AN_APPROVER  BAD_THRESHOLD
PAUSED  REENTRANCY
```

`NO_DIRECT_POLICY_EDIT` 由 **ABI 缺席**证明（无 `setInflationRate`/`setPolicy`/`adminMint`/`setBalance`/`seize` selector），测试断言之——无对应代码路径。非转让性同样「由缺席保证」（无 `transfer`/`transferFrom`/`approve`/`allowance`）。

---

## 5. 后端 Phase 2–4 冻结契约（供后续实现）

**Prisma 模型**：新增 13 —— `MemberSigner`, `CommunityController`, `CommunityApprover`, `SignatureRequest`, `Signature`, `ChainAction`, `ChainTransaction`, `ChainEvent`, `SyncCheckpoint`, `TokenRuleVersion`, `MemberEpochMintCounter`, `ProposalExecution`, `SignerChallenge`。既有模型转为**从 `ChainEvent` 重建的投影**（绝不由 API 命令路径写权威余额）：`PublicRecord`, `CommunityTokenPolicy`, `CommunityTokenState`, `MemberTokenBalance`, `TokenEpoch`, `TokenMintEvent`, `TokenReversalEvent`, `Proposal`, `Vote`, `ProposalMemberSnapshot`, `TokenPolicyVersion`, `TokenAdvanceRequest`, `Contribution`, `Member`。**类型铁律**：金额/余额/供应/gas-wei = `Decimal @db.Decimal(78,0)`；bps/epoch/version/nonce/logIndex/ledgerSeq/blockNumber = `Int`/`BigInt`；JSON 边界一律十进制字符串（`jsonSafe` 的 `Prisma.Decimal → toFixed(0)` 分支是防 `number` 泄漏的唯一咽喉）。

**API（21 端点）**：server 授权「谁可创建/收集/提交」，合约授权「动作本身」。signer challenge/register/rotate · contributions mint-request · mint-requests get/sign/submit · reversal-requests create/sign/submit · proposals activate/vote-authorization/votes-relay/finalize/execute · public-records payload/proof/verify · internal chain-actions submit/retry + chain sync/health。所有变更端点需 `Idempotency-Key`；确认余额**只**由 `chain/sync` 折叠写入。

**ChainAction 状态机**：`awaiting_signatures → ready_to_submit → submitting → submitted → confirming → verified | reverted | expired | superseded`；每步为条件 UPDATE（`WHERE id + status IN(from)`，0 行 = 幂等 no-op）；**只有 `verified` 增加确认余额**（经 indexer）。

---

## 6. 分阶段实现顺序

- **Phase 0 冻结** ✅ —— 本文档 §1/§2/§4 即冻结产物。（`IYouFenGovernance.sol` 接口 + `lib/blockchain/signing/typed-data.ts` 的 golden-vector 摘要一致性测试为后续锁 I1–I3 回归的门。合约已内联 typehash 常量，并 export `domainSeparator()`/`hashMintAuthorization()` 供 TS 侧比对。）
- **Phase 1 合约** ✅ —— `YouFenGovernance.sol` 实现完毕；`YouFenGovernance.test.ts` 的 23 项对抗性验收全绿（六个越权 demo + 冻结 revert + 快照冻结 + 预算守恒 + 非转让）。
- **Phase 2 后端库**（依赖 P1 ABI + P0 签名）：`signing/*`（recover/auth-envelope/member-signer）、`signatures/*`（阈值策略 = §2 step-7 的链下 fail-fast 镜像 + request-assembler）、`relay/*`（ChainAction 状态机 + submitter/confirm worker）、`indexer/*`（event-decoder + projection.apply（ledgerSeq 守卫）+ reconciler + rebuild）。Prisma 迁移（§5）为 P2 前置。
- **Phase 3 API**：21 端点，按资源组并行；共享 `lib/api/core/*`（respond/idempotency/auth/validation + `jsonSafe` Decimal 分支）先落。v0.6 旧端点回 410 GONE 重定向。
- **Phase 4 端到端**：浏览器 MemberSigner（passkey-prf / encrypted-local）签名 → API 收集 → Relayer 提交 → indexer 投影 → `/verify` 返回 `enforcementMatches:true`；rebuild 灾备演练（清库 → `/chain/sync` 从 deployBlock 重放 → 投影逐字节一致）。

**关键路径**：P0 → P1(storage→enforcement) → P2(migration→relay) → P3(mint 端点) → P4(端到端 demo)。P0 的 golden-vector 摘要测试与 P1 的验收套件是拦截 I1–I3 / I7 / I16–I19 回归的两道硬门。

---

## 7. 经济模型溯源（do-not-drift；链上公式逐字节移植 v0.6）

| 链上公式 | v0.6 来源 |
|---|---|
| `baseMintBudget = openingSupply*inflationRateBps/10000`（floor） | `calc.calculateBaseMintBudget` |
| `effectiveRegularBudget = max(0, base-debt)` | `calc.calculateEffectiveRegularBudget` |
| `carriedOverDebt = max(0, debt-base)`；`nextDebt = advanceMinted + carriedOver` | `calc.calculateCarriedOverDebt` + `epoch-service` |
| `maxAdvanceAmount = base*maxAdvanceRateBps/10000` | `calc.calculateMaxAdvanceAmount` |
| `memberEpochCap = base*memberMintCapRateBps/10000` | `calc.calculateMemberEpochCap` |
| `cumBps = (advanceMinted+requested)*10000/base`（epoch-累计） | `calc.calculateCumulativeAdvanceRateBps` + `mint-service.verifyAdvanceApproval` |
| 审批分层 0 / >0 / >1000 / >2500 + related/special | `calc.resolveAdvanceApproval` + role §6.2 |
| 平票/零票 → reject；quorum = voterCount>=minVoterCount；仅 approve+quorum 结算 | `proposal-service.resolveOutcome/end/settle` |
| 快照权重冻结；快照后 mint 排除 | `proposal-service.activate` + `castVote` 快照行 |
| debt>0 时禁新预支 | `advance-service` + `mint-service` |

---

## 8. 与冻结蓝图的差异记录（MVP 取舍，已在测试中验证）

- **key rotation**：MVP 仅接受当前注册密钥签名授权；guardian M-of-N 恢复为后续。
- **createProposal 创建者签名**：`ProposalCreation` 结构体绑定核心参数，`nonce=0`/`deadline=endTime`（proposalId 唯一性即单次创建守卫）。
- **finalize 胜出判定**：approve/reject 型选票用「approve 权重严格过半」判 approved；多选项 `COMMUNITY_DECISION` 的复数胜者由链下从 `VoteCast` 日志聚合（链上仅结算受门禁的 kinds）。
- **YouFenCommunityFactory**（每社区一合约）：非 MVP 路径；结构体内 `communityId` 绑定已提供签名重放隔离，工厂仅在需要每社区升级隔离/独立 pause 时再引入。
