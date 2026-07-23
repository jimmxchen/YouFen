# 有份儿 YouFen.xyz

> 让每个参与者，在社区里真的有份儿。

社群运营神器。Tokenize社群治理权，使用区块链技术帮助社群运营者把成员的参与和贡献转化为"社群股份"，让成员可以共同参与社区决策、规则共创和重要投票。

## 🎯 项目概述

**版本**: v0.1 Hackathon MVP  
**赛道**: Injective Blockchain x AI / Build in Public  
**Demo 社区**: AdventureX Community

### 核心功能

- ✅ **无代码创建社群** - 填写信息，AI 自动生成参与规则
- ✅ **发言权系统** - 成员通过贡献获得发言权，用于社区决策
- ✅ **AI 辅助审核** - AI 识别贡献类型，建议发言权数值
- ✅ **加权投票** - 按发言权加权的社区投票系统
- ✅ **可信记录** - 关键决策通过 Injective 生成公开可信记录
- ✅ **移动端优先** - H5 网站，可在微信内打开

## 📚 文档

| 文档 | 说明 |
|-----|------|
| [PRD.md](docs/PRD.md) | 完整的产品需求文档 |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | 技术架构设计文档 |

## 🏗️ 技术栈

### 前端
- **框架**: Next.js 14 (App Router + React Server Components)
- **语言**: TypeScript 5+
- **样式**: Tailwind CSS + shadcn/ui
- **移动端**: PWA + 微信 JSSDK

### 后端
- **运行时**: Node.js 20+
- **API**: Next.js API Routes / tRPC
- **ORM**: Prisma
- **认证**: NextAuth.js

### 数据库
- **主数据库**: PostgreSQL 15+
- **缓存**: Redis 7+

### AI 集成
- **模型**: OpenAI GPT-4 / Claude 3
- 生成参与规则
- 识别贡献类型
- 生成社群报告

### 区块链
- **网络**: Injective Testnet
- **交互**: ethers.js / Injective SDK
- **钱包**: 后台托管钱包（用户无感）

## 🚀 快速开始

### 环境要求

- Node.js 20+
- pnpm 8+
- PostgreSQL 15+
- Redis 7+

### 安装依赖

```bash
pnpm install
```

### 环境变量

复制 `.env.example` 到 `.env` 并填写：

```env
# Database
DATABASE_URL=postgresql://...

# Redis
REDIS_URL=redis://...

# AI
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-...

# Blockchain
INJECTIVE_RPC_URL=https://...
INJECTIVE_CONTRACT_ADDRESS=0x...
BLOCKCHAIN_PRIVATE_KEY=0x...

# Auth
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
```

### 初始化数据库

```bash
pnpm prisma generate
pnpm prisma db push
pnpm prisma db seed
```

### 启动开发服务器

```bash
pnpm dev
```

访问 http://localhost:3000

## 📱 页面结构

```
有份儿 YouFen.xyz
├── 首页 (/)
├── 创建社群 (/create)
├── 社群后台 (/admin/:id) - 桌面端优先
│   ├── 概览
│   ├── 成员管理
│   ├── 贡献审核
│   ├── 议题管理
│   └── 可信记录
├── 成员页 (/dashboard/:id) - 移动端优先
├── 投票页 (/vote/:id) - 移动端优先
├── 公开社群页 (/community/:id)
└── Build in Public (/bip)
```

## 🎨 设计原则

| 原则 | 说明 |
|-----|------|
| **移动端优先** | 成员端体验优先移动设备 |
| **无感集成** | 区块链对用户透明，后台自动处理 |
| **AI 辅助** | AI 只建议，人工最终决策 |
| **渐进增强** | 基础功能无 JS 也能用 |

## 📊 Demo 数据

项目包含预设的 Demo 数据：
- 社群：AdventureX Community
- 25 名成员，总发言权 5,280
- 8 条贡献记录
- 2 个投票议题
- 4 条可信记录

## 🔐 安全性

- 发言权不可交易、不能提现
- 贡献需要运营者审核
- IP 地址记录防刷
- 后台托管钱包，用户无需连接钱包

## 📝 开发计划

- [x] Day 1-2: 基础搭建
- [ ] Day 3-4: 核心功能
- [ ] Day 5-6: 区块链集成
- [ ] Day 7: 优化和部署

## 🎯 MVP 成功标准

- ✅ 首页可访问
- ✅ 可创建社群 + AI 生成规则
- ✅ 可添加成员 + 发放发言权
- ✅ 可创建议题 + 完成投票
- ✅ 可生成至少 1 条 Injective 可信记录
- ✅ 可展示 Build in Public 页面
- ✅ 手机端体验完整

## 📄 许可证

MIT

---

**开发团队** | 2026 Hackathon  
**联系方式** | youfen@example.com
