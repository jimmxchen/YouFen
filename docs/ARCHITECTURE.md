# 有份 YouFen - 技术架构设计

**版本**: v0.1 Hackathon MVP  
**更新日期**: 2026-07-23  
**文档状态**: 架构设计阶段

---

## 1. 整体架构概述

### 1.1 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        用户层                                  │
├──────────────────┬──────────────────┬───────────────────────┤
│   移动端浏览器    │   桌面端浏览器    │   PWA (P2)              │
│  (成员端优先)      │  (运营端优先)      │                       │
└──────────────────┴──────────────────┴───────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     前端应用层                                 │
│                  Next.js 14 (App Router)                      │
│              React 18 + TypeScript + Tailwind CSS            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      API 网关层                                │
│                  Next.js API Routes / tRPC                    │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│   业务逻辑层   │   │   AI 服务层   │   │  区块链层     │
│   Node.js     │   │   OpenAI API  │   │  Injective   │
│   Prisma ORM  │   │   Claude API  │   │   Testnet    │
└──────────────┘   └──────────────┘   └──────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│                      数据持久层                                 │
│              PostgreSQL (主数据库)                             │
│              Redis (缓存 + 会话)                               │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 核心设计原则

| 原则 | 说明 | 实现方式 |
|-----|------|---------|
| **移动端优先** | 成员端体验优先移动设备 | 响应式设计 + 移动端手势优化 |
| **渐进增强** | 基础功能无 JS 也能用 | Server-Side Rendering |
| **无感集成** | 区块链对用户透明 | 后台自动处理链上记录 |
| **AI 辅助** | AI 不自动决策 | 所有 AI 建议需人工确认 |
| **快速迭代** | Hackathon MVP 快速上线 | Monorepo + Vercel 部署 |

### 1.3 技术栈选择

**前端技术栈**：
- **框架**: Next.js 14 (App Router + React Server Components)
- **语言**: TypeScript 5+
- **样式**: Tailwind CSS + shadcn/ui
- **状态管理**: React Server Components + URL State
- **表单**: React Hook Form + Zod
- **图表**: Recharts
- **移动端**: 响应式设计 + PWA (P2)

**后端技术栈**：
- **运行时**: Node.js 20+
- **API**: Next.js API Routes / tRPC
- **ORM**: Prisma
- **认证**: NextAuth.js
- **文件存储**: Vercel Blob / AWS S3

**数据库**：
- **主数据库**: PostgreSQL 15+
- **缓存**: Redis 7+
- **搜索**: PostgreSQL Full-Text Search

**AI 集成**：
- **模型**: OpenAI GPT-4 / Claude 3
- **SDK**: OpenAI SDK / Anthropic SDK

**区块链集成**：
- **网络**: Injective Testnet
- **交互**: ethers.js / Injective SDK
- **钱包**: 后台托管钱包（用户无感）

**开发工具**：
- **包管理**: pnpm
- **代码检查**: ESLint + Prettier
- **测试**: Vitest + Playwright
- **CI/CD**: GitHub Actions
- **部署**: Vercel


---

## 2. 前端架构设计

### 2.1 响应式设计策略

**断点设计**：

```css
/* 移动端优先 */
mobile: 320px - 767px    (成员端主要体验)
tablet: 768px - 1023px   (过渡体验)
desktop: 1024px+         (运营端主要体验)
```

**页面适配策略**：

| 页面 | 移动端 | 桌面端 | 设计重点 |
|-----|--------|--------|---------|
| 首页 | 单列布局 | 双列布局 | 移动端 CTA 突出 |
| 创建社群 | 分步表单 | 单页表单 | 桌面端效率优先 |
| 社群后台 | 简化视图 | 完整视图 | 桌面端数据密集 |
| 成员页 | 卡片布局 | 卡片+侧边栏 | 移动端手势友好 |
| 投票页 | 全屏卡片 | 居中卡片 | 移动端一键投票 |

### 2.2 项目结构

```
youfen-web/
├── app/                      # Next.js App Router
│   ├── (landing)/            # 公开页面组
│   │   ├── page.tsx          # 首页
│   │   ├── community/        # 公开社群页
│   │   └── bip/              # Build in Public
│   ├── (auth)/               # 需要认证的页面组
│   │   ├── create/           # 创建社群
│   │   ├── dashboard/        # 成员页
│   │   └── admin/            # 社群后台
│   ├── api/                  # API Routes
│   └── layout.tsx            # 根布局
├── components/               # React 组件
│   ├── ui/                   # shadcn/ui 基础组件
│   ├── features/             # 功能组件
│   │   ├── community/        # 社群相关
│   │   ├── contribution/     # 贡献相关
│   │   ├── proposal/         # 议题相关
│   │   └── vote/             # 投票相关
│   └── layout/               # 布局组件
├── lib/                      # 工具库
│   ├── prisma.ts             # Prisma 客户端
│   ├── ai/                   # AI 集成
│   ├── blockchain/           # 区块链集成
│   └── utils/                # 通用工具
├── hooks/                    # React Hooks
├── types/                    # TypeScript 类型
├── public/                   # 静态资源
└── prisma/                   # Prisma 配置
    ├── schema.prisma         # 数据库模型
    └── seed.ts               # 种子数据
```

### 2.3 核心组件设计

**1. VoicePowerBadge 组件**

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
      <span className="text-xs opacity-90">发言权</span>
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

**2. ProposalCard 组件**

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
              截止时间：{formatDate(proposal.endTime)}
            </CardDescription>
          </div>
          {proposal.status === 'active' && (
            <Badge variant="success">进行中</Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* AI 摘要 */}
        {proposal.summary && (
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm">{proposal.summary}</p>
          </div>
        )}
        
        {/* 投票选项 */}
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
        
        {/* 投票信息 */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>你的发言权：{userVP}</span>
          <span>已投票：{proposal.voterCount}/{proposal.totalMembers}</span>
        </div>
      </CardContent>
      
      <CardFooter>
        <Button 
          className="w-full" 
          size={isMobile ? "lg" : "default"}
          disabled={hasVoted}
        >
          {hasVoted ? "已投票" : "确认投票"}
        </Button>
      </CardFooter>
    </Card>
  )
}
```

### 2.4 移动端优化

**手势支持**：
```typescript
// 使用 use-gesture 实现滑动操作
import { useGesture } from '@use-gesture/react'

function ContributionList() {
  const bind = useGesture({
    onSwipeLeft: (state) => {
      // 左滑显示操作按钮（批准/拒绝）
    },
    onSwipeRight: (state) => {
      // 右滑返回
    }
  })
  
  return <div {...bind()}>...</div>
}
```

**触摸优化**：
- 按钮最小尺寸：44x44px
- 卡片间距：16px
- 底部导航栏高度：56px
- 避免悬停效果，使用 active 状态

**性能优化**：
```typescript
// 图片懒加载
import Image from 'next/image'

<Image 
  src="/avatar.jpg"
  loading="lazy"
  placeholder="blur"
/>

// 路由预取
import Link from 'next/link'

<Link href="/vote" prefetch={true}>
  去投票
</Link>
```

  })
}
```

**分享卡片优化**：
- 标题：25字以内
- 描述：40字以内
- 图片：200x200px，小于32KB
- 链接：支持直接打开


---

## 3. 后端架构设计

### 3.1 API 设计模式

**选择方案**：Next.js API Routes + tRPC

**为什么选择 tRPC**：
- 端到端类型安全
- 无需手写 API 文档
- 自动类型推导
- 适合 Monorepo

**API 结构**：

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

### 3.2 业务逻辑层

**Community Router**：

```typescript
// server/routers/community.ts
import { router, publicProcedure, protectedProcedure } from '../trpc'
import { z } from 'zod'

export const communityRouter = router({
  // 创建社群
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
      // 1. 创建社群
      const community = await ctx.prisma.community.create({
        data: {
          ...input,
          ownerId: ctx.session.user.id,
        },
      })
      
      // 2. AI 生成默认规则
      const rules = await ctx.ai.generateRules({
        type: input.type,
        goal: input.goal,
      })
      
      // 3. 保存规则
      await ctx.prisma.community.update({
        where: { id: community.id },
        data: { rules },
      })
      
      // 4. 自动添加创建者为成员
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
  
  // 获取社群详情
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
  
  // 更新规则
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
      // 1. 验证权限
      await ctx.requireRole(input.communityId, ['OWNER'])
      
      // 2. 更新规则
      const community = await ctx.prisma.community.update({
        where: { id: input.communityId },
        data: { rules: input.rules },
      })
      
      // 3. 生成规则版本记录
      await ctx.blockchain.recordRuleVersion(input.communityId, input.rules)
      
      return community
    }),
})
```

**Contribution Router**：

```typescript
// server/routers/contribution.ts
export const contributionRouter = router({
  // 提交贡献
  submit: protectedProcedure
    .input(z.object({
      communityId: z.string(),
      memberId: z.string(),
      description: z.string(),
      evidence: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // 1. 获取社群规则
      const community = await ctx.prisma.community.findUnique({
        where: { id: input.communityId },
      })
      
      // 2. AI 分析贡献
      const aiAnalysis = await ctx.ai.analyzeContribution({
        description: input.description,
        rules: community.rules,
      })
      
      // 3. 创建贡献记录
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
  
  // 审核贡献
  review: protectedProcedure
    .input(z.object({
      contributionId: z.string(),
      action: z.enum(['APPROVE', 'REJECT']),
      approvedVP: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // 1. 获取贡献
      const contribution = await ctx.prisma.contribution.findUnique({
        where: { id: input.contributionId },
      })
      
      // 2. 验证权限
      await ctx.requireRole(contribution.communityId, ['OWNER', 'MANAGER'])
      
      // 3. 更新贡献状态
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
      
      // 4. 如果批准，更新成员发言权
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

### 3.3 认证与授权

**使用 NextAuth.js**：

```typescript
// app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { prisma } from '@/lib/prisma'

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    // 邮箱登录
    CredentialsProvider({
      name: 'Email',
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        // 验证逻辑
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

**权限检查中间件**：

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

## 4. 数据库设计

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

// 用户
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

// 社群
model Community {
  id              String    @id @default(cuid())
  name            String
  type            String
  description     String
  goal            String
  size            String
  rules           Json      // 参与规则数组
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

// 成员
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

// 贡献记录
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

// 议题
model Proposal {
  id            String          @id @default(cuid())
  communityId   String
  title         String
  description   String
  summary       String?
  options       Json            // 投票选项数组
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

// 投票记录
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

// 可信记录
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

### 4.2 数据库索引优化

**关键查询优化**：

```sql
-- 社群成员列表（按发言权排序）
CREATE INDEX idx_member_community_vp ON "Member"(community_id, voice_power DESC);

-- 待审核贡献列表
CREATE INDEX idx_contribution_status_created ON "Contribution"(community_id, status, created_at DESC);

-- 进行中的投票
CREATE INDEX idx_proposal_status_end ON "Proposal"(community_id, status, end_time);

-- 可信记录查询
CREATE INDEX idx_record_community_type ON "PublicRecord"(community_id, type, created_at DESC);
```

### 4.3 缓存策略

**Redis 缓存设计**：

```typescript
// lib/cache.ts
import { Redis } from 'ioredis'

const redis = new Redis(process.env.REDIS_URL)

// 缓存键设计
const CACHE_KEYS = {
  community: (id: string) => `community:${id}`,
  memberList: (communityId: string) => `members:${communityId}`,
  proposalVotes: (proposalId: string) => `votes:${proposalId}`,
  userSession: (userId: string) => `session:${userId}`,
}

// 缓存时间（秒）
const CACHE_TTL = {
  community: 300,      // 5分钟
  memberList: 60,      // 1分钟
  proposalVotes: 10,   // 10秒（实时性要求高）
  userSession: 3600,   // 1小时
}

// 社群数据缓存
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

// 投票实时计数（使用 Redis Hash）
export async function incrementVoteCount(proposalId: string, optionId: string, vp: number) {
  const key = CACHE_KEYS.proposalVotes(proposalId)
  await redis.hincrby(key, optionId, vp)
  await redis.expire(key, CACHE_TTL.proposalVotes)
}
```


---

## 5. AI 集成方案

### 5.1 AI 服务封装

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
  // 生成参与规则
  async generateRules(input: {
    type: string
    goal: string
  }): Promise<Rule[]> {
    const prompt = `
你是一个社群运营专家。请为以下社群生成合理的参与规则。

社群类型：${input.type}
社群目标：${input.goal}

请生成 5-7 条参与规则，每条规则包含：
- name: 规则名称（简洁，10字以内）
- description: 规则描述
- voicePower: 建议的发言权数值（10-300）
- category: 规则分类

返回 JSON 数组格式。
`
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    })
    
    const result = JSON.parse(response.choices[0].message.content)
    return result.rules
  }
  
  // 分析贡献
  async analyzeContribution(input: {
    description: string
    rules: Rule[]
  }): Promise<{
    type: string
    suggestedVP: number
    reason: string
  }> {
    const prompt = `
你是一个社群贡献评估专家。请分析以下贡献并给出建议。

贡献描述：${input.description}

社群规则：
${input.rules.map(r => `- ${r.name}: ${r.voicePower} 发言权`).join('\n')}

请分析：
1. 这个贡献最匹配哪条规则？
2. 建议给予多少发言权？
3. 理由是什么？

返回 JSON 格式：
{
  "type": "匹配的规则名称",
  "suggestedVP": 数值,
  "reason": "理由说明"
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
  
  // 生成社群报告
  async generateReport(input: {
    community: Community
    members: Member[]
    contributions: Contribution[]
    proposals: Proposal[]
  }): Promise<string> {
    const prompt = `
生成社群运营报告。

社群信息：
- 名称：${input.community.name}
- 成员数：${input.members.length}
- 总发言权：${input.members.reduce((sum, m) => sum + m.voicePower, 0)}

本周数据：
- 新增贡献：${input.contributions.length}
- 进行中投票：${input.proposals.filter(p => p.status === 'ACTIVE').length}

请生成包含以下内容的报告：
1. 社群概览
2. 核心贡献者 Top 5
3. 参与趋势分析
4. 运营建议

使用 Markdown 格式。
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

### 5.2 AI 调用限流

```typescript
// lib/ai/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN,
})

// 每个用户每小时最多调用 20 次 AI
export const aiRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 h'),
  analytics: true,
})

// 使用示例
export async function rateLimitedAICall(userId: string, fn: () => Promise<any>) {
  const { success, remaining } = await aiRateLimit.limit(userId)
  
  if (!success) {
    throw new Error('AI 调用次数已达上限，请稍后再试')
  }
  
  return fn()
}
```


---

## 6. Injective 区块链集成

### 6.1 智能合约部署

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

### 6.2 区块链服务封装

```typescript
// lib/blockchain/injective.ts
import { ethers } from 'ethers'

const CONTRACT_ADDRESS = process.env.INJECTIVE_CONTRACT_ADDRESS
const CONTRACT_ABI = [...] // 合约 ABI

export class InjectiveService {
  private provider: ethers.providers.JsonRpcProvider
  private wallet: ethers.Wallet
  private contract: ethers.Contract
  
  constructor() {
    // 连接 Injective Testnet
    this.provider = new ethers.providers.JsonRpcProvider(
      process.env.INJECTIVE_RPC_URL
    )
    
    // 后台托管钱包（用户无感）
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
  
  // 计算数据哈希
  private calculateHash(data: any): string {
    return ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(JSON.stringify(data))
    )
  }
  
  // 记录投票结果
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
  
  // 验证记录
  async verifyRecord(dataHash: string): Promise<{
    exists: boolean
    record?: any
  }> {
    const [exists, record] = await this.contract.verifyRecord(dataHash)
    return { exists, record: exists ? record : null }
  }
  
  // 获取交易详情
  async getTransaction(txHash: string) {
    return this.provider.getTransaction(txHash)
  }
}

export const injective = new InjectiveService()
```

### 6.3 异步上链队列

```typescript
// lib/blockchain/queue.ts
import Bull from 'bull'

export const blockchainQueue = new Bull('blockchain-records', {
  redis: process.env.REDIS_URL,
})

// 处理上链任务
blockchainQueue.process(async (job) => {
  const { recordId, type, data } = job.data
  
  try {
    // 更新状态为"上链中"
    await prisma.publicRecord.update({
      where: { id: recordId },
      data: { status: 'RECORDING' },
    })
    
    // 执行上链
    let txHash: string
    switch (type) {
      case 'vote_result':
        txHash = await injective.recordVoteResult(data.proposalId, data)
        break
      // 其他类型...
    }
    
    // 更新状态为"已上链"
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
    // 标记失败
    await prisma.publicRecord.update({
      where: { id: recordId },
      data: { status: 'FAILED' },
    })
    
    throw error
  }
})

// 添加上链任务
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

## 7. 部署架构

### 7.1 Vercel 部署

**生产环境**：
```yaml
# vercel.json
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

**环境变量**：
- `DATABASE_URL`: PostgreSQL 连接字符串
- `REDIS_URL`: Redis 连接字符串
- `OPENAI_API_KEY`: OpenAI API 密钥
- `ANTHROPIC_API_KEY`: Claude API 密钥
- `INJECTIVE_RPC_URL`: Injective RPC 端点
- `INJECTIVE_CONTRACT_ADDRESS`: 合约地址
- `BLOCKCHAIN_PRIVATE_KEY`: 后台钱包私钥
- `NEXTAUTH_SECRET`: NextAuth 密钥
- `NEXTAUTH_URL`: 网站 URL

### 7.2 数据库部署

**使用 Vercel Postgres / Supabase**：
- 自动备份
- 连接池优化
- SSL 连接

### 7.3 CDN 和资源优化

- 静态资源自动 CDN 分发
- 图片自动优化（Next.js Image）
- Gzip/Brotli 压缩

---

## 8. 开发计划

### 8.1 Day 1-2: 基础搭建

**任务**：
- [x] 初始化 Next.js 项目
- [ ] 配置 Prisma + PostgreSQL
- [ ] 部署 Injective 测试合约
- [ ] 集成 AI SDK
- [ ] 搭建基础 UI 组件库

### 8.2 Day 3-4: 核心功能

**任务**：
- [ ] 实现创建社群流程
- [ ] 实现 AI 生成规则
- [ ] 实现成员管理
- [ ] 实现贡献审核（含 AI）
- [ ] 实现投票功能

### 8.3 Day 5-6: 区块链集成

**任务**：
- [ ] 实现投票结果上链
- [ ] 实现可信记录展示
- [ ] 测试完整流程
- [ ] 准备 Demo 数据

### 8.4 Day 7: 优化和部署

**任务**：
- [ ] 移动端适配优化
- [ ] 性能优化
- [ ] Build in Public 页面
- [ ] 部署到生产环境
- [ ] 准备演示材料

---

## 9. 技术风险与应对

| 风险 | 影响 | 应对方案 |
|-----|------|---------|
| **AI 调用超时** | 用户体验差 | 设置 10s 超时，失败降级到默认规则 |
| **区块链上链失败** | 可信记录缺失 | 异步队列重试，失败不影响主流程 |
| **数据库连接池耗尽** | 服务不可用 | 使用 Prisma 连接池，设置合理超时 |
| **跨浏览器兼容性** | 部分功能不可用 | 渐进增强，基础功能保证可用 |

---

**文档完成时间**: 2026-07-23  
**下一步**: 开始开发实现

