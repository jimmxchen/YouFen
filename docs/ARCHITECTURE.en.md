# YouFen.io- Technical Architecture Design

**Version**: v0.1 Hackathon MVP
**Last Updated**: 2026-07-23
**Document Status**: Architecture Design Phase

---

## 1. Overall Architecture Overview

### 1.1 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        User Layer                            │
├──────────────────┬──────────────────┬───────────────────────┤
│   Mobile Browser  │   Desktop Browser │   PWA (P2)           │
│   (Member-first)  │   (Ops-first)     │                      │
└──────────────────┴──────────────────┴───────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Application Layer                │
│                Next.js 14 (App Router)                       │
│            React 18 + TypeScript + Tailwind CSS             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      API Gateway Layer                       │
│                Next.js API Routes / tRPC                     │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  Business     │   │  AI Service   │   │  Blockchain   │
│  Logic Layer  │   │  Layer        │   │  Layer        │
│  Node.js      │   │  OpenAI API   │   │  Injective    │
│  Prisma ORM   │   │  Claude API   │   │  Testnet      │
└──────────────┘   └──────────────┘   └──────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data Persistence Layer                    │
│            PostgreSQL (Primary Database)                     │
│            Redis (Cache + Sessions)                          │
└─────────────────────────────────────────────────────────────┘
```



### 1.2 Core Design Principles


| Principle                   | Description                              | Implementation                                   |
| --------------------------- | ---------------------------------------- | ------------------------------------------------ |
| **Mobile First**            | Member experience prioritized for mobile | Responsive design + mobile gesture optimization  |
| **Progressive Enhancement** | Basic functionality works without JS     | Server-Side Rendering                            |
| **Seamless Integration**    | Blockchain invisible to users            | Automatic on-chain record handling in background |
| **AI Assisted**             | AI does not make decisions autonomously  | All AI suggestions require human confirmation    |
| **Fast Iteration**          | Hackathon MVP launched quickly           | Monorepo + Vercel deployment                     |




### 1.3 Tech Stack Selection

**Frontend Tech Stack**:

- **Framework**: Next.js 14 (App Router + React Server Components)
- **Language**: TypeScript 5+
- **Styling**: Tailwind CSS + shadcn/ui
- **State Management**: React Server Components + URL State
- **Forms**: React Hook Form + Zod
- **Charts**: Recharts
- **Mobile**: Responsive design + PWA (P2)

**Backend Tech Stack**:

- **Runtime**: Node.js 20+
- **API**: Next.js API Routes / tRPC
- **ORM**: Prisma
- **Auth**: NextAuth.js
- **File Storage**: Vercel Blob / AWS S3

**Database**:

- **Primary**: PostgreSQL 15+
- **Cache**: Redis 7+
- **Search**: PostgreSQL Full-Text Search

**AI Integration**:

- **Models**: OpenAI GPT-4 / Claude 3
- **SDK**: OpenAI SDK / Anthropic SDK

**Blockchain Integration**:

- **Network**: Injective Testnet
- **Interaction**: ethers.js / Injective SDK
- **Wallet**: Backend managed wallet (user-transparent)

**Development Tools**:

- **Package Manager**: pnpm
- **Linting**: ESLint + Prettier
- **Testing**: Vitest + Playwright
- **CI/CD**: GitHub Actions
- **Deployment**: Vercel

---



## 2. Frontend Architecture Design



### 2.1 Responsive Design Strategy

**Breakpoint Design**:

```css
/* Mobile first */
mobile: 320px - 767px    (Member primary experience)
tablet: 768px - 1023px   (Transition experience)
desktop: 1024px+         (Ops primary experience)
```

**Page Adaptation Strategy**:


| Page             | Mobile           | Desktop          | Design Focus             |
| ---------------- | ---------------- | ---------------- | ------------------------ |
| Landing          | Single column    | Two columns      | Mobile CTA prominent     |
| Create Community | Step form        | Single-page form | Desktop efficiency-first |
| Community Admin  | Simplified view  | Full view        | Desktop data-dense       |
| Member Page      | Card layout      | Card + sidebar   | Mobile gesture-friendly  |
| Vote Page        | Full-screen card | Centered card    | Mobile one-tap voting    |




### 2.2 Project Structure

```
youfen-web/
├── app/                      # Next.js App Router
│   ├── (landing)/            # Public page group
│   │   ├── page.tsx          # Landing page
│   │   ├── community/        # Public community pages
│   │   └── bip/              # Build in Public
│   ├── (auth)/               # Authenticated page group
│   │   ├── create/           # Create community
│   │   ├── dashboard/        # Member page
│   │   └── admin/            # Community admin
│   ├── api/                  # API Routes
│   └── layout.tsx            # Root layout
├── components/               # React components
│   ├── ui/                   # shadcn/ui base components
│   ├── features/             # Feature components
│   │   ├── community/        # Community-related
│   │   ├── contribution/     # Contribution-related
│   │   ├── proposal/         # Proposal-related
│   │   └── vote/             # Vote-related
│   └── layout/               # Layout components
├── lib/                      # Utility libraries
│   ├── prisma.ts             # Prisma client
│   ├── ai/                   # AI integration
│   ├── blockchain/           # Blockchain integration
│   └── utils/                # General utilities
├── hooks/                    # React Hooks
├── types/                    # TypeScript types
├── public/                   # Static assets
└── prisma/                   # Prisma config
    ├── schema.prisma         # Database models
    └── seed.ts               # Seed data
```



### 2.3 Core Component Design

**1. VoicePowerBadge Component**

```typescript
// components/features/voice-power-badge.tsx
interface VoicePowerBadgeProps {
  value: number
  size?: 'sm' | 'md' | 'lg'
  showTrend?: boolean
  trend?: number
}

export function VoicePowerBadge({
  value,
  size = 'md',
  showTrend = false,
  trend = 0
}: VoicePowerBadgeProps) {
  return (
    <div className={cn(
      "inline-flex items-center gap-2 rounded-full",
      "bg-gradient-to-r from-purple-500 to-pink-500",
      size === 'sm' && "px-2 py-1 text-xs",
      size === 'md' && "px-3 py-1.5 text-sm",
      size === 'lg' && "px-4 py-2 text-base"
    )}>
      <VoiceIcon className="w-4 h-4" />
      <span className="font-semibold">{value}</span>
      <span className="text-xs opacity-90">Voice Power</span>
      {showTrend && trend !== 0 && (
        <span className={cn(
          "text-xs",
          trend > 0 ? "text-green-200" : "text-red-200"
        )}>
          {trend > 0 ? `+${trend}` : trend}
        </span>
      )}
    </div>
  )
}
```

**2. ProposalCard Component**

```typescript
// components/features/proposal/proposal-card.tsx
interface ProposalCardProps {
  proposal: Proposal
  userVP: number
  hasVoted: boolean
  isMobile?: boolean
}

export function ProposalCard({
  proposal,
  userVP,
  hasVoted,
  isMobile = false
}: ProposalCardProps) {
  return (
    <Card className={cn(
      "overflow-hidden",
      isMobile ? "w-full" : "max-w-2xl mx-auto"
    )}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>{proposal.title}</CardTitle>
            <CardDescription>
              Deadline: {formatDate(proposal.endTime)}
            </CardDescription>
          </div>
          {proposal.status === 'active' && (
            <Badge variant="success">Active</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* AI Summary */}
        {proposal.summary && (
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm">{proposal.summary}</p>
          </div>
        )}

        {/* Voting Options */}
        <RadioGroup>
          {proposal.options.map(option => (
            <ProposalOption
              key={option.id}
              option={option}
              totalVotes={proposal.totalVotes}
              disabled={hasVoted}
            />
          ))}
        </RadioGroup>

        {/* Vote Info */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Your voice power: {userVP}</span>
          <span>Voted: {proposal.voterCount}/{proposal.totalMembers}</span>
        </div>
      </CardContent>

      <CardFooter>
        <Button
          className="w-full"
          size={isMobile ? "lg" : "default"}
          disabled={hasVoted}
        >
          {hasVoted ? "Voted" : "Confirm Vote"}
        </Button>
      </CardFooter>
    </Card>
  )
}
```



### 2.4 Mobile Optimization

**Gesture Support**:

```typescript
// Using use-gesture for swipe actions
import { useGesture } from '@use-gesture/react'

function ContributionList() {
  const bind = useGesture({
    onSwipeLeft: (state) => {
      // Swipe left shows action buttons (approve/reject)
    },
    onSwipeRight: (state) => {
      // Swipe right to go back
    }
  })

  return <div {...bind()}>...</div>
}
```

**Touch Optimization**:

- Minimum button size: 44x44px
- Card spacing: 16px
- Bottom nav bar height: 56px
- Avoid hover effects, use active states

**Performance Optimization**:

```typescript
// Image lazy loading
import Image from 'next/image'

<Image
  src="/avatar.jpg"
  loading="lazy"
  placeholder="blur"
/>

// Route prefetching
import Link from 'next/link'

<Link href="/vote" prefetch={true}>
  Go Vote
</Link>
```

**Share Card Optimization**:

- Title: Within 25 characters
- Description: Within 40 characters
- Image: 200x200px, under 32KB
- Link: Supports direct open

---



## 3. Backend Architecture Design



### 3.1 API Design Pattern

**Selected Approach**: Next.js API Routes + tRPC

**Why tRPC**:

- End-to-end type safety
- No manual API documentation
- Auto type inference
- Suitable for Monorepo

**API Structure**:

```typescript
// app/api/trpc/[trpc]/route.ts
import { appRouter } from '@/server/routers/_app'
import { createContext } from '@/server/context'

export const { GET, POST } = createNextApiHandler({
  router: appRouter,
  createContext,
})

// server/routers/_app.ts
export const appRouter = router({
  community: communityRouter,
  member: memberRouter,
  contribution: contributionRouter,
  proposal: proposalRouter,
  vote: voteRouter,
  record: recordRouter,
  ai: aiRouter,
})

export type AppRouter = typeof appRouter
```



### 3.2 Business Logic Layer

**Community Router**:

```typescript
// server/routers/community.ts
import { router, publicProcedure, protectedProcedure } from '../trpc'
import { z } from 'zod'

export const communityRouter = router({
  // Create community
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(30),
      type: z.enum(['hackathon', 'book_club', 'campus_club', 'creator', 'open_source', 'volunteer', 'custom']),
      description: z.string(),
      goal: z.string(),
      size: z.string(),
      isPublic: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      // 1. Create community
      const community = await ctx.prisma.community.create({
        data: {
          ...input,
          ownerId: ctx.session.user.id,
        },
      })

      // 2. AI generates default rules
      const rules = await ctx.ai.generateRules({
        type: input.type,
        goal: input.goal,
      })

      // 3. Save rules
      await ctx.prisma.community.update({
        where: { id: community.id },
        data: { rules },
      })

      // 4. Auto-add creator as member
      await ctx.prisma.member.create({
        data: {
          communityId: community.id,
          userId: ctx.session.user.id,
          role: 'OWNER',
          voicePower: 0,
        },
      })

      return community
    }),

  // Get community details
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const community = await ctx.prisma.community.findUnique({
        where: { id: input.id },
        include: {
          members: true,
          proposals: {
            where: { status: 'ACTIVE' },
          },
          _count: {
            select: {
              members: true,
              contributions: true,
              publicRecords: true,
            },
          },
        },
      })

      if (!community) {
        throw new Error('Community not found')
      }

      if (!community.isPublic && !ctx.session) {
        throw new Error('Unauthorized')
      }

      return community
    }),

  // Update rules
  updateRules: protectedProcedure
    .input(z.object({
      communityId: z.string(),
      rules: z.array(z.object({
        name: z.string(),
        description: z.string(),
        voicePower: z.number(),
        category: z.string(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      // 1. Verify permissions
      await ctx.requireRole(input.communityId, ['OWNER'])

      // 2. Update rules
      const community = await ctx.prisma.community.update({
        where: { id: input.communityId },
        data: { rules: input.rules },
      })

      // 3. Generate rule version record
      await ctx.blockchain.recordRuleVersion(input.communityId, input.rules)

      return community
    }),
})
```

**Contribution Router**:

```typescript
// server/routers/contribution.ts
export const contributionRouter = router({
  // Submit contribution
  submit: protectedProcedure
    .input(z.object({
      communityId: z.string(),
      memberId: z.string(),
      description: z.string(),
      evidence: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // 1. Get community rules
      const community = await ctx.prisma.community.findUnique({
        where: { id: input.communityId },
      })

      // 2. AI analyze contribution
      const aiAnalysis = await ctx.ai.analyzeContribution({
        description: input.description,
        rules: community.rules,
      })

      // 3. Create contribution record
      const contribution = await ctx.prisma.contribution.create({
        data: {
          communityId: input.communityId,
          memberId: input.memberId,
          description: input.description,
          type: aiAnalysis.type,
          suggestedVP: aiAnalysis.suggestedVP,
          aiReason: aiAnalysis.reason,
          evidence: input.evidence,
          status: 'PENDING',
          submittedBy: ctx.session.user.id,
        },
      })

      return contribution
    }),

  // Review contribution
  review: protectedProcedure
    .input(z.object({
      contributionId: z.string(),
      action: z.enum(['APPROVE', 'REJECT']),
      approvedVP: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // 1. Get contribution
      const contribution = await ctx.prisma.contribution.findUnique({
        where: { id: input.contributionId },
      })

      // 2. Verify permissions
      await ctx.requireRole(contribution.communityId, ['OWNER', 'MANAGER'])

      // 3. Update contribution status
      const updated = await ctx.prisma.contribution.update({
        where: { id: input.contributionId },
        data: {
          status: input.action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          approvedVP: input.action === 'APPROVE'
            ? (input.approvedVP ?? contribution.suggestedVP)
            : null,
          reviewedBy: ctx.session.user.id,
          reviewedAt: new Date(),
        },
      })

      // 4. If approved, update member voice power
      if (input.action === 'APPROVE') {
        await ctx.prisma.member.update({
          where: { id: contribution.memberId },
          data: {
            voicePower: {
              increment: updated.approvedVP,
            },
            contributionCount: {
              increment: 1,
            },
          },
        })
      }

      return updated
    }),
})
```



### 3.3 Authentication and Authorization

**Using NextAuth.js**:

```typescript
// app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { prisma } from '@/lib/prisma'

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    // Email login
    CredentialsProvider({
      name: 'Email',
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        // Verification logic
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        })

        if (user && await verifyPassword(credentials.password, user.password)) {
          return user
        }
        return null
      }
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      session.user.id = token.sub
      return session
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
```

**Permission Check Middleware**:

```typescript
// server/middleware/auth.ts
export async function requireRole(
  communityId: string,
  roles: MemberRole[],
  userId: string
) {
  const member = await prisma.member.findFirst({
    where: {
      communityId,
      userId,
      role: { in: roles },
    },
  })

  if (!member) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You do not have permission to perform this action',
    })
  }

  return member
}
```

---



## 4. Database Design



### 4.1 Prisma Schema

```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// User
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  password      String
  avatar        String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  ownedCommunities Community[]
  members          Member[]
  contributions    Contribution[] @relation("SubmittedBy")
  votes            Vote[]
}

// Community
model Community {
  id              String    @id @default(cuid())
  name            String
  type            String
  description     String
  goal            String
  size            String
  rules           Json      // Participation rules array
  isPublic        Boolean   @default(true)
  chainRecordHash String?
  ownerId         String
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  owner           User              @relation(fields: [ownerId], references: [id])
  members         Member[]
  contributions   Contribution[]
  proposals       Proposal[]
  publicRecords   PublicRecord[]

  @@index([ownerId])
}

// Member
model Member {
  id                String    @id @default(cuid())
  communityId       String
  userId            String
  role              MemberRole @default(MEMBER)
  voicePower        Int       @default(0)
  contributionCount Int       @default(0)
  tags              String[]
  joinedAt          DateTime  @default(now())
  lastActiveAt      DateTime  @default(now())

  community         Community      @relation(fields: [communityId], references: [id], onDelete: Cascade)
  user              User           @relation(fields: [userId], references: [id])
  contributions     Contribution[]
  votes             Vote[]

  @@unique([communityId, userId])
  @@index([communityId])
  @@index([userId])
}

enum MemberRole {
  OWNER
  MANAGER
  MEMBER
}

// Contribution
model Contribution {
  id            String              @id @default(cuid())
  communityId   String
  memberId      String
  description   String
  type          String?
  suggestedVP   Int
  approvedVP    Int?
  status        ContributionStatus  @default(PENDING)
  aiReason      String?
  evidence      String[]
  submittedBy   String
  reviewedBy    String?
  createdAt     DateTime            @default(now())
  reviewedAt    DateTime?

  community     Community           @relation(fields: [communityId], references: [id], onDelete: Cascade)
  member        Member              @relation(fields: [memberId], references: [id])
  submitter     User                @relation("SubmittedBy", fields: [submittedBy], references: [id])

  @@index([communityId])
  @@index([memberId])
  @@index([status])
}

enum ContributionStatus {
  PENDING
  APPROVED
  REJECTED
}

// Proposal
model Proposal {
  id            String          @id @default(cuid())
  communityId   String
  title         String
  description   String
  summary       String?
  options       Json            // Voting options array
  status        ProposalStatus  @default(DRAFT)
  voteType      VoteType        @default(WEIGHTED)
  startTime     DateTime
  endTime       DateTime
  createdBy     String
  resultHash    String?
  chainTxHash   String?
  createdAt     DateTime        @default(now())

  community     Community       @relation(fields: [communityId], references: [id], onDelete: Cascade)
  votes         Vote[]

  @@index([communityId])
  @@index([status])
}

enum ProposalStatus {
  DRAFT
  ACTIVE
  ENDED
  RECORDED
}

enum VoteType {
  WEIGHTED
  ONE_PERSON_ONE_VOTE
}

// Vote
model Vote {
  id              String    @id @default(cuid())
  proposalId      String
  memberId        String
  optionId        String
  voicePowerUsed  Int
  comment         String?
  isAnonymous     Boolean   @default(false)
  ipAddress       String?
  createdAt       DateTime  @default(now())

  proposal        Proposal  @relation(fields: [proposalId], references: [id], onDelete: Cascade)
  member          Member    @relation(fields: [memberId], references: [id])
  voter           User      @relation(fields: [memberId], references: [id])

  @@unique([proposalId, memberId])
  @@index([proposalId])
  @@index([memberId])
}

// PublicRecord (Trusted Record)
model PublicRecord {
  id            String        @id @default(cuid())
  communityId   String
  type          RecordType
  hash          String
  txHash        String?
  network       String        @default("injective-testnet")
  status        RecordStatus  @default(PENDING)
  data          Json
  createdBy     String
  createdAt     DateTime      @default(now())
  recordedAt    DateTime?

  community     Community     @relation(fields: [communityId], references: [id], onDelete: Cascade)

  @@index([communityId])
  @@index([type])
  @@index([status])
}

enum RecordType {
  COMMUNITY
  RULE
  VP_BATCH
  PROPOSAL
  VOTE_RESULT
}

enum RecordStatus {
  PENDING
  RECORDING
  RECORDED
  FAILED
}
```



### 4.2 Database Index Optimization

**Key Query Optimizations**:

```sql
-- Community member list (sorted by voice power)
CREATE INDEX idx_member_community_vp ON "Member"(community_id, voice_power DESC);

-- Pending contribution list
CREATE INDEX idx_contribution_status_created ON "Contribution"(community_id, status, created_at DESC);

-- Active votes
CREATE INDEX idx_proposal_status_end ON "Proposal"(community_id, status, end_time);

-- Trusted record queries
CREATE INDEX idx_record_community_type ON "PublicRecord"(community_id, type, created_at DESC);
```



### 4.3 Cache Strategy

**Redis Cache Design**:

```typescript
// lib/cache.ts
import { Redis } from 'ioredis'

const redis = new Redis(process.env.REDIS_URL)

// Cache key design
const CACHE_KEYS = {
  community: (id: string) => `community:${id}`,
  memberList: (communityId: string) => `members:${communityId}`,
  proposalVotes: (proposalId: string) => `votes:${proposalId}`,
  userSession: (userId: string) => `session:${userId}`,
}

// Cache TTL (seconds)
const CACHE_TTL = {
  community: 300,      // 5 minutes
  memberList: 60,      // 1 minute
  proposalVotes: 10,   // 10 seconds (high real-time requirement)
  userSession: 3600,   // 1 hour
}

// Community data caching
export async function getCommunityCache(id: string) {
  const cached = await redis.get(CACHE_KEYS.community(id))
  if (cached) return JSON.parse(cached)
  return null
}

export async function setCommunityCache(id: string, data: any) {
  await redis.setex(
    CACHE_KEYS.community(id),
    CACHE_TTL.community,
    JSON.stringify(data)
  )
}

// Vote real-time counting (using Redis Hash)
export async function incrementVoteCount(proposalId: string, optionId: string, vp: number) {
  const key = CACHE_KEYS.proposalVotes(proposalId)
  await redis.hincrby(key, optionId, vp)
  await redis.expire(key, CACHE_TTL.proposalVotes)
}
```

---



## 5. AI Integration Plan



### 5.1 AI Service Wrapper

```typescript
// lib/ai/index.ts
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export class AIService {
  // Generate participation rules
  async generateRules(input: {
    type: string
    goal: string
  }): Promise<Rule[]> {
    const prompt = `
You are a community operations expert. Please generate reasonable participation rules for the following community.

Community Type: ${input.type}
Community Goal: ${input.goal}

Please generate 5-7 participation rules, each containing:
- name: Rule name (concise, within 10 characters)
- description: Rule description
- voicePower: Suggested voice power value (10-300)
- category: Rule category

Return in JSON array format.
`

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    })

    const result = JSON.parse(response.choices[0].message.content)
    return result.rules
  }

  // Analyze contribution
  async analyzeContribution(input: {
    description: string
    rules: Rule[]
  }): Promise<{
    type: string
    suggestedVP: number
    reason: string
  }> {
    const prompt = `
You are a community contribution evaluation expert. Please analyze the following contribution and provide recommendations.

Contribution Description: ${input.description}

Community Rules:
${input.rules.map(r => `- ${r.name}: ${r.voicePower} voice power`).join('\n')}

Please analyze:
1. Which rule does this contribution best match?
2. How much voice power should be awarded?
3. What is the reason?

Return in JSON format:
{
  "type": "Matched rule name",
  "suggestedVP": value,
  "reason": "Reason description"
}
`

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const result = JSON.parse(response.content[0].text)
    return result
  }

  // Generate community report
  async generateReport(input: {
    community: Community
    members: Member[]
    contributions: Contribution[]
    proposals: Proposal[]
  }): Promise<string> {
    const prompt = `
Generate a community operations report.

Community Info:
- Name: ${input.community.name}
- Members: ${input.members.length}
- Total Voice Power: ${input.members.reduce((sum, m) => sum + m.voicePower, 0)}

This Week's Data:
- New Contributions: ${input.contributions.length}
- Active Votes: ${input.proposals.filter(p => p.status === 'ACTIVE').length}

Please generate a report with:
1. Community Overview
2. Top 5 Core Contributors
3. Participation Trend Analysis
4. Operations Recommendations

Use Markdown format.
`

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
    })

    return response.choices[0].message.content
  }
}

export const ai = new AIService()
```



### 5.2 AI Call Rate Limiting

```typescript
// lib/ai/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN,
})

// Max 20 AI calls per user per hour
export const aiRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 h'),
  analytics: true,
})

// Usage example
export async function rateLimitedAICall(userId: string, fn: () => Promise<any>) {
  const { success, remaining } = await aiRateLimit.limit(userId)

  if (!success) {
    throw new Error('AI call limit reached, please try again later')
  }

  return fn()
}
```

---



## 6. Injective Blockchain Integration



### 6.1 Smart Contract Deployment

```solidity
// contracts/YouFenRecords.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract YouFenRecords {
    struct Record {
        bytes32 dataHash;
        uint256 timestamp;
        string recordType;
        string communityId;
        bool exists;
    }

    mapping(bytes32 => Record) public records;
    address public owner;

    event RecordCreated(
        bytes32 indexed recordHash,
        string recordType,
        string communityId,
        uint256 timestamp
    );

    constructor() {
        owner = msg.sender;
    }

    function createRecord(
        bytes32 dataHash,
        string memory recordType,
        string memory communityId
    ) external {
        require(msg.sender == owner, "Only owner can create records");
        require(!records[dataHash].exists, "Record already exists");

        records[dataHash] = Record({
            dataHash: dataHash,
            timestamp: block.timestamp,
            recordType: recordType,
            communityId: communityId,
            exists: true
        });

        emit RecordCreated(dataHash, recordType, communityId, block.timestamp);
    }

    function verifyRecord(bytes32 dataHash)
        external
        view
        returns (bool exists, Record memory record)
    {
        Record memory r = records[dataHash];
        return (r.exists, r);
    }
}
```



### 6.2 Blockchain Service Wrapper

```typescript
// lib/blockchain/injective.ts
import { ethers } from 'ethers'

const CONTRACT_ADDRESS = process.env.INJECTIVE_CONTRACT_ADDRESS
const CONTRACT_ABI = [...] // Contract ABI

export class InjectiveService {
  private provider: ethers.providers.JsonRpcProvider
  private wallet: ethers.Wallet
  private contract: ethers.Contract

  constructor() {
    // Connect to Injective Testnet
    this.provider = new ethers.providers.JsonRpcProvider(
      process.env.INJECTIVE_RPC_URL
    )

    // Backend managed wallet (user-transparent)
    this.wallet = new ethers.Wallet(
      process.env.BLOCKCHAIN_PRIVATE_KEY,
      this.provider
    )

    this.contract = new ethers.Contract(
      CONTRACT_ADDRESS,
      CONTRACT_ABI,
      this.wallet
    )
  }

  // Calculate data hash
  private calculateHash(data: any): string {
    return ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(JSON.stringify(data))
    )
  }

  // Record vote result
  async recordVoteResult(proposalId: string, voteData: any): Promise<string> {
    try {
      const dataHash = this.calculateHash(voteData)

      const tx = await this.contract.createRecord(
        dataHash,
        'vote_result',
        voteData.communityId
      )

      const receipt = await tx.wait()

      return receipt.transactionHash
    } catch (error) {
      console.error('Failed to record on Injective:', error)
      throw error
    }
  }

  // Verify record
  async verifyRecord(dataHash: string): Promise<{
    exists: boolean
    record?: any
  }> {
    const [exists, record] = await this.contract.verifyRecord(dataHash)
    return { exists, record: exists ? record : null }
  }

  // Get transaction details
  async getTransaction(txHash: string) {
    return this.provider.getTransaction(txHash)
  }
}

export const injective = new InjectiveService()
```



### 6.3 Async On-Chain Queue

```typescript
// lib/blockchain/queue.ts
import Bull from 'bull'

export const blockchainQueue = new Bull('blockchain-records', {
  redis: process.env.REDIS_URL,
})

// Process on-chain tasks
blockchainQueue.process(async (job) => {
  const { recordId, type, data } = job.data

  try {
    // Update status to "recording"
    await prisma.publicRecord.update({
      where: { id: recordId },
      data: { status: 'RECORDING' },
    })

    // Execute on-chain recording
    let txHash: string
    switch (type) {
      case 'vote_result':
        txHash = await injective.recordVoteResult(data.proposalId, data)
        break
      // Other types...
    }

    // Update status to "recorded"
    await prisma.publicRecord.update({
      where: { id: recordId },
      data: {
        status: 'RECORDED',
        txHash,
        recordedAt: new Date(),
      },
    })

    return { success: true, txHash }
  } catch (error) {
    // Mark as failed
    await prisma.publicRecord.update({
      where: { id: recordId },
      data: { status: 'FAILED' },
    })

    throw error
  }
})

// Add on-chain task
export async function queueBlockchainRecord(
  recordId: string,
  type: string,
  data: any
) {
  await blockchainQueue.add({
    recordId,
    type,
    data,
  }, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  })
}
```

---



## 7. Deployment Architecture



### 7.1 Vercel Deployment

**Production**:

```json
// vercel.json
{
  "buildCommand": "pnpm build",
  "devCommand": "pnpm dev",
  "installCommand": "pnpm install",
  "framework": "nextjs",
  "regions": ["hkg1", "sin1"],
  "env": {
    "DATABASE_URL": "@database-url",
    "REDIS_URL": "@redis-url",
    "OPENAI_API_KEY": "@openai-key",
    "INJECTIVE_CONTRACT_ADDRESS": "@contract-address"
  }
}
```

**Environment Variables**:

- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `OPENAI_API_KEY`: OpenAI API key
- `ANTHROPIC_API_KEY`: Claude API key
- `INJECTIVE_RPC_URL`: Injective RPC endpoint
- `INJECTIVE_CONTRACT_ADDRESS`: Contract address
- `BLOCKCHAIN_PRIVATE_KEY`: Backend wallet private key
- `NEXTAUTH_SECRET`: NextAuth secret
- `NEXTAUTH_URL`: Site URL



### 7.2 Database Deployment

**Using Vercel Postgres / Supabase**:

- Automatic backups
- Connection pool optimization
- SSL connections



### 7.3 CDN and Asset Optimization

- Static assets automatically distributed via CDN
- Image auto-optimization (Next.js Image)
- Gzip/Brotli compression

---



## 8. Development Plan



### 8.1 Day 1-2: Foundation Setup

**Tasks**:

- [x] Initialize Next.js project
- [ ] Configure Prisma + PostgreSQL
- [ ] Deploy Injective testnet contract
- [ ] Integrate AI SDK
- [ ] Set up base UI component library



### 8.2 Day 3-4: Core Features

**Tasks**:

- [ ] Implement community creation flow
- [ ] Implement AI rule generation
- [ ] Implement member management
- [ ] Implement contribution review (with AI)
- [ ] Implement voting functionality



### 8.3 Day 5-6: Blockchain Integration

**Tasks**:

- [ ] Implement vote result on-chain recording
- [ ] Implement trusted record display
- [ ] Test complete flow
- [ ] Prepare demo data



### 8.4 Day 7: Optimization and Deployment

**Tasks**:

- [ ] Mobile adaptation optimization
- [ ] Performance optimization
- [ ] Build in Public page
- [ ] Deploy to production
- [ ] Prepare demo materials

---



## 9. Technical Risks and Mitigations


| Risk                                    | Impact                    | Mitigation                                              |
| --------------------------------------- | ------------------------- | ------------------------------------------------------- |
| **AI call timeout**                     | Poor UX                   | Set 10s timeout, fail gracefully to default rules       |
| **Blockchain on-chain failure**         | Missing trusted records   | Async queue retry; failure doesn't affect main flow     |
| **Database connection pool exhaustion** | Service unavailable       | Use Prisma connection pool, set reasonable timeouts     |
| **Cross-browser compatibility**         | Some features unavailable | Progressive enhancement; basic functionality guaranteed |


---

**Document Completed**: 2026-07-23
**Next Step**: Begin implementation