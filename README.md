# 有份 YouFen

> 让每个参与者，在社区里真的有份。

无代码社群共治平台，帮助运营者将成员参与转化为 Ownership，通过链上治理实现投票、规则共创和重要决策。

## 项目状态

**线上地址**: [www.youfen.app](https://www.youfen.app)
**版本**: v0.7
**赛道**: Injective Blockchain × AI / Build in Public

## 核心功能

- **无代码创建社群** — 填写信息即可启动，AI 自动生成贡献规则
- **Ownership 系统** — 贡献→Ownership→治理权，每月 Epoch 通胀预算 + 预支机制
- **AI 辅助审核** — DeepSeek / Claude 识别贡献类型，建议 Ownership 数值
- **加权投票** — Ownership 加权 + EIP-712 链上签名 + 多签审批
- **任务系统** — 运营者发布任务，成员提交凭证，审批后自动发放 Ownership
- **活动系统** — 创建活动、成员报名、签到管理
- **链上存证** — 所有 mint / reversal / epoch / proposal 操作上链为 PublicRecord，可公开验证
- **移动端优先** — H5 网站，微信内可用

## 文档

| 文档 | 说明 |
|-----|------|
| [PRD.md](docs/PRD.md) | 产品需求文档 |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | 技术架构设计 |
| [PRD.en.md](docs/PRD.en.md) | PRD 英文版 |
| [ARCHITECTURE.en.md](docs/ARCHITECTURE.en.md) | 架构英文版 |

## 技术栈

### 前端
- **框架**: Next.js 16 (App Router + Turbopack)
- **语言**: TypeScript 5+
- **样式**: Tailwind CSS
- **国际化**: next-intl（中/英）
- **动画**: Framer Motion

### 后端
- **API**: Next.js API Routes（89 个端点）
- **ORM**: Prisma + Drizzle ORM 双轨
- **数据库**: Neon PostgreSQL（Serverless）
- **队列**: BullMQ（链上确认 worker）
- **Cron**: Vercel Cron（每分钟链同步 + 提交 + 确认）

### AI
- **模型**: DeepSeek / Claude
- 贡献分析与规则建议
- 自动匹配贡献类型

### 区块链
- **网络**: Injective Testnet (chainId 1439)
- **合约**: YouFenGovernance v0.7 + YouFenRecords（Solidity）
- **交互**: ethers.js v6
- **签名**: EIP-712 类型化数据签名（approver 多签）
- **钱包**: 后台托管（用户无感）
- **特点**: 非 token 经济，Ownership 不可交易/不可转移

## 快速开始

### 环境要求

- Node.js 20+
- npm 9+

### 安装

```bash
npm install
cp .env.example .env  # 编辑填写环境变量
```

### 环境变量

```env
# 数据库 (Neon PostgreSQL)
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# 区块链
INJECTIVE_RPC_URL=https://k8s.testnet.json-rpc.injective.network/
CHAIN_ID=1439
CONTRACT_ADDRESS=0x...
CONTRACT_DEPLOY_BLOCK=...
BLOCKCHAIN_PRIVATE_KEY=0x...

# 内部 API
CRON_SECRET=...
INTERNAL_API_TOKEN=...
RECORD_HASH_PEPPER=...

# AI
ANTHROPIC_API_KEY=sk-...
DEEPSEEK_API_KEY=sk-...

# Auth
JWT_SECRET=...
```

### 初始化数据库

```bash
npx prisma generate
npx prisma db push
npx tsx db/seed.ts
```

### 启动

```bash
npm run dev
```

访问 http://localhost:3000

### 部署合约

```bash
npx hardhat compile
npx hardhat run scripts/deploy-contract.ts --network injectiveTestnet
npx hardhat run scripts/deploy-governance.ts --network injectiveTestnet
npx tsx scripts/seed-governance-community.ts
```

## 页面结构

```
有份 YouFen
├── 首页 (/)
├── 功能页
│   ├── AI 辅助审核 (/features/ai)
│   ├── Ownership 系统 (/features/voting-power)
│   ├── 贡献系统 (/features/contribution)
│   └── 加权投票 (/features/voting)
├── 管理后台 (/admin) — 桌面端
│   ├── 概览
│   ├── 管理 (投票 / 活动 / 任务)
│   ├── 成员管理
│   ├── 贡献审核
│   ├── 提案管理
│   ├── AI 对话
│   └── 存证记录
├── 成员端 (/member/[communityId]) — 移动端优先
│   ├── 首页
│   ├── 提案投票
│   ├── 贡献提交
│   ├── 任务
│   ├── 活动
│   ├── 社区聊天
│   ├── 链上存证
│   ├── 社群公开页
│   └── 个人中心
├── 公开社群页 (/communities/[slug])
├── 存证验证 (/records)
└── 文档 (/docs)
```

## 已知注意事项

### Injective 测试网 RPC

公共 RPC (`k8s.testnet.json-rpc.injective.network`) 的 `eth_getTransactionReceipt` 会长期返回 null，即使交易已上链。项目已通过以下方式绕过：
- 用 `getLogs` 做事件索引（不受影响）
- Confirmer 内置 null-receipt 快速通道：连续 5 次 null 后直接读合约 `recordExists()` 确认

## Demo 数据

- 社群：AdventureX Community
- 25 名成员
- 初始供应 100,000 Ownership
- 月通胀率 5%，预支上限 25%，单人上限 10%

## 许可证

MIT

---

**有份团队** | 2026
