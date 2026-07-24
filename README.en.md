# YouFen.io

> Let every participant genuinely have a stake in their community.

A no-code community co-governance platform that helps community operators convert member participation and contributions into "voice power," enabling members to collectively participate in community voting, rule co-creation, and important decision-making.

## 🎯 Project Overview

**Version**: v0.1 Hackathon MVP
**Track**: Injective Blockchain x AI / Build in Public
**Demo Community**: AdventureX Community

### Core Features

- ✅ **No-Code Community Creation** - Fill in the info, AI auto-generates participation rules
- ✅ **Voice Power System** - Members earn voice power through contributions for community decisions
- ✅ **AI-Assisted Review** - AI identifies contribution types, suggests voice power values
- ✅ **Weighted Voting** - Community voting weighted by voice power
- ✅ **Trusted Records** - Key decisions generate public trusted records via Injective
- ✅ **Mobile First** - H5 website, works inside WeChat

## 📚 Documentation

| Document | Description |
| -------- | ----------- |
| [PRD.md](docs/PRD.md) | Full Product Requirements Document (Chinese) |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Technical Architecture Design (Chinese) |
| [PRD.en.md](docs/PRD.en.md) | English translation of PRD (reference only) |
| [ARCHITECTURE.en.md](docs/ARCHITECTURE.en.md) | English translation of Architecture (reference only) |

## 🏗️ Tech Stack

### Frontend
- **Framework**: Next.js 14 (App Router + React Server Components)
- **Language**: TypeScript 5+
- **Styling**: Tailwind CSS + shadcn/ui
- **Mobile**: PWA + WeChat JSSDK

### Backend
- **Runtime**: Node.js 20+
- **API**: Next.js API Routes / tRPC
- **ORM**: Prisma
- **Auth**: NextAuth.js

### Database
- **Primary**: PostgreSQL 15+
- **Cache**: Redis 7+

### AI Integration
- **Models**: OpenAI GPT-4 / Claude 3
- Generate participation rules
- Identify contribution types
- Generate community reports

### Blockchain
- **Network**: Injective Testnet
- **Interaction**: ethers.js / Injective SDK
- **Wallet**: Backend managed wallet (user-transparent)

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+
- PostgreSQL 15+
- Redis 7+

### Install Dependencies

```bash
pnpm install
```

### Environment Variables

Copy `.env.example` to `.env` and fill in:

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

### Initialize Database

```bash
pnpm prisma generate
pnpm prisma db push
pnpm prisma db seed
```

### Start Dev Server

```bash
pnpm dev
```

Visit http://localhost:3000

## 📱 Page Structure

```
YouFen.io
├── Landing Page (/)
├── Create Community (/create)
├── Community Admin (/admin/:id) - Desktop First
│   ├── Dashboard
│   ├── Member Management
│   ├── Contribution Review
│   ├── Proposal Management
│   └── Trusted Records
├── Member Page (/dashboard/:id) - Mobile First
├── Vote Page (/vote/:id) - Mobile First
├── Public Community Page (/community/:id)
└── Build in Public (/bip)
```

## 🎨 Design Principles

| Principle | Description |
| --------- | ----------- |
| **Mobile First** | Member experience prioritized for mobile |
| **Seamless Integration** | Blockchain invisible to users, handled automatically in background |
| **AI Assisted** | AI only suggests; human makes the final decision |
| **Progressive Enhancement** | Basic functionality works without JS |

## 📊 Demo Data

The project includes preset demo data:
- Community: AdventureX Community
- 25 members, total voice power: 5,280
- 8 contribution records
- 2 voting proposals
- 4 trusted records

## 🔐 Security

- Voice power cannot be traded, withdrawn, or transferred
- Contributions require operator review
- IP tracking to prevent abuse
- Backend managed wallet; users don't need to connect a wallet

## 📝 Development Plan

- [x] Day 1-2: Foundation setup
- [ ] Day 3-4: Core features
- [ ] Day 5-6: Blockchain integration
- [ ] Day 7: Optimization and deployment

## 🎯 MVP Success Criteria

- ✅ Landing page accessible
- ✅ Communities can be created + AI generates rules
- ✅ Members can be added + voice power distributed
- ✅ Proposals can be created + voting completed
- ✅ At least 1 Injective trusted record generated
- ✅ Build in Public page displayed
- ✅ Mobile experience complete

## 📄 License

MIT

---

**Team** | 2026 Hackathon
**Contact** | youfen@example.com
