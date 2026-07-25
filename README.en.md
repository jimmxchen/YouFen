# YouFen

> Let every participant genuinely have a stake in their community.

A no-code community co-governance platform that converts member participation into Ownership power with on-chain governance for voting, rule co-creation, and decision-making.

## Status

**Live**: [www.youfen.app](https://www.youfen.app)
**Version**: v0.7
**Track**: Injective Blockchain × AI / Build in Public

## Core Features

- **No-Code Community Creation** — Fill in details, AI auto-generates contribution rules
- **Ownership System** — Contributions → Ownership → governance weight; monthly Epoch inflation budget + advance mechanism
- **AI-Assisted Review** — DeepSeek / Claude identify contribution types and suggest Ownership values
- **Weighted Voting** — Ownership-weighted + EIP-712 on-chain signatures + multi-sig approval
- **Task System** — Operators publish tasks, members submit evidence, auto-mint Ownership on approval
- **Activity System** — Create activities, member registration, check-in management
- **On-Chain Records** — All mint / reversal / epoch / proposal operations recorded as verifiable PublicRecords
- **Mobile First** — H5 website, works inside WeChat

## Documentation

| Document | Description |
| -------- | ----------- |
| [PRD.md](docs/PRD.md) | Product Requirements (Chinese) |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architecture Design (Chinese) |
| [PRD.en.md](docs/PRD.en.md) | PRD English |
| [ARCHITECTURE.en.md](docs/ARCHITECTURE.en.md) | Architecture English |

## Tech Stack

### Frontend
- **Framework**: Next.js 16 (App Router + Turbopack)
- **Language**: TypeScript 5+
- **Styling**: Tailwind CSS
- **i18n**: next-intl (zh/en)
- **Animation**: Framer Motion

### Backend
- **API**: Next.js API Routes (89 endpoints)
- **ORM**: Prisma + Drizzle ORM (dual-track)
- **Database**: Neon PostgreSQL (Serverless)
- **Queue**: BullMQ (on-chain confirmation worker)
- **Cron**: Vercel Cron (every-minute chain sync + submit + confirm)

### AI
- **Models**: DeepSeek / Claude
- Contribution analysis & rule suggestions
- Auto-matching contribution types

### Blockchain
- **Network**: Injective Testnet (chainId 1439)
- **Contracts**: YouFenGovernance v0.7 + YouFenRecords (Solidity)
- **SDK**: ethers.js v6
- **Signatures**: EIP-712 typed data (approver multi-sig)
- **Wallet**: Backend-managed (transparent to users)
- **Design**: Non-token economy — Ownership is non-tradable, non-transferable

## Quick Start

### Prerequisites

- Node.js 20+
- npm 9+

### Install

```bash
npm install
cp .env.example .env  # edit with your values
```

### Environment Variables

```env
# Database (Neon PostgreSQL)
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# Blockchain
INJECTIVE_RPC_URL=https://k8s.testnet.json-rpc.injective.network/
CHAIN_ID=1439
CONTRACT_ADDRESS=0x...
CONTRACT_DEPLOY_BLOCK=...
BLOCKCHAIN_PRIVATE_KEY=0x...

# Internal API
CRON_SECRET=...
INTERNAL_API_TOKEN=...
RECORD_HASH_PEPPER=...

# AI
ANTHROPIC_API_KEY=sk-...
DEEPSEEK_API_KEY=sk-...

# Auth
JWT_SECRET=...
```

### Init Database

```bash
npx prisma generate
npx prisma db push
npx tsx db/seed.ts
```

### Start

```bash
npm run dev
```

Visit http://localhost:3000

### Deploy Contracts

```bash
npx hardhat compile
npx hardhat run scripts/deploy-contract.ts --network injectiveTestnet
npx hardhat run scripts/deploy-governance.ts --network injectiveTestnet
npx tsx scripts/seed-governance-community.ts
```

## Page Structure

```
YouFen
├── Landing (/)
├── Feature Pages
│   ├── AI Review (/features/ai)
│   ├── Ownership (/features/voting-power)
│   ├── Contributions (/features/contribution)
│   └── Voting (/features/voting)
├── Admin (/admin) — Desktop
│   ├── Dashboard
│   ├── Management (Polls / Activities / Tasks)
│   ├── Members
│   ├── Contribution Review
│   ├── Proposals
│   ├── AI Chat
│   └── Records
├── Member (/member/[communityId]) — Mobile First
│   ├── Home
│   ├── Voting
│   ├── Contribute
│   ├── Tasks
│   ├── Activities
│   ├── Chat
│   ├── On-Chain Records
│   ├── Public Page
│   └── Profile
├── Public Community (/communities/[slug])
├── Record Verification (/records)
└── Docs (/docs)
```

## Known Issues

### Injective Testnet RPC

The public RPC (`k8s.testnet.json-rpc.injective.network`) may return null indefinitely for `eth_getTransactionReceipt` even after transactions are mined. The project handles this via:
- Event indexing via `getLogs` (unaffected)
- Confirmer null-receipt fast path: after 5 consecutive nulls, reads `recordExists()` directly from the contract

## Demo Data

- Community: AdventureX Community
- 25 members
- Initial supply: 100,000 Ownership
- Monthly inflation: 5%, max advance: 25%, per-member cap: 10%

## License

MIT

---

**YouFen Team** | 2026
