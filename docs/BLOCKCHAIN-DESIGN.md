# YouFen Injective 后端接口层设计（权威版）

> ⚠️ **v0.7 升级中**：合约 / 授权 / 签名模型已升级为协议执行型，权威见 **`docs/BLOCKCHAIN-DESIGN-v0.7.md`**（`YouFenGovernance` 合约 + EIP-712 + 冻结 revert）。本文档（v0.6）关于 canonical JSON / keccak256 recordHash / BullMQ 队列 / Injective RPC 事实的部分仍然有效并被 v0.7 复用；其存证合约 `YouFenRecords` 被 v0.7 的 `YouFenGovernance` 取代。

> 本文档取代 ARCHITECTURE.md 第 6 节（旧版与 PRD 冲突已审计确认）。以 PRD.md §10/§24/§26/§27/§28 为需求权威，本文档为实现权威。

> 范围：全量实现，不做黑客松降级（风险清单中的 MVP 降级路径仅作参考，不执行）。


## 1. 模块结构

```text
lib/blockchain/
├── index.ts                      # 对外唯一出口：导出 InjectiveService 工厂 + 类型（~50 行）
├── config.ts                     # env 校验（RPC_URL/CONTRACT_ADDRESS/SERVER_WALLET_KEY/HASH_PEPPER/CONFIRMATIONS），启动时 fail-fast（~80 行）
├── types.ts                      # RecordType、VerificationStatus、SubmitResult、ConfirmResult、VerifyResult、CanonicalPayload 等共享类型（~150 行）
├── errors.ts                     # ChainError 分类：RetryableError / TerminalError / AlreadyRecordedError / NonceError（~80 行）
├── abi/
│   └── youfen-records.ts         # 合约 ABI 常量 + 事件 topic 常量（生成物，~200 行）
├── hashing/
│   ├── canonicalize.ts           # canonical JSON 序列化（键排序/整数校验/UTF-8），纯函数（~120 行）
│   ├── record-hash.ts            # computeRecordHash = keccak256(canonicalize(envelope))，纯函数（~60 行）
│   └── id-hash.ts                # hashCommunityId / hashMemberId → bytes32（~60 行）
├── payloads/
│   ├── build-mint-payload.ts     # TokenMintEvent → MintPayload（普通/预支共用，~100 行）
│   ├── build-reversal-payload.ts # TokenReversalEvent → ReversalPayload（~80 行）
│   ├── build-epoch-payload.ts    # TokenEpoch → EpochSummaryPayload（~80 行）
│   ├── build-policy-payload.ts   # CommunityTokenPolicy → PolicyVersionPayload（~80 行）
│   └── build-proposal-payload.ts # Proposal → SnapshotPayload / ResultPayload（~120 行）
├── injective/
│   ├── provider.ts               # JsonRpcProvider 单例工厂（~40 行）
│   ├── wallet.ts                 # Server Wallet 加载 + nonce 显式管理（resync 逻辑）（~100 行）
│   ├── contract.ts               # 类型化合约实例（读/写两个视图）（~60 行）
│   ├── submitter.ts              # TxSubmitter：按 RecordType 分发到合约函数，签名+广播，不等确认（~200 行）
│   ├── confirmer.ts              # TxConfirmer：等 receipt、解析事件、判定 reverted（~120 行）
│   └── verifier.ts               # RecordVerifier：链上读 records(hash) + 重算哈希比对（~120 行）
├── records/
│   ├── record-service.ts         # PublicRecordService：DB CRUD、requestSubmission、markSuperseded（~250 行）
│   ├── state-machine.ts          # 六状态转换表 + assertTransition(from,to)，纯函数（~80 行）
│   └── reconciler.ts             # 崩溃对账：getLogs(topic=recordHash) 反查丢失的 txHash（~150 行）
└── queue/
    ├── queues.ts                 # BullMQ Queue 定义：chain-submit / chain-confirm / chain-reconcile（~80 行）
    ├── enqueue.ts                # enqueueRecordSubmission（幂等 jobId 构造）（~60 行）
    ├── submit-worker.ts          # concurrency=1 的提交 worker（~200 行）
    ├── confirm-worker.ts         # 确认 worker（可并发）（~120 行）
    └── reconcile-worker.ts       # repeatable 对账 worker（~100 行）

contracts/
├── YouFenRecords.sol             # 唯一合约（~250 行）
└── test/YouFenRecords.t.sol

app/api/public-records/[id]/
├── route.ts                      # GET 详情
├── submit/route.ts               # POST 提交
├── retry/route.ts                # POST 重试
└── verify/route.ts               # GET 实时验证

原则：hashing/ 与 payloads/ 全部纯函数（无 IO），前端与第三方可直接复用同一份 canonicalize/record-hash 代码复算哈希；injective/ 内签名(wallet)/提交(submitter)/确认(confirmer)/验证(verifier)四职责分离；queue/ 只做编排不含业务。每文件 60–250 行，符合 200–400 行小文件原则。
```


## 2. 合约接口

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// YouFenRecords — 平台唯一记录合约（Injective EVM Testnet）
/// 设计要点：
/// 1. 无 transfer/transferFrom/approve/allowance（PRD 28.2）——不可转让由"根本不存在该函数"保证，而非 revert；
/// 2. 所有写入仅 recorder（平台 Server Wallet）可调，owner 可轮换 recorder（私钥泄露时止损）；
/// 3. 每个事件的 recordHash 均为 indexed —— 后端崩溃丢 txHash 后可 getLogs(topic=recordHash) 反查（对账核心）；
/// 4. require(!records[recordHash].exists) 是防重复上链的最后防线（队列层为第一防线）；
/// 5. Advance Mint 复用 recordMint/TokensMinted：PRD 28.3 事件已含 budgetSource+activationEpoch，
///    budgetSource=1 且 activationEpoch>0 即预支，RecordType 枚举仍区分七类用于 records 元数据；
/// 6. balanceOf/totalSupply 采用"赋值快照"而非"+=amount 并 require 一致"：链上镜像 DB 事务后快照，
///    个别记录永久失败不会 brick 后续所有 mint；并由社区维度严格递增的 ledgerSeq 守卫：
///    仅当 ledgerSeq > lastLedgerSeq[communityId] 时才写镜像并推进序号，否则跳过镜像（不 revert）——
///    晚到/乱序的旧记录（重试、对账）照常公证（records/事件/reversalOf），但绝不用过期余额覆盖新值；
///    ledgerSeq 由后端在 DB 事务内按社区分配（详见 §2 存储布局与写入函数）；
/// 7. recordReversal 带 originalRecordHash 并 require 其存在 —— 满足 PRD 10.3 "新记录必须引用原记录"，
///    事件签名保持 PRD 28.3 原样（引用关系在哈希原文与 reversalOf 映射中，可验证）。
contract YouFenRecords {
    enum RecordType { MINT, ADVANCE_MINT, REVERSAL, EPOCH_SUMMARY, POLICY_VERSION, PROPOSAL_SNAPSHOT, PROPOSAL_RESULT }

    struct RecordMeta { uint64 blockNumber; uint64 timestamp; uint8 recordType; bool exists; }

    address public owner;
    address public recorder;
    mapping(bytes32 => RecordMeta) public records;                          // recordHash → meta
    mapping(bytes32 => uint256) public totalSupplyOf;                       // communityIdHash → supply
    mapping(bytes32 => mapping(bytes32 => uint256)) public balanceOf;       // communityIdHash → memberIdHash → balance
    mapping(bytes32 => bytes32) public reversalOf;                          // reversal recordHash → original recordHash
    mapping(bytes32 => uint64) public lastLedgerSeq;                        // communityIdHash → 已应用的最新账本序号（镜像守卫）

    modifier onlyRecorder() { require(msg.sender == recorder, "NOT_RECORDER"); _; }
    modifier notRecorded(bytes32 h) { require(!records[h].exists, "RECORD_EXISTS"); _; }

    // ---- PRD 28.3 已给出的三个事件（原样保留）----
    event TokensMinted(bytes32 indexed communityId, bytes32 indexed memberId, uint256 amount,
        uint256 memberBalanceAfter, uint256 totalSupplyAfter, uint8 budgetSource,
        uint64 activationEpoch, bytes32 indexed recordHash);
    event TokensReversed(bytes32 indexed communityId, bytes32 indexed memberId, uint256 amount,
        uint256 memberBalanceAfter, uint256 totalSupplyAfter, bytes32 indexed recordHash);
    event EpochRecorded(bytes32 indexed communityId, uint64 indexed epochNumber, uint256 openingSupply,
        uint256 baseBudget, uint256 regularMinted, uint256 advancedMinted,
        uint256 advanceDebt, bytes32 indexed recordHash);

    // ---- 补全的事件（覆盖七类中其余三类；Advance Mint 由 TokensMinted 承载）----
    event PolicyVersionRecorded(bytes32 indexed communityId, uint32 indexed policyVersion,
        uint32 inflationRateBps, uint32 maxAdvanceRateBps, uint32 memberMintCapRateBps,
        uint64 effectiveEpoch, bytes32 indexed recordHash);
    // weightsMerkleRoot / votesMerkleRoot：非索引数据字段，紧邻仍为最后索引的 recordHash 之前
    // （recordHash 恒在 topics[3]）；提交个体可验证性承诺，bytes32(0) 表示未发布对应 Merkle 树。
    event ProposalSnapshotRecorded(bytes32 indexed communityId, bytes32 indexed proposalId,
        uint64 epochNumber, uint256 totalSupplySnapshot, uint256 activeGovernanceSupplySnapshot,
        uint32 policyVersion, bytes32 weightsMerkleRoot, bytes32 indexed recordHash);
    event ProposalResultRecorded(bytes32 indexed communityId, bytes32 indexed proposalId,
        bytes32 winningOptionIdHash, uint32 voterCount, uint256 totalVoteWeight,
        bytes32 votesMerkleRoot, bytes32 indexed recordHash);
    event RecorderChanged(address indexed oldRecorder, address indexed newRecorder);

    // ---- 写入函数（全部 onlyRecorder + notRecorded）----
    /// 普通与预支 Mint 共用；budgetSource: 0=CURRENT_EPOCH, 1=NEXT_EPOCH_ADVANCE（预支时 activationEpoch>0）
    /// ledgerSeq：社区内严格递增的账本序号（紧邻 recordHash 之前，不进事件）；镜像仅在 ledgerSeq>lastLedgerSeq[communityId] 时更新
    function recordMint(bytes32 communityId, bytes32 memberId, uint256 amount,
        uint256 memberBalanceAfter, uint256 totalSupplyAfter,
        uint8 budgetSource, uint64 activationEpoch, uint64 ledgerSeq, bytes32 recordHash
    ) external onlyRecorder notRecorded(recordHash);

    /// 冲销；originalRecordHash 必须已存在（PRD 10.3 追加引用）；ledgerSeq 语义同 recordMint
    function recordReversal(bytes32 communityId, bytes32 memberId, uint256 amount,
        uint256 memberBalanceAfter, uint256 totalSupplyAfter,
        bytes32 originalRecordHash, uint64 ledgerSeq, bytes32 recordHash
    ) external onlyRecorder notRecorded(recordHash);
    // 实现内：require(records[originalRecordHash].exists, "ORIGINAL_NOT_FOUND"); reversalOf[recordHash]=originalRecordHash;
    // records/reversalOf/事件无条件写入；balanceOf/totalSupply 仅当 ledgerSeq>lastLedgerSeq[communityId] 时更新并推进序号（否则跳过，不 revert）。

    function recordEpochSummary(bytes32 communityId, uint64 epochNumber, uint256 openingSupply,
        uint256 baseBudget, uint256 regularMinted, uint256 advancedMinted,
        uint256 advanceDebt, bytes32 recordHash
    ) external onlyRecorder notRecorded(recordHash);

    function recordPolicyVersion(bytes32 communityId, uint32 policyVersion,
        uint32 inflationRateBps, uint32 maxAdvanceRateBps, uint32 memberMintCapRateBps,
        uint64 effectiveEpoch, bytes32 recordHash
    ) external onlyRecorder notRecorded(recordHash);

    /// weightsMerkleRoot：对每成员快照叶子集（叶子 = keccak256(abi.encodePacked(memberIdHash, weight))）
    /// 的承诺，紧邻 recordHash 之前、不进事件索引；成员可据此自证快照权重被纳入。bytes32(0) 表示未发布树。
    function recordProposalSnapshot(bytes32 communityId, bytes32 proposalId, uint64 epochNumber,
        uint256 totalSupplySnapshot, uint256 activeGovernanceSupplySnapshot,
        uint32 policyVersion, bytes32 weightsMerkleRoot, bytes32 recordHash
    ) external onlyRecorder notRecorded(recordHash);

    /// votesMerkleRoot：对每票叶子集（叶子 = keccak256(abi.encodePacked(memberIdHash, optionIdHash, weight))）
    /// 的承诺，语义同上；投票者可据此自证其票被计入统计。bytes32(0) 表示未发布树。
    function recordProposalResult(bytes32 communityId, bytes32 proposalId,
        bytes32 winningOptionIdHash, uint32 voterCount, uint256 totalVoteWeight,
        bytes32 votesMerkleRoot, bytes32 recordHash
    ) external onlyRecorder notRecorded(recordHash);

    // ---- 读函数（PRD 28.2 允许清单：Read Balance / Read Total Supply / Read Record Hash）----
    function getBalance(bytes32 communityId, bytes32 memberId) external view returns (uint256);
    function getTotalSupply(bytes32 communityId) external view returns (uint256);
    function getRecord(bytes32 recordHash) external view
        returns (bool exists, uint8 recordType, uint64 blockNumber, uint64 timestamp);

    // ---- 管理 ----
    function setRecorder(address newRecorder) external /* onlyOwner */;
}
```


## 3. TypeScript 服务接口

```typescript
// lib/blockchain/types.ts —— 职责单一：签名/提交(TxSubmitter)、确认(TxConfirmer)、验证(RecordVerifier)、哈希(RecordHasher) 分离，InjectiveService 仅做门面组合。所有金额一律 bigint。

export type Hex32 = `0x${string}`; // bytes32
export type RecordType =
  | 'token_mint' | 'advance_mint' | 'token_reversal' | 'epoch_summary'
  | 'policy_version' | 'proposal_snapshot' | 'proposal_result';

export type VerificationStatus = // PRD 10.4 原文
  'pending' | 'submitting' | 'confirming' | 'verified' | 'failed' | 'superseded';

/** canonical payload 信封（哈希原文，见 hashingSpec） */
export interface RecordEnvelope {
  readonly schema: 'youfen.record.v1';
  readonly type: RecordType;
  readonly payload: Readonly<Record<string, string | number | boolean>>; // 仅整数/字符串/布尔，禁浮点、禁 null
}

export interface SubmitResult {
  readonly txHash: string;
  readonly nonce: number;
  readonly submittedAt: Date;
}
export interface ConfirmResult {
  readonly status: 'confirmed' | 'reverted';
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly confirmedAt: Date;
}
export interface ChainRecordMeta {
  readonly exists: boolean;
  readonly recordType?: number;
  readonly blockNumber?: number;
  readonly timestamp?: number;
}
export interface VerifyResult {
  readonly verified: boolean;      // hashMatches && onChain && status 允许
  readonly hashMatches: boolean;   // 由 DB 源数据重算 == 存储的 recordHash
  readonly onChain: boolean;       // 合约 records(hash).exists
  readonly computedHash: Hex32;
  readonly storedHash: Hex32;
  readonly txHash?: string;
  readonly blockNumber?: number;
  readonly explorerUrl?: string;
  readonly failureReason?: string;
}
/** 提交所需的最小记录视图（由 PublicRecordService 从 DB 装配） */
export interface SubmittableRecord {
  readonly recordId: string;
  readonly recordType: RecordType;
  readonly recordHash: Hex32;
  readonly chainArgs: readonly (Hex32 | bigint | number)[]; // 与合约函数参数一一对应
}

// ---- 纯函数层 ----
export interface RecordHasher {
  canonicalize(envelope: RecordEnvelope): string;          // 确定性 JSON 字符串
  computeRecordHash(envelope: RecordEnvelope): Hex32;      // keccak256(utf8(canonicalize))
  hashCommunityId(communityId: string): Hex32;             // 无盐，公开可复算
  hashMemberId(communityId: string, memberId: string): Hex32; // 加 pepper，防字典反查
}
export interface PayloadBuilder {
  /** 从 DB 源实体构建信封 + 合约参数；纯函数，同一输入永远同一输出 */
  build(source: RecordSource): { envelope: RecordEnvelope; chainArgs: SubmittableRecord['chainArgs'] };
}

// ---- 链交互层 ----
export interface TxSubmitter {
  /** 签名并广播，拿到 txHash 立即返回，绝不在此等待确认 */
  submitRecord(record: SubmittableRecord, nonce: number): Promise<SubmitResult>;
  /** 从链上 pending count 重新同步 nonce（进程重启/nonce 错乱时调用） */
  resyncNonce(): Promise<number>;
}
export interface TxConfirmer {
  waitForConfirmation(txHash: string, opts?: { confirmations?: number; timeoutMs?: number }): Promise<ConfirmResult>;
  getTransactionStatus(txHash: string): Promise<'pending' | 'confirmed' | 'reverted' | 'not_found'>;
  /** 崩溃对账核心：recordHash 在所有事件中 indexed，可反查丢失的 txHash */
  findTxByRecordHash(recordHash: Hex32): Promise<{ txHash: string; blockNumber: number } | null>;
}
export interface RecordVerifier {
  readChainRecord(recordHash: Hex32): Promise<ChainRecordMeta>;
  /** 完整验证：DB 源数据重算哈希 + 链上存在性 + 元数据比对 */
  verifyRecord(recordId: string): Promise<VerifyResult>;
}

// ---- 门面（API/worker 只依赖它）----
export interface InjectiveService {
  readonly submitter: TxSubmitter;
  readonly confirmer: TxConfirmer;
  readonly verifier: RecordVerifier;
  readonly hasher: RecordHasher;
}
export function createInjectiveService(deps?: Partial<InjectiveService>): InjectiveService; // 依赖注入便于 mock 测试

// ---- DB 服务层 ----
export interface PublicRecordService {
  createPendingRecord(tx: PrismaTx, input: { recordType: RecordType; sourceTable: string; sourceId: string;
    communityId: string; envelope: RecordEnvelope; recordHash: Hex32 }): Promise<PublicRecord>; // 在业务事务内调用（PRD 26.x 第12/13步）
  requestSubmission(recordId: string): Promise<{ queued: boolean; jobId: string }>;
  transition(recordId: string, from: VerificationStatus[], to: VerificationStatus,
    patch?: Partial<PublicRecord>): Promise<boolean>; // 条件 UPDATE，0 行即竞争失败
  markSuperseded(originalRecordId: string, supersededByRecordId: string): Promise<void>;
  getWithSource(recordId: string): Promise<PublicRecordWithSource | null>;
}
```


## 4. recordHash 计算规范

## recordHash 计算规范（youfen.record.v1）

### 1. 信封结构
哈希原文永远是一个信封对象：
{"schema":"youfen.record.v1","type":"<recordType>","payload":{...}}
schema 字段版本化，未来变更序列化规则时旧记录仍按 v1 验证。

### 2. 标准化规则（canonicalize，对齐 RFC 8785/JCS 的严格子集）
1. 键按 UTF-16 code unit 升序排序（所有键为 ASCII，等价于字典序）；递归应用于嵌套对象；
2. 无任何空白：分隔符仅 `,` 和 `:`；
3. 数字仅允许**整数**（安全整数范围内），序列化为最短十进制形式，无 `+`、无前导零、无小数点、无指数。金额超过 2^53 一律先转字符串字段（MVP 中 Token 为整数且远小于该界）。**百分比字段一律排除**（可由数值推导，浮点是哈希毒药）；bps 类字段本身是整数，可入哈希；
4. 时间一律 Unix epoch 秒（UTC 整数），字段名以 `At` 结尾（如 `createdAt`）；
5. **禁止 null / undefined**：可选字段缺失时直接省略键，绝不写 `"x":null`；
6. 字符串按 JSON 标准最小转义（仅 `"` `\` 与 <0x20 控制符），UTF-8 编码；
7. hash = keccak256(utf8Bytes(canonicalJson))。**必须用 ethers 的 keccak256（Ethereum Keccak-256），绝不能用 Node crypto 的 sha3-256（NIST SHA3，结果不同）**。

### 3. ID → bytes32（PRD 28.4 隐私）
// 社区是公开实体（有公开 slug 页），无盐哈希，任何第三方可复算：
hashCommunityId(id)        = keccak256(utf8(`youfen:community:v1:${id}`))
// 成员哈希加服务端 pepper（env: RECORD_HASH_PEPPER），防止第三方拿链上数据字典枚举反推成员身份：
hashMemberId(cid, mid)     = keccak256(utf8(`youfen:member:v1:${cid}:${mid}:${PEPPER}`))
// 投票选项同理：keccak256(utf8(`youfen:option:v1:${proposalId}:${optionId}`))

第三方可验证性不受 pepper 影响：链上与验证 API 公开的是 memberIdHash 本身，payload 中也只含 memberIdHash——第三方从公开的 canonical payload 复算 recordHash 无需 pepper；pepper 只保护"链上 hash → 真实成员"这一步。前后端共享 hashing/ 目录纯函数，保证同一实现。

### 4. 各类型 payload 字段（示例：token_mint / advance_mint）
payload 取自 TokenMintEvent（PRD 24.4）快照字段的整数子集：
{
  "activationEpoch": 0,                // 预支时为激活 epochNumber，普通 mint 省略或 0
  "amount": 500,
  "budgetSource": "current_epoch",
  "communityIdHash": "0x…",
  "createdAt": 1753228800,
  "epochNumber": 3,
  "memberBalanceAfter": 10500,
  "memberBalanceBefore": 10000,
  "memberIdHash": "0x…",
  "mintEventId": "cme_…",              // DB 主键，防两笔完全相同的 mint 哈希碰撞（唯一性来源）
  "mintType": "contribution",
  "tokenPolicyVersion": 2,
  "totalSupplyAfter": 116263,
  "totalSupplyBefore": 115763
}
注意：reason / evidenceUrls / approvedBy / AI 分析等一律不入 payload（PRD 28.4 禁止 PII 与内部备注上链；且 reason 可含 PII）。reversal payload 必含 "originalRecordHash"（PRD 10.3 引用要求）。mintEventId 等 DB 主键（cuid，无语义）保证同参数记录哈希唯一，且与 require(!exists) 配合成为天然幂等键。

### 5. 一致性保障
- 在业务事务内（PRD 26.x 第12步）即计算并落库 envelope 原文 + recordHash，之后任何环节只读不再重算写入——提交、确认、验证全部针对同一 hash；
- verify 时用 DB 源实体重新走 PayloadBuilder → 若与存储 envelope 不一致说明源数据被篡改（这正是要暴露的）；
- hashing/ 提供 golden test vectors（固定输入 → 固定 hash），防止序列化实现漂移。


## 5. PublicRecord 状态机与崩溃恢复

## PublicRecord 状态机（PRD 10.4 六状态）

pending ──(submit-worker 领取任务，条件 UPDATE 成功)──▶ submitting
submitting ──(广播成功拿到 txHash，持久化 txHash+nonce)──▶ confirming
submitting ──(广播前 estimateGas revert=RECORD_EXISTS → 链上已存在，反查 txHash)──▶ confirming（幂等恢复）
submitting ──(终态错误：参数非法/合约拒绝且链上不存在)──▶ failed
confirming ──(receipt.status=1 且达到确认数 且 records(hash).exists=true)──▶ verified
confirming ──(receipt.status=0 reverted；或超时且 tx 消失、nonce 已被后续交易越过)──▶ failed
failed ──(POST /retry 或 BullMQ 自动重试重新入队)──▶ pending
verified ──(对应 Reversal/Correction 记录达到 verified，业务层调用 markSuperseded)──▶ superseded

不允许的转换全部由 state-machine.ts 的转换表拒绝；所有转换都是条件 UPDATE（WHERE status IN (from...)），返回 0 行即说明并发竞争，放弃本次操作——这同时是幂等防线之一。verified 与 superseded 是仅有的两个终态（superseded 的原始记录链上依然存在，仅 DB 标记 + 关联 supersededByRecordId，符合 PRD 10.3 "不删除、追加纠正、双版本展示"）。
只有 verified 状态前端才可展示 "Injective 已确认"（PRD 10.4）。

## 崩溃恢复（关键：txHash 丢失对账）
危险窗口 = 已广播但 txHash 尚未写入 DB 时进程死亡。恢复依赖两个不变量：
(a) recordHash 在广播**之前**已持久化且确定性可重算；
(b) 合约所有事件的 recordHash 均为 indexed topic。

reconcile-worker（每 2 分钟）扫描 status='submitting' 或 'confirming' 且 updatedAt 超过阈值（如 3 分钟）的记录：
1. 先查合约 getRecord(recordHash)：
   - exists=true → 上链其实成功了。eth_getLogs(address=contract, topics=[*, …, recordHash]) 反查出 txHash + blockNumber，补写 DB → verified；
   - exists=false → 继续判断：
2. 读 DB 中该记录广播前持久化的 assignedNonce，与链上 getTransactionCount(wallet,'latest') 比较：
   - assignedNonce < latestNonce 且链上无此 record → 该 nonce 被其他交易用掉或交易被丢弃 → 安全重新入队（合约 require(!exists) 兜底，绝无双写）；
   - assignedNonce >= latestNonce → 交易可能还在 mempool → 继续等待，超过硬超时（如 10 分钟）标记 failed 并释放。
3. 对 status='confirming' 且有 txHash 的：直接 getTransactionStatus(txHash) 补跑确认逻辑。

提交侧配合协议（submit-worker 内的写顺序，保证可对账）：
① 条件 UPDATE → submitting，同时写入 assignedNonce（广播前）；
② 签名 + 广播；
③ UPDATE 写入 txHash（广播后）。
崩溃在 ①② 之间：无广播，reconciler 直接重置 pending；崩溃在 ②③ 之间：上述 getLogs 反查恢复。


## 6. 队列 / nonce / 幂等设计

## BullMQ 队列设计（Redis）

### 队列与任务粒度
1. **chain-submit**：一个 PublicRecord = 一个 job（payload 只放 recordId，数据一律从 DB 读，防止 Redis 里的过期副本）。Worker **concurrency=1**——单一 Server Wallet 下这是 nonce 顺序最简单可靠的解法：同一时刻只有一笔在途交易，天然串行、无 nonce 空洞。Injective 出块快（~1s），MVP 吞吐足够。
2. **chain-confirm**：一个 txHash = 一个 job，只读轮询 receipt，concurrency=4。
3. **chain-reconcile**：repeatable job（every: 120_000），执行 reconciler 扫描（见状态机节）。

### 重试策略（区分错误类别，errors.ts 分类）
- chain-submit: attempts=5, backoff={type:'exponential', delay:5000}
  - RetryableError（网络超时/RPC 5xx/NONCE_TOO_LOW→先 resyncNonce）→ 抛出让 BullMQ 重试；
  - AlreadyRecordedError（revert reason=RECORD_EXISTS）→ **不是失败**：走 findTxByRecordHash 恢复路径，job 成功结束；
  - TerminalError（参数非法等）→ job.discard()，记录转 failed，等人工 /retry。
- chain-confirm: attempts=30, backoff={type:'fixed', delay:10000}（约 5 分钟窗口），超限转交 reconciler。
- removeOnComplete: {age: 86400}, removeOnFail: {age: 604800}。

### 幂等（四层防线，同一 record 绝不重复上链）
1. **jobId 去重**：jobId = `submit:${recordId}:v${record.attemptEpoch}`。BullMQ 对相同 jobId 的 add 静默去重；retry 时 attemptEpoch+1 生成新 jobId（否则旧的 completed/failed job 会挡住重新入队）。
2. **DB 状态守卫**：worker 第一步执行条件转换 UPDATE … WHERE status IN ('pending') —— 0 行即另一进程已处理，job 直接成功返回，不广播。
3. **广播前链上预检**（一次廉价 view 调用）：getRecord(recordHash).exists → true 则跳到确认恢复路径。
4. **合约 require(!records[recordHash].exists)** —— 最后防线；因为 recordHash 含 DB 主键（mintEventId 等），同一业务记录的哈希恒等，重复提交必然 revert，双写在数学上被排除。

### nonce 顺序问题（单钱包）
- concurrency=1 串行化是第一原则；
- wallet.ts 显式管理 nonce：进程启动/每次 NONCE 错误时 resyncNonce() = provider.getTransactionCount(addr,'pending')；不依赖 ethers NonceManager 的内存计数（进程重启即失效）；
- 每次广播前把 assignedNonce 持久化到该 PublicRecord（对账需要）；
- 卡死交易（长时间 pending）：MVP 不做 same-nonce gas 替换（testnet gas 便宜、拥堵概率低），由 reconciler 超时标 failed + 人工 retry 兜底。

### 与业务事务的衔接（PRD 26.x）
业务事务（正常增发/预支/Epoch 切换）内只做两件事：创建 PublicRecord(status='pending', envelope, recordHash) + 提交事务；**事务提交成功后**才 enqueueRecordSubmission（PRD 26.3 "区块链提交在数据库事务完成后异步执行"）。若 enqueue 本身失败（Redis 抖动），记录停在 pending，由 reconciler 补扫 pending 超时记录重新入队——DB 是唯一事实源，Redis 丢数据可完全重建。

### 部署注意
BullMQ worker 需要常驻进程，**不能跑在 Vercel serverless 函数里**。黑客松方案：单独一个 worker 入口（如 `npm run worker`）部署到 Railway/Fly/Render 免费实例，与 Next.js API 共享同一 Redis 与 Postgres。


## 7. Public Records API

## PRD 27 节 Public Records API（统一响应信封 { success, data, error }）

### POST /api/public-records/:id/submit
- 权限：社区管理员或内部服务调用（业务事务提交后也可由服务端自动调用同一服务方法）。
- 前置：record.status ∈ {pending}（failed 请走 retry）；否则 409 INVALID_STATUS。
- 服务映射：PublicRecordService.requestSubmission(recordId) → enqueue.enqueueRecordSubmission()。
- 响应 202：
  { "success": true, "data": { "recordId": "pr_1", "status": "pending", "queued": true, "jobId": "submit:pr_1:v1" } }

### POST /api/public-records/:id/retry
- 权限：社区管理员。
- 前置：record.status === 'failed'；否则 409。
- 服务映射：PublicRecordService.transition(id, ['failed'], 'pending', { attemptEpoch: +1, lastError: null }) 成功后 requestSubmission()（新 jobId）。
- 响应 202：同 submit 结构，另含 "attemptEpoch"。

### GET /api/public-records/:id
- 权限：公开（可信记录本来就是给公众验证的；envelope 内无 PII，只有 hash 与数值）。
- 服务映射：PublicRecordService.getWithSource(id)。
- 响应 200：
  { "success": true, "data": {
      "recordId": "pr_1", "recordType": "token_mint",
      "status": "verified",                       // PRD 10.4 六状态；前端仅 verified 可展示"Injective 已确认"
      "recordHash": "0x…",
      "canonicalPayload": "{\"schema\":\"youfen.record.v1\",…}",  // 原文字符串，供第三方直接 keccak256 复算
      "chain": { "txHash": "0x…", "blockNumber": 123, "confirmedAt": 1753228800,
                 "explorerUrl": "https://testnet.blockscout.injective…/tx/0x…" }, // 非 verified 时字段省略
      "supersededBy": null, "createdAt": "…" } }

### GET /api/public-records/:id/verify
- 权限：公开。实时验证，不读缓存状态。
- 服务映射：RecordVerifier.verifyRecord(id) —— 三步：① DB 源实体重新过 PayloadBuilder 重算哈希（防源数据被改）；② 与存储 recordHash 比对；③ 合约 getRecord(hash) 链上存在性 + 事件反查 tx。
- 副作用（可选优化）：若 DB status='confirming' 但链上已确认 → 顺手 transition 到 verified（机会性对账）。
- 响应 200：
  { "success": true, "data": {
      "verified": true, "hashMatches": true, "onChain": true,
      "computedHash": "0x…", "storedHash": "0x…",
      "chain": { "txHash": "0x…", "blockNumber": 123, "timestamp": 1753228800, "explorerUrl": "…" } } }
  失败示例：hashMatches=false → "failureReason": "SOURCE_DATA_MISMATCH"（即"历史被改动"的公开证据）。

### 错误码约定
404 RECORD_NOT_FOUND / 409 INVALID_STATUS / 429（对 verify 加 rate limit，防 RPC 被刷）/ 502 CHAIN_UNAVAILABLE（verify 时 RPC 不可达，此时返回 DB 侧信息并标记 onChain:"unknown"，绝不误报 verified）。


## 8. 风险清单

- 【部署架构】BullMQ worker 是常驻进程，与 Vercel serverless 天然冲突——若团队默认全栈 Vercel，上链会静默不执行。必须在 Day 1 决定 worker 宿主（Railway/Fly），这是最容易翻车的隐藏依赖。
- 【单钱包串行】concurrency=1 意味着吞吐 ≈ 1 tx/块。Demo 场景（几十条记录）没问题，但批量导入初始分配时会排队数分钟；缓解：Demo 前预热提交，或 Epoch 内多条 mint 合并（本设计未做 batch，属有意取舍）。
- 【Server Wallet 私钥】唯一 recorder 私钥泄露 = 攻击者可写入任意伪造记录（虽偷不走钱）。已设 setRecorder 轮换止损，但历史伪造记录无法链上删除，只能靠 hashMatches=false 暴露。私钥仅存 worker 环境变量，绝不进前端/仓库。
- 【链上余额取赋值语义 + 序号守卫】balanceOf/totalSupply 直接赋快照值而非 += 并强校验（个别记录永久失败不会 brick 整个社区后续上链）；并由社区维度严格递增的 `ledgerSeq` 守卫消除"过期记录覆盖新余额"：镜像仅当 `ledgerSeq > lastLedgerSeq[communityId]` 时更新并推进序号，晚到/乱序的旧记录（重试、对账）仍完成公证但不回滚更新的余额。`ledgerSeq` 由后端在 DB 事务内按社区分配（`PublicRecord.ledgerSeq`，mint/reversal 类必填），不进事件、进 recordHash 的 canonical payload 故可第三方复算验证。硬化选项（黑客松后）：额外 require(balanceOf+amount==memberBalanceAfter) 做累计强校验。
- 【canonical JSON 实现漂移】哈希对不上的最大来源不是链，而是序列化实现差异（键序、数字格式、null 处理）。必须用 golden test vectors 锁定 hashing/ 纯函数，且前后端共用同一份代码；严禁任何一端手写 JSON.stringify。
- 【keccak256 陷阱】Node crypto 的 sha3-256 是 NIST SHA3，不是 Ethereum Keccak-256，混用会产生全错但不报错的哈希。统一从 ethers 导入 keccak256。
- 【pepper 与可验证性张力】memberIdHash 加 pepper 后第三方无法从原始 memberId 推出哈希（隐私目的），只能信任平台公布的 memberIdHash。若评委追问'成员如何自证'，答案是：成员本人页面展示自己的 memberIdHash，可与链上事件比对。
- 【Injective EVM testnet 不确定性】RPC 稳定性、finality 语义、blockscout 浏览器地址都需 Day 1 实测；确认数常量做成 env 可调（默认 2）。
- 【Redis 丢失】队列非事实源，DB 才是——Redis 清空后 reconciler 可从 pending/submitting 记录完全重建任务流，此点必须写测试验证。
- 【负载均衡 RPC 回执索引不一致】负载均衡后端的 getLogs 已可见事件、但 getTransactionReceipt 对同一 txHash 持续返回 null，会把已上链的记录困在 confirming。缓解：confirmer 连续 N 次（默认 5，可配 `nullReceiptFastPathThreshold`）拿到 null 回执后走合约 `getRecord(recordHash)` 存在性快路径——存在即视为最终（Injective 即时最终性），用既有 `findTxByRecordHash` 反查补齐区块信息（blockHash 不可得，置零占位，verify 不依赖 blockHash）；快路径任何异常一律吞掉不使正常轮询变差。
- ── MVP 降级路径（按砍除顺序）──
- 砍①：confirm 独立队列 → submit-worker 内直接 await tx.wait(1)（反正 concurrency=1，同步等 1-2 秒不影响正确性），状态机 submitting→confirming→verified 仍完整走完，只是同进程完成。
- 砍②：reconcile-worker 定时任务 → 保留 reconciler.ts 逻辑但只挂在 GET /verify 的机会性修复 + 人工 POST /retry 上（Demo 时手点即可）。
- 砍③：七类记录只接三类——PRD 30 验收标准链上只要求：一次普通 Mint、一次 Advance Mint、一次 Proposal Result。合约七个函数全部部署（改合约成本高），但后端 payloads/ 只实现 mint/proposal-result 两个 builder，epoch_summary/policy_version/proposal_snapshot/reversal 的上链 wiring 延后（DB 账本仍完整记录，PRD 10.2 的'产品账本'不受影响）。
- 砍④：same-nonce gas 替换、多钱包扩容、事件订阅 indexer——全部不做，用 reconciler 超时 + 人工 retry 兜底。
- 砍⑤：superseded 自动联动 → 手动调用 markSuperseded 的内部接口。
- 不可砍：recordHash canonical 规范与 golden tests、合约 require(!exists)、事件里 indexed recordHash、广播前持久化 assignedNonce——这四样是可信叙事（'无人可静默修改'）和崩溃恢复的地基，砍掉任何一个 Demo 现场翻车概率剧增。


## 9. Injective Testnet 事实（核实于 2026-07-23）


### Testnet JSON-RPC 端点与 chain ID（置信度：confirmed）
Injective 原生 EVM Testnet: JSON-RPC = https://k8s.testnet.json-rpc.injective.network/ ，EVM chain ID = 1439（对应 Cosmos chain ID injective-888）。WebSocket = wss://k8s.testnet.ws.injective.network/ 。Mainnet 对照: EVM chain ID = 1776（injective-1），RPC = https://sentry.evm-rpc.injective.network/ 。
来源：https://docs.injective.network/developers-evm/network-information


### 原生 EVM 主网上线时间（确认是新 EVM 而非 inEVM）（置信度：confirmed）
Injective 原生 EVM（MultiVM）主网于 2025-11-11 上线，EVM 直接嵌入 L1 核心（非独立 rollup 的旧 inEVM），Day 1 有 30+ 项目部署。
来源：https://injective.com/blog/welcome-to-the-injective-era-native-evm-mainnet-launch-opens-new-frontiers-for-finance


### ethers.js / Hardhat / Foundry 支持（置信度：confirmed）
官方文档明确列出 MetaMask、Hardhat、Foundry、viem、ethers.js、Remix 全部兼容；官方提供 Hardhat 和 Foundry 两条 Testnet 部署教程。官方 Hardhat 示例配置即 solidity "0.8.20" + url https://k8s.testnet.json-rpc.injective.network/ + chainId 1439 + gas/gasPrice "auto"，因此 ^0.8.20 合约可直接编译部署。
来源：https://docs.injective.network/developers-evm 与 https://docs.injective.network/developers-evm/testnet-deployment 与 https://docs.injective.network/developers-evm/smart-contracts/compile-hardhat


### ethers.js v6 具体版本（置信度：likely）
文档只写 "ethers.js" 未标注版本号；它是标准 JSON-RPC（eth_* 方法）端点，ethers v6 的 JsonRpcProvider + Wallet 发交易/部署合约按标准流程即可工作（现行 Hardhat 工具链默认捆绑 ethers v6）。未找到任何 v6 不兼容的报告。
来源：https://docs.injective.network/developers-evm （版本号推断，非文档原文）


### 测试网水龙头（置信度：confirmed）
官方文档列出三个 faucet: 1) https://testnet.faucet.injective.network/ （官方，24h 一次，发测试 INJ 和 USDT）；2) https://cloud.google.com/application/web3/faucet/injective/testnet （Google Web3 faucet）；3) https://faucet.circle.com/ （测试 USDC）。官方 faucet 的程序化 API 为 POST https://jsbqfdd4yk.execute-api.us-east-1.amazonaws.com/v1/faucet，body 为 { address: "inj1..." }（bech32 格式），队列每 5-10 分钟处理。
来源：https://docs.injective.network/developers-evm/network-information 与 https://docs.injective.network/developers-defi/testnet-faucet-integration


### Faucet 是否直接收 0x 地址（置信度：uncertain）
faucet API 文档示例只给了 inj1... bech32 地址；EVM 0x 地址与 inj 地址是同一密钥的两种编码（可用 @injectivelabs/sdk-ts 的 getInjectiveAddress(0x...) 转换）。官方 faucet 网页 UI 是否直接接受 0x 输入未能确凿核实，稳妥做法是把后端钱包 0x 地址转成 inj1 格式再领水。
来源：https://docs.injective.network/developers-defi/testnet-faucet-integration


### Gas 代币与出块/最终性（置信度：confirmed）
Gas 代币为 INJ（EVM 侧以 wINJ 包装表示，但 gas 直接扣原生 INJ 余额）。出块时间约 0.64-0.65 秒，CometBFT/Tendermint BFT 共识，单区块即时最终性（无需等多个确认，收到 receipt 即不可逆）。费用极低（主网宣传低至 $0.00008/笔）。
来源：https://docs.injective.network/developers-evm/network-information 与 https://injective.com/blog/understanding-injective-architecture-and-consensus 与 https://injective.com/blog/welcome-to-the-injective-era-native-evm-mainnet-launch-opens-new-frontiers-for-finance


### 区块浏览器（testnet，EVM 交易）（置信度：confirmed）
官方文档给出的 EVM 浏览器: testnet = https://testnet-injective.cloud.blockscout.com （mainnet = https://blockscout.injective.network），Blockscout 实例，可查 EVM 交易/合约并支持 Hardhat verify。注意: 我直接抓取该站点失败（疑似反爬），URL 以官方文档为准，建议开发时手动浏览器确认一次。
来源：https://docs.injective.network/developers-evm/network-information


### sdk-ts vs ethers.js 取舍（置信度：likely）
对'平台单钱包签名、只往链上写哈希记录'的场景，直接用 ethers.js 明显更简单: 一个 JsonRpcProvider + Wallet + 标准合约调用即可，无 Cosmos 概念负担，Hardhat/Foundry 部署流程全兼容。@injectivelabs/sdk-ts 面向 Cosmos 侧原生模块（orderbook、staking、bank、bech32 地址、Cosmos 签名流程），依赖重、API 面大，本场景用不上；唯一可能用到的是地址转换工具（0x <-> inj1，用于领水）。结论: 主路径 ethers.js，可选引入 sdk-ts 仅做地址转换。
来源：https://docs.injective.network/developers-evm 与 https://github.com/InjectiveLabs/injective-ts/tree/master/packages/sdk-ts （取舍判断为基于确认事实的分析）


### nonce / 并发交易坑（置信度：uncertain）
未找到 Injective 官方文档中针对其 EVM 的 nonce 专门警告。但 Cosmos-EVM 类链（同架构谱系: Ethermint / cosmos/evm）有公开记录的通病: CometBFT 默认 mempool 是 FIFO，不像 geth 那样按账户+nonce 排序并暂存 nonce 有空隙的交易，乱序/超前 nonce 的交易可能被直接拒绝而不是排队（见 cosmos/evm issue #417、evmos issue #562）。加上 <1s 出块，同一钱包快速连发多笔未确认交易风险较高。对你的场景的实操建议: 单钱包严格串行——本地维护 nonce 计数器（或每次用 getTransactionCount(addr, 'pending')），每笔 await tx.wait(1) 后再发下一笔（即时最终性使这几乎无延迟代价）；后端加一个按钱包的提交队列/互斥锁即可完全规避。
来源：https://github.com/cosmos/evm/issues/417 与 https://github.com/evmos/evmos/issues/562 （同架构类比，非 Injective 专属实证）


### 注意事项
- testnet-injective.cloud.blockscout.com 无法通过 WebFetch 直接访问（连接被拒/反爬），URL 仅由官方文档确认，未实测站点可用性；建议开发前浏览器手动验证。
- ethers.js v6 兼容性是基于'标准 JSON-RPC + 官方列名 ethers.js'的推断，官方未标注版本号；建议第一步就用 v6 跑一笔 self-transfer 冒烟测试。
- nonce/并发结论是对 Cosmos-EVM 架构谱系（Ethermint/cosmos/evm）已知问题的类比，Injective 的定制 mempool 实现可能已缓解，未找到 Injective 专属的 bug 报告或官方说明；串行提交方案在任何情况下都安全。
- 官方 faucet 网页是否接受 0x 地址未确证（API 示例用 inj1 格式）；Google Cloud faucet 是备选。
- 0.64s 出块/即时最终性数据主要来自主网宣传材料，testnet 实际出块可能略有差异；EIP-1559 支持情况与 gas price 具体数值未在文档中核实到（Hardhat 官方示例用 gas/gasPrice 'auto'，建议照抄）。
- 所有信息核实于 2026-07-23，Injective 迭代较快（文档域名/端点近一年多次调整），实施前建议对 RPC 端点做一次 eth_chainId 调用确认返回 0x59f (1439)。
