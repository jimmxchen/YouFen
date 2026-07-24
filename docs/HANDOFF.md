# 人工介入交接清单（HANDOFF）

> 本文档汇总 Injective 后端接口层实现过程中所有**必须由人类完成**的事项。
> 代码已全量实现并通过离线验证（typecheck 零错误、vitest 445+ 用例、合约 29+ 用例、覆盖率 ≥94%），
> 但**从未接触任何真实外部服务**——真实链、数据库、Redis 的接入全部在此清单中。

---

## 0. 一图流：上线顺序

```text
① 生成密钥/配置 env → ② 供给 Postgres + Redis → ③ 生成钱包并领水
→ ④ 部署合约（回填地址+部署区块）→ ⑤ 部署 worker（常驻主机）
→ ⑥ 部署 Next.js（Vercel）→ ⑦ 冒烟验证 → ⑧ 生产加固
```

---

## 1. 密钥与环境变量（对照 `.env.example`）

| 变量 | 放哪里 | 说明 |
|---|---|---|
| `DATABASE_URL` | Web + worker | Postgres 连接串，两端同库 |
| `REDIS_URL` | Web + worker | BullMQ 队列 |
| `INJECTIVE_RPC_URL` | Web + worker | 默认 `https://k8s.testnet.json-rpc.injective.network/` |
| `CHAIN_ID` | Web + worker | `1439`（Injective EVM Testnet） |
| `CONTRACT_ADDRESS` | Web + worker | **部署合约后回填**（0x 小写） |
| `CONTRACT_DEPLOY_BLOCK` | worker | **部署后回填**——reconciler getLogs 反查的下界 |
| `BLOCKCHAIN_PRIVATE_KEY` | **仅 worker** | recorder 钱包私钥。**绝不进前端 / 仓库 / Vercel**。泄露时用合约 `setRecorder` 轮换止损 |
| `RECORD_HASH_PEPPER` | Web + worker | 长随机串。**一旦上线不可更换**（更换会导致所有 memberIdHash 变化、历史记录验证失败） |
| `CHAIN_CONFIRMATIONS` | worker | 默认 `2`，按 testnet 实测可调 |
| `EXPLORER_BASE_URL` | Web | `https://testnet-injective.cloud.blockscout.com`（用真实交易链接验证一次可达性） |
| `INTERNAL_API_TOKEN` | Web + worker | ≥16 字符随机串，内部服务间调用鉴权 |
| `ANTHROPIC_API_KEY` | Web | AI 建议服务（贡献分析/规则生成/健康报告）；未配置时端点优雅降级返回「AI 不可用」 |
| `AI_MODEL_ID` | Web | AI 模型 ID，默认 `claude-sonnet-5` |
| `CRON_SECRET` | Web + worker | 保护 Epoch 切换等内部触发端点 |

生成建议：`openssl rand -hex 32`（pepper / internal token）。

## 2. 基础设施供给

- **Postgres**：创建库后运行 `pnpm prisma migrate dev`（本仓库只跑过 `generate`/`validate`，**从未建过表**）。
- **Redis**：BullMQ 用；worker 连接要求 `maxRetriesPerRequest: null`（代码已设置）。
- **worker 宿主**：`scripts/worker.ts` 是常驻进程（含优雅停机），部署到 Railway / Fly / Render 等长驻主机。**不能跑在 Vercel serverless**——跑在那里上链会静默不执行。
- **Web（Next.js）**：Vercel 即可；Web 进程不需要也不应持有 `BLOCKCHAIN_PRIVATE_KEY`。

## 3. 钱包与水龙头

1. 生成 recorder 钱包（如 `node -e "const {Wallet}=require('ethers');const w=Wallet.createRandom();console.log(w.address, w.privateKey)"`）。
2. 领测试 INJ：官方水龙头 `https://testnet.faucet.injective.network/`（24h 一次）。注意其 API 收 `inj1...` 格式地址——0x 地址需转 bech32（可用 `@injectivelabs/sdk-ts` 的 `getInjectiveAddress(0x...)`，或用官方网页/Google Cloud Web3 faucet 试 0x 直投）。
3. 首笔真实交易前确认钱包有余额。

## 4. 合约部署

```bash
pnpm tsx scripts/deploy-contract.ts   # 对 Injective EVM Testnet 部署 YouFenRecords
```

部署后回填 `CONTRACT_ADDRESS` 与 `CONTRACT_DEPLOY_BLOCK` 到两端 env。

## 5. 上线前冒烟清单（顺序执行）

- [ ] `eth_chainId` 调用返回 `0x59f`（=1439），确认 RPC 可用且没连错链
- [ ] 用 recorder 钱包发一笔 self-transfer，确认签名/广播/回执全通
- [ ] 触发一条真实 `recordMint` 走完整流水线：pending → submitting → confirming → verified
- [ ] 浏览器打开 Blockscout 的交易链接确认可见
- [ ] 请求 `GET /api/public-records/:id/verify`，确认 `hashMatches=true, onChain=true`
- [ ] 实测 testnet 的 `eth_getLogs` 区块段查询上限，按需调整 reconciler 分段参数

## 6. 生产加固（上线后尽快）

| 事项 | 现状 | 要做 |
|---|---|---|
| API 限流 | 内存计数器（多实例下失效） | 换 Redis 计数器 |
| 管理端鉴权 | 占位 token | 接真实管理员认证（NextAuth） |
| 代码风格工具 | 未引入 linter（有意决策：控制依赖面） | 需要时补 biome/prettier |
| 超长文件 | `record-service.ts` 490 行；3 个测试文件 >400 行 | 空闲时拆分 |

## 7. Git 状态与待决策项 ⚠️

实现由多 agent 完成，当前 git 状态**需要你审阅后定夺**：

### 7.1 后端（主工作区 `YouFen/`）

- 当前 HEAD 在 agent 创建的任务分支 `task/w7-submit-keyfree-deps`（本地 develop 之上共 6 个后端修复提交）。
- 工作区大量未跟踪/修改路径——**绝大部分实现代码尚未提交**（本会话未做任何提交/推送；分支上的提交为流水线 agent 留下的 TDD 轨迹）。

### 7.2 分叉警告：本地 develop ≠ 远程 develop

- **本地 develop** = `26c9c2e` + 4 个后端修复提交（流水线 agent 所做）。
- **远程 origin/develop** = `26c9c2e` + 2 个前端提交（队友初始化的 Next.js + i18n 前端）。
- 两者已分叉，不能快进合并。集成时需要一次真正的 merge——后端文件与前端文件路径基本无交集（唯一重叠：`package.json`/`tsconfig.json`/`.gitignore`/`lib/`，需要手工合并为「前端 + 后端」统一工程；这是上线前最大的一项集成工作）。

### 7.3 前端 worktree（`../YouFen-develop/`，分支 `feature/records-explorer`）

- 基于 `origin/develop` 检出，包含**未提交**的新增内容：链上记录溯源页 `/[locale]/records`（`app/[locale]/records/` + `components/records/` 3 个组件 + `messages/{zh,en}.json` 的 `records` 命名空间）。
- 顺带修复了队友分支上两个**既有的构建阻断问题**：① `package-lock.json` 与 package.json 不同步（缺 `@swc/helpers`，已通过 npm install 重新生成并新增 `@types/three` devDep）；② `PixelBlast.tsx` 的 5 处类型错误（补显式类型标注，零行为变化）。修复前该分支 `npm run build` 无法通过。
- 溯源页目前使用 AdventureX 演示数据（PRD §29），真实数据接入点在 `components/records/demo-data.ts` 与 `provenance-journey.tsx` 顶部注释（指向 `GET /api/public-records/:id/verify`）。

### 7.4 建议合并顺序

1. 审阅并提交主工作区后端代码 → 合并 `task/w7-submit-keyfree-deps` 回本地 develop；
2. 审阅并提交 worktree 的溯源页与前端修复（`feature/records-explorer`）；
3. 做一次 develop 的前后端集成 merge（重点手工处理 package.json 双工程合一）；
4. push。或告诉我，我来执行任意一步。

## 8.5 全量后端交付后的补充事项（真链实测教训）⚠️

- **worker 每次部署必须重启**：worker 是常驻进程，代码更新不会自动生效——测试期间两次被旧代码坑（confirmer 加固未生效、mapProposal 修复未生效）。部署脚本里必须包含 worker 重启。
- **首次生产建库的迁移拆分**：`20260723162000_business_models` 含 `ALTER TYPE ADD VALUE`，Postgres 要求其与使用新枚举值的语句不在同一事务——对全新生产库需按迁移文件头部注释拆两步执行（本地已验证通过）。
- **双管理员审批的完整闭环需要 NextAuth**：现已实现「第二审批人必须是本社区 owner/manager 成员」校验 + 第一审批人凭证强制；但「第二人亲自登录确认」的双凭证语义需 UI 侧接好 NextAuth 后把 authorize 注入点接到真实 session（`lib/api/core/auth.ts`）。
- **CI 需要真实 Postgres 集成测试**：fake 与真实 schema 的脱节两次咬人（`ledgerSeq` 列缺失、Proposal Merkle 根列缺失），都只在真库/真链暴露。建议 CI 加 testcontainers 跑 `scripts/seed-demo.ts --reset` 作为集成门槛。
- **种子脚本用法**：`scripts/seed-demo.ts` 不带 `REDIS_URL` 运行（记录留 pending 由 reconciler 补交上链）；`--reset` 仅限演示库。
- **AI 端点已带限流与降级**：无 key 时返回结构化「AI 不可用」，不阻塞业务。

## 9. v0.7 协议执行升级（进行中）⚠️

方向：v0.6 的「平台钱包签一切」升级为 v0.7「合约强制执行 + EIP-712 成员/审批人签名 + YouFen 纯 Relayer」。合约接口 / EIP-712 / 数据模型 / API / 威胁模型的设计冻结正在跑（`docs/BLOCKCHAIN-DESIGN.md` 的 v0.7 重写待冻结结果落地），合约实现随后。**已决策：成员私钥客户端持有**（服务端拿不到私钥，这是「YouFen 不能替成员投票」为真的前提）。

前端已先行反映 v0.7 叙事（`components/records/rule-guardian.tsx`、存档卡授权行、可退出性与信任边界文案）。由此引入两条上线前必须处理的事项：

- **守门示例目前是教学型占位**：`RuleGuardian` 的四个「越权被拒」场景是文案示例，尚无真实链上 Revert 数据。v0.7 合约部署后，应接 `executeMint`/`castVoteBySig` 的真实 Revert（`MEMBER_EPOCH_CAP_EXCEEDED` / `ADVANCE_LIMIT_EXCEEDED` / `INVALID_MEMBER_SIGNATURE` 等）替换为真实 demo。
- **信任文案的「事实」前提尚未全部落地**：溯源页把「合约拒绝越权」「YouFen 不能替你投票」作为事实陈述——这些只有在 v0.7 合约 + 客户端持钥签名层上线后才字面为真。在 v0.7 上线前对外发布该页时，须保留 demo/占位标注（现有 `demoNote` 已具备），不得把公开信任文案当作已运行系统的字面承诺（PRD §12.2 纪律）。

## 8. 文档权威地图

| 文档 | 角色 |
|---|---|
| `docs/PRD.md` | 需求唯一权威（已含 Codex 修订 P1-P6） |
| `docs/ARCHITECTURE.md` | 全系统技术架构（已按 PRD 全量重写 + Codex 修订 A1-A6） |
| `docs/BLOCKCHAIN-DESIGN.md` | 区块链层实现权威（模块/合约/哈希/状态机/队列/API + Injective 事实核查） |
| `docs/HANDOFF.md` | 本文档：人工介入清单 |
