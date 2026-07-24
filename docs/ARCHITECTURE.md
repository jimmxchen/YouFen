# 有份儿 YouFen.xyz — 技术架构设计

**版本**：v0.6 Inflationary Ownership Protocol
**更新日期**：2026-07-23
**文档状态**：与 PRD v0.6 对齐，进入实现阶段
**目标赛道**：Injective Blockchain × AI / Build in Public

> **一句话定位**：本文档描述有份儿（无代码社区共同所有平台）的整体技术架构——如何把成员的真实贡献转化为受预算约束、可公开验证、不可转让的社区所有权 Token。
>
> **权威关系**：需求以 `docs/PRD.md`（v0.6，Token / Epoch / 预支 / 冲销模型）为唯一权威；区块链层实现以 `docs/BLOCKCHAIN-DESIGN.md` 为权威（代码正照此实现）。本文档与上述二者冲突时，一律以二者为准。
>
> **变更说明（旧概念废弃）**：旧版架构中的发言权模型（voicePower 字段、VoicePowerBadge 组件、suggestedVP/approvedVP、VP_BATCH 记录类型、四态 RecordStatus、ONE_PERSON_ONE_VOTE 投票模式、可覆盖的 Community.rules Json、ethers v5 语法、Bull 队列）已全部废弃，本文档不再包含相关设计；对应新模型见第 3、7、10 节。

---

## 目录

1. 系统概览与技术栈
2. 前端架构
3. 数据模型（Prisma Schema）
4. Token 引擎：增发与冲销
5. Epoch 生命周期
6. 预支机制（Mint Budget Advance）
7. Proposal 治理与快照
8. API 设计
9. AI 集成
10. Injective 区块链层
11. 部署架构与开发计划

---

## 1. 系统概览与技术栈

有份儿是一个无代码社区共同所有平台，把成员的真实贡献转化为不可转让的社区所有权 Token。系统围绕三条主线组织：面向成员与访客的响应式 Web 前端、承载 Token 引擎（固定通胀预算、增发、预支、冲销、Epoch 切换）的业务逻辑层，以及把关键账本事件写入 Injective 的可信记录层。所有金额与供应量在 TypeScript 服务层一律为整数，比例参数一律为 bps 整数（如 `monthlyInflationRateBps: 500` 表示 5%），链交互层使用 `bigint`。

### 1.1 分层架构

与旧版单体全栈部署不同，本架构显式区分两个部署单元：Vercel serverless 承载前端与 REST API，一个独立常驻 Worker 进程承载 BullMQ 上链队列。二者共享同一 PostgreSQL 与 Redis，DB 是唯一事实源。

```text
┌──────────────────────────────────────────────────────────────┐
│                          用户层                                 │
│        移动端浏览器（成员优先） · 桌面端浏览器（管理者优先）        │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                        前端应用层                               │
│         Next.js 14 App Router · React Server Components         │
│              TypeScript · Tailwind CSS + shadcn/ui             │
└──────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────┐
│   API 层 · Next.js Route Handlers（REST）· 部署于 Vercel        │
└──────────────────────────────────────────────────────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌────────────────────┐ ┌──────────────┐ ┌────────────────────────┐
│   业务逻辑层        │ │  AI 服务层    │ │  区块链服务层            │
│ ┌────────────────┐ │ │ 规则生成/贡献  │ │ ID 哈希 · canonical      │
│ │  Token 引擎     │ │ │ 分析/健康报告  │ │ envelope · recordHash    │
│ │ 预算·增发·预支  │ │ │（只建议不执行）│ │ · 入队 submit            │
│ │ 冲销·Epoch 切换 │ │ └──────────────┘ └────────────────────────┘
│ └────────────────┘ │        │                     │
└────────────────────┘        │            事务提交后异步入队
        │                     │                     ▼
        ▼                     ▼        ┌────────────────────────────┐
┌──────────────────────────────────┐  │  常驻 Worker 进程（非 Vercel）│
│          数据持久层                │  │  部署于 Railway / Fly.io     │
│  PostgreSQL（账本·状态·唯一事实源）│◄─┤  BullMQ 三队列：             │
│  Redis（缓存 + BullMQ 队列）        │  │  chain-submit（concurrency=1）│
└──────────────────────────────────┘  │  chain-confirm · chain-reconcile│
                                       └────────────────────────────┘
                                                     │
                                                     ▼
                                       ┌────────────────────────────┐
                                       │   Injective EVM Testnet     │
                                       │   chainId 1439              │
                                       │   平台 Server Wallet 签名    │
                                       └────────────────────────────┘
```

Worker 与 Vercel serverless 分离是硬性约束：BullMQ 上链任务是常驻进程，跑在 serverless 函数里会静默不执行（详见第 10、11 节）。业务事务在 PostgreSQL 中提交成功后，才异步入队 `chain-submit`；可信记录以 canonical envelope 的 `recordHash`（keccak256）加 `canonicalPayload` 原文落库并上链，供第三方复算校验。

### 1.2 核心机制流程

```text
成员完成贡献
  ↓
AI 分析贡献并匹配 Token 规则（只建议）
  ↓
社区管理者确认贡献
  ↓
从本月 Token 预算中铸造 Token
  ↓
成员 Token 余额增加
  ↓
社区总供应量增加
  ↓
所有成员相对所有权重新计算
  ↓
成员使用 Token 参与社区决策
  ↓
增发与投票结果写入 Injective
```

审核与铸造是两步：`/contributions/:id/approve` 确认贡献符合规则，`/contributions/:id/mint` 在预算与单期上限校验通过后于单个数据库事务内铸造 Token 并写入账本。管理者只能确认贡献是否符合预先公布的规则，不能自定义增发数量、绕过月度预算或单期上限。

### 1.3 设计原则

| 原则 | 说明 | 实现方式 |
| --- | --- | --- |
| 移动端优先 | 成员端体验优先移动设备 | 响应式布局 + RSC 服务端渲染 |
| 无感集成 | 区块链对用户透明，用户无需连接钱包 | 平台 Server Wallet 统一签名，后台异步上链 |
| AI 只建议不执行 | AI 不自动批准、不自动预支、不改历史 | 所有 AI 输出需管理者人工确认后才触发写入 |
| 预算受控增发 | 固定月度通胀 + 月初供应量快照 | 基础预算按月初 `openingSupply × 通胀率bps` 计算，禁止按月内实时供应量重算形成复利 |
| 账本只追加 | 账本事件只 append，不 update/delete | 纠错走 Reversal/Correction 并引用原记录，原记录置为 `superseded` 永久保留 |
| 快照治理 | Proposal 激活即锁定投票权重 | 权重只读快照时的有效治理 Token，快照后铸造的 Token 不影响进行中 Proposal |

### 1.4 技术栈

**前端**：Next.js 14（App Router + React Server Components）· TypeScript 5+ · Tailwind CSS + shadcn/ui · React Hook Form + Zod · Recharts。

**后端**：Node.js 20+ · REST Route Handlers（**结论先行**：对外契约即 PRD §27 的 REST 路径，评委据此验证，完整论证见第 8 节）· Prisma ORM · NextAuth.js 认证 · pnpm 包管理 · Vercel 部署。

**数据与队列**：PostgreSQL 15+（账本与状态的唯一事实源）· Redis 7+（缓存 + 队列）· **BullMQ**（非 Bull；三队列 chain-submit / chain-confirm / chain-reconcile，跑在独立 Worker 进程，宿主 Railway/Fly）。

**AI**：贡献分析、Token 规则生成与通胀健康报告，输出严格类型化，只作建议。

**区块链**：Injective EVM Testnet（chainId 1439）· 平台 Server Wallet 统一签名 · 链交互层**锁定 ethers v6.x**——统一使用 `ethers.JsonRpcProvider`、顶层 `ethers.keccak256` / `ethers.toUtf8Bytes` 与 `receipt.hash`，禁用 Node `crypto` 的 sha3-256（NIST SHA3 ≠ Ethereum Keccak-256）；v6 语法与合约、canonical 序列化细节见第 10 节。

---

## 2. 前端架构

前端采用 Next.js App Router，成员端移动优先、管理端数据密集。UI 围绕社区所有权 Token 的三个余额维度（`totalBalance`、`activeGovernanceBalance`、`pendingGovernanceBalance`）及派生的 `ownershipPercentage`、`governancePercentage` 组织；页面只读展示服务层算好的整数金额与快照数据，绝不在客户端重算权重或供应量。

### 2.1 路由信息架构

路由树严格对齐 PRD §11。管理台在 `/communities/:id/admin` 下按 Token 生命周期拆分九个子页，成员端与公开验证入口独立分区：

```text
YouFen.xyz
├── /                              首页（信任标签：Powered by Injective）
├── /demo                          AdventureX Demo
├── /create                        创建社区（Token Policy 初始化）
├── /communities/:slug             公开社区页（通胀预算透明度）
├── /communities/:id/admin
│   ├── /overview                  社区概览（总供应量 / 通胀健康度）
│   ├── /members                   成员管理（三字段余额 + 相对所有权）
│   ├── /contributions             贡献审核（approve 与 mint 两步）
│   ├── /token                     Token 总览（分布 / 集中度）
│   ├── /epochs                    月度预算（Epoch 列表 / 预支债务）
│   ├── /ledger                    Token 账本（Mint / Advance / Reversal）
│   ├── /proposals                 社区 Proposal
│   ├── /records                   Injective 记录
│   └── /settings                  Token Policy（版本化，只读展示 pending 版本）
├── /member/:communityId           成员 Dashboard（所有权卡片 + 待激活 Token）
├── /vote/:proposalId              投票页（只读快照权重）
├── /results/:proposalId           投票结果（快照区块 + Tx Hash）
├── /records/:recordId             可信记录详情（canonicalPayload 复算校验）
└── /build-in-public               Build in Public
```

审核页对应 `approve` 与 `mint` 两个独立动作（`/api/contributions/:id/approve` 与 `/mint`），不提供“一步审核并发放”的合并按钮。`/settings` 对通胀率等宪法级参数只读，任何修改都跳转创建 `TOKEN_POLICY_CHANGE` Proposal，展示 `pendingPolicyEffectiveEpoch` 生效周期。

### 2.2 项目结构

`components/features` 按 Token 领域切分，替代旧的 community/contribution/proposal/vote 平铺；组件与钩子只消费服务层类型，不含金额计算逻辑：

```text
youfen-web/
├── app/                          # App Router（路由同 §2.1）
├── components/
│   ├── ui/                       # 基础组件
│   └── features/
│       ├── token/                # TokenBalanceCard / TokenBalanceBadge / 供应量、所有权
│       ├── epoch/                # EpochBudgetCard / EpochTimeline（预算、未使用额度）
│       ├── advance/              # AdvanceWarningDialog / AdvanceDebtBadge（预支）
│       ├── contribution/         # ContributionReviewPanel / MintConfirmDialog
│       ├── proposal/             # ProposalVoteCard / ProposalResultPanel
│       └── record/               # InjectiveStatusBadge / RecordDetailVerifier
├── lib/
│   ├── format/                   # 整数金额 / bps → 百分比 展示格式化
│   └── hash/                     # recordHash 复算（keccak256 canonical envelope）
├── hooks/
└── types/                        # 复用 PRD §24 接口定义（不改名）
```

### 2.3 核心组件示例

**TokenBalanceCard** —— 渲染 PRD §19.1 所有权卡片，并内嵌 §19.3 待激活 Token 说明区。金额一律整数，百分比由服务层派生的比率格式化展示：

```tsx
// components/features/token/token-balance-card.tsx
interface TokenBalanceCardProps {
  tokenSymbol: string;              // 例：AXO
  totalBalance: number;             // 整数：Token 总余额
  activeGovernanceBalance: number;  // 整数：当前有效治理 Token
  pendingGovernanceBalance: number; // 整数：待激活治理 Token（预支来源）
  ownershipPercentage: number;      // 派生比率 [0,1]：相对所有权
  governancePercentage: number;     // 派生比率 [0,1]：治理占比
  activationEpochNumber?: number;   // 待激活 Token 生效的下一 Epoch
}

export function TokenBalanceCard({
  tokenSymbol,
  totalBalance,
  activeGovernanceBalance,
  pendingGovernanceBalance,
  ownershipPercentage,
  governancePercentage,
  activationEpochNumber,
}: TokenBalanceCardProps) {
  return (
    <Card>
      <CardHeader><CardTitle>你的社区所有权</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <Row label="Token 总余额" value={`${totalBalance} ${tokenSymbol}`} />
        <Row label="有效治理 Token" value={`${activeGovernanceBalance} ${tokenSymbol}`} />
        <Row label="待激活 Token" value={`${pendingGovernanceBalance} ${tokenSymbol}`} />
        <Row label="相对 Token 所有权" value={formatPercent(ownershipPercentage)} />
        <Row label="当前治理占比" value={formatPercent(governancePercentage)} />
        {pendingGovernanceBalance > 0 && (
          <div className="mt-3 rounded-lg bg-muted p-3 text-sm">
            <p>待激活治理 Token：{pendingGovernanceBalance} {tokenSymbol}（来源：未来增发预算预支）</p>
            <p>治理权激活时间：第 {activationEpochNumber} 个 Epoch 开始时</p>
            <p>这些 Token 已计入你的总余额，但暂时不能影响社区 Proposal。</p>
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          社区所有权 Token 代表贡献记录和决策参与权，不代表公司股权、收益权或金融资产。
        </p>
      </CardContent>
    </Card>
  );
}
```

**ProposalVoteCard** —— 展示 PRD §20.3 的四行数值与快照时间/区块。投票权重取 Proposal 激活时的快照字段 `snapshotWeight`（即快照时该成员的有效治理 Token），而非实时 `activeGovernanceBalance`；快照后新增的 Token 不影响本次结果：

```tsx
// components/features/proposal/proposal-vote-card.tsx
interface ProposalVoteCardProps {
  tokenSymbol: string;
  totalBalance: number;             // 整数：当前 Token 总余额（仅展示）
  activeGovernanceBalance: number;  // 整数：当前有效治理 Token（仅展示）
  snapshotWeight: number;           // 整数：本次快照投票权重（activeGovernanceBalanceSnapshot）
  pendingGovernanceBalance: number; // 整数：待激活 Token（仅展示）
  snapshotTime: Date;               // Proposal 激活时刻
  snapshotBlock?: number;           // 快照区块高度
  hasVoted: boolean;
}

export function ProposalVoteCard({
  tokenSymbol, totalBalance, activeGovernanceBalance,
  snapshotWeight, pendingGovernanceBalance,
  snapshotTime, snapshotBlock, hasVoted,
}: ProposalVoteCardProps) {
  return (
    <Card>
      <CardContent className="space-y-1">
        <Row label="你的 Token 总余额" value={`${totalBalance} ${tokenSymbol}`} />
        <Row label="有效治理 Token" value={`${activeGovernanceBalance} ${tokenSymbol}`} />
        <Row label="本次快照投票权重" value={`${snapshotWeight} ${tokenSymbol}`} highlight />
        <Row label="待激活 Token" value={`${pendingGovernanceBalance} ${tokenSymbol}`} />
        <p className="pt-2 text-sm">本次快照时间：{formatDateTime(snapshotTime)}</p>
        {snapshotBlock != null && <p className="text-sm">快照区块：#{snapshotBlock}</p>}
        <p className="text-xs text-muted-foreground">
          本次投票使用 Proposal 激活时的 Token 快照。快照之后获得的 Token 不会影响本次结果。
        </p>
      </CardContent>
      <CardFooter>
        <Button className="w-full" disabled={hasVoted}>
          {hasVoted ? '已投票' : '确认投票'}
        </Button>
      </CardFooter>
    </Card>
  );
}
```

快照权重可能小于当前有效治理 Token —— 成员在 Proposal 激活后又获得了正常预算 Token。前端只从快照字段读取权重、不读实时余额，从机制上防御投票前增发攻击。

### 2.4 关键 UI 文案组件

**预支警告（AdvanceWarningDialog）** —— 使用未来 Epoch 预算铸造前弹出，文案原文（PRD §6.7）：

```text
你正在使用下一 Epoch 的 Token 预算。

预支金额：500 AXO
下期预算将自动减少：500 AXO

通过预支额度获得的 Token，
将在下一 Epoch 激活治理权。
```

**增发确认框（MintConfirmDialog）** —— 管理员执行 mint 前展示增发前后余额、供应量与相对所有权变化，文案原文（PRD §16.3）：

```text
确认向 Alice 增发 50 AXO？

预算来源：本期正常预算

增发前：
Alice Token：100 AXO
总供应量：12,500 AXO

增发后：
Alice Token：150 AXO
总供应量：12,550 AXO
Alice 相对所有权：0.80% → 1.20%

该操作将：
✓ 写入不可删除 Token 账本
✓ 占用本期增发预算
✓ 更新总供应量
✓ 生成 Injective 可信记录
```

**InjectiveStatusBadge** —— 仅当 `status === 'verified'` 才渲染“Injective 已确认”，其余五态各有降级文案（PRD §10.4），永不对未确认记录声称“已完成区块链验证”：

```tsx
// components/features/record/injective-status-badge.tsx
type VerificationStatus =
  | 'pending' | 'submitting' | 'confirming'
  | 'verified' | 'failed' | 'superseded';

const COPY: Record<VerificationStatus, { text: string; tone: string }> = {
  pending:    { text: '等待提交 Injective', tone: 'muted' },
  submitting: { text: '正在提交 Injective', tone: 'muted' },
  confirming: { text: '等待区块确认', tone: 'muted' },
  verified:   { text: 'Injective 已确认', tone: 'success' },
  failed:     { text: '提交失败，可重试', tone: 'danger' },
  superseded: { text: '已被纠正记录取代', tone: 'muted' },
};

export function InjectiveStatusBadge({
  status, txHash,
}: { status: VerificationStatus; txHash?: string }) {
  const { text, tone } = COPY[status];
  return (
    <Badge tone={tone}>
      {status === 'verified' && <ChainIcon />}
      {text}
      {status === 'verified' && txHash && <TxHashLink hash={txHash} />}
    </Badge>
  );
}
```

`superseded` 徽章出现在被 Reversal/Correction 取代的原始记录上，记录详情页同时展示原版本与纠正版本并各自复算 `recordHash` 校验。

### 2.5 移动端优化

* 触摸尺寸：交互元素最小 44×44px，避免悬停态、使用 `active` 反馈；底部导航 56px、卡片间距 16px。
* 懒加载：`next/image` 的 `loading="lazy"` + 模糊占位；账本与 Epoch 等长列表按 Epoch 分段虚拟滚动。
* 预取：关键跳转（去投票、看结果）用 `<Link prefetch>`；快照与余额在服务端组件预取，客户端只读渲染。

### 2.6 链上记录溯源页（Records Explorer）—— v0.7 协议执行叙事

面向无 web3 经验的文科社群管理者的公开溯源页，路由 `/[locale]/records`，组件位于 `components/records/`：

| 文件 | 职责 |
|---|---|
| `records-explorer.tsx` | 页面主体：页头、解释条、规则守门区、分区检索、时间线、账本状态条 |
| `provenance-journey.tsx` | 单条记录的四步溯源旅程 + 链上存档卡（含 v0.7 授权行）+ 亲验流程 |
| `rule-guardian.tsx` | **v0.7 新增**：规则守门区，把"越权被合约拒绝"叙事化 |
| `chain-status.tsx` | Injective 公共账本实时状态（Blockscout `/api/v2/stats` 轮询） |
| `demo-data.ts` | PRD §29 AdventureX 演示数据（含 v0.7 `authorization` 字段） |

**两层信任叙事，缺一不可。**

1. **公证存证层（v0.6）**——"已发生的事改不了"：记录 → 数字指纹（recordHash/keccak256）→ 上链盖章 → 人人可复算校验。
2. **规则守门层（v0.7）**——"不合规的事发生不了"：合约在放行前强制核对预算、成员上限、预支比例、治理门禁，越权操作当场 Revert。`RuleGuardian` 用四个文科可读的"越权尝试 → 账本回应"示例呈现（超员上限、绕投票改规则、快照后突击拉票、平台替投票），对应威胁模型 §13.2–13.6 的越权 Revert demo。

**信任文案纪律（PRD §12.2）。** 守门区显式声明账本**保证什么 / 不保证什么**：账本保证权力不被滥发（预算/上限/投票规则不可绕过），但不替社区判断贡献真伪——那是社区的事。并强调**可退出性**：余额与治理历史存于链上，即使 YouFen 关站也可从链上读回，不依赖本平台数据库。

**客户端持钥前提。** "YouFen 不能替成员投票"在文案中作为**事实**陈述，其成立前提是成员私钥客户端持有（服务端拿不到私钥）——详见 BLOCKCHAIN-DESIGN v0.7 与 HANDOFF。

**授权溯源。** 发放/冲销类记录的存档卡展示 `authorization`：签名批准的管理员人数 + 账本放行前核对的规则项（本月预算 / 成员单期上限 / 预支比例）。真实环境由 `executeMint` 的 `signatures[]` 与合约校验事件回填。

> 当前 `RuleGuardian` 的四个场景为教学型示例；v0.7 合约部署后即成为真实的越权 Revert 演示（见 HANDOFF）。中英文案位于 `messages/{zh,en}.json` 的 `records.guardian` / `records.archive.auth*`，两语言键位对齐（各 165 键）。

---

## 3. 数据模型（Prisma Schema）

数据层承载 v0.6 的 Token / Epoch / 预支 / 冲销模型，遵循四条铁律：账本事件只追加、不 `update`/`delete`；比例一律 bps 整数（`500 = 5%`）；金额与供应量在服务层用整数（链交互层转 `bigint`）；纠错走 Reversal / Correction 并引用原记录。派生百分比（`ownershipPercentage` 等）为只读快照值，不参与链上哈希。字段名严格对齐 PRD §24.1–§24.8、§20.1。

### 3.1 基础实体（User / Community / Member / Contribution）

`Member` 不再持有任何权重字段，成员余额完全由 `MemberTokenBalance` 承载。`Contribution` 的建议 / 批准数量改名为 `suggestedTokenAmount` / `approvedTokenAmount`，状态机止于 `APPROVED`——批准只代表“贡献合规、数量已定”，实际 Token 发放由独立 mint 步骤在受预算约束的事务中完成（第 4 节）。`TokenMintEvent` 以复合 `@@unique([contributionId, budgetSource])`，从库层杜绝同一贡献在同一预算来源下被重复铸造（一笔奖励跨正常/预支两来源时拆两条事件，见 §4.4）。

```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
generator client {
  provider = "prisma-client-js"
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  password  String
  avatar    String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  ownedCommunities Community[]
  members          Member[]
  contributions    Contribution[] @relation("SubmittedBy")
}

model Community {
  id          String    @id @default(cuid())
  name        String
  type        String
  description String
  goal        String
  isPublic    Boolean   @default(true)
  ownerId     String
  deletedAt   DateTime? // 软删：账本引用永久保留，社区不物理删除
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  owner           User                  @relation(fields: [ownerId], references: [id])
  members         Member[]
  contributions   Contribution[]
  tokenPolicy     CommunityTokenPolicy?
  tokenState      CommunityTokenState?
  epochs          TokenEpoch[]
  memberBalances  MemberTokenBalance[]
  mintEvents      TokenMintEvent[]
  reversalEvents  TokenReversalEvent[]
  advanceRequests TokenAdvanceRequest[]
  proposals       Proposal[]
  publicRecords   PublicRecord[]
  @@index([ownerId])
}

model Member {
  id                String     @id @default(cuid())
  communityId       String
  userId            String
  role              MemberRole @default(MEMBER)
  contributionCount Int        @default(0)
  tags              String[]
  joinedAt          DateTime   @default(now())
  lastActiveAt      DateTime   @default(now())
  community     Community           @relation(fields: [communityId], references: [id], onDelete: Restrict)
  user          User                @relation(fields: [userId], references: [id])
  balance       MemberTokenBalance?
  contributions Contribution[]
  @@unique([communityId, userId])
  @@index([communityId])
  @@index([userId])
}

enum MemberRole {
  OWNER
  MANAGER
  MEMBER
}

model Contribution {
  id                   String             @id @default(cuid())
  communityId          String
  memberId             String
  description          String
  type                 String?
  ruleId               String?            // approve 时写入命中的 Token 规则 ID（规则存于 CommunityTokenPolicy.rules）
  suggestedTokenAmount Int
  approvedTokenAmount  Int?
  status               ContributionStatus @default(PENDING)
  aiReason             String?
  evidence             String[]
  submittedBy          String
  reviewedBy           String?
  createdAt            DateTime           @default(now())
  reviewedAt           DateTime?
  community Community       @relation(fields: [communityId], references: [id], onDelete: Restrict)
  member    Member          @relation(fields: [memberId], references: [id])
  submitter User            @relation("SubmittedBy", fields: [submittedBy], references: [id])
  mintEvents TokenMintEvent[] @relation("ContributionMint") // 已铸造的事件；正常增发至多一条 CURRENT_EPOCH，跨额度奖励另加一条 NEXT_EPOCH_ADVANCE（§4.4）
  @@index([communityId, status])
  @@index([memberId])
}

// 批准即定量，发放由独立 mint 事务完成，状态止于 APPROVED
enum ContributionStatus {
  PENDING
  APPROVED
  REJECTED
}
```

### 3.2 Token 政策、版本表与 Epoch（CommunityTokenPolicy / TokenPolicyVersion / TokenEpoch）

`CommunityTokenPolicy` 是社区宪法级**规则**的当前生效指针视图，通胀 / 预支 / 单期上限均为 bps 整数，`isTransferable` 恒 `false`；它是可变行，`updatedAt` 只存在于这一"当前生效指针"上。修改只能经 `TOKEN_POLICY_CHANGE` Proposal 在只追加的版本表 `TokenPolicyVersion` 创建 pending 版本行（含三个 bps 参数与 `rules` 快照），`pendingPolicyVersionId` / `pendingPolicyEffectiveEpoch` 指向它；Epoch 切换事务（§5.3 第 8 步）读取该行内容写回 `CommunityTokenPolicy` 并递增 `policyVersion`，绝不原地覆盖立即生效（第 7 节）。`TokenPolicyVersion` 是**不可变的版本行**，一经创建永不 `update`（§3.6 白名单仅 `publicRecordId` 回填，故其模型只有 `createdAt` 没有 `updatedAt`），是公开端点 `GET /api/communities/:id/token-policy/versions` 的直读存储。**规则与状态分离**：随增发 / 冲销 / 预支变化的 `currentTotalSupply` 不是规则，不放在 `CommunityTokenPolicy`，而是独立成 `CommunityTokenState`（社区 Token 运行时状态行），在各资金事务内读写。`TokenEpoch` 记录每期从月初供应量快照推导的预算全景，`status` 四态驱动预算生命周期。

```prisma
model CommunityTokenPolicy {
  id          String @id @default(cuid())
  communityId String @unique
  tokenName   String
  tokenSymbol String
  rules       Json   @default("[]") // GeneratedTokenRule[]（含规则 id），仅经 TOKEN_POLICY_CHANGE Proposal 版本化修改
  initialSupply           Int
  // currentTotalSupply 不属于规则，已迁往独立状态模型 CommunityTokenState（规则与状态分离，见下）
  epochDurationDays       Int     @default(30)
  monthlyInflationRateBps Int     @default(500)  // 500 = 5%
  maxAdvanceRateBps       Int     @default(2500) // 2500 = 25%
  memberMintCapRateBps    Int     @default(1000) // 1000 = 10%
  policyVersion           Int     @default(1)
  isTransferable          Boolean @default(false)
  pendingPolicyVersionId      String? @unique // 待生效 TokenPolicyVersion.id（TOKEN_POLICY_CHANGE Proposal 通过时创建）
  pendingPolicyEffectiveEpoch Int?    // 下一 Epoch 编号，切换事务激活
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  community      Community            @relation(fields: [communityId], references: [id], onDelete: Restrict)
  pendingVersion TokenPolicyVersion?  @relation("PendingPolicyVersion", fields: [pendingPolicyVersionId], references: [id])
  versions       TokenPolicyVersion[] @relation("PolicyVersions")
}

// 社区 Token 状态：与规则分离的独立可变状态行，承载运行时供应量。
// currentTotalSupply 是随每次增发 / 冲销 / 预支而变化的状态，不是宪法级规则，
// 故不放在 CommunityTokenPolicy（规则视图），单独成表在增发 / 冲销 / 预支事务内更新。
model CommunityTokenState {
  id          String @id @default(cuid())
  communityId String @unique
  currentTotalSupply Int @default(0)
  updatedAt   DateTime @updatedAt
  community   Community @relation(fields: [communityId], references: [id], onDelete: Restrict)
}

// 政策版本表：只追加不可改（§3.6 白名单仅 publicRecordId 回填）。
// TOKEN_POLICY_CHANGE Proposal 通过时创建 pending 行（§7.5），Epoch 切换事务读取并激活（§5.3 第 8 步）；
// GET /api/communities/:id/token-policy/versions 直读本表（§8.3）
model TokenPolicyVersion {
  id       String @id @default(cuid())
  policyId String
  version  Int // 激活时写回 CommunityTokenPolicy.policyVersion
  effectiveEpoch Int // 生效 Epoch 编号 = Proposal 通过时的下一 Epoch（对应 pendingPolicyEffectiveEpoch）
  monthlyInflationRateBps Int
  maxAdvanceRateBps       Int
  memberMintCapRateBps    Int
  rules      Json    // GeneratedTokenRule[] 快照，随版本冻结
  proposalId String? // 产生本版本的 TOKEN_POLICY_CHANGE Proposal（v1 初始版本为空）
  publicRecordId String? // TOKEN_POLICY_VERSION 可信记录回填（链上 recordPolicyVersion）
  createdAt DateTime @default(now())
  policy          CommunityTokenPolicy  @relation("PolicyVersions", fields: [policyId], references: [id], onDelete: Restrict)
  pendingOnPolicy CommunityTokenPolicy? @relation("PendingPolicyVersion")
  @@unique([policyId, version])
}

model TokenEpoch {
  id          String   @id @default(cuid())
  communityId String
  epochNumber Int
  startTime   DateTime
  endTime     DateTime
  openingSupply    Int // 月初供应量快照；全期预算基于此，禁止月内复利
  inflationRateBps Int
  baseMintBudget               Int
  advanceDebtFromPreviousEpoch Int @default(0)
  effectiveRegularBudget       Int // = max(0, baseMintBudget - advanceDebt)
  maxAdvanceAmount     Int
  regularMintedAmount  Int @default(0)
  advancedMintedAmount Int @default(0)
  unusedRegularBudget  Int @default(0) // Epoch 关闭时作废，不滚入下一期
  status    EpochStatus @default(UPCOMING)
  createdAt DateTime    @default(now())
  closedAt  DateTime?
  publicRecordId String? // Epoch Summary 可信记录
  community  Community        @relation(fields: [communityId], references: [id], onDelete: Restrict)
  mintEvents TokenMintEvent[]
  @@unique([communityId, epochNumber])
  @@index([communityId, status])
}

enum EpochStatus {
  UPCOMING
  ACTIVE
  CLOSING
  CLOSED
}
```

### 3.3 成员余额与账本事件（MemberTokenBalance / TokenMintEvent / TokenAdvanceRequest / TokenReversalEvent）

`MemberTokenBalance` 拆分三类余额与统计字段，是唯一可变的余额聚合行（在增发 / 冲销 / 激活事务内条件更新）；成员级 `ownershipPercentage` / `governancePercentage` 是派生值，一律查询时按余额÷总供应量计算，不作为权威字段存储（§4.2）。`TokenMintEvent` 与 `TokenReversalEvent` 为纯追加不可变账本，冻结前后成员余额、有效治理余额、总供应量与相对所有权快照（`ownershipPercentageBefore/After` 是历史快照事实，必须保留）；`budgetSource` 区分正常 / 预支来源，`governanceStatus` 与 `governanceActivationEpoch` 表达预支 Token“下一 Epoch 激活”。`TokenAdvanceRequest` 以六态状态机承载预支审批。

```prisma
model MemberTokenBalance {
  id          String @id @default(cuid())
  communityId String
  memberId    String
  totalBalance             Int @default(0)
  activeGovernanceBalance  Int @default(0)
  pendingGovernanceBalance Int @default(0)
  // ownershipPercentage / governancePercentage 不作为权威字段存储：二者是派生值，
  // 查询时计算（ownership = totalBalance / CommunityTokenState.currentTotalSupply，
  // governance = activeGovernanceBalance / 有效治理总量），见 §4.2。历史快照仍留存于 TokenMintEvent。
  tokensEarnedCurrentEpoch Int @default(0)
  tokensEarnedLifetime     Int @default(0)
  tokensReversedLifetime   Int @default(0)
  lastContributionAt DateTime?
  lastMintAt         DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  community Community @relation(fields: [communityId], references: [id], onDelete: Restrict)
  member    Member    @relation(fields: [memberId], references: [id])
  @@unique([communityId, memberId])
  @@index([communityId, activeGovernanceBalance(sort: Desc)])
}

model TokenMintEvent {
  id          String @id @default(cuid())
  communityId String
  memberId    String
  epochId     String
  mintType     TokenMintType
  budgetSource TokenBudgetSource
  amount       Int
  governanceStatus          GovernanceStatus
  governanceActivationEpoch Int? // 预支 Token 激活 Epoch 编号
  memberBalanceBefore       Int
  memberBalanceAfter        Int
  activeGovernanceBefore    Int
  activeGovernanceAfter     Int
  totalSupplyBefore         Int
  totalSupplyAfter          Int
  ownershipPercentageBefore Float
  ownershipPercentageAfter  Float
  contributionId     String? // 一贡献每预算来源至多一次铸造（见下方 @@unique）
  ruleId             String?
  proposalId         String?
  tokenPolicyVersion Int
  reason           String
  evidenceUrls     String[]
  approvedBy       String
  secondApprovedBy String? // 关联方 / 预支需第二审批人
  relatedParty     Boolean  @default(false)
  publicRecordId   String?
  createdAt        DateTime @default(now())
  community    Community           @relation(fields: [communityId], references: [id], onDelete: Restrict)
  epoch        TokenEpoch          @relation(fields: [epochId], references: [id])
  contribution Contribution?       @relation("ContributionMint", fields: [contributionId], references: [id])
  reversal     TokenReversalEvent? @relation("MintReversal")
  @@unique([contributionId, budgetSource]) // 每贡献每预算来源至多一条：正常增发幂等 + 跨额度奖励可拆两条
  @@index([communityId, createdAt(sort: Desc)])
  @@index([memberId, createdAt(sort: Desc)])
  @@index([epochId])
}

enum TokenMintType {
  INITIAL_ALLOCATION
  CONTRIBUTION
  SPECIAL_REWARD
  HISTORICAL_CORRECTION
}

enum TokenBudgetSource {
  CURRENT_EPOCH
  NEXT_EPOCH_ADVANCE
}

enum GovernanceStatus {
  ACTIVE
  PENDING
}

model TokenAdvanceRequest {
  id          String @id @default(cuid())
  communityId String
  epochId     String
  requestedAmount Int
  approvedAmount  Int?
  advanceRateBps  Int // 占本期基础预算比例，决定审批路径
  reason          String
  contributionIds String[]
  status       AdvanceStatus @default(DRAFT)
  relatedParty Boolean       @default(false) // 实现辅助字段：创建时按关联方规则（§4.5）判定审批路径，PRD §24.5 之外
  requestedBy      String
  secondApprovedBy String?
  proposalId       String?
  createdAt  DateTime  @default(now())
  approvedAt DateTime?
  executedAt DateTime?
  publicRecordId String?
  community Community @relation(fields: [communityId], references: [id], onDelete: Restrict)
  @@index([communityId, status])
  @@index([epochId])
}

enum AdvanceStatus {
  DRAFT
  PENDING_SECOND_APPROVAL
  PENDING_PROPOSAL
  APPROVED
  REJECTED
  EXECUTED
}

model TokenReversalEvent {
  id          String @id @default(cuid())
  communityId String
  memberId    String
  originalMintEventId String @unique // 必填引用原增发（PRD 10.3 追加纠正）
  amount              Int
  reason              String
  totalBalanceAfter             Int
  activeGovernanceBalanceAfter  Int
  pendingGovernanceBalanceAfter Int
  totalSupplyAfter              Int
  approvedBy String
  proposalId String?
  publicRecordId String?
  createdAt      DateTime @default(now())
  community    Community      @relation(fields: [communityId], references: [id], onDelete: Restrict)
  originalMint TokenMintEvent @relation("MintReversal", fields: [originalMintEventId], references: [id])
  @@index([communityId, createdAt(sort: Desc)])
  @@index([memberId])
}
```

### 3.4 治理（Proposal / Vote）

`Proposal` 增加 `type: ProposalType` 六值枚举与全部激活快照字段：政策修改、预支超限、特殊奖励、关联方增发、冲销都必须走对应类型。快照字段在 Draft → Active 时一次性冻结，配合 `minimumVoterCount` 以最低参与人数而非供应量 Quorum 计票；特殊 Proposal 附加字段对齐 PRD §20.1。`Vote` 仅存 PRD §24.8 四个快照字段——投票权重只读 Proposal 激活时的有效治理 Token 快照，从数据结构上封死投票前增发攻击；逐成员权重快照落入不可变子表 `ProposalMemberSnapshot`（激活事务见 §7.2）。

```prisma
model Proposal {
  id          String @id @default(cuid())
  communityId String
  type        ProposalType
  title       String
  description String
  options     Json // 投票选项数组
  status      ProposalStatus @default(DRAFT)
  startTime   DateTime
  endTime     DateTime
  snapshotTime  DateTime?
  snapshotBlock Int?
  epochIdSnapshot                String?
  totalSupplySnapshot            Int?
  activeGovernanceSupplySnapshot Int?
  tokenPolicyVersionSnapshot     Int?
  minimumVoterCount              Int     @default(3)
  advanceAmount          Int?    // 以下为特殊 Proposal 附加字段（PRD 20.1）
  specialMintRecipientId String?
  specialMintAmount      Int?
  policyChangePayload    Json?
  relatedPartyNote       String?
  createdBy            String
  createdAt            DateTime @default(now())
  resultPublicRecordId String?
  community       Community                @relation(fields: [communityId], references: [id], onDelete: Restrict)
  votes           Vote[]
  memberSnapshots ProposalMemberSnapshot[]
  @@index([communityId, status, endTime])
}

// Proposal 激活时逐成员冻结的投票权重快照（只追加，绝不回写 MemberTokenBalance）
model ProposalMemberSnapshot {
  id         String @id @default(cuid())
  proposalId String
  memberId   String
  activeGovernanceToken Int // 快照时有效治理 Token，即本 Proposal 投票权重
  createdAt  DateTime @default(now())
  proposal   Proposal @relation(fields: [proposalId], references: [id], onDelete: Restrict)
  @@unique([proposalId, memberId])
  @@index([proposalId])
}

enum ProposalType {
  COMMUNITY_DECISION
  TOKEN_POLICY_CHANGE
  BUDGET_ADVANCE
  SPECIAL_MINT
  RELATED_PARTY_MINT
  TOKEN_REVERSAL
}

enum ProposalStatus {
  DRAFT
  ACTIVE
  ENDED
  RECORDED
}

model Vote {
  id         String @id @default(cuid())
  proposalId String
  memberId   String
  optionId   String
  totalTokenBalanceSnapshot       Int
  activeGovernanceBalanceSnapshot Int // 本票权重来源
  totalSupplySnapshot             Int
  governancePercentageSnapshot    Float
  createdAt DateTime @default(now())
  proposal  Proposal @relation(fields: [proposalId], references: [id], onDelete: Restrict)
  @@unique([proposalId, memberId])
  @@index([proposalId])
}
```

### 3.5 可信记录（PublicRecord）

`PublicRecord` 是上链 Outbox：`type` 共 13 类——PRD §10.2 的 12 类产品账本事件，外加 Epoch 关账摘要 `EPOCH_SUMMARY`（PRD §26.3 第 10 步要求的 Epoch Summary PublicRecord，对应链上 `EpochRecorded`）；`status` 为 PRD §10.4 六态验证状态；`chainEligible` 标记该类型是否入上链队列（DB-only 类型见本节映射表）。它保存 canonical envelope 的 `recordHash`（`@unique`，天然幂等键）与信封原文 `canonicalPayload`（供第三方复算），并存 `txHash` / `blockNumber` / `assignedNonce`（广播前落库，供崩溃对账）/ `attemptEpoch`（重试代际）/ `supersededByRecordId`（被纠正记录指向）；`sourceTable` + `sourceId` 反查产生该记录的账本行。仅 `VERIFIED` 状态前端可展示“Injective 已确认”。字段与状态机细节详见 BLOCKCHAIN-DESIGN.md §4–§6。

```prisma
model PublicRecord {
  id          String @id @default(cuid())
  communityId String
  type   RecordType
  status RecordStatus @default(PENDING)
  chainEligible Boolean @default(true) // false = DB-only 账本行（见 §3.5 映射表），requestSubmission 拒绝入队
  recordHash       String @unique // keccak256(canonicalize(envelope))
  canonicalPayload String        // 信封原文字符串，第三方直接复算
  txHash        String?
  blockNumber   Int?
  assignedNonce Int? // 广播前落库，reconciler 反查依据
  attemptEpoch  Int  @default(1)
  supersededByRecordId String? // 指向纠正 / 冲销后的新记录
  sourceTable String // 产生该记录的账本表
  sourceId    String
  network   String   @default("injective-testnet")
  lastError String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  community Community @relation(fields: [communityId], references: [id], onDelete: Restrict)
  @@unique([sourceTable, sourceId, type]) // 同一源行可产生多类记录（如 Proposal 的 CREATED/SNAPSHOT/RESULT），按 (源, 类型) 去重
  @@index([communityId, type, createdAt(sort: Desc)])
  @@index([status]) // 队列 / reconciler 扫描
}

enum RecordType {
  INITIAL_ALLOCATION
  TOKEN_MINT
  ADVANCE_MINT
  TOKEN_REVERSAL
  EPOCH_BUDGET_CREATED
  BUDGET_ADVANCE
  ADVANCE_DEBT_REPAYMENT
  EPOCH_SUMMARY // Epoch 关账摘要（PRD §26.3 第 10 步），链上 EpochRecorded
  INFLATION_RATE_CHANGE
  TOKEN_POLICY_VERSION
  PROPOSAL_CREATED
  PROPOSAL_SNAPSHOT
  PROPOSAL_RESULT
}

enum RecordStatus {
  PENDING
  SUBMITTING
  CONFIRMING
  VERIFIED
  FAILED
  SUPERSEDED
}
```

链交互层（`lib/blockchain/types.ts`）另用小写 `VerificationStatus` 联合类型与七类链上 `RecordType`（Advance Mint 复用 `TokensMinted` 事件）作为合约视图，避免把 Prisma 枚举字符串直接传入合约。DB 13 类 `RecordType` 到链上七类可信记录的完整映射如下；`chainEligible = false` 的类型是纯 DB 账本行（同样满足 PRD §10.2“进入不可删除的产品账本”），`requestSubmission` 对其拒绝入队、reconciler 跳过、前端只展示账本行而不展示链上验证徽章，其数值由所列链上记录承载并可在链上验证：

| DB `RecordType` | chainEligible | 链上类型 / 合约函数 | 说明 |
| --- | --- | --- | --- |
| `INITIAL_ALLOCATION` | 是 | `token_mint` / `recordMint` | 初始分配按普通 Mint 上链（§10.1“初始分配、普通增发均走 token_mint”） |
| `TOKEN_MINT` | 是 | `token_mint` / `recordMint` | `budgetSource = 0` |
| `ADVANCE_MINT` | 是 | `advance_mint` / `recordMint` | `budgetSource = 1` 且 `activationEpoch > 0` |
| `TOKEN_REVERSAL` | 是 | `token_reversal` / `recordReversal` | 携带 `originalRecordHash` |
| `EPOCH_BUDGET_CREATED` | 否 | —（由该 Epoch 关账时的 `epoch_summary` 承载） | 预算参数在 `EpochRecorded` 事件的 `openingSupply` / `baseBudget` 中可验证 |
| `BUDGET_ADVANCE` | 否 | —（由 `advance_mint` 与关账 `epoch_summary` 承载） | 预支事实随 ADVANCE_MINT 上链，预支总额随 `advancedMinted` 上链 |
| `ADVANCE_DEBT_REPAYMENT` | 否 | —（由下期 `epoch_summary` 的 `advanceDebt` 承载） | Epoch 切换扣债步骤创建（§5.3 第 10 步，PRD §10.2） |
| `EPOCH_SUMMARY` | 是 | `epoch_summary` / `recordEpochSummary` | 关账摘要，链上 `EpochRecorded` 事件 |
| `INFLATION_RATE_CHANGE` | 否 | —（由同事务 `policy_version` 承载） | 新通胀率含在 `PolicyVersionRecorded` 事件的 `inflationRateBps` 字段 |
| `TOKEN_POLICY_VERSION` | 是 | `policy_version` / `recordPolicyVersion` | 版本号、三个 bps 参数、`effectiveEpoch` 上链 |
| `PROPOSAL_CREATED` | 否 | —（由激活时的 `proposal_snapshot` 承载） | 快照上链即锚定 Proposal 存在性与参数 |
| `PROPOSAL_SNAPSHOT` | 是 | `proposal_snapshot` / `recordProposalSnapshot` | Proposal 激活事务创建（§7.2） |
| `PROPOSAL_RESULT` | 是 | `proposal_result` / `recordProposalResult` | 结果结算创建（§7.6） |

### 3.6 账本不可删除性

账本类模型对 `Community` 一律 `onDelete: Restrict`，社区经 `Community.deletedAt` 软删，账本引用永久保留。`TokenMintEvent` / `TokenReversalEvent` / `TokenPolicyVersion` / `Vote` / `ProposalMemberSnapshot` 为纯追加事件，禁止 `delete`；`update` 仅限每模型的白名单生命周期字段——`TokenMintEvent` 只允许 `governanceStatus` 激活翻转（Epoch 切换事务，§5.3）与 `publicRecordId` 回填，金额与快照字段永不可变；`TokenReversalEvent` 与 `TokenPolicyVersion` 只允许 `publicRecordId` 回填；`Vote` 与 `ProposalMemberSnapshot` 无任何可更新字段。纠错只能追加引用原记录的新事件；`PublicRecord` 是状态机 Outbox，禁止删除，仅允许状态机白名单字段更新。应用层用 Prisma Client 扩展在查询层拦截，DB 触发器可作可选加固。

```typescript
// lib/db/immutable-guard.ts —— 账本模型逐模型白名单：仅生命周期字段可更新，其余 update/delete 一律拦截
const LEDGER_MUTABLE_FIELDS: Record<string, ReadonlySet<string>> = {
  TokenMintEvent: new Set(['governanceStatus', 'publicRecordId']), // 治理激活翻转 + 可信记录回填
  TokenReversalEvent: new Set(['publicRecordId']),
  TokenPolicyVersion: new Set(['publicRecordId']), // 版本参数与 rules 快照永不可变
  Vote: new Set(),
  ProposalMemberSnapshot: new Set(),
  PublicRecord: new Set([ // 状态机字段
    'status', 'txHash', 'blockNumber', 'assignedNonce',
    'attemptEpoch', 'supersededByRecordId', 'lastError', 'updatedAt',
  ]),
};

export const immutableLedgerGuard = Prisma.defineExtension({
  name: 'immutable-ledger-guard',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const whitelist = model ? LEDGER_MUTABLE_FIELDS[model] : undefined;
        if (whitelist) {
          if (operation === 'delete' || operation === 'deleteMany') {
            throw new Error(`[LEDGER] ${model} 不可删除：账本只追加，纠错请追加 Reversal/Correction`);
          }
          if (['update', 'updateMany', 'upsert'].includes(operation)) {
            const data = (args as { data?: Record<string, unknown> }).data ?? {};
            const illegal = Object.keys(data).filter((k) => !whitelist.has(k));
            if (illegal.length > 0) {
              throw new Error(`[LEDGER] ${model} 仅白名单生命周期字段可更新，非法：${illegal.join(', ')}`);
            }
          }
        }
        return query(args);
      },
    },
  },
});
// export const prisma = new PrismaClient().$extends(immutableLedgerGuard);
```

> 可选 DB 层加固：对账本事件表（`TokenMintEvent` / `TokenReversalEvent` / `Vote` / `ProposalMemberSnapshot`）建 `BEFORE UPDATE OR DELETE` 触发器 `RAISE EXCEPTION`（`TokenMintEvent` 的两个白名单字段 UPDATE 例外），即使绕过 Prisma（原生 SQL / 运维误操作）也无法改写账本。

### 3.7 索引优化与缓存策略

关键索引以 Token 余额与账本术语组织：

```sql
CREATE INDEX idx_balance_active_gov ON "MemberTokenBalance"(community_id, active_governance_balance DESC); -- 成员按有效治理 Token 排序
CREATE INDEX idx_balance_total ON "MemberTokenBalance"(community_id, total_balance DESC);                    -- 相对所有权榜（Top N）：占比派生自 total_balance÷总供应量，同社区供应量恒定故按 total_balance 排序等价
CREATE UNIQUE INDEX idx_epoch_number ON "TokenEpoch"(community_id, epoch_number);                           -- 当前 Epoch 查找
CREATE INDEX idx_epoch_status ON "TokenEpoch"(community_id, status);
CREATE INDEX idx_mint_ledger ON "TokenMintEvent"(community_id, created_at DESC);                            -- Token 账本分页
CREATE UNIQUE INDEX idx_record_hash ON "PublicRecord"(record_hash);                                         -- 幂等 + 反查
CREATE INDEX idx_record_status ON "PublicRecord"(status);                                                   -- 队列 / reconciler 扫描
CREATE INDEX idx_proposal_status_end ON "Proposal"(community_id, status, end_time);                         -- 进行中 Proposal
```

缓存沿用旧版键设计思路，键名迁到 Token 术语，读多写少的聚合走 Redis：

- 键：`tokenPolicy:{communityId}`、`memberBalances:{communityId}`（有序集，按 `activeGovernanceBalance` 排名）、`tokenLedger:{communityId}:{page}`、`proposalSnapshot:{proposalId}`、`proposalTally:{proposalId}`。
- TTL：`tokenPolicy` 300s、`memberBalances` 60s、`tokenLedger` 120s、`proposalSnapshot` 快照不可变故长缓存 86400s、`proposalTally` 10s。
- 失效：增发 / 冲销 / Epoch 切换事务提交后主动清 `tokenPolicy`、`memberBalances`、`tokenLedger`。
- 实时计票：`proposalTally` 用 Redis Hash 以 `optionId` 累加 `activeGovernanceBalanceSnapshot` 权重，最终结果仍以 `Vote` 表快照为准，Redis 仅作展示加速。
- 红线：任何缓存都不得作为增发预算校验或投票权重的判据，预算与权重一律从数据库快照行读取。

---

## 4. Token 引擎：增发与冲销

Token 引擎是后端核心记账层，把"贡献被认可"转换为**受预算约束、可原子提交、永久可溯源**的账本变更。所有写操作遵守两条红线：账本事件只追加、绝不 update/delete 原始行（纠错走 Reversal，见 §4.6）；一次增发在数据库事务内原子完成全部校验与写入，区块链提交在事务提交**之后**才异步入队（衔接见 BLOCKCHAIN-DESIGN.md §6）。

### 4.1 引擎设计约束：管理者权限边界

管理者的唯一权限是"确认贡献是否符合预先公布的规则"。引擎在设计上必须使以下越权行为在代码路径上不可达（PRD §8.1）：

- **不能自定义任意增发数量**：`amount` 只能取自 `Contribution.approvedTokenAmount`（该值又受 Token Rule 约束），增发接口不接受管理者临时输入的裸金额。
- **不能绕过月度预算**：`amount` 必须通过本期剩余额度校验（`effectiveRegularBudget − regularMintedAmount`），额度不足时只能走预支或延迟至下期，不存在"强制发放"分支。
- **不能绕过成员单期上限**：受 `calculateMemberEpochCap` 约束（§4.2）。
- **不能删除增发记录、不能修改历史供应量**：`TokenMintEvent`、`TokenReversalEvent`、`PublicRecord` 在应用层禁止 update/delete（模型层 `onDelete: Restrict`，由 §3.6 的 immutable guard 按白名单拦截）。
- **不能在 Proposal 期间改变快照**：快照字段一经写入即只读（Proposal 权重只读激活时的快照，见第 7 节）。
- **不能给自己单独审批 Token**：关联方增发强制第二审核人（§4.5）。

这些约束不是运行时的"提醒"，而是引擎函数签名与事务校验的硬编码前置条件——任一校验失败即整笔事务回滚，账本不产生任何副作用。

### 4.2 核心计算纯函数

预算与上限计算全部是无副作用纯函数，输入输出均为整数（比例统一为 bps 整数），可独立单元测试并在前后端共享（PRD §25）：

```typescript
// 25.1 Epoch 基础预算 = 月初供应量快照 × 通胀率（禁止月内复利）
function calculateBaseMintBudget(openingSupply: number, inflationRateBps: number): number {
  return Math.floor(openingSupply * inflationRateBps / 10_000);
}
// 25.2 实际基础可用预算 = 基础预算 − 上期滚入的预支债务
function calculateEffectiveRegularBudget(baseMintBudget: number, advanceDebtFromPreviousEpoch: number): number {
  return Math.max(0, baseMintBudget - advanceDebtFromPreviousEpoch);
}
// 25.3 最大预支额度 = 基础预算 × maxAdvanceRateBps（默认 2500 = 25%）
function calculateMaxAdvanceAmount(baseMintBudget: number, maxAdvanceRateBps: number): number {
  return Math.floor(baseMintBudget * maxAdvanceRateBps / 10_000);
}
// 25.4 成员单期上限 = 基础预算 × memberMintCapRateBps（默认 1000 = 10%）
function calculateMemberEpochCap(baseMintBudget: number, memberMintCapRateBps: number): number {
  return Math.floor(baseMintBudget * memberMintCapRateBps / 10_000);
}
// 25.5 相对所有权 = 成员余额 / 总供应量
function calculateOwnershipPercentage(memberBalance: number, totalSupply: number): number {
  if (totalSupply === 0) return 0;
  return memberBalance / totalSupply;
}
```

`ownershipPercentage`/`governancePercentage` 是派生浮点值，查询时按余额÷总供应量即时计算供 UI 展示，**不作为 `MemberTokenBalance` 的持久字段**，也**不进入 canonical payload 哈希**（浮点是哈希毒药，详见 BLOCKCHAIN-DESIGN.md §4）。`TokenMintEvent` 上的 `ownershipPercentageBefore/After` 是历史快照事实，属例外——它们是写入时点的既成记录，永久保留。

### 4.3 approve 与 mint 两步拆分

旧版"一步审核并发放"被拆分为两个独立端点，职责严格分离：

```text
POST /api/contributions/:id/approve   仅改 Contribution 状态 → APPROVED
      （写入 approvedTokenAmount、approvedBy；不触碰任何账本）
              ↓
POST /api/contributions/:id/mint      才动账本（§4.4 十三步原子事务）
```

`approve` 是"规则符合性判定"，是可撤销的软状态；`mint` 是"不可逆的账本写入 + 上链"。拆分后，预算校验、单期上限、关联方判定全部落在 `mint` 阶段，approve 阶段不承担任何供应量语义，也不产生 `TokenMintEvent`。

### 4.4 正常增发事务

一次正常增发在单个 `prisma.$transaction` 内原子完成 PRD §26.1 的十三步。`TokenEpoch` 行通过 `SELECT ... FOR UPDATE` 加行锁串行化，避免并发增发击穿预算；幂等由 Contribution 尚未存在 `CURRENT_EPOCH` 来源的 `TokenMintEvent`（复合 `@@unique([contributionId, budgetSource])`，正常增发的来源即 `CURRENT_EPOCH`）保证：

```typescript
async function mintForContribution(contributionId: string, approverId: string) {
  const publicRecordId = await prisma.$transaction(async (tx) => {
    // 1. 验证 Contribution 为 APPROVED；2. 验证正常增发尚未生成（幂等：无 CURRENT_EPOCH 来源事件）
    const contribution = await tx.contribution.findUniqueOrThrow({
      where: { id: contributionId },
      include: { mintEvents: true },
    });
    if (contribution.status !== 'APPROVED') throw new EngineError('NOT_APPROVED');
    if (contribution.mintEvents.some((m) => m.budgetSource === 'CURRENT_EPOCH'))
      throw new EngineError('ALREADY_MINTED');

    // 5. 锁定当前 ACTIVE TokenEpoch（行锁；置于额度校验前，保证读到的是被本事务独占的最新值）
    const [epoch] = await tx.$queryRaw<TokenEpoch[]>`
      SELECT * FROM "TokenEpoch"
      WHERE "communityId" = ${contribution.communityId} AND status = 'ACTIVE'
      FOR UPDATE`;
    if (!epoch) throw new EngineError('EPOCH_NOT_ACTIVE');

    const policy = await tx.communityTokenPolicy.findUniqueOrThrow({
      where: { communityId: contribution.communityId } });
    const state = await tx.communityTokenState.findUniqueOrThrow({ // 供应量属状态，非规则（§3.2）
      where: { communityId: contribution.communityId } });
    const balance = await tx.memberTokenBalance.findUniqueOrThrow({
      where: { communityId_memberId: {
        communityId: contribution.communityId, memberId: contribution.memberId } } });

    // 3. 验证 Token Rule：金额取自规则约束下的 approvedTokenAmount，管理者无法自定义
    const amount = contribution.approvedTokenAmount ?? 0;
    const rule = findTokenRule(policy.rules, contribution.ruleId); // 规则存于版本化 Policy（§3.2）
    if (!rule || amount <= 0 || amount > rule.tokenAmount) throw new EngineError('RULE_VIOLATION');

    // 4. 验证成员本期上限；6. 验证正常剩余额度
    const memberCap = calculateMemberEpochCap(epoch.baseMintBudget, policy.memberMintCapRateBps);
    if (balance.tokensEarnedCurrentEpoch + amount > memberCap) throw new EngineError('MEMBER_CAP_EXCEEDED');
    if (amount > epoch.effectiveRegularBudget - epoch.regularMintedAmount) {
      throw new EngineError('BUDGET_EXCEEDED'); // 额度不足 → 前端提示改走预支
    }

    // 前后快照（正常增发治理权立即激活：governanceStatus = ACTIVE）
    const totalBefore = state.currentTotalSupply, totalAfter = totalBefore + amount;
    const memberBefore = balance.totalBalance, memberAfter = memberBefore + amount;
    const ownBefore = calculateOwnershipPercentage(memberBefore, totalBefore);
    const ownAfter = calculateOwnershipPercentage(memberAfter, totalAfter);

    // 7. 创建 TokenMintEvent（追加；@@unique([contributionId, budgetSource])，同一贡献同一来源第二次铸造在库层直接失败）
    const mint = await tx.tokenMintEvent.create({ data: {
      communityId: contribution.communityId, memberId: contribution.memberId, epochId: epoch.id,
      mintType: 'CONTRIBUTION', budgetSource: 'CURRENT_EPOCH', amount,
      governanceStatus: 'ACTIVE',
      memberBalanceBefore: memberBefore, memberBalanceAfter: memberAfter,
      activeGovernanceBefore: balance.activeGovernanceBalance,
      activeGovernanceAfter: balance.activeGovernanceBalance + amount,
      totalSupplyBefore: totalBefore, totalSupplyAfter: totalAfter,
      ownershipPercentageBefore: ownBefore, ownershipPercentageAfter: ownAfter,
      contributionId: contribution.id, ruleId: contribution.ruleId,
      tokenPolicyVersion: policy.policyVersion,
      reason: contribution.description, evidenceUrls: contribution.evidence,
      approvedBy: approverId, relatedParty: false,
    }});

    // 8/9. 更新成员总余额与有效治理余额；10. 总供应量；11. Epoch 正常增发量
    await tx.memberTokenBalance.update({
      where: { id: balance.id },
      data: {
        totalBalance: memberAfter,
        activeGovernanceBalance: { increment: amount },
        tokensEarnedCurrentEpoch: { increment: amount },
        tokensEarnedLifetime: { increment: amount },
        lastMintAt: new Date(),
      },
    });
    await tx.communityTokenState.update({ // 供应量写入独立状态行（§3.2 规则与状态分离）
      where: { communityId: contribution.communityId }, data: { currentTotalSupply: totalAfter },
    });
    // 条件 UPDATE 再次防击穿：只有当已增发量仍在预算内才成功
    const bumped = await tx.$executeRaw`
      UPDATE "TokenEpoch" SET "regularMintedAmount" = "regularMintedAmount" + ${amount}
      WHERE id = ${epoch.id}
        AND "regularMintedAmount" + ${amount} <= "effectiveRegularBudget"`;
    if (bumped !== 1) throw new EngineError('BUDGET_EXCEEDED');

    // 12. 创建待验证 PublicRecord（envelope + recordHash 在事务内即算即存，之后只读不重算）
    const { envelope, recordHash } = payloadBuilder.build({ kind: 'token_mint', mint });
    const record = await publicRecordService.createPendingRecord(tx, {
      recordType: 'TOKEN_MINT', sourceTable: 'TokenMintEvent', sourceId: mint.id,
      communityId: contribution.communityId, envelope, recordHash,
    });
    await tx.tokenMintEvent.update({ // publicRecordId 属 §3.6 白名单字段
      where: { id: mint.id }, data: { publicRecordId: record.id } });
    return record.id; // 13. 事务提交
  });

  // 事务提交成功后才异步上链（PRD §26.1 末句；队列/nonce/幂等详见 BLOCKCHAIN-DESIGN.md §6）
  await publicRecordService.requestSubmission(publicRecordId);
}
```

`baseMintBudget` 全程复用开期时的 `openingSupply` 快照——月内任何增发都不改变本期预算，禁止复利。预支路径（`budgetSource = NEXT_EPOCH_ADVANCE`、治理权计入 `pendingGovernanceBalance` 待下一 Epoch 激活）详见第 6 节；Epoch 切换时的激活逻辑详见第 5 节。

**跨额度奖励必须拆成两条 `TokenMintEvent`**：`budgetSource` 是单值枚举（`CURRENT_EPOCH` / `NEXT_EPOCH_ADVANCE`），一条 mint 事件只归属单一预算来源，链上事件 schema 保持不变。当一笔奖励同时动用本期正常剩余额度与预支额度时（正常剩余不足以覆盖全额、差额走预支），引擎必须在同一事务内拆成两条 `TokenMintEvent`、指向同一 `contributionId`：一条 `budgetSource = CURRENT_EPOCH`、`governanceStatus = ACTIVE`（治理立即生效，计入 `regularMintedAmount`），另一条 `budgetSource = NEXT_EPOCH_ADVANCE`、`governanceStatus = PENDING`、`governanceActivationEpoch = 下一期号`（治理待激活，计入 `advancedMintedAmount`）。绝不把两种来源塞进单条事件、也不让 `budgetSource` 承载混合语义——正常部分立即入活跃治理、预支部分进 `pendingGovernanceBalance` 待第 5 节 Epoch 切换统一激活。为容纳同一贡献的双来源拆分，`TokenMintEvent` 的去重约束由单列 `contributionId @unique` 放宽为复合 `@@unique([contributionId, budgetSource])`（每贡献每来源至多一条，仍从库层杜绝同一来源重复铸造）。

### 4.5 关联方增发

满足以下任一条件即判定为 Related-party Mint（PRD §8.3），`mint` 事务在写入前置位 `TokenMintEvent.relatedParty = true`：

- 接收人与审批人相同；
- 接收人为 Steward；
- 接收人为审批人的家庭成员或关联账号；
- 接收人为拥有管理员权限的成员。

关联方增发的引擎约束：

```text
relatedParty = true
  ├─ 审批人不得单独执行 → 强制 secondApprovedBy（且 ≠ approvedBy）
  ├─ amount 未超普通规则数量 → 双审批后走 §4.4 正常事务
  └─ amount 超普通规则数量   → 必须转 RELATED_PARTY_MINT Proposal
                               投票通过（proposalId 引用快照结果）后才铸造
```

事务内校验：若 `relatedParty && !secondApprovedBy` 则拒绝；若超额且 `!proposalId` 则拒绝。前端在成员详情与公开账本对该笔记录公开标注"关联方增发"，`secondApprovedBy` 与 `proposalId` 一并展示，杜绝暗箱自审批。

### 4.6 Token 冲销

冲销是唯一合法的账本纠错手段，且**只允许**以下六种情形（PRD §7.4）：贡献材料造假、同一贡献重复领取、多账户作弊、明确操纵投票、Token 录入错误、社区正式 Proposal 通过撤销。

冲销**绝不修改原 `TokenMintEvent` 行**，而是追加一条 `TokenReversalEvent` 并通过 `originalMintEventId` 引用原记录，原始记录与冲销记录同时永久保留（这正是账本不可篡改性的落地：不删除、追加纠正、双版本展示）：

```text
冲销事务（追加式，伪代码）：
1. 校验 reason ∈ 六种合法情形；否则拒绝
2. 加载并锁定原 TokenMintEvent、该成员 MemberTokenBalance、CommunityTokenState（供应量状态行，FOR UPDATE）
3. 若情形为"社区 Proposal 撤销"或关联方 → 校验 TOKEN_REVERSAL Proposal 已通过（proposalId）
4. 幂等：确认原 mint 未被冲销过（该 originalMintEventId 无既有 reversal）
5. 追加创建 TokenReversalEvent {
     originalMintEventId, amount(= 原 mint amount 或部分),
     totalBalanceAfter, activeGovernanceBalanceAfter,
     pendingGovernanceBalanceAfter, totalSupplyAfter, approvedBy, proposalId? }
6. 扣减三项余额（写 MemberTokenBalance）与总供应量（写 CommunityTokenState.currentTotalSupply）：
     totalBalance            −= amount
     activeGovernanceBalance −= min(amount, 已激活部分)     // 原 mint 已激活的治理权
     pendingGovernanceBalance −= max(0, amount − 已激活部分) // 原为预支且尚未激活的部分
     currentTotalSupply      −= amount                     // CommunityTokenState（§3.2 规则与状态分离）
     tokensReversedLifetime  += amount
7. createPendingRecord(recordType='TOKEN_REVERSAL')，
     canonical payload 必含 originalRecordHash（引用原 mint 的 recordHash，PRD §10.3）
8. 提交事务；提交后 requestSubmission(reversalRecordId)（异步上链）
9. 待冲销 PublicRecord 达到 verified 后，业务层调用
     publicRecordService.markSuperseded(原 mint.publicRecordId, reversalRecord.id)
     → 原 mint 的 PublicRecord 置为 superseded（DB 标记 + supersededByRecordId），
       链上原记录依然存在，前端同时展示原记录与冲销记录
```

扣减金额一律为正整数运算（服务层整数、链交互层 bigint），分项扣减需区分原 mint 的治理激活状态（普通增发全额在 `activeGovernanceBalance`，预支未激活部分在 `pendingGovernanceBalance`）；`markSuperseded` 严格发生在冲销记录 `verified` **之后**，避免出现"原记录已标记撤销但冲销尚未确认"的悬空状态（状态机与时序详见 BLOCKCHAIN-DESIGN.md §5）。

---

## 5. Epoch 生命周期

Epoch 是每个社区管理 Token 增发的时间单元，MVP 默认一个 Epoch = 30 天。月度预算、预支债务偿还、待激活治理 Token 的激活都以 Epoch 边界为原子切换点。TokenEpoch 模型（PRD §24.2）是 Epoch 页面与预算计算的唯一事实源，字段全部由数据库直读，不在读取时重算。

### 5.1 Epoch 状态机

每个 TokenEpoch 在其生命周期中依次经历四个状态，切换只允许沿箭头单向前进：

```text
upcoming ──(到达 startTime，成为当前活动 Epoch)──▶ active
active ──(到达 endTime，切换事务开始，锁定当前 Epoch)──▶ closing
closing ──(切换事务提交成功)──▶ closed
```

- `upcoming`：预算参数已算好但起始时间未到；MVP 因下一 Epoch 紧接当前 `endTime` 起算，切换事务直接以 `active` 建立，`upcoming` 保留给提前预排场景。
- `active`：当前唯一接受增发（正常与预支）的 Epoch，同一社区任一时刻仅有一个。
- `closing`：切换事务持有该行排他写锁，冻结增发写入，防止关账与增发竞争。
- `closed`：终态，账本快照永久固化，`closedAt` 与 `publicRecordId` 就位。

### 5.2 预算生成铁律

本月基础增发额度必须使用月初供应量快照计算，公式（PRD §5.2、§25.1；纯函数实现见 §4.2）：

```text
baseMintBudget = floor(openingSupply × monthlyInflationRateBps / 10000)
```

`openingSupply` 在 Epoch 创建时一次性写入 `TokenEpoch.openingSupply` 并冻结，此后当月任何增发都不会改写它。严禁在月内按实时 `currentTotalSupply` 重算 `baseMintBudget`——那会形成月内复利增发。比例参数一律 bps 整数（`monthlyInflationRateBps = 500` 表示 5%），金额在服务层为整数，链交互层为 `bigint`。

未使用的正常额度在 Epoch 结束时自动作废，不滚存进下一期（PRD §5.4）。切换事务将 `unusedRegularBudget = effectiveRegularBudget − regularMintedAmount` 计入关账快照后即丢弃，下一 Epoch 的预算完全独立重算。作废而非结转的三条防御理由：

1. 防止管理者为"用完预算"而对低价值贡献乱发 Token；
2. 防止多月额度堆积后突然一次性大额增发稀释既有成员；
3. 防止利用历史累积额度在投票前发动增发突袭（配合 Proposal 快照，见第 7 节）。

### 5.3 Epoch 切换事务

切换事务融合 PRD §26.3（十一步）与 §17.2（关闭 Epoch 十条），在单个 `prisma.$transaction` 内原子完成关账、激活与开账。区块链提交严格在数据库事务提交成功后异步执行。

```typescript
async function switchEpoch(communityId: string, currentEpochId: string): Promise<void> {
  const recordIds = await prisma.$transaction(async (tx) => {
    // 1. 锁定当前 Epoch（行级排他锁，冻结并发增发）
    const [current] = await tx.$queryRaw<TokenEpoch[]>`
      SELECT * FROM "TokenEpoch" WHERE id = ${currentEpochId}
      AND status = 'ACTIVE' FOR UPDATE`;
    if (!current) throw new Error('EPOCH_NOT_ACTIVE'); // 0 行即并发竞争，放弃本次

    // 2. 未使用正常额度（作废，不滚存）
    const unusedRegularBudget = current.effectiveRegularBudget - current.regularMintedAmount;
    // 3. 关闭当前 Epoch，写入关账快照
    await tx.tokenEpoch.update({ where: { id: current.id },
      data: { status: 'CLOSING', unusedRegularBudget, closedAt: new Date() } });
    // 4. 读当前总供应量作为下期月初供应量快照（供应量属状态行，规则读 policy、供应量读 state，§3.2）
    const policy = await tx.communityTokenPolicy.findUniqueOrThrow({ where: { communityId } });
    const state = await tx.communityTokenState.findUniqueOrThrow({ where: { communityId } });
    const nextOpeningSupply: number = state.currentTotalSupply;
    // 5-6. 算下期基础预算，扣当期预支债务得实际可用预算（下限 0）；未清偿余额滚存至下期债务
    const nextEpochNumber = current.epochNumber + 1;
    const advanceDebt = current.advancedMintedAmount + Math.max(0, current.advanceDebtFromPreviousEpoch - current.baseMintBudget); // 本期新预支 + 本期未清偿的滚存债务（PRD §25.2 calculateCarriedOverDebt / §26.3 第6步：超额债务滚存至后续 Epoch 继续锁定预算，不得静默免除）
    const baseMintBudget = Math.floor(nextOpeningSupply * policy.monthlyInflationRateBps / 10_000);
    const effectiveRegularBudget = Math.max(0, baseMintBudget - advanceDebt);
    const maxAdvanceAmount = Math.floor(baseMintBudget * policy.maxAdvanceRateBps / 10_000);
    // 7. 激活到期待激活治理 Token（本节职责：激活 + 债务扣除）。用单条 set-based UPDATE 一次性归并全社区：
    //    Prisma updateMany 不支持字段间运算（active = active + pending），故用 tx.$executeRaw 原生 SQL；
    //    绝不逐行 for 循环、也不做 lazy activation。
    await tx.$executeRaw`
      UPDATE "MemberTokenBalance"
      SET "activeGovernanceBalance" = "activeGovernanceBalance" + "pendingGovernanceBalance",
          "pendingGovernanceBalance" = 0
      WHERE "communityId" = ${communityId} AND "pendingGovernanceBalance" > 0`;
    await tx.tokenMintEvent.updateMany({ // Mint 事件治理状态 PENDING → ACTIVE（§3.6 白名单字段）
      where: { communityId, governanceStatus: 'PENDING', governanceActivationEpoch: nextEpochNumber },
      data: { governanceStatus: 'ACTIVE' } });
    // 7b. 单期获得量按期清零：§4.4 单期上限校验读取该字段（PRD §25.4），不清零会跨期累加、错误拦截后续增发
    await tx.memberTokenBalance.updateMany({
      where: { communityId }, data: { tokensEarnedCurrentEpoch: 0 } });
    // 8. 到期的待生效政策版本激活（宪法级参数下一 Epoch 生效，详见第 7 节）：
    //    读取 pendingPolicyVersionId 指向的 TokenPolicyVersion 行（§3.2），把三个 bps 参数与 rules 快照
    //    写回 CommunityTokenPolicy、policyVersion = version、清空 pending 字段，并创建
    //    TOKEN_POLICY_VERSION（上链）与 INFLATION_RATE_CHANGE（DB-only）两条 PublicRecord（§7.5）
    let effectiveInflationRateBps = policy.monthlyInflationRateBps;
    const chainRecordIds: string[] = [];
    if (policy.pendingPolicyVersionId && policy.pendingPolicyEffectiveEpoch === nextEpochNumber) {
      const activated = await activatePendingPolicyVersion(tx, policy);
      effectiveInflationRateBps = activated.version.monthlyInflationRateBps;
      chainRecordIds.push(activated.policyVersionRecordId); // TOKEN_POLICY_VERSION 待上链
    }
    // 9. 创建下一 Epoch
    const nextEpoch = await tx.tokenEpoch.create({ data: {
      communityId, epochNumber: nextEpochNumber, status: 'ACTIVE',
      startTime: current.endTime, endTime: addDays(current.endTime, policy.epochDurationDays),
      openingSupply: nextOpeningSupply, inflationRateBps: effectiveInflationRateBps,
      baseMintBudget, advanceDebtFromPreviousEpoch: advanceDebt, effectiveRegularBudget,
      maxAdvanceAmount, regularMintedAmount: 0, advancedMintedAmount: 0, unusedRegularBudget: 0 } });
    // 10. 创建关账 / 开账 PublicRecord（各类型 chainEligible 见 §3.5 映射表）
    await tx.publicRecord.create({
      data: buildBudgetCreatedRecord(nextEpoch) });                  // RecordType.EPOCH_BUDGET_CREATED，DB-only
    if (advanceDebt > 0) await tx.publicRecord.create({
      data: buildDebtRepaymentRecord(nextEpoch, advanceDebt) });     // RecordType.ADVANCE_DEBT_REPAYMENT，DB-only（PRD §10.2 预支债务偿还）
    const summaryRecord = await tx.publicRecord.create({
      data: buildEpochSummaryRecord(current, unusedRegularBudget) }); // RecordType.EPOCH_SUMMARY → 链上 EpochRecorded
    chainRecordIds.push(summaryRecord.id);
    // 11. 旧 Epoch 置为终态 CLOSED 并回填 Epoch Summary 记录引用（§3.2 / PRD §24.2 publicRecordId）
    await tx.tokenEpoch.update({ where: { id: current.id },
      data: { status: 'CLOSED', publicRecordId: summaryRecord.id } });
    return chainRecordIds;
  });
  // 事务提交成功后仅对 chainEligible 记录异步上链（chain-submit 队列，事务内绝不做网络 IO；job payload 只含 recordId）
  for (const recordId of recordIds) await publicRecordService.requestSubmission(recordId);
}
```

每条 PublicRecord 以 `status = 'pending'`（VerificationStatus 六态之一）落库，携带 canonical 信封原文 `canonicalPayload` 与其 keccak256 `recordHash`；仅当 chain-confirm 完成、状态转为 `verified` 后前端才展示"Injective 已确认"。其中 `EPOCH_BUDGET_CREATED` 与 `ADVANCE_DEBT_REPAYMENT`（`advanceDebt > 0` 时创建，落实 PRD §10.2 "预支债务偿还"进入产品账本）为 `chainEligible = false` 的 DB-only 账本行，不入上链队列，其数值由 `EPOCH_SUMMARY` 的链上事件承载（§3.5 映射表）。`EPOCH_SUMMARY` 上链对应合约 `EpochRecorded` 事件（详见 BLOCKCHAIN-DESIGN.md §2），携带 `openingSupply / baseBudget / regularMinted / advancedMinted / advanceDebt`。

### 5.4 触发机制

Epoch 切换由 cron/scheduled worker 驱动，不依赖用户请求。到期时 worker 调用内部端点：

```text
POST /api/internal/token-epochs/:id/close        # 执行上述原子切换事务（关旧 + 开新）
POST /api/internal/token-epochs/create-next      # 创世/恢复用：幂等补建缺失的下一 Epoch
```

`/close` 承载完整的十一步切换事务；`create-next` 仅用于社区首个 Epoch 引导及切换异常后的幂等补建（以 `communityId + epochNumber` 唯一约束防重复创建）。两个端点均为内部鉴权，仅接受调度器凭证，禁止对外暴露（鉴权见第 8 节）。

### 5.5 Epoch 页面数据来源

Epoch 列表页（PRD §17.1）全部字段由 TokenEpoch 模型直读，无运行时重算：

| 页面字段 | TokenEpoch 来源 |
| ---- | ---- |
| Epoch 编号 | `epochNumber` |
| 开始时间 / 结束时间 | `startTime` / `endTime` |
| 月初供应量 | `openingSupply`（冻结快照） |
| 通胀率 | `inflationRateBps`（bps） |
| 基础预算 | `baseMintBudget` |
| 上期预支债务 | `advanceDebtFromPreviousEpoch` |
| 实际基础可用预算 | `effectiveRegularBudget` |
| 本期预支上限 | `maxAdvanceAmount` |
| 正常增发量 | `regularMintedAmount` |
| 预支增发量 | `advancedMintedAmount` |
| 未使用额度 | `unusedRegularBudget` |
| 状态 | `status`（upcoming/active/closing/closed） |

---

## 6. 预支机制（Mint Budget Advance）

当月基础预算不足、社区又出现额外高价值贡献时，管理者可有限预支下一 Epoch 的 Token 增发额度（前端称"未来增发额度预支"）。预支是 v0.6 的核心新增能力：它在受控条件下放宽当月增发上限，但通过供应量立即入账、治理权延迟激活、下期预算自动扣债三条硬约束，保证不破坏"社区所有权 = 相对贡献"这一根本不变量（PRD §6、§8.5）。

### 6.1 定义与不变量

预支不创造免费预算，其本质是把下一 Epoch 的部分额度提前使用，并在下一 Epoch 的基础预算中自动扣除。核心不变量：

- **供应量立即入账、治理权延迟激活**：预支铸造的 Token 立即增加成员 `totalBalance`、社区 `currentTotalSupply` 与派生 `ownershipPercentage`，进入 `pendingGovernanceBalance`；`activeGovernanceBalance` 不变，须等下一 Epoch 切换时统一激活（PRD §6.5，激活由第 5 节 Epoch 切换事务完成）。
- **下期自动扣债**：下一 Epoch 的实际基础可用额度按下式计算，最低为 0，禁止月内复利（PRD §6.3）：

```text
effectiveRegularBudget
  = baseMintBudget - advanceDebtFromPreviousEpoch   // 结果 < 0 时取 0
```

- **预支上限**：以月初供应量快照算出的 `baseMintBudget` 为基数，按 bps 整数计算，默认 `maxAdvanceRateBps = 2500`（25%），禁止月内复利（PRD §6.2）：

```text
maxAdvanceAmount = baseMintBudget * maxAdvanceRateBps / 10000
```

范围限制四条（PRD §6.4）：只能预支下一个 Epoch；禁止预支下下个 Epoch（禁止跨期）；禁止连续滚动未来债务；存在未偿还预支债务时不得开启新的预支。三、四两条共同杜绝"本月预支下月、下月再预支下下月偿还本月债务"的滚动债务链。

### 6.2 审批分层

预支占比按**本 Epoch 累计口径**判定审批路径：`cumulativeAdvanceRateBps = (epoch.advancedMintedAmount + amount) × 10000 / baseMintBudget`，即"本期已预支累计 + 本次申请"相对 `baseMintBudget` 的比例，而非单笔比例——否则连续 9% 的多笔申请可绕过 10% 治理门槛。另有按接收方与来由强制走 Proposal 的两条规则，原样收录 PRD §6.6：

| 预支情况 | 审批方式 |
| --- | --- |
| 未使用预支，只使用本月正常额度 | 按现有贡献规则审批（不进入本机制） |
| 累计不超过基础额度的 10%（cumulativeAdvanceRateBps ≤ 1000） | 至少两名管理员批准 |
| 累计超过 10%、不超过 25%（1000 < cumulativeAdvanceRateBps ≤ 2500） | 必须通过社区 BUDGET_ADVANCE Proposal |
| 给 Steward 或审批人增发（关联方） | 必须通过社区 Proposal |
| 无对应贡献的特殊奖励 | 必须通过社区 Proposal |
| 累计超过 25%（cumulativeAdvanceRateBps > 2500） | 系统禁止 |

即：本期累计占比越界即拒绝；累计 ≤10% 走双管理员；累计 >10% 或涉及关联方 / 无贡献特殊奖励一律走 Proposal（对应 `ProposalType.BUDGET_ADVANCE`，PRD §9.5）。判定表达式：`(epoch.advancedMintedAmount + amount) > baseMintBudget × 10%` 时触发 Proposal 要求。

### 6.3 TokenAdvanceRequest 状态机

`TokenAdvanceRequest`（PRD §24.5）承载预支申请全生命周期，`status` 六态流转如下，箭头上标注触发端点（PRD §27 Token Advance）：

```text
POST /api/token-advances ──▶ [draft]
   │
   ├─ cumulativeAdvanceRateBps ≤ 1000（本期累计口径，双管理员）─▶ [pending_second_approval]
   │        └─ POST /:id/second-approve ─▶ [approved]
   │
   └─ cumulativeAdvanceRateBps > 1000 或 关联方 / 无贡献特殊奖励 ─▶ [pending_proposal]
            └─ POST /:id/create-proposal（Proposal 通过后回填）─▶ [approved]

[approved] ── POST /:id/execute（触发 §6.4 预支增发事务）─▶ [executed]

rejected 分支：[pending_second_approval] / [pending_proposal]
             ──（第二审核人否决 / Proposal 未通过）─▶ [rejected]
```

`draft → pending_second_approval | pending_proposal` 的分叉由 `advanceRateBps` 与接收方性质在创建时判定；`approved` 是两条审批路径的汇合点；`/execute` 仅接受 `approved` 状态，执行成功后置 `executed` 并写 `executedAt`。任一审批环节否决进入 `rejected`，终态不可再流转。

### 6.4 预支增发事务

`/execute` 端点在单个 `prisma.$transaction` 内原子完成 PRD §26.2 十四步。全程金额为整数，比例为 bps 整数，行锁 `SELECT ... FOR UPDATE` 保证 Epoch 与余额并发安全；链上提交在事务提交成功后异步进行。

```typescript
async function executeAdvanceMint(input: ExecuteAdvanceInput): Promise<TokenMintEvent> {
  const { mint, chainRecordIds } = await prisma.$transaction(async (tx) => {
    const req = await tx.tokenAdvanceRequest.findUniqueOrThrow({ where: { id: input.requestId } });
    if (req.status !== 'APPROVED') throw new DomainError('ADVANCE_NOT_APPROVED');
    const amount: number = req.approvedAmount ?? req.requestedAmount; // 整数

    // 1. 锁定 TokenEpoch 并验证正常额度不足：正常剩余 = effectiveRegularBudget - regularMintedAmount
    const [epoch] = await tx.$queryRaw<TokenEpoch[]>`
      SELECT * FROM "TokenEpoch" WHERE id = ${req.epochId} AND status = 'ACTIVE' FOR UPDATE`;
    if (!epoch) throw new DomainError('EPOCH_NOT_ACTIVE');
    const regularRemaining = epoch.effectiveRegularBudget - epoch.regularMintedAmount;
    if (regularRemaining >= amount) throw new DomainError('REGULAR_BUDGET_SUFFICIENT');

    // 2. 验证预支上限：advancedMintedAmount + amount ≤ maxAdvanceAmount
    if (epoch.advancedMintedAmount + amount > epoch.maxAdvanceAmount)
      throw new DomainError('ADVANCE_CAP_EXCEEDED');

    // 3. 验证不存在未偿还的滚动预支（禁止连续预支）
    if (epoch.advanceDebtFromPreviousEpoch > 0) throw new DomainError('ROLLING_ADVANCE_FORBIDDEN');

    // 4. 验证审批权限（按比例分层，见 §6.2）
    const policy = await tx.communityTokenPolicy.findUniqueOrThrow({
      where: { communityId: req.communityId } });
    const state = await tx.communityTokenState.findUniqueOrThrow({ // 供应量属状态，非规则（§3.2）
      where: { communityId: req.communityId } });
    // 阈值按本 Epoch 累计判定（防连续 9% 绕过治理）：已预支累计 + 本次申请 相对 baseMintBudget 的占比
    const cumulativeAdvanceRateBps = Math.floor(
      ((epoch.advancedMintedAmount + amount) * 10_000) / epoch.baseMintBudget);
    if (cumulativeAdvanceRateBps > policy.maxAdvanceRateBps) throw new DomainError('ADVANCE_RATE_EXCEEDED'); // 累计 > 25% 系统禁止

    // 5. 验证 Proposal 或第二审核人（10% 阈值按本 Epoch 累计口径：advancedMintedAmount + amount > baseMintBudget × 10%）
    if (cumulativeAdvanceRateBps > 1000 || req.relatedParty) {
      if (!req.proposalId) throw new DomainError('PROPOSAL_REQUIRED');
    } else if (!req.secondApprovedBy) throw new DomainError('SECOND_APPROVER_REQUIRED');

    // 6. 锁定接收人余额行（Epoch 行已于步骤 1 FOR UPDATE 锁定）
    const nextEpochNumber = epoch.epochNumber + 1;
    const [balance] = await tx.$queryRaw<MemberTokenBalance[]>`
      SELECT * FROM "MemberTokenBalance"
      WHERE "communityId" = ${req.communityId} AND "memberId" = ${input.memberId} FOR UPDATE`;

    // 7. 创建 TokenMintEvent（budgetSource=NEXT_EPOCH_ADVANCE、governanceStatus=PENDING、activationEpoch=下一期号）
    const supplyBefore = state.currentTotalSupply;
    const mint = await tx.tokenMintEvent.create({ data: {
      communityId: req.communityId, memberId: input.memberId, epochId: epoch.id,
      mintType: 'SPECIAL_REWARD', budgetSource: 'NEXT_EPOCH_ADVANCE', amount,
      governanceStatus: 'PENDING', governanceActivationEpoch: nextEpochNumber,
      memberBalanceBefore: balance.totalBalance, memberBalanceAfter: balance.totalBalance + amount,
      activeGovernanceBefore: balance.activeGovernanceBalance,
      activeGovernanceAfter: balance.activeGovernanceBalance, // 治理权不动，待下一 Epoch 激活
      totalSupplyBefore: supplyBefore, totalSupplyAfter: supplyBefore + amount,
      ownershipPercentageBefore: calculateOwnershipPercentage(balance.totalBalance, supplyBefore), // 快照事实，即算即冻结
      ownershipPercentageAfter: calculateOwnershipPercentage(
        balance.totalBalance + amount, supplyBefore + amount), // §4.2 纯函数
      tokenPolicyVersion: policy.policyVersion, reason: req.reason, evidenceUrls: input.evidenceUrls,
      approvedBy: req.requestedBy, secondApprovedBy: req.secondApprovedBy, relatedParty: req.relatedParty,
    }});

    // 8/9. 增加成员总余额与 pendingGovernanceBalance（activeGovernanceBalance 保持不变）；
    //      预支立即计入相对所有权（PRD §6.5），占比为派生值、查询时计算，不写回余额行（与 §4.4 正常增发一致）
    await tx.memberTokenBalance.update({ where: { id: balance.id }, data: {
      totalBalance: { increment: amount },
      pendingGovernanceBalance: { increment: amount },
    }});

    // 10. 更新总供应量（立即增加；写入独立状态行，§3.2 规则与状态分离）
    await tx.communityTokenState.update({ where: { communityId: req.communityId }, data: { currentTotalSupply: { increment: amount } } });

    // 11. 更新 advancedMintedAmount
    await tx.tokenEpoch.update({ where: { id: epoch.id }, data: { advancedMintedAmount: { increment: amount } } });

    // 12. 写 TokenAdvanceRequest 执行记录
    await tx.tokenAdvanceRequest.update({ where: { id: req.id }, data: {
      status: 'EXECUTED', approvedAmount: amount, executedAt: new Date(),
    }});

    // 13. 创建 ADVANCE_MINT（上链）与 BUDGET_ADVANCE（DB-only 账本行，chainEligible=false，§3.5 映射表）两条 PublicRecord
    const advanceMintRecord = await publicRecordService.createPendingRecord(tx, {
      recordType: 'ADVANCE_MINT', sourceTable: 'TokenMintEvent', sourceId: mint.id, /* envelope、recordHash */ });
    await publicRecordService.createPendingRecord(tx, {
      recordType: 'BUDGET_ADVANCE', sourceTable: 'TokenAdvanceRequest', sourceId: req.id,
      /* envelope、recordHash */ chainEligible: false });

    return { mint, chainRecordIds: [advanceMintRecord.id] }; // 14. 事务提交
  });

  // 事务提交成功后仅对 chainEligible 记录异步上链（job payload 只含 recordId，见 §10.5）。
  // BUDGET_ADVANCE 不入队、没有对应合约函数：预支事实由 ADVANCE_MINT（budgetSource=1、activationEpoch）
  // 与关账 EPOCH_SUMMARY 的 advancedMinted 字段链上承载（§3.5 映射表）
  for (const recordId of chainRecordIds) await publicRecordService.requestSubmission(recordId);
  return mint;
}
```

上链侧复用 `recordMint` / `TokensMinted`（PRD §28.3）：`budgetSource = 1`（`next_epoch_advance`）、`activationEpoch = nextEpochNumber`，据此在链上即可区分预支增发，`recordHash` 为 canonical 信封的 keccak256（详见 BLOCKCHAIN-DESIGN.md §2）。

### 6.5 攻击防御

预支增发攻击的典型路径是：管理者预支下月额度→给支持者发 Token→操纵当前决策→让未来成员承担通胀成本（PRD §8.5）。本节机制逐条防御：

| 防御条款（PRD §8.5） | 本节对应机制 |
| --- | --- |
| 预支超过 10% 必须投票 | §6.2 分层：本期累计 `cumulativeAdvanceRateBps > 1000` 强制走 BUDGET_ADVANCE Proposal，单个管理员无法放大额度，连续小额也无法绕过 |
| 预支 Token 下一 Epoch 才激活治理权 | §6.4 事务只增 `pendingGovernanceBalance`、`governanceStatus = pending`；激活由第 5 节 Epoch 切换事务（PRD §26.3 第 7 步）在下一 Epoch 统一完成——本节负责延迟入账，Epoch 切换负责到期激活，分工明确 |
| 已开始 Proposal 使用固定快照 | 权重只读 Proposal 激活时快照的有效治理 Token，预支产生的 pending 部分不计入当前 Proposal（快照机制见第 7 节 / PRD §9.1） |
| 预支记录公开展示 | §6.4 步骤 13 生成 ADVANCE_MINT（上链，`verified` 后展示"Injective 已确认"）与 BUDGET_ADVANCE（DB-only 账本行公开展示，数值由链上 ADVANCE_MINT 与 EPOCH_SUMMARY 承载，§3.5 映射表）两条 PublicRecord |
| 下期预算自动扣除 | §6.1 `effectiveRegularBudget = baseMintBudget - advanceDebtFromPreviousEpoch`（最低 0），由 Epoch 切换事务落实 |

---

## 7. Proposal 治理与快照

Proposal 是 YouFen 治理层的唯一入口。所有会改变社区宪法级参数、或超出规则内额度的操作（政策修改、大额预支、特殊/关联方增发、Token 冲销）都必须经 Proposal 投票，不存在管理员绕过通道。本节定义 Proposal 类型、Draft→Active 快照机制、基于快照的投票、Quorum、Token Policy 修改路径与结果结算。

### 7.1 Proposal 类型与治理回调

`ProposalType` 采用 PRD §9.5 定义，六值，不含任何“一人一票”模式——投票权重统一为 Proposal 激活快照时的有效治理 Token（`activeGovernanceBalance`）。

```typescript
enum ProposalType {
  COMMUNITY_DECISION = 'community_decision',
  TOKEN_POLICY_CHANGE = 'token_policy_change',
  BUDGET_ADVANCE = 'budget_advance',
  SPECIAL_MINT = 'special_mint',
  RELATED_PARTY_MINT = 'related_party_mint',
  TOKEN_REVERSAL = 'token_reversal',
}
```

各类型的用途、PRD §20.1 特殊附加字段，以及通过后回调的引擎如下：

| ProposalType | 用途 | 特殊附加字段（§20.1） | 通过后回调 |
| --- | --- | --- | --- |
| `COMMUNITY_DECISION` | 普通社区决策 | 无 | 仅结算，无铸造副作用 |
| `TOKEN_POLICY_CHANGE` | 修改通胀率等宪法级参数 | Token Policy 修改内容 | 写 pending 版本，下一 Epoch 生效（§7.5） |
| `BUDGET_ADVANCE` | 预支下期预算（>10% 强制） | 预支金额 | 预支执行事务（PRD §26.2） |
| `SPECIAL_MINT` | 超单期上限的特殊奖励 | 特殊增发接收人、Token 数量 | 受控增发事务（PRD §26.1） |
| `RELATED_PARTY_MINT` | 关联方增发（§8.3 命中） | 接收人、数量、关联方关系说明 | 受控增发事务（PRD §26.1，标记关联方） |
| `TOKEN_REVERSAL` | 冲销已铸造 Token | 冲销目标（`originalMintEventId`） | 冲销事务（PRD §7.4） |

治理类 Proposal 结算为“通过”后，结算服务按 `type` 分发到对应引擎；引擎自身仍在各自的原子事务内执行完整校验（预算、单期上限、双审批、账本追加、供应量更新、生成 PublicRecord），Proposal 只提供“已获授权”这一前置，绝不代替引擎直接改余额。AI 仅在创建阶段给出建议，任何铸造与激活均由确定性引擎执行，不由 AI 触发。`BUDGET_ADVANCE` 的执行与预支治理激活呼应第 6 节：预支 Token 立即计入总供应量，治理权下一 Epoch 才激活（`pendingGovernanceBalance`）。

### 7.2 Draft→Active 快照机制

Proposal 从 `draft` 变为 `active` 时，必须在同一数据库事务内冻结投票基准。按 PRD §9.1 保存八项：Snapshot Time、Snapshot Block、Token 总供应量、每位成员有效治理 Token、Token Policy Version、当前 Epoch、当前预支债务、当前通胀率。快照结构采用 PRD §20.2 原文：

```typescript
interface ProposalSnapshot {
  proposalId: string;
  snapshotTime: Date;
  snapshotBlock?: number;

  epochId: string;
  tokenPolicyVersion: number;

  totalSupplySnapshot: number;
  activeGovernanceSupplySnapshot: number;

  memberBalances: Array<{
    memberId: string;
    activeGovernanceToken: number;
  }>;
}
```

`memberBalances` 逐成员落入不可变子表 `ProposalMemberSnapshot`（模型定义见 §3.4；新建行，绝不回写 `MemberTokenBalance`）；聚合快照字段写入 `Proposal`（对齐 PRD §24.7 的 `epochIdSnapshot / totalSupplySnapshot / activeGovernanceSupplySnapshot / tokenPolicyVersionSnapshot`）。金额一律整数。激活事务用条件 `UPDATE` 与行锁保证幂等与原子性：

```typescript
await prisma.$transaction(async (tx) => {
  // 条件转换：仅 DRAFT 可激活；返回 0 行说明并发，放弃
  const moved = await tx.$executeRaw`
    UPDATE "Proposal" SET status = 'ACTIVE'
    WHERE id = ${proposalId} AND status = 'DRAFT'`;
  if (moved === 0) throw new ConflictError('PROPOSAL_NOT_DRAFT');

  const policy = await tx.communityTokenPolicy.findUniqueOrThrow({ where: { communityId } });
  const state = await tx.communityTokenState.findUniqueOrThrow({ where: { communityId } }); // 供应量属状态行（§3.2）
  const epoch = await tx.tokenEpoch.findFirstOrThrow({ where: { communityId, status: 'ACTIVE' } });
  const balances = await tx.memberTokenBalance.findMany({ where: { communityId } });

  const activeGovernanceSupplySnapshot = balances.reduce(
    (sum, b) => sum + b.activeGovernanceBalance, 0); // 整数累加

  await tx.proposal.update({
    where: { id: proposalId },
    data: {
      snapshotTime: now, snapshotBlock: null, // Snapshot Block 由上链后回填
      epochIdSnapshot: epoch.id,
      totalSupplySnapshot: state.currentTotalSupply,
      activeGovernanceSupplySnapshot,
      tokenPolicyVersionSnapshot: policy.policyVersion,
    },
  });

  await tx.proposalMemberSnapshot.createMany({
    data: balances.map((b) => ({
      proposalId, memberId: b.memberId,
      activeGovernanceToken: b.activeGovernanceBalance, // 快照权重来源
    })),
  });

  // 追加账本：PROPOSAL_SNAPSHOT（含 canonicalPayload + recordHash，链下事务内计算）
  await tx.publicRecord.create({ data: buildSnapshotRecord(proposalId /* … */) });
});
// DB 事务成功后再异步入队上链（chain-submit），呼应记录状态六态设计
```

创建阶段（`draft` 落库）追加 `PROPOSAL_CREATED` PublicRecord；激活阶段追加 `PROPOSAL_SNAPSHOT` PublicRecord。两者均为不可删除账本记录；其中 `PROPOSAL_SNAPSHOT` 经合约 `recordProposalSnapshot` 事件上链（详见 BLOCKCHAIN-DESIGN.md §2）。

**双 Merkle Root 与成员自证包含（个体可验证性）。** 快照与结算各自额外上链一个 Merkle Root，把“聚合数字正确”升级为“每个成员可独立验证自己被正确纳入”。快照记录携带 `weightsMerkleRoot`：对 `ProposalMemberSnapshot` 的每成员叶子集求根，叶子 = `keccak256(abi.encodePacked(memberIdHash, weight))`；结算记录携带 `votesMerkleRoot`：对每票叶子集求根，叶子 = `keccak256(abi.encodePacked(memberIdHash, optionIdHash, weight))`。两棵树的内部节点采用 sorted-pair `keccak256(min‖max)`（成员出示证明时无需方向位），空树根 = `bytes32(0)`、单叶树根 = 叶子本身；根、叶子编码与证明构造/校验统一由 `lib/blockchain/hashing/merkle.ts`（`buildMerkleRoot / buildMerkleProof / verifyMerkleProof`）实现，叶子按 `abi.encodePacked` 编码以便在 Solidity 侧 `keccak256(abi.encodePacked(...))` 原样复算。任何成员据链上根 + 平台给出的 sibling 证明即可自证其快照权重（或其票）确被计入，无需信任平台索引；这两个 root 是非索引数据字段、紧邻 recordHash 之前，`recordHash` 仍恒在 `topics[3]`，且作为 canonical payload 的一部分参与 `recordHash` 计算。

### 7.3 投票与快照防御

投票权重恒等于“Proposal 激活快照时的有效治理 Token”（PRD §4.4），投票时只读 `ProposalMemberSnapshot`，绝不读实时 `MemberTokenBalance`。每张 `Vote` 按 PRD §24.8 落四个快照字段：

```typescript
interface Vote {
  id: string;
  proposalId: string;
  memberId: string;
  optionId: string;

  totalTokenBalanceSnapshot: number;
  activeGovernanceBalanceSnapshot: number;
  totalSupplySnapshot: number;
  governancePercentageSnapshot: number;

  createdAt: Date;
}
```

投票期间新增的 Token 按 PRD §9.2 三条规则处理：（1）不影响当前 Proposal；（2）正常预算 Token 可用于之后创建的 Proposal；（3）预支 Token 需等下一 Epoch 激活。历史 Proposal 结果永不重算。

这直接封堵 PRD §8.4 的“投票前增发攻击”：管理者即便在投票窗口内给支持者增发，快照后铸造的 Token 权重为 0，攻击无效。防御的技术根因是“Proposal 创建即锁定 Token 快照”——权重来源是激活时刻冻结的 `ProposalMemberSnapshot`，与投票时刻的余额解耦。

### 7.4 Quorum：最低参与人数

MVP 采用最低参与人数（`Proposal.minimumVoterCount`，默认 3）作为 Quorum，而非总供应量百分比（PRD §9.4）。社区可设置更高的最低参与人数。理由：大量早期 Token 可能由已离开的成员持有，若以总供应量百分比作唯一 Quorum，沉睡余额会使治理永久无法达标而停摆。结算时以“实际参与人数 ≥ `minimumVoterCount`”判定 Proposal 是否有效。

### 7.5 Token Policy 修改路径

通胀率等属于社区宪法级参数，管理员没有任何直接改参数的路径——`CommunityTokenPolicy` 的 `monthlyInflationRateBps / maxAdvanceRateBps / memberMintCapRateBps`（均为 bps 整数）只能经 `TOKEN_POLICY_CHANGE` Proposal 修改，且下一 Epoch 才生效（PRD §5.3）：

```text
创建 TOKEN_POLICY_CHANGE Proposal
  ↓ 社区成员按快照权重投票
Proposal 通过
  ↓ 结算回调：在只追加的 TokenPolicyVersion 表创建 pending 版本行（三个 bps 参数 + rules 快照），
    写 pendingPolicyVersionId / pendingPolicyEffectiveEpoch 指向它
等待当前 Epoch 结束
  ↓ 由 Epoch 切换事务读取该行并激活（PRD §26.3 第 9 步，详见第 5 节）
下一 Epoch 生效，policyVersion = 版本行 version
  ↓
TOKEN_POLICY_VERSION PublicRecord 上链（INFLATION_RATE_CHANGE 为 DB-only 账本行）
```

Proposal 通过后仅在只追加的 `TokenPolicyVersion` 表创建 pending 版本行（`version`、`effectiveEpoch`、三个 bps 参数、`rules` 快照，见 §3.2）并写入 `pendingPolicyVersionId` 与 `pendingPolicyEffectiveEpoch` 指向它，当前 Epoch 参数不变；真正切版发生在第 5 节的 Epoch 切换事务中，届时读取该版本行、把参数与 `rules` 快照写回 `CommunityTokenPolicy`（`policyVersion = version`、清空 pending 字段），并追加 `TOKEN_POLICY_VERSION`（新版本记录）与 `INFLATION_RATE_CHANGE`（通胀率变更记录，`chainEligible = false` 的 DB-only 账本行，新通胀率由 `PolicyVersionRecorded` 事件字段承载，见 §3.5 映射表）两类 PublicRecord。`TOKEN_POLICY_VERSION` 经合约 `recordPolicyVersion` 事件上链（`policyVersion`、`inflationRateBps`、`effectiveEpoch` 等字段，详见 BLOCKCHAIN-DESIGN.md §2），确认后回填版本行 `publicRecordId`。历史版本全量保留于 `TokenPolicyVersion` 表，公开端点 `GET /api/communities/:id/token-policy/versions` 直读。此路径确保参数变更公开、延迟生效、可溯源，杜绝即时覆盖。

### 7.6 结果结算

Proposal 到期后进入 `ended`，结算服务按快照聚合、绝不触碰实时余额：读取全部 `Vote`，按 `optionId` 汇总 `activeGovernanceBalanceSnapshot` 得到各选项 Token 权重与成员人数，并校验参与人数达到 Quorum。结算产出胜出选项、总参与 Token、快照总供应量、Token 参与率，并追加 `PROPOSAL_RESULT` PublicRecord，`Proposal.status` 置为 `recorded`、回填 `resultPublicRecordId`。

`PROPOSAL_RESULT` 经合约 `recordProposalResult` 事件上链，携带 `winningOptionIdHash`（`keccak256("youfen:option:v1:…")`）、`voterCount`、`totalVoteWeight`、`votesMerkleRoot`（每票叶子集之根，见 §7.2）与 `recordHash`；提交遵循“DB 事务成功后异步入队”原则，仅当记录到达 `verified` 状态，结果页才展示“Injective 已确认”。上链、确认与验证细节详见 BLOCKCHAIN-DESIGN.md §2 与 §7。治理类 Proposal 若为“通过”，结算完成后即触发 §7.1 的引擎回调；已确认结果无法被静默覆盖，任何纠正都以引用原记录的新版本公开追加。

---

## 8. API 设计

### 8.1 架构决策：Next.js Route Handlers，不采用 tRPC

对外接口层放弃 tRPC，改用 Next.js Route Handlers（`app/api/**/route.ts`）实现 PRD §27 逐字定义的 REST 路径。三条理由：

1. **PRD §27 路径是对外可验证契约。** 评委与任意第三方会直接用 `curl` 调用 `/api/public-records/:id/verify`、`/api/communities/:id/token-ledger` 等端点核对链上事实，这些 URL 本身就是交付物的一部分；tRPC 的 RPC 风格调用无法作为公开可复算的契约暴露。
2. **BLOCKCHAIN-DESIGN §7 的 Public Records API 已按 REST 设计并正在实现。** 该层的 submit / retry / 详情 / verify 四端点与统一响应信封已落地，全站沿用同一风格可避免两套接口范式并存。
3. **公开只读端点无需端到端类型。** 账本、余额、快照等读接口面向匿名公众，端到端类型无收益；内部前后端之间通过共享的 `@youfen/types` 包（导出 PRD §24 的接口与枚举）保证类型安全，无需 tRPC 的运行时管道。

### 8.2 统一响应信封

所有端点返回统一信封，与 BLOCKCHAIN-DESIGN §7 一致：

```typescript
type ApiResponse<T> =
  | { success: true; data: T; meta?: PageMeta }
  | { success: false; error: { code: string; message: string; details?: unknown } };

interface PageMeta { total: number; page: number; limit: number }
```

约定：`success` 恒为布尔判据；分页端点（如 token-ledger、token-history）在 `meta` 内返回 `total / page / limit`；错误体只暴露稳定的 `code`（如 `INSUFFICIENT_BUDGET`、`INVALID_STATUS`、`FORBIDDEN`）与用户友好 `message`，绝不泄露内部堆栈。金额与供应量在响应中一律为整数，比例参数一律为 bps 整数（如 `monthlyInflationRateBps: 500` 表示 5%）。

### 8.3 端点总表（PRD §27 八组）

权限分级：**公开**（无需登录）／**成员**（社区 MemberTokenBalance 存在）／**管理员**（OWNER 或 MANAGER）／**双管理员**（第二审核人须 ≠ 发起人）／**内部**（`/api/internal/*`，服务令牌鉴权）。

| 分组 | 方法 | 路径 | 权限 | 幂等性 |
| --- | --- | --- | --- | --- |
| Token Policy | GET | `/api/communities/:id/token-policy` | 公开 | 只读幂等 |
| | POST | `/api/communities/:id/token-policy/proposals` | 管理员 | 非幂等（创建 pending 版本，须 TOKEN_POLICY_CHANGE Proposal） |
| | GET | `/api/communities/:id/token-policy/versions` | 公开 | 只读幂等（TokenPolicyVersion 版本表直读，§3.2） |
| Epoch | GET | `/api/communities/:id/token-epochs` | 公开 | 只读幂等 |
| | GET | `/api/token-epochs/:id` | 公开 | 只读幂等 |
| | POST | `/api/internal/token-epochs/:id/close` | 内部 | 幂等（已 closed 直接 no-op） |
| | POST | `/api/internal/token-epochs/create-next` | 内部 | 幂等（同社区已存在 upcoming Epoch 则复用） |
| Token Balance | GET | `/api/members/:id/token-balance` | 成员 | 只读幂等 |
| | GET | `/api/members/:id/token-history` | 成员 | 只读幂等（分页） |
| Contribution Mint | POST | `/api/contributions` | 成员 | Idempotency-Key 去重 |
| | POST | `/api/contributions/:id/analyze` | 管理员 | 只读（AI 仅建议，无副作用） |
| | POST | `/api/contributions/:id/approve` | 管理员 | 状态转移幂等（重复 approve 为 no-op） |
| | POST | `/api/contributions/:id/mint` | 管理员 | 幂等（已生成 Token 返回既有 TokenMintEvent） |
| | POST | `/api/contributions/:id/reject` | 管理员 | 状态转移幂等 |
| Token Advance | POST | `/api/token-advances` | 管理员 | Idempotency-Key 去重（创建 draft） |
| | GET | `/api/token-advances/:id` | 管理员 | 只读幂等 |
| | POST | `/api/token-advances/:id/second-approve` | 双管理员 | 状态转移幂等 |
| | POST | `/api/token-advances/:id/create-proposal` | 管理员 | 幂等（已挂 proposalId 则复用） |
| | POST | `/api/token-advances/:id/execute` | 管理员／双管理员 | 幂等（executed 后 no-op） |
| Token Ledger | GET | `/api/communities/:id/token-ledger` | 公开 | 只读幂等（分页 + 过滤器） |
| | POST | `/api/token/reverse` | 管理员 | 追加式（引用 originalMintEventId；属社区撤销或关联方情形须 TOKEN_REVERSAL Proposal，其余情形管理员直接冲销，见 §4.6） |
| Proposal | POST | `/api/proposals` | 成员 | Idempotency-Key 去重 |
| | POST | `/api/proposals/:id/start` | 管理员 | 幂等（生成快照，已 active 则 no-op） |
| | GET | `/api/proposals/:id/snapshot` | 公开 | 只读幂等 |
| | POST | `/api/proposals/:id/vote` | 成员 | 幂等（每成员每 Proposal 唯一投票） |
| | POST | `/api/proposals/:id/end` | 管理员／内部 | 幂等 |
| Public Records | POST | `/api/public-records/:id/submit` | 管理员／内部 | 幂等（jobId 去重） |
| | POST | `/api/public-records/:id/retry` | 管理员 | 幂等（仅 failed 可触发） |
| | GET | `/api/public-records/:id` | 公开 | 只读幂等 |
| | GET | `/api/public-records/:id/verify` | 公开 | 只读（实时链上校验，限流） |

> 幂等约定：仅三个**创建类**写端点（`POST /api/contributions`、`POST /api/proposals`、`POST /api/token-advances`）要求携带 `Idempotency-Key` 请求头，服务端按 (端点, key) 去重、重放返回首次结果——这些端点没有天然去重键，需通用键防止重复提交。**资金路径不加通用键**：它们依赖既有的域级幂等——`mint` 由 `TokenMintEvent` 复合 `@@unique([contributionId, budgetSource])`（同一贡献同一来源第二次直接失败）、`advance execute` 由状态机 `executed` 后 no-op、`PublicRecord` 由 `recordHash` 含主键去重、链上由合约 `require(!exists)` 兜底，均无需 `Idempotency-Key`。

### 8.4 关键端点详述

#### approve 与 mint 的语义拆分

审核与铸造是两个独立动作。`approve` 只做资格判定，不触碰任何余额、供应量或账本；`mint` 才在事务内执行 PRD §26.1 的 13 步原子增发。二者拆分是防止“单人一步审核即发放任意数量”的核心保证。贡献在四个端点间的生命周期：

```text
POST /contributions        → status: pending
POST /contributions/:id/analyze  → AI 建议（suggestedTokenAmount，只读，不改状态）
POST /contributions/:id/approve  → status: approved（写 approvedTokenAmount，无账本副作用）
POST /contributions/:id/mint     → §26.1 事务：TokenMintEvent + 余额/供应量 + PublicRecord(pending)
        └─ 正常额度不足 → 409 → POST /token-advances（预支路径）
POST /contributions/:id/reject   → status: rejected（终态）
```


`POST /api/contributions/:id/approve` — 请求仅校验贡献可审核，写入审核结论：

```json
// 请求
{ "approvedTokenAmount": 120, "ruleId": "rule_7", "note": "命中每期上限内" }
// 响应 200
{ "success": true, "data": { "contributionId": "c_9", "status": "approved",
  "approvedTokenAmount": 120, "approvedBy": "u_owner", "mintReady": true } }
```

`POST /api/contributions/:id/mint` — 在 `prisma.$transaction` 内按 §26.1 顺序执行：验证已 approved 且尚未生成 Token → 验证 Token Rule → 验证成员本期上限 → 行锁定 `TokenEpoch` → 验证正常剩余额度 → 创建 `TokenMintEvent`（写入前后 `memberBalance`／`activeGovernance`／`totalSupply`／`ownershipPercentage` 快照）→ 更新 `MemberTokenBalance` 与 `TokenEpoch.regularMintedAmount` → 创建 `status='pending'` 的 `PublicRecord`。事务提交成功后才异步 `enqueueRecordSubmission`（BLOCKCHAIN-DESIGN §6）。

```json
// 成功 201
{ "success": true, "data": {
  "mintEventId": "me_31", "amount": 120, "budgetSource": "current_epoch",
  "governanceStatus": "active",
  "memberBalanceAfter": 1620, "totalSupplyAfter": 204120,
  "publicRecordId": "pr_88" } }
```

当 `TokenEpoch.effectiveRegularBudget` 减去 `regularMintedAmount` 的剩余额度不足以覆盖本次金额时，`mint` 返回 **409** 并给出预支路径，绝不越权增发：

```json
// 409 INSUFFICIENT_BUDGET
{ "success": false, "error": {
  "code": "INSUFFICIENT_BUDGET",
  "message": "本期正常预算剩余不足，无法完成增发",
  "details": { "remainingRegularBudget": 40, "requested": 120,
    "advancePath": "POST /api/token-advances",
    "hint": "本期累计预支不超过基础预算 10% 需双管理员审批；累计超过 10% 须经 BUDGET_ADVANCE Proposal" } } }
```

#### 预支执行的审批分层

预支请求的审批状态机决定 `execute` 是否放行：

```text
draft ─┬─ ≤10% ──→ pending_second_approval ─(second-approve)─→ approved ─(execute)─→ executed
       └─ >10%/关联方 → pending_proposal ─(BUDGET_ADVANCE Proposal 通过)─→ approved ─(execute)─→ executed
                                                                      └─ 否决 → rejected
```

`POST /api/token-advances/:id/execute` 按审批层级校验后，在事务内执行 PRD §26.2 的 14 步：本期累计预支（`advancedMintedAmount + amount`）未超过本期预算 10% 时，须已有第二审核人（`secondApprovedBy ≠ requestedBy`，即请求 `status='approved'` 且经 second-approve 路径）；累计超过 10%（`cumulativeAdvanceRateBps > 1000`）或属关联方场景时，须已挂接通过的 `BUDGET_ADVANCE` / `RELATED_PARTY_MINT` Proposal（`proposalId` 已存在且 Proposal `status='recorded'`）。执行时创建 `TokenMintEvent`（`budgetSource='next_epoch_advance'`、`governanceStatus='pending'`、`governanceActivationEpoch` 指向下一 Epoch），增加成员 `pendingGovernanceBalance` 而非 `activeGovernanceBalance`——预支 Token 立即计入总余额与总供应量，治理权下一 Epoch 才激活。校验不达标返回 **403 `APPROVAL_REQUIRED`** 并说明所需审批方式；状态非 `approved` 返回 **409 `INVALID_STATUS`**。

#### token-ledger 过滤器

`GET /api/communities/:id/token-ledger` 为公开只读账本，`?filter=` 取值严格对照 PRD §18.2：

```text
all → 全部
regular_mint → 正常增发（mintType=contribution, budgetSource=current_epoch）
advance_mint → 预支增发（budgetSource=next_epoch_advance）
initial_allocation → 初始分配（mintType=initial_allocation）
special_reward → 特殊奖励（mintType=special_reward）
related_party → 关联方增发（relatedParty=true）
reversal → Token 冲销（TokenReversalEvent）
pending_governance → 治理权待激活（governanceStatus=pending）
injective_verified → 已通过 Injective 验证（PublicRecord.status=verified）
verification_failed → 验证失败（PublicRecord.status=failed）
```

每行携带 §18.1 的字段（成员余额前后、总供应量前后、相对所有权前后、预算来源、治理状态、激活 Epoch、审批人、Tx Hash 等）。仅当关联 `PublicRecord.status='verified'` 时，`injectiveStatus` 才展示“Injective 已确认”，其余状态展示 Pending / Failed。

### 8.5 Public Records 四端点

链上契约层的 submit / retry / 详情 / verify 保持既有实现，此处仅列语义摘要：`submit`（管理员或内部，`pending` 记录入队上链）、`retry`（管理员，`failed` 记录重入队并 `attemptEpoch + 1`）、`GET /api/public-records/:id`（公开，返回 `recordHash`、`canonicalPayload` 原文与链信息）、`verify`（公开限流，实时用 DB 源实体重算哈希并做链上存在性核对）。**契约与实现详见 BLOCKCHAIN-DESIGN.md §7**，本节不复制其响应体。

### 8.6 认证与授权

- **会话**：使用 NextAuth 管理登录会话，业务端点在 Route Handler 内通过服务端会话取当前用户；匿名可访问的公开端点跳过会话校验。
- **`requireRole` 中间件**：管理员与双管理员端点在处理前调用 `requireRole(communityId, ['OWNER', 'MANAGER'])`，校验当前用户在目标社区的角色；双管理员端点额外断言第二操作人身份不等于发起人，失败返回 **403 `FORBIDDEN`**。
- **内部端点**：`/api/internal/*`（Epoch 关闭、创建下一 Epoch、由 CRON 触发）不使用用户会话，改用服务令牌鉴权——请求头须携带 `CRON_SECRET`，缺失或不匹配返回 **401**。
- **输入校验**：所有写端点在边界用 Zod schema 解析请求体，金额字段约束为非负整数（`z.number().int().nonnegative()`），比例字段为 bps 整数，校验失败统一返回 **400 `VALIDATION_ERROR`** 并在 `details` 中携带字段级错误，绝不将未校验数据传入服务层。

---

## 9. AI 集成

### 9.1 三项能力与硬边界

AI 服务层向社区提供三项、且仅三项能力：

1. **generateTokenRules**：为新社区生成一套初始 Token 规则草案（贡献类型与对应 Token 数量）。
2. **analyzeContribution**：为一次待审核贡献匹配规则、给出建议 Token 数量与风险说明。
3. **通胀健康报告**：在每个 Epoch 结束时生成一份供应量增长与集中度分析。

三项能力共享一条不可逾越的边界：**AI 的输出永远只是建议，任何写库动作都不由 AI 触发。** 落库只发生在人类审批之后，由增发引擎在 `prisma.$transaction` 中执行完整的预算与上限校验（正常增发见 PRD §26.1、预支增发见 §26.2）。AI 不持有账本写权限，也不参与 Epoch 切换与 Proposal 快照。

AI 禁止清单（PRD §23.2，原样收录）：

```text
AI 不得：
* 自动批准增发
* 自动预支预算
* 绕过预算限制
* 绕过 Proposal
* 修改历史记录
* 改变 Proposal 快照
```

这条清单由架构本身保证：AI 服务模块不 import 任何账本写入函数，只返回纯数据结构；预算是否充足、是否触达成员单期上限、需要何种审批，全部由确定性代码计算，LLM 只负责规则匹配与自然语言说理。

### 9.2 generateTokenRules：生成 Token 规则

输出结构直接采用 PRD §23.1 的 `GeneratedTokenRule` 接口：

```typescript
interface GeneratedTokenRule {
  name: string;
  description: string;
  tokenAmount: number;          // 建议 Token 数量（整数）
  repeatLimitPerEpoch?: number; // 每 Epoch 可重复领取次数
  evidenceRequired: boolean;    // 是否要求证明材料
  abuseRisk: string;            // 滥用风险说明
  reasoning: string;            // 生成理由
}
```

Prompt 的核心是生成**社区所有权 Token 规则**：给定社区类型与目标，产出 5–7 条贡献规则，每条给出一个 `tokenAmount`，数量级参考 PRD §7.1 规则表（完成社区介绍 10 Token、帮助其他成员 50 Token、担任 Mentor 300 Token 等），即单条约落在 10–300 Token 区间。生成结果只是草案，需管理者确认后写入 `CommunityTokenPolicy`；此后规则与通胀参数只能经 `TOKEN_POLICY_CHANGE` Proposal 版本化修改，AI 不参与后续变更。

### 9.3 analyzeContribution：分析贡献

输出接口完整覆盖 PRD §23.2 的十一项：

```typescript
enum RequiredApproval {
  STANDARD_RULE = 'standard_rule',           // 按现有贡献规则审批
  DUAL_ADMIN = 'dual_admin',                 // 至少两名管理员批准
  COMMUNITY_PROPOSAL = 'community_proposal',  // 必须通过社区 Proposal
  SYSTEM_FORBIDDEN = 'system_forbidden',      // 超过 25%，系统禁止
}

interface ContributionAnalysis {
  matchedRuleId: string | null;       // 匹配规则
  matchedRuleName: string | null;
  suggestedTokenAmount: number;        // 建议 Token 数（整数）
  contributionValue: string;           // 贡献价值说明
  isDuplicate: boolean;                // 是否重复领取
  exceedsMemberEpochCap: boolean;      // 是否超过成员单期上限
  regularBudgetSufficient: boolean;    // 正常预算是否足够
  requiresAdvance: boolean;            // 是否需要预算预支
  advanceRateBps: number;              // 预支比例（bps 整数，0 表示无需预支）
  relatedPartyRisk: boolean;           // 是否存在关联方风险
  requiredApproval: RequiredApproval;  // 所需审批方式
  riskWarnings: string[];              // 风险提示
}
```

**确定性数据先于 LLM。** 服务调用 LLM 前，先从数据库读取本期剩余正常额度、成员本期已得、成员单期上限、接收人与审批人的关联关系，注入 prompt 作为事实上下文。`regularBudgetSufficient` / `requiresAdvance` / `advanceRateBps` / `exceedsMemberEpochCap` / `requiredApproval` 一律**以代码计算为准并回填**，LLM 的返回仅用于 `matchedRule` / `suggestedTokenAmount` / `contributionValue` / `isDuplicate` / `riskWarnings` 等语义字段。金额一律整数、比例一律 bps 整数。

服务方法签名与 prompt 骨架如下。`DeterministicMintContext` 是从 DB 读取的确定性事实快照，字段包括 `baseMintBudget`、`remainingRegularBudget`（本期正常剩余）、`memberEarnedThisEpoch`（成员本期已得）、`memberEpochCap`（单期上限）、`maxAdvanceAmount`、`hasOutstandingAdvance`（是否存在未偿还预支）、`isRelatedParty`（接收人是否与审批人关联）：

```typescript
async function analyzeContribution(input: {
  communityId: string;
  memberId: string;
  description: string;
  evidenceUrls: string[];
  rules: GeneratedTokenRule[];
  context: DeterministicMintContext; // 先从 DB 读取的确定性事实
}): Promise<ContributionAnalysis> {
  // LLM 只做规则匹配与说理，明确禁止其做审批决策
  const prompt = `
你是社区贡献评估助手，只做规则匹配与说理，不做任何审批决策。
贡献描述：${input.description}
证明材料数量：${input.evidenceUrls.length}
可用规则（名称 → Token）：
${input.rules.map((r) => `- ${r.name}: ${r.tokenAmount}`).join('\n')}
只返回 JSON：{ matchedRuleName, suggestedTokenAmount(不得超过所匹配规则),
  contributionValue, isDuplicate, riskWarnings }
`;
  const llm = await callClaude(prompt); // Anthropic SDK，模型 ID 由环境变量配置

  // 预算与审批判定：一律以代码计算为准，覆盖任何 LLM 猜测
  const { context: ctx } = input;
  const amount = Math.min(llm.suggestedTokenAmount, matchedRuleAmount(input));
  const shortfall = Math.max(0, amount - ctx.remainingRegularBudget);
  // 累计口径（与 §6.2/§6.4 一致）：本期已预支累计 + 本次差额，防连续小额绕过 10% 门槛
  const cumulativeAdvanceRateBps =
    ctx.baseMintBudget === 0 ? 0
      : Math.floor(((ctx.advancedMintedThisEpoch + shortfall) * 10_000) / ctx.baseMintBudget);

  return {
    ...mapLlm(llm),
    suggestedTokenAmount: amount,
    exceedsMemberEpochCap: ctx.memberEarnedThisEpoch + amount > ctx.memberEpochCap,
    regularBudgetSufficient: shortfall === 0,
    requiresAdvance: shortfall > 0,
    cumulativeAdvanceRateBps,
    relatedPartyRisk: ctx.isRelatedParty,
    requiredApproval: resolveApproval(cumulativeAdvanceRateBps, ctx),
  };
}
```

`resolveApproval` 严格对齐 PRD §6.6，一律按本 Epoch **累计**占比判定：预支为 0 走 `STANDARD_RULE`；累计不超过基础额度 10% 走 `DUAL_ADMIN`；累计超过 10% 但不超过 25%、或涉及关联方/特殊奖励走 `COMMUNITY_PROPOSAL`；累计超过 25% 返回 `SYSTEM_FORBIDDEN`。

输出对照 PRD §16.1 两种情形。额度充足：

```text
匹配规则：帮助其他成员
建议增发：+50 Token
本成员本期已获得：150 / 500
正常预算已使用：4,600 / 5,000（剩余 400）
无需使用未来预算。
```

需预支：

```text
匹配规则：完成关键基础设施
建议增发：+300 Token
正常预算剩余：100，需要预支：200
预支占基础预算 4%（advanceRateBps=400），需两名管理员共同批准。
预支 Token 将在下一 Epoch 激活治理权。
```

审批通过后，`approve` 与 `mint` 是两个独立步骤（对应 `/contributions/:id/approve` 与 `/mint`）：`approve` 只标记贡献通过，`mint` 才在事务中依据上述审批方式执行增发；预支 Token 立即计入总余额与总供应量，但进入 `pendingGovernanceBalance`，下一 Epoch 才激活。

### 9.4 通胀健康报告

报告在**第 5 节 Epoch 切换事务成功提交后异步生成**（与区块链提交同为事务后的异步动作，互不阻塞）。服务先从已关闭的 `TokenEpoch` 汇总确定性数据——月初供应量、正常/预支增发量、供应增长率、预支债务、按规则分类的 Token 分布、前三名集中度及环比——再由 LLM 组织成叙述性报告。内容结构对照 PRD §23.3：

```text
AdventureX Token Health Report

本期基础通胀率：5%
正常增发：4.6%
预支增发：0.5%
本期总供应增长：5.1%
未来预算债务：500 Token

Token 分布：志愿者 35% / Mentor 28% / 项目贡献者 27% / 管理者 10%
集中度：前 3 名成员 31.4%（上期 38.2%）

风险：本期使用了未来预算，建议下一期优先控制特殊奖励数量。
```

所有比率均来自账本数值，LLM 只做归纳与建议，不改写任何供应量或分布数据。

### 9.5 调用限流

沿用基于 Upstash Ratelimit 的滑动窗口限流：每个用户每小时最多发起固定次数 AI 调用，超出即拒绝并提示稍后再试，避免 `generateTokenRules` 与 `analyzeContribution` 被高频刷用抬高成本。限流键以用户 ID 计数，Redis 后端与业务缓存共用实例。

---

## 10. Injective 区块链层

本节是区块链层的架构级摘要与索引：给出合约职责、哈希规范、上链状态机、队列与上链范围的骨架，实现细节一律以 `docs/BLOCKCHAIN-DESIGN.md` 为权威，每小节末标注对应章节。需求以 PRD §10/§28/§30 为准。区块链层的唯一职责是把产品账本中的关键事件（DB 13 类 `RecordType` 按 §3.5 映射表投影到链上七类可信记录）不可篡改地镜像到 Injective，供公众复算与验证；它不承载任何业务规则，业务事务在数据库内完成后（PRD §26.3）才异步触发上链。

模块位于 `lib/blockchain/`，遵循职责分离与小文件原则：`hashing/` 与 `payloads/` 为纯函数（无 IO，前端与第三方可直接复用同一份序列化/哈希代码复算）；`injective/` 内签名（`wallet`）、提交（`submitter`）、确认（`confirmer`）、验证（`verifier`）四职责分离；`records/` 承载 DB 服务与状态机；`queue/` 只做编排不含业务。门面 `InjectiveService` 组合上述能力并支持依赖注入以便 mock 测试。详见 BLOCKCHAIN-DESIGN.md §1、§3。

### 10.1 合约 YouFenRecords 职责

平台只部署一个合约 `YouFenRecords`，是一个有状态、不可转让的社区所有权 Token 镜像。它按社区维度维护余额与总供应量，并登记七类记录的哈希。链上七类记录（`token_mint` / `advance_mint` / `token_reversal` / `epoch_summary` / `policy_version` / `proposal_snapshot` / `proposal_result`）是 PRD §10.2 十二类产品账本事件的可信记录投影：初始分配、普通增发均走 `token_mint`，预支增发走 `advance_mint`，预算创建/预支/债务偿还归入 `epoch_summary`，通胀率修改与规则版本修改归入 `policy_version`，其余按名对应。合约要点：

- 三个写入口的读写模型：`recordMint`（普通增发与预支增发共用，`budgetSource` 区分 `0=当前 Epoch`、`1=下一 Epoch 预支`，预支时 `activationEpoch>0`）、`recordReversal`（携带 `originalRecordHash` 并 `require` 其已存在，满足 PRD §10.3“新记录必须引用原记录”）、以及 `recordEpochSummary` / `recordPolicyVersion` / `recordProposalSnapshot` / `recordProposalResult` 四个摘要写入口。`recordMint` / `recordReversal` 另收一个紧邻 `recordHash` 之前的 `uint64 ledgerSeq`（社区内严格递增账本序号，后端在 DB 事务内分配），作为余额镜像的顺序守卫（见下条）。
- 三个读接口：`getBalance(communityIdHash, memberIdHash)`、`getTotalSupply(communityIdHash)`、`getRecord(recordHash)`（PRD §28.2 允许清单：Read Balance / Read Total Supply / Read Record Hash）。
- 不可转让由“合约根本不存在 `transfer` / `transferFrom` / `approve` / `allowance` 函数”保证，而非在函数内 revert（PRD §28.2）。
- 余额与总供应量采用“赋值快照 + 序号守卫”语义：链上直接写入 DB 事务算得的 `memberBalanceAfter` / `totalSupplyAfter`，而非链上 `+= amount` 再校验，避免单条记录永久失败 brick 整个社区后续上链；并仅当 `ledgerSeq > lastLedgerSeq[communityId]` 时才更新镜像并推进 `lastLedgerSeq`，否则跳过镜像更新（不 revert）。据此，晚到/乱序的旧记录（重试、对账场景）仍无条件完成公证（`records` 元数据、事件、`reversalOf`），但绝不会用过期余额覆盖更新的快照。`ledgerSeq` 不进事件签名（PRD §28.3 原样保留），其可验证性由 `recordHash` 的 canonical payload 承载。
- 链上标识一律为 `bytes32`：`communityIdHash`（社区是公开实体，无盐 keccak256）与 `memberIdHash`（加服务端 pepper，防字典枚举反查成员身份）；数值字段用 `uint256` 金额、`uint8 budgetSource`、`uint64 activationEpoch`、`uint32` 版本/bps。链上绝不出现成员姓名、邮箱、证明材料、AI Prompt、内部备注等 PII（PRD §28.4）。
- 只有平台 Server Wallet（`recorder`）可写；`owner` 可 `setRecorder` 轮换，用于私钥泄露止损。

事件签名直接采用 PRD §28.3 的三个原文事件，并补全其余三类（Advance Mint 由 `TokensMinted` 承载）：

```solidity
// PRD §28.3 原文三事件（recordHash 均为 indexed，供崩溃对账反查）
event TokensMinted(bytes32 indexed communityId, bytes32 indexed memberId, uint256 amount,
    uint256 memberBalanceAfter, uint256 totalSupplyAfter, uint8 budgetSource,
    uint64 activationEpoch, bytes32 indexed recordHash);
event TokensReversed(bytes32 indexed communityId, bytes32 indexed memberId, uint256 amount,
    uint256 memberBalanceAfter, uint256 totalSupplyAfter, bytes32 indexed recordHash);
event EpochRecorded(bytes32 indexed communityId, uint64 indexed epochNumber, uint256 openingSupply,
    uint256 baseBudget, uint256 regularMinted, uint256 advancedMinted,
    uint256 advanceDebt, bytes32 indexed recordHash);
// 补全三事件：PolicyVersionRecorded / ProposalSnapshotRecorded / ProposalResultRecorded

// 普通与预支增发共用；notRecorded(recordHash) 内含 require(!records[recordHash].exists)
// ledgerSeq：社区内严格递增账本序号（紧邻 recordHash 之前，不进事件）；镜像仅在 ledgerSeq>lastLedgerSeq[communityId] 时更新
function recordMint(bytes32 communityId, bytes32 memberId, uint256 amount,
    uint256 memberBalanceAfter, uint256 totalSupplyAfter,
    uint8 budgetSource, uint64 activationEpoch, uint64 ledgerSeq, bytes32 recordHash)
    external onlyRecorder notRecorded(recordHash);
```

`require(!records[recordHash].exists)` 是防止同一记录重复上链的最后防线（详见 §10.5 幂等）。完整合约（存储布局、reversalOf 映射、管理函数）详见 BLOCKCHAIN-DESIGN.md §2。

### 10.2 recordHash 计算规范

链上哈希必须对应“当时的标准化数据”（PRD §10.3），因此上链前对固定信封做确定性序列化再哈希：

- 信封为 `{"schema":"youfen.record.v1","type":"<recordType>","payload":{...}}`；`schema` 版本化，未来变更序列化规则时旧记录仍按 v1 验证。
- canonical JSON（RFC 8785/JCS 严格子集）：键按码位升序、递归排序；无空白；数字仅整数（bps 类字段本身是整数可入哈希，百分比派生字段一律排除，浮点是哈希毒药）；时间统一 Unix 秒且字段名以 `At` 结尾；禁止 `null`（可选字段缺失即省略键）；字符串最小转义、UTF-8。
- `recordHash = keccak256(utf8Bytes(canonicalJson))`，且必须使用 ethers 的 `keccak256`（Ethereum Keccak-256）。严禁使用 Node `crypto` 的 `sha3-256`（NIST SHA3 与 Keccak-256 结果不同，混用会产生全错但不报错的哈希）。
- payload 内含 `mintEventId` 等 DB 主键（cuid，无语义），保证参数完全相同的两笔记录哈希仍唯一，与合约 `require(!exists)` 配合成为天然幂等键。
- payload 只含 `communityIdHash` / `memberIdHash` 与整数快照，绝不含 `reason` / `evidenceUrls` / `approvedBy` / AI 分析等（PRD §28.4 禁 PII）。
- `hashing/` 为纯函数并提供 golden test vectors，前后端与第三方共用同一实现复算校验；序列化实现漂移（键序、数字格式、null 处理）是哈希对不上的最大来源，严禁任何一端手写 `JSON.stringify`。

pepper 不影响第三方可验证性：链上与验证 API 公开的就是 `memberIdHash` 本身，payload 中也只含 `memberIdHash`，第三方从公开 canonical payload 复算 `recordHash` 无需 pepper；pepper 只保护“链上 hash → 真实成员”这一步反查。成员本人可在其页面展示自己的 `memberIdHash` 与链上事件比对自证。详见 BLOCKCHAIN-DESIGN.md §4。

### 10.3 ethers v6 交互

链交互统一使用 ethers v6 语法（顶层 `keccak256` / `toUtf8Bytes`，`providers.*` 前缀移除，回执字段为 `hash`）：

```typescript
import { JsonRpcProvider, Wallet, Contract, keccak256, toUtf8Bytes } from 'ethers';

const provider = new JsonRpcProvider(process.env.INJECTIVE_RPC_URL); // v6：构造器提升到顶层
const wallet = new Wallet(process.env.SERVER_WALLET_KEY!, provider);
const contract = new Contract(process.env.INJECTIVE_CONTRACT_ADDRESS!, YOUFEN_ABI, wallet);

const communityIdHash = keccak256(toUtf8Bytes(`youfen:community:v1:${communityId}`)); // 顶层函数
const tx = await contract.recordMint(
  communityIdHash, memberIdHash, amount,          // amount 等金额一律 bigint
  memberBalanceAfter, totalSupplyAfter, budgetSource, activationEpoch,
  ledgerSeq, recordHash,                          // ledgerSeq：镜像顺序守卫，紧邻 recordHash 之前
);
const receipt = await tx.wait(CONFIRMATIONS);
const txHash = receipt.hash; // v6：TransactionReceipt.hash 即交易哈希
```

金额在 TS 服务层为整数、在链交互层为 `bigint`；比例一律 bps 整数（如 `monthlyInflationRateBps`）。主路径用 ethers.js 即可（一个 `JsonRpcProvider` + `Wallet` + 标准合约调用，无 Cosmos 概念负担）；`@injectivelabs/sdk-ts` 仅在需要 `0x ↔ inj1` 地址转换（领水）时可选引入。详见 BLOCKCHAIN-DESIGN.md §3。

### 10.4 上链状态机（六态）

`PublicRecord.status` 使用 PRD §10.4 六态 `VerificationStatus`（TS 层小写联合类型）。所有状态转换都是条件 `UPDATE ... WHERE status IN (from...)`，返回 0 行即并发竞争、放弃本次操作，这同时是幂等防线之一：

```text
pending ──(submit-worker 领取，条件 UPDATE 成功)──▶ submitting
submitting ──(广播成功拿到 txHash，持久化 txHash+nonce)──▶ confirming
submitting ──(链上已存在 RECORD_EXISTS，反查 txHash)──▶ confirming（幂等恢复）
submitting ──(参数非法/合约拒绝且链上不存在)──▶ failed
confirming ──(receipt.status=1 且达确认数 且 getRecord(hash).exists)──▶ verified
confirming ──(reverted；或超时且交易消失、nonce 被越过)──▶ failed
failed ──(POST /retry 或 BullMQ 自动重试)──▶ pending
verified ──(对应 Reversal/Correction 记录 verified 后调用 markSuperseded)──▶ superseded
```

`verified` 与 `superseded` 是仅有的两个终态；只有 `verified` 状态前端才可展示“Injective 已确认”（PRD §10.4），`pending` / `submitting` / `confirming` / `failed` 一律不得显示已确认/永久保存/无人可修改。被纠正记录置 `superseded` 时链上原记录依旧存在，仅 DB 标记并关联 `supersededByRecordId`（PRD §10.3 不删除、追加纠正、双版本展示）。

submit-worker 的写顺序为崩溃对账提供不变量：① 条件 `UPDATE → submitting` 并写入 `assignedNonce`（广播前）；② 签名并广播；③ `UPDATE` 写入 `txHash`（广播后）。崩溃在 ①② 之间无广播，reconciler 直接重置 `pending`；崩溃在 ②③ 之间丢失 `txHash`，因 `recordHash` 广播前已持久化且是所有事件的 indexed topic，可用 `eth_getLogs(topics=[…, recordHash])` 反查出 `txHash` 与 `blockNumber` 补写后转 `verified`。

reconcile-worker 每 2 分钟扫描超时的 `submitting` / `confirming` 记录：先查 `getRecord(recordHash)`，`exists=true` 走上述 getLogs 反查恢复；`exists=false` 时比较持久化的 `assignedNonce` 与链上 `getTransactionCount(wallet,'latest')`——`assignedNonce < latestNonce` 且链上无此记录说明该 nonce 已被越过、交易被丢弃，可安全重新入队（合约 `require(!exists)` 兜底绝无双写）；否则交易可能仍在 mempool，超硬超时才标 `failed` 并释放。详见 BLOCKCHAIN-DESIGN.md §5。

### 10.5 队列与幂等

上链编排用 BullMQ（Redis）三队列，业务事务提交成功后才 `enqueue`：

- **chain-submit**：一个 `PublicRecord` 一个 job，`concurrency=1` 串行化——单一 Server Wallet 下这是 nonce 顺序最可靠的解法，同一时刻仅一笔在途交易，无 nonce 空洞；job payload 只放 `recordId`，数据一律从 DB 读。
- **chain-confirm**：一个 `txHash` 一个 job，只读轮询 receipt，可并发。
- **chain-reconcile**：repeatable job（每 2 分钟），扫描超时的 `submitting` / `confirming` 记录做崩溃对账。

同一记录绝不重复上链的四层幂等防线：

1. **jobId 去重**：`submit:${recordId}:v${attemptEpoch}`，BullMQ 对相同 jobId 静默去重；retry 时 `attemptEpoch+1` 生成新 jobId。
2. **DB 状态守卫**：worker 首步条件转换 `UPDATE ... WHERE status IN ('pending')`，0 行即已被其他进程处理，直接成功返回不广播。
3. **广播前链上预检**：一次廉价 `getRecord(recordHash).exists` view 调用，为 true 则跳到确认恢复路径。
4. **合约 `require(!records[recordHash].exists)`**：最后防线；因 `recordHash` 含 DB 主键，同一业务记录哈希恒等，重复提交必然 revert。

重试按错误类别分流（`errors.ts`）：`RetryableError`（网络超时 / RPC 5xx / `NONCE_TOO_LOW`，后者先 `resyncNonce`）抛出让 BullMQ 指数退避重试；`AlreadyRecordedError`（revert reason=`RECORD_EXISTS`）不是失败，走 `findTxByRecordHash` 恢复路径后 job 正常结束；`TerminalError`（参数非法等）直接 `discard`，记录转 `failed` 等人工 `/retry`。

`wallet.ts` 显式管理 nonce（启动或 NONCE 错误时 `resyncNonce = getTransactionCount(addr,'pending')`，不依赖 ethers 内存计数器以免进程重启失效），每次广播前把 `assignedNonce` 持久化到 `PublicRecord` 供对账。

业务事务（增发/预支/Epoch 切换）内只创建 `PublicRecord(status='pending', envelope, recordHash)` 并提交，事务提交成功后才 `enqueueRecordSubmission`（PRD §26.3“区块链提交在数据库事务完成后异步执行”）；若 enqueue 本身失败（Redis 抖动），记录停在 `pending`，由 reconciler 补扫 pending 超时记录重新入队。DB 是唯一事实源，Redis 丢数据可完全重建。BullMQ worker 为常驻进程，不能跑在 Vercel serverless，需独立 worker 宿主。详见 BLOCKCHAIN-DESIGN.md §6。

### 10.6 上链范围

`submitter` 按七类链上 `RecordType` 分发到合约写入函数：`token_mint` / `advance_mint`（共用 `recordMint`）、`token_reversal`、`epoch_summary`、`policy_version`、`proposal_snapshot`、`proposal_result`，七条分发路径全部实现，无留空 case；`chainEligible = false` 的 DB-only 类型（§3.5 映射表）在入队层即被拒绝，绝不会到达 submitter。`PublicRecord` 表除 `recordHash` 与 `canonicalPayload`（信封原文字符串，供第三方直接复算）外，另存 `chainEligible`（DB-only 类型不入队，见 §3.5 映射表）/ `assignedNonce` / `attemptEpoch` / `supersededByRecordId`。

上链范围为全量实现，与 BLOCKCHAIN-DESIGN.md 的范围声明一致（“全量实现，不做黑客松降级”，其风险清单中的 MVP 降级路径仅作参考、不执行）：合约全部函数部署，七类 payload builder（`payloads/`）与 submitter 分发路径全部实现并接入业务流程——`token_mint`（§4.4 正常增发）、`advance_mint`（§6.4 预支增发）、`token_reversal`（§4.6 冲销）、`epoch_summary`（§5.3 Epoch 切换）、`proposal_result`（§7.6 结果结算）五条为必须真实跑通的链上路径，`policy_version`（§7.5 政策切版）与 `proposal_snapshot`（§7.2 Proposal 激活）同样完成 wiring。MVP 验收（PRD §30）列出的三条路径（一次正常 Mint、一次 Advance Mint、一次 Proposal Result，前端展示真实 Tx Hash 与 Block Height、可在区块浏览器验证）仅是 Demo 演示的最低验收要求，不是实现范围——不允许以此为由后置任何一类的上链 wiring。

公开验证端点 `GET /api/public-records/:id/verify` 做三步实时校验：① 用 DB 源实体重新过 `PayloadBuilder` 重算哈希（防源数据被改）；② 与存储 `recordHash` 比对；③ 合约 `getRecord(hash)` 链上存在性 + 事件反查 tx。`hashMatches=false` 即“历史被改动”的公开证据；RPC 不可达时返回 `onChain:"unknown"`，绝不误报 `verified`。这正是“无人可静默修改”叙事的技术落点。详见 BLOCKCHAIN-DESIGN.md §7。

### 10.7 Injective Testnet 事实

| 项 | 值 |
| --- | --- |
| JSON-RPC | `https://k8s.testnet.json-rpc.injective.network/` |
| WebSocket | `wss://k8s.testnet.ws.injective.network/` |
| EVM chainId | 1439（Cosmos `injective-888`；主网对照 1776 / `injective-1`） |
| 工具链 | 官方兼容 Hardhat / Foundry / ethers.js / viem，`^0.8.20` 合约可直接编译部署 |
| 出块/最终性 | 约 0.64s 单块即时最终性（收到 receipt 即不可逆，默认确认数 2 做成 env 可调） |
| Gas 代币 | INJ（费用极低） |
| Faucet | `https://testnet.faucet.injective.network/`（备选 Google Web3 faucet） |
| 区块浏览器 | `https://testnet-injective.cloud.blockscout.com` |

核实于 2026-07-23；实施第一步建议用 ethers v6 跑一笔 `eth_chainId` 冒烟确认返回 `0x59f`（1439）。详见 BLOCKCHAIN-DESIGN.md §9。

---

## 11. 部署架构与开发计划

### 11.1 双宿主部署拓扑

系统运行在两个互补的宿主上，共享同一 Postgres 与同一 Redis，通过数据库与队列解耦：

```text
                    ┌──────────────────────────┐
   浏览器 ───────►  │  Vercel (Next.js)         │
                    │  ├─ 页面 (SSR/RSC)         │
                    │  └─ API Routes            │  写业务事务 + 创建 PublicRecord(pending)
                    └───────┬──────────┬────────┘
                            │          │  事务提交成功后 enqueue
                     ┌──────▼───┐   ┌──▼──────────────┐
                     │ Postgres │◄──┤ Redis (BullMQ)  │
                     └──────▲───┘   └──┬──────────────┘
                            │          │  拉取 job
                    ┌───────┴──────────▼────────┐
   Injective ◄────► │  常驻 Worker 进程          │  npm run worker
                    │  ├─ chain-submit  (c=1)   │  签名+广播
                    │  ├─ chain-confirm (c=4)   │  等 receipt
                    │  └─ chain-reconcile       │  崩溃对账
                    └───────────────────────────┘
```

Vercel 承载 Next.js 页面与 API Routes，负责所有同步请求与业务事务（正常增发、预支、Epoch 切换、Proposal 快照等，详见第 4–7 节）。区块链提交在数据库事务成功提交后才异步入队，绝不在请求路径内同步等待上链。

**BullMQ worker 必须部署为独立常驻进程，不能跑在 Vercel serverless 函数里。** serverless 函数生命周期短、无常驻监听，BullMQ 的三个 worker（`chain-submit` / `chain-confirm` / `chain-reconcile`）需要长期持有 Redis 连接并串行持有单钱包 nonce，二者天然冲突；若默认全栈 Vercel，上链会静默不执行。因此 **Day 1 必须决定 worker 宿主**（Railway / Fly / Render 免费实例任选其一），入口为 `npm run worker`，与 Vercel 共享同一 `DATABASE_URL` 与 `REDIS_URL`。DB 是唯一事实源，Redis 丢数据可由 `chain-reconcile` 从 `pending` / `submitting` 记录完全重建（详见 BLOCKCHAIN-DESIGN.md §6）。

### 11.2 环境变量清单

所有变量在进程启动时 fail-fast 校验（缺失或格式非法即拒绝启动，见 BLOCKCHAIN-DESIGN.md §1 的 `config.ts`），避免运行到上链一刻才暴露缺配：

| 变量 | 宿主 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 两端 | Postgres 连接串（Vercel 与 worker 同库） |
| `REDIS_URL` | 两端 | Redis 连接串（BullMQ 队列） |
| `ANTHROPIC_API_KEY` | Vercel | AI 建议服务（`callClaude`，只建议不执行，见第 9 节） |
| `AI_MODEL_ID` | Vercel | AI 模型 ID（环境变量配置，便于切换） |
| `NEXTAUTH_SECRET` | Vercel | 会话签名密钥 |
| `NEXTAUTH_URL` | Vercel | 站点回调 URL |
| `INJECTIVE_RPC_URL` | 两端 | Injective Testnet JSON-RPC（默认 `https://k8s.testnet.json-rpc.injective.network/`） |
| `INJECTIVE_CONTRACT_ADDRESS` | 两端 | 已部署的 YouFenRecords 合约地址 |
| `SERVER_WALLET_KEY` | **仅 worker** | 唯一 recorder 私钥；**绝不进前端 / 仓库 / Vercel 环境**，仅签名上链交易 |
| `RECORD_HASH_PEPPER` | 两端 | memberIdHash 加盐（communityIdHash 无盐），前后端复算须一致 |
| `CHAIN_CONFIRMATIONS` | worker | 确认数常量，默认 `2`，可按 testnet 实测调整 |
| `CRON_SECRET` | 两端 | 保护 `/api/internal/token-epochs/:id/close` 等内部触发端点 |

`SERVER_WALLET_KEY` 只存在于 worker 宿主的环境变量中：前端与 API Routes 从不签名交易，仅创建 `PublicRecord` 并入队，签名职责完全隔离在 worker。

### 11.3 数据库部署与 CDN

数据库使用托管 Postgres（Vercel Postgres / Supabase / Neon 均可），启用自动备份、连接池与 SSL；serverless 侧走 Prisma 连接池并设置合理超时，避免连接耗尽。账本类表（`PublicRecord`、`TokenMintEvent`、`TokenReversalEvent`）在库层保持只追加语义，对 `Community` 采用 `onDelete: Restrict`，纠错走 Reversal 追加而非物理删除。

静态资源经 Vercel 自动 CDN 分发，Next.js Image 自动优化图片，启用 Gzip / Brotli 压缩；页面按 RSC 默认服务端渲染，减小前端包体。

### 11.4 开发计划

**Day 1–2 · 基础与链上地基**

* [ ] 初始化 Next.js + Prisma 骨架、托管 Postgres 与 Redis 接入
* [ ] **部署 YouFenRecords 合约到 Injective Testnet**（Hardhat，`chainId 1439`，solidity ^0.8.20，`gas`/`gasPrice` auto）
* [ ] **决定并搭建 worker 宿主**（Railway / Fly / Render），跑通 `npm run worker` 空转
* [ ] **`eth_chainId` 冒烟测试**：ethers v6 `JsonRpcProvider` 连通 RPC，发一笔 self-transfer 验证签名/出块

**Day 3–4 · Token 引擎核心**

* [ ] 七模型迁移（`CommunityTokenPolicy` / `CommunityTokenState` / `TokenEpoch` / `MemberTokenBalance` / `TokenMintEvent` / `TokenAdvanceRequest` / `TokenReversalEvent`）
* [ ] Token 引擎事务：`approve` 与 `mint` 两步拆分，`prisma.$transaction` + 条件 UPDATE 保证预算与单期上限原子校验
* [ ] Epoch 切换事务：月初供应量快照、债务扣除、激活上一期 `pendingGovernanceBalance`
* [ ] 预支流程：`TokenAdvanceRequest` 审批状态机与预支增发（治理权下一 Epoch 激活）

**Day 5–6 · 全事件上链与验证**（逐条对应 PRD §30 区块链验收）

* [ ] 至少完成一次**正常 Mint 上链**（`TOKEN_MINT`，budgetSource=regular）
* [ ] 至少完成一次 **Advance Mint 上链**（`ADVANCE_MINT`，携带 activationEpoch）
* [ ] 至少完成一次 **Proposal Result 上链**（`PROPOSAL_RESULT`）
* [ ] **七类 payload builder 与 submitter 分发全量接通**：`TOKEN_REVERSAL` / `EPOCH_SUMMARY` / `TOKEN_POLICY_VERSION` / `PROPOSAL_SNAPSHOT` 与上述验收三类同为真实上链路径（§10.6，BLOCKCHAIN-DESIGN 全量范围）
* [ ] 记录详情页展示**真实 Tx Hash 与 Block Height**（仅 `verified` 状态展示"Injective 已确认"）
* [ ] 记录可在 **Blockscout 区块浏览器验证**（`https://testnet-injective.cloud.blockscout.com`），并可用同一 canonical envelope 复算 `recordHash`
* [ ] 历史记录不能被静默覆盖，纠正走 Reversal 追加（原记录置 `superseded`）

**Day 7 · 打磨与 Demo**：移动端适配、Demo 数据预热提交、Build in Public 页面、演示材料。

测试与验证策略（golden test vectors、六态状态机、上链验收脚本）以 BLOCKCHAIN-DESIGN.md §4–§5 的一致性保障与 §8 风险清单为准，此处不展开。

### 11.5 技术风险与应对

| 风险 | 影响 | 应对机制 |
| --- | --- | --- |
| AI 调用超时 | 建议延迟、体验差 | 10s 超时降级到默认规则；AI 只建议不执行，不阻塞业务 |
| 上链失败 | 可信记录缺失 | BullMQ 分级重试 + reconciler 对账 + 人工 `/retry`，不影响主业务事务 |
| worker 与 serverless 冲突 | 上链静默不执行 | worker 独立常驻宿主（Railway/Fly），Day 1 决定，绝不部署到 Vercel serverless |
| 单钱包串行吞吐 | 批量记录排队数分钟 | `chain-submit` concurrency=1 保 nonce 顺序；Demo 前预热提交，批量初始分配提前上链 |
| canonical JSON 实现漂移 | 哈希对不上、验证误判 | golden test vectors 锁定 `hashing/` 纯函数，前后端共用同一份 canonicalize，严禁手写 `JSON.stringify` |
| keccak256 与 sha3-256 混用 | 全错但不报错的哈希 | 统一从 ethers 导入 `ethers.keccak256`，禁用 Node crypto 的 NIST sha3-256 |
