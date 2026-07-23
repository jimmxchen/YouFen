# 有份儿 YouFen - 产品需求文档 (PRD)

**版本**: v0.1 Hackathon MVP
**更新日期**: 2026-07-23
产品形态**: 响应式 Web 应用（桌面端 + 移动端自适应）
**目标赛道**: Injective Blockchain x AI / Build in Public
**核心 Demo 社区**: AdventureX Community

**重要说明**：
- 当前 MVP 专注于响应式 Web 应用，支持桌面和移动浏览器访问
- 微信小程序/公众号集成作为未来拓展计划（P2）
- 产品定位为全球化区块链应用，优先支持开放 Web 环境

---

## 1. 产品概述

### 1.1 产品一句话

有份儿是一个无代码社群共治网站，帮助社群运营者把成员的参与和贡献转化为"发言权"，让成员可以共同参与社区投票、规则共创和重要决策。AI 负责生成规则和总结贡献，Injective 负责记录关键投票与规则版本。

### 1.2 产品定位

**中文定位**：

> 让每个参与者，在社区里真的有份儿。

**英文定位**：

> No-code participation governance for communities.

**核心价值**：用户不需要懂代码、不需要懂区块链、不需要连接钱包。前台是社群工具，后台是 Injective 可信记录层。

---

## 2. 目标用户

| 用户角色                   | 描述                                   | 核心需求                                 |
| -------------------------- | -------------------------------------- | ---------------------------------------- |
| **社群运营者**       | 读书会、黑客松、社团、创作者社群负责人 | 无代码创建社群规则、发放发言权、组织投票 |
| **社区成员**         | 普通参与者、志愿者、mentor、贡献者     | 被看见、获得发言权、参与社区决策         |
| **活动主办方**       | 黑客松、线下活动、营地组织者           | 量化贡献、分配话语权、提升归属感         |
| **Sponsor / 生态方** | 提供资源或资金的一方                   | 看到真实贡献和公开可信投票结果           |
| **评委**             | Injective 和 Build in Public 赛道评委  | 看到 AI + 链 + 社区共创闭环              |

---

## 3. 核心问题与解决方案

### 3.1 核心问题

社群现在的问题不是没有群，而是：

- ❌ 成员没有存在感
- ❌ 贡献者没有被看见
- ❌ 投票只是普通问卷，没有体现真实参与
- ❌ 社区决策不透明
- ❌ 志愿者、mentor、幕后组织者的贡献难以沉淀
- ❌ 社群运营者不会用 DAO、合约、钱包等工具

### 3.2 解决方案

> 让社群成员通过真实参与获得发言权，并用这些发言权参与社区决策。

---

## 4. 核心概念设计

### 4.1 用户侧术语映射

| 用户侧概念         | 含义                     | 技术侧术语          |
| ------------------ | ------------------------ | ------------------- |
| **发言权**   | 成员通过贡献获得的投票权 | Voice Power / VP    |
| **参与规则** | 什么行为能获得多少发言权 | Rule Config         |
| **社群议题** | 社区一起投票的问题       | Proposal            |
| **贡献记录** | 成员做过的事             | Contribution        |
| **可信记录** | 重要结果的公开证明       | Injective tx / hash |
| **共创报告** | 社群参与情况总结         | AI Summary          |

### 4.2 术语规避清单

为了降低用户门槛，前台**避免使用**以下 Web3 术语：

- ❌ token / 代币
- ❌ DAO
- ❌ gas / wallet
- ❌ 链上资产
- ❌ 交易 / 挖矿 / 空投

---

## 5. MVP 范围

### 5.1 核心流程

MVP 只做一个完整闭环：

```
创建社群 
  ↓
AI 生成规则 
  ↓
添加成员 
  ↓
发放发言权 
  ↓
创建议题 
  ↓
成员投票 
  ↓
AI 总结 
  ↓
生成 Injective 可信记录 
  ↓
展示 Build in Public 页面
```

### 5.2 成功标准

Hackathon MVP 必须完成：

- ✅ 首页可访问
- ✅ 可创建社群
- ✅ 可 AI 生成规则
- ✅ 可添加成员
- ✅ 可发放发言权
- ✅ 可创建议题
- ✅ 可完成投票
- ✅ 可展示投票结果
- ✅ 可生成至少 1 条 Injective 可信记录
- ✅ 可展示 Build in Public 页面
- ✅ 手机端体验完整

---

## 6. 信息架构

### 6.1 网站页面结构

```
有份儿 YouFen
├── 首页 (Landing Page)
├── 创建社群 (Create Community)
├── 社群后台 (Community Admin) - 桌面端优先 💻
│   ├── 概览 Dashboard
│   ├── 成员管理 Members
│   ├── 贡献审核 Contributions
│   ├── 议题管理 Proposals
│   └── 可信记录 Public Records
├── 成员页 (Member Dashboard) - 移动端优先 📱
│   ├── 我的发言权
│   ├── 我的贡献
│   └── 可参与投票
├── 投票页 (Vote) - 移动端优先 📱
├── 公开社群页 (Public Community)
└── Build in Public 页面
```

### 6.2 设备优先级设计

| 页面类型                       | 优先设备      | 设计原则                               |
| ------------------------------ | ------------- | -------------------------------------- |
| **运营端（后台管理）**   | 💻 桌面端优先 | 需要处理大量信息、批量操作、数据可视化 |
| **成员端（投票、贡献）** | 📱 移动端优先 | 成员随时随地参与，微信内打开便捷性     |
| **公开页（展示）**       | 📱💻 响应式   | 需要在各种设备上良好展示社群形象       |

---

## 7. 详细页面需求

### 7.1 首页 (Landing Page)

**目标**：5 秒内让用户知道这是给社群运营者用的工具

**页面结构**：

- **顶部导航**：有份儿 / Demo / Build in Public
- **主标题**：让每个参与者，在社区里真的有份儿
- **副标题**：无代码创建社群参与规则，把成员贡献变成发言权，让大家一起决定社区未来。
- **CTA 按钮**：
  - 创建社群（主按钮）
  - 查看 AdventureX 示例（次按钮）

**三个价值卡片**：

| 标题     | 说明                               | 图标建议 |
| -------- | ---------------------------------- | -------- |
| 贡献可见 | 志愿者、mentor、活跃成员不再被忽略 | 👁️     |
| 发言有权 | 成员通过参与获得社区发言权         | 🗣️     |
| 结果可信 | 重要投票可生成公开可信记录         | 🔒       |

---

### 7.2 创建社群页 (Create Community)

**用户**：社群运营者

**表单字段**：

| 字段     | 类型     | 必填 | 说明                          |
| -------- | -------- | ---- | ----------------------------- |
| 社群名称 | 文本     | ✅   | 最多30字                      |
| 社群类型 | 下拉选择 | ✅   | 见下方选项                    |
| 成员规模 | 下拉选择 | ✅   | <30 / 30-100 / 100-500 / 500+ |
| 社群目标 | 多行文本 | ✅   | 用于AI生成规则                |
| 是否公开 | 开关     | ❌   | 默认开启                      |

**社群类型选项**：

- 黑客松
- 读书会
- 校园社团
- 创作者社区
- 开源社区
- 志愿者组织
- 自定义（需输入）

**AI 生成默认参与规则**：

根据社群类型和目标，AI 生成类似以下的规则：

```
加入社群：+10 发言权
活动签到：+20 发言权
帮助他人：+50 发言权
提交作品：+100 发言权
担任志愿者：+150 发言权
组织活动：+300 发言权
担任 mentor：+300 发言权
```

**操作流程**：

1. 用户填写表单
2. 点击"使用 AI 推荐规则"
3. AI 返回规则模板
4. 用户可手动编辑规则
5. 点击"创建社群"
6. 成功后跳转到社群后台

---

### 7.3 社群后台 (Community Admin) - 桌面端优先

**用户**：社群运营者

**核心模块**：

#### 1. 社群概览 Dashboard

**关键指标卡片**：

| 指标       | 说明               |
| ---------- | ------------------ |
| 成员数     | 当前社群总成员数   |
| 总发言权   | 所有成员发言权总和 |
| 进行中议题 | 正在投票的议题数量 |
| 今日贡献数 | 今天新增的贡献记录 |
| 可信记录数 | 已生成的链上记录数 |

#### 2. 快捷操作区

- 添加成员
- 发放发言权
- 创建议题
- 生成社群报告

#### 3. 成员列表

**表格字段**：

| 字段     | 说明           | 操作           |
| -------- | -------------- | -------------- |
| 名字     | 成员昵称       | 可点击查看详情 |
| 角色     | Owner/Member   | 可修改         |
| 发言权   | 当前发言权数值 | 可手动调整     |
| 贡献次数 | 贡献记录总数   | 显示           |

**功能**：

- 搜索成员
- 按发言权排序
- 批量导入成员
- 导出成员列表

#### 4. 议题列表

**表格字段**：

| 字段     | 说明               |
| -------- | ------------------ |
| 标题     | 议题名称           |
| 状态     | 投票中/已结束      |
| 投票人数 | 已投票人数/总人数  |
| 可信记录 | 是否已生成链上记录 |
| 创建时间 | 时间戳             |

**操作**：

- 查看详情
- 结束投票
- 生成可信记录
- 删除（仅未开始的）

#### 5. 可信记录列表

**记录卡片显示**：

```
记录类型：投票结果
社区：AdventureX Community
网络：Injective Testnet
交易哈希：0x7a8b9c...
时间：2026-07-23 13:45:00
```

**筛选选项**：

- 全部记录
- 社群记录
- 规则版本
- 发言权批次
- 议题记录
- 投票结果

---

### 7.4 成员页 (Member Dashboard) - 移动端优先

**用户**：普通成员

**页面布局**：

#### 1. 我的发言权卡片

```
你当前拥有 180 发言权
排名：前 15%
```

#### 2. 我的角色标签

显示：参赛者 / 志愿者 / Mentor 等

#### 3. 我的贡献记录

**时间线展示**：

```
2026-07-20  提交项目作品  +100 发言权  ✅已批准
2026-07-18  帮助 Team Alpha 测试 Demo  +50 发言权  ✅已批准
2026-07-15  活动签到  +20 发言权  ✅已批准
```

#### 4. 可参与的投票

**投票卡片**：

```
📊 正在进行
AdventureX 下一次最应该增加什么？
你的发言权：180
截止时间：2026-07-25

[立即投票]
```

#### 5. 快捷操作

- 提交新贡献
- 查看社群公开页
- 分享我的贡献

---

### 7.5 贡献审核页 (Contributions) - 桌面端优先

**用户**：社群运营者

**贡献来源**：

- 运营者手动添加
- 成员自我申报
- 双方确认
- Demo 数据导入（批量）

#### 贡献提交表单

**字段**：

| 字段       | 类型     | 必填 | 说明             |
| ---------- | -------- | ---- | ---------------- |
| 成员       | 下拉选择 | ✅   | 选择社群成员     |
| 贡献描述   | 多行文本 | ✅   | 详细描述贡献内容 |
| 贡献类型   | 下拉选择 | ❌   | AI可自动识别     |
| 建议发言权 | 数字     | ❌   | AI可自动建议     |
| 证明材料   | 文件上传 | ❌   | 图片、文档等     |

#### AI 辅助功能

**输入示例**：

> 我帮 Team Alpha 测试了 Demo，并指出了钱包连接问题。

**AI 输出**：

```
贡献类型：帮助他人 / 技术测试
建议发言权：+50
理由：该成员帮助其他团队发现 Demo 问题，属于有效社区协作。
```

#### 运营者操作

**待审核列表**：

| 成员  | 贡献描述     | AI建议VP | 状态   | 操作           |
| ----- | ------------ | -------- | ------ | -------------- |
| Alice | 提交项目作品 | +100     | 待审核 | 批准/拒绝/修改 |
| Bob   | 帮助测试Demo | +50      | 待审核 | 批准/拒绝/修改 |

**批量操作**：

- 批量批准
- 批量发放发言权
- 导出贡献报告

---

### 7.6 投票页 (Vote) - 移动端优先

**用户**：社区成员

**页面内容**：

#### 1. 议题标题

```
AdventureX 下一次最应该增加什么？
```

#### 2. AI 摘要（可选）

简要说明投票背景和各选项的核心差异

#### 3. 投票选项

**选项卡片**：

```
□ AI x Blockchain 专场
  当前得票：450 发言权 (35%)
  
□ Founder Office Hour
  当前得票：300 发言权 (23%)
  
□ Demo Day
  当前得票：280 发言权 (22%)
  
□ Build in Public 展区
  当前得票：260 发言权 (20%)
```

#### 4. 投票信息栏

```
你的发言权：180
截止时间：2026-07-25 23:59
已投票人数：12/25
```

#### 5. 投票按钮

- [确认投票]（主按钮）
- 投票说明：本次投票按发言权加权计算

#### 6. 投票完成提示

```
✅ 你已投票成功
本次投票将在结束后生成公开可信记录
```

**投票方式**：

- MVP：按发言权加权
- P1：支持一人一票模式
- P1：支持匿名结果模式

---

### 7.7 公开社群页 (Public Community)

**用户**：所有人（包括访客）

**页面目标**：展示社区共创感和透明度

#### 1. 社群头部

```
AdventureX Community
一个由参与者共同塑造的黑客松社区
```

#### 2. 社群数据概览

| 指标       | 数值  |
| ---------- | ----- |
| 成员数     | 25 人 |
| 总发言权   | 5,280 |
| 进行中议题 | 1 个  |
| 已完成投票 | 3 个  |
| 可信记录   | 4 条  |

#### 3. 本周贡献者榜

```
🥇 Dan (Organizer) - 800 发言权
🥈 Eve (Sponsor) - 600 发言权
🥉 Carol (Mentor) - 500 发言权
```

#### 4. 发言权分布可视化

饼图或柱状图展示成员发言权分布

#### 5. 最近共创记录

**时间线展示**：

```
2026-07-23  完成投票：下次活动主题  ✅已生成可信记录
2026-07-22  发放发言权：5位志愿者
2026-07-20  新增成员：3人加入社群
```

#### 6. 公开可信记录

展示所有链上记录，点击可查看详情

#### 7. 底部文案

```
这个社群的规则和决策，由真实参与者共同塑造。
```

---

### 7.8 Build in Public 页面

**目标**：适配 Build in Public 赛道，展示产品开发过程

**页面结构**：

#### 1. 今日更新

```
Day 3 - 2026-07-23

✅ 完成了什么
- 实现了AI辅助贡献审核功能
- 完成了移动端投票页面优化
- 集成了Injective测试网记录功能

🚧 正在做什么
- 优化社群后台数据可视化
- 测试移动端浏览器体验
```

#### 2. 用户反馈墙

```
💬 来自运营者的反馈
"能不能不要出现token这个词？我的成员会被吓跑。"
✅ 已采纳：前台完全去除Web3术语

💬 来自成员的反馈  
"我希望成员可以用发言权决定下次活动主题。"
✅ 已实现：投票功能已上线
```

#### 3. 社区投票决定了什么

```
📊 最近投票结果

投票：下一步优先做什么？
✅ 成员贡献自申报 - 65%
❌ 社群报告导出 - 25%
❌ 邮件通知功能 - 10%

12位成员参与，总计1580发言权
```

#### 4. 下一步计划

```
📋 Roadmap

本周计划
- [ ] 成员贡献自申报功能
- [ ] 批量导入成员工具
- [ ] 投票结果AI总结

下周计划
- [ ] PWA 渐进式应用封装
- [ ] 多语言支持
- [ ] 社群模板库
```

#### 5. 产品数据看板

```
📊 当前数据

总社群数：1
总成员数：25
总发言权：5,280
已完成投票：3
链上记录：4条
```

#### 6. 开发日志

**时间线格式**：

```
2026-07-23
我们发现社群运营者最关心的不是积分系统，而是"成员有没有被看见"。
所以我们把产品核心从"积分"改为"发言权"。

2026-07-22
完成了第一次用户测试，收到了关键反馈：
"我不懂区块链，但我理解发言权这个概念。"
```

---

## 8. 数据模型设计

### 8.1 Community (社群)

```typescript
interface Community {
  id: string                    // UUID
  name: string                  // 社群名称
  type: CommunityType           // 社群类型
  description: string           // 社群描述
  goal: string                  // 社群目标
  size: string                  // 成员规模范围
  rules: Rule[]                 // 参与规则
  isPublic: boolean             // 是否公开
  createdAt: Date               // 创建时间
  updatedAt: Date               // 更新时间
  chainRecordHash?: string      // 链上记录哈希
  ownerId: string               // 创建者ID
}

enum CommunityType {
  HACKATHON = 'hackathon',
  BOOK_CLUB = 'book_club',
  CAMPUS_CLUB = 'campus_club',
  CREATOR = 'creator',
  OPEN_SOURCE = 'open_source',
  VOLUNTEER = 'volunteer',
  CUSTOM = 'custom'
}

interface Rule {
  id: string
  name: string                  // 规则名称，如"活动签到"
  description: string           // 规则描述
  voicePower: number            // 获得的发言权
  category: string              // 规则分类
  isActive: boolean             // 是否启用
}
```

---

### 8.2 Member (成员)

```typescript
interface Member {
  id: string                    // UUID
  communityId: string           // 所属社群ID
  name: string                  // 成员昵称
  email?: string                // 邮箱（可选）
  phone?: string                // 手机号（可选）
  role: MemberRole              // 角色
  voicePower: number            // 当前发言权
  contributionCount: number     // 贡献次数
  tags: string[]                // 标签，如["志愿者", "mentor"]
  joinedAt: Date                // 加入时间
  lastActiveAt: Date            // 最后活跃时间
}

enum MemberRole {
  OWNER = 'owner',              // 创建者
  MANAGER = 'manager',          // 管理员
  MEMBER = 'member',            // 普通成员
}
```

---

### 8.3 Contribution (贡献记录)

```typescript
interface Contribution {
  id: string                    // UUID
  communityId: string           // 社群ID
  memberId: string              // 成员ID
  description: string           // 贡献描述
  type: string                  // 贡献类型
  suggestedVP: number           // AI建议的发言权
  approvedVP?: number           // 批准后的发言权
  status: ContributionStatus    // 状态
  aiReason?: string             // AI分析理由
  evidence?: string[]           // 证明材料URL
  submittedBy: string           // 提交人ID（可能是成员自己或运营者）
  reviewedBy?: string           // 审核人ID
  createdAt: Date               // 创建时间
  reviewedAt?: Date             // 审核时间
}

enum ContributionStatus {
  PENDING = 'pending',          // 待审核
  APPROVED = 'approved',        // 已批准
  REJECTED = 'rejected',        // 已拒绝
}
```

---

### 8.4 Proposal (议题)

```typescript
interface Proposal {
  id: string                    // UUID
  communityId: string           // 社群ID
  title: string                 // 议题标题
  description: string           // 议题描述
  summary?: string              // AI生成的摘要
  options: ProposalOption[]     // 投票选项
  status: ProposalStatus        // 状态
  voteType: VoteType            // 投票方式
  startTime: Date               // 开始时间
  endTime: Date                 // 结束时间
  createdBy: string             // 创建人ID
  createdAt: Date               // 创建时间
  resultHash?: string           // 结果哈希
  chainTxHash?: string          // 链上交易哈希
}

interface ProposalOption {
  id: string
  text: string                  // 选项文本
  votes: number                 // 得票数（发言权总和）
  voterCount: number            // 投票人数
}

enum ProposalStatus {
  DRAFT = 'draft',              // 草稿
  ACTIVE = 'active',            // 进行中
  ENDED = 'ended',              // 已结束
  RECORDED = 'recorded',        // 已生成可信记录
}

enum VoteType {
  WEIGHTED = 'weighted',        // 按发言权加权（默认）
  ONE_PERSON_ONE_VOTE = 'one_person_one_vote',  // 一人一票（P1）
}
```

---

### 8.5 Vote (投票记录)

```typescript
interface Vote {
  id: string                    // UUID
  proposalId: string            // 议题ID
  memberId: string              // 成员ID
  optionId: string              // 选择的选项ID
  voicePowerUsed: number        // 使用的发言权
  comment?: string              // 投票意见（可选）
  isAnonymous: boolean          // 是否匿名（P1）
  createdAt: Date               // 投票时间
  ipAddress?: string            // IP地址（用于防刷）
}
```

---

### 8.6 PublicRecord (可信记录)

```typescript
interface PublicRecord {
  id: string                    // UUID
  communityId: string           // 社群ID
  type: RecordType              // 记录类型
  hash: string                  // 数据哈希
  txHash?: string               // Injective交易哈希
  network: string               // 网络名称
  status: RecordStatus          // 状态
  data: any                     // 原始数据
  createdBy: string             // 创建人ID
  createdAt: Date               // 创建时间
  recordedAt?: Date             // 上链时间
}

enum RecordType {
  COMMUNITY = 'community',      // 社群记录
  RULE = 'rule',                // 规则版本
  VP_BATCH = 'vp_batch',        // 发言权批次
  PROPOSAL = 'proposal',        // 议题记录
  VOTE_RESULT = 'vote_result',  // 投票结果
}

enum RecordStatus {
  PENDING = 'pending',          // 待上链
  RECORDING = 'recording',      // 上链中
  RECORDED = 'recorded',        // 已上链
  FAILED = 'failed',            // 失败
}
```

---

## 9. AI 功能设计

**设计原则**：AI 只做辅助，不自动决定最终结果。运营者始终拥有最终决策权。

### 9.1 生成参与规则

**触发场景**：创建社群页

**输入**：

- 社群类型
- 社群目标
- 成员规模

**输出示例**：

```
根据您的黑客松社群，我们建议以下参与规则：

加入社群：+10 发言权
活动签到：+20 发言权
帮助他人：+50 发言权
提交作品：+100 发言权
担任志愿者：+150 发言权
组织活动：+300 发言权
担任 mentor：+300 发言权
```

**可编辑**：运营者可修改规则名称、发言权数值、添加/删除规则

---

### 9.2 识别贡献类型

**触发场景**：贡献审核页

**输入**：

- 成员姓名
- 贡献描述
- 社群参与规则

**输出示例**：

```
贡献类型：帮助他人 / 技术测试
建议发言权：+50
理由：该成员帮助其他团队发现 Demo 问题，属于有效社区协作，
      符合"帮助他人"规则。
```

**API调用示例**：

```typescript
POST /api/ai/analyze-contribution
{
  "description": "我帮 Team Alpha 测试了 Demo，并指出了钱包连接问题。",
  "communityRules": [...],
  "memberName": "Alice"
}

Response:
{
  "type": "帮助他人",
  "suggestedVP": 50,
  "reason": "该成员帮助其他团队发现 Demo 问题，属于有效社区协作。",
  "matchedRule": "帮助他人"
}
```

---

### 9.3 优化议题表达

**触发场景**：创建投票页

**输入**：运营者输入的原始议题

**输出**：更清晰、中立的投票问题

**示例**：

输入：

> 我们下次要不要搞个AI专场？

输出：

> AdventureX 下一次活动应该增加哪个环节？

---

### 9.4 总结投票观点

**触发场景**：投票进行中页面（可选功能）

**输入**：各选项和当前投票情况

**输出**：正反观点摘要

**示例**：

```
AI x Blockchain 专场 (35%)
支持者认为：契合当前技术趋势，能吸引更多技术团队

Founder Office Hour (23%)
支持者认为：创始人交流对团队成长更有价值
```

---

### 9.5 生成社群报告

**触发场景**：社群后台，运营者点击"生成社群报告"

**输入**：

- 社群基本信息
- 成员列表和发言权
- 贡献记录
- 投票历史

**输出示例**：

```markdown
# AdventureX Community 社群报告
生成时间：2026-07-23

## 社群概览
- 成员数：25人
- 总发言权：5,280
- 活跃度：高（本周12次新贡献）

## 核心贡献者 Top 5
1. Dan (Organizer) - 800 发言权 - 贡献5次
2. Eve (Sponsor) - 600 发言权 - 贡献3次
3. Carol (Mentor) - 500 发言权 - 贡献8次

## 参与趋势
本周发言权增长：+680
最活跃时段：周末
主要贡献类型：帮助他人 (45%), 提交作品 (30%)

## 建议
- 可以增加对"帮助他人"行为的奖励
- 考虑为高活跃成员设置荣誉徽章
```

---

### 9.6 生成 Build in Public 更新

**触发场景**：Build in Public 页面，自动或手动触发

**输入**：

- 产品开发日志
- 用户反馈
- 投票结果
- 数据变化

**输出示例**：

```markdown
Day 3 - 2026-07-23

今天我们完成了AI辅助贡献审核功能。这个功能源于运营者的反馈：
"我很难判断每个贡献应该给多少发言权。"

现在AI可以根据社群规则自动建议发言权数值，但最终决定权仍在运营者手中。

用户反馈最多的需求是"成员贡献自申报"，我们决定下周优先开发这个功能。
```

---

## 10. Injective 功能设计

**设计原则**：前台展示为"公开可信记录"，避免使用区块链术语。

### 10.1 MVP 上链内容

| 记录类型             | 数据内容       | 何时生成         |
| -------------------- | -------------- | ---------------- |
| **社群记录**   | communityHash  | 社群创建时       |
| **规则版本**   | ruleHash       | 规则创建/修改时  |
| **发言权批次** | vpBatchHash    | 批量发放发言权时 |
| **议题记录**   | proposalHash   | 议题创建时       |
| **投票结果**   | voteResultHash | 投票结束时       |

---

### 10.2 最小合约接口设计

**Solidity 伪代码**（适配Injective EVM）：

```solidity
contract YouFenRecords {
  
    struct Record {
        bytes32 dataHash;
        uint256 timestamp;
        string recordType;
        string communityId;
    }
  
    mapping(bytes32 => Record) public records;
  
    event RecordCreated(
        bytes32 indexed recordHash,
        string recordType,
        string communityId,
        uint256 timestamp
    );
  
    function recordCommunity(bytes32 communityHash, string memory communityId) 
        external 
    {
        records[communityHash] = Record({
            dataHash: communityHash,
            timestamp: block.timestamp,
            recordType: "community",
            communityId: communityId
        });
        emit RecordCreated(communityHash, "community", communityId, block.timestamp);
    }
  
    function recordRuleVersion(bytes32 ruleHash, string memory communityId) 
        external 
    {
        records[ruleHash] = Record({
            dataHash: ruleHash,
            timestamp: block.timestamp,
            recordType: "rule",
            communityId: communityId
        });
        emit RecordCreated(ruleHash, "rule", communityId, block.timestamp);
    }
  
    function recordVoicePowerBatch(bytes32 batchHash, string memory communityId) 
        external 
    {
        records[batchHash] = Record({
            dataHash: batchHash,
            timestamp: block.timestamp,
            recordType: "vp_batch",
            communityId: communityId
        });
        emit RecordCreated(batchHash, "vp_batch", communityId, block.timestamp);
    }
  
    function recordProposal(bytes32 proposalHash, string memory communityId) 
        external 
    {
        records[proposalHash] = Record({
            dataHash: proposalHash,
            timestamp: block.timestamp,
            recordType: "proposal",
            communityId: communityId
        });
        emit RecordCreated(proposalHash, "proposal", communityId, block.timestamp);
    }
  
    function recordVoteResult(bytes32 resultHash, string memory communityId) 
        external 
    {
        records[resultHash] = Record({
            dataHash: resultHash,
            timestamp: block.timestamp,
            recordType: "vote_result",
            communityId: communityId
        });
        emit RecordCreated(resultHash, "vote_result", communityId, block.timestamp);
    }
  
    function verifyRecord(bytes32 recordHash) 
        external 
        view 
        returns (bool exists, Record memory record) 
    {
        Record memory r = records[recordHash];
        exists = r.timestamp > 0;
        return (exists, r);
    }
}
```

---

### 10.3 前台展示

**可信记录详情页**：

```
✅ 公开可信记录

记录类型：投票结果
社区：AdventureX Community
网络：Injective Testnet
交易哈希：0x7a8b9c1d2e3f4g5h6i7j8k9l0m1n2o3p
区块高度：#1,234,567
时间：2026-07-23 14:30:00

原始数据哈希：
0xabcd1234...ef5678

[在区块浏览器中查看]
```

**避免使用的术语**：

- ❌ "上链"
- ❌ "gas费"
- ❌ "钱包签名"
- ❌ "智能合约"

**推荐使用**：

- ✅ "生成公开可信记录"
- ✅ "永久保存"
- ✅ "可公开验证"

---

### 10.4 后端实现流程

```typescript
// 生成投票结果可信记录的流程
async function createVoteResultRecord(proposalId: string) {
  // 1. 获取投票结果数据
  const proposal = await db.proposal.findById(proposalId);
  const votes = await db.vote.findByProposalId(proposalId);
  
  // 2. 构造待记录的数据
  const resultData = {
    proposalId: proposal.id,
    title: proposal.title,
    options: proposal.options.map(opt => ({
      text: opt.text,
      votes: opt.votes,
      voterCount: opt.voterCount
    })),
    totalVoters: votes.length,
    totalVP: votes.reduce((sum, v) => sum + v.voicePowerUsed, 0),
    endTime: proposal.endTime
  };
  
  // 3. 计算数据哈希
  const dataHash = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes(JSON.stringify(resultData))
  );
  
  // 4. 保存到数据库（状态：待上链）
  const record = await db.publicRecord.create({
    communityId: proposal.communityId,
    type: 'vote_result',
    hash: dataHash,
    data: resultData,
    status: 'pending'
  });
  
  // 5. 调用 Injective 合约记录
  try {
    const tx = await youFenContract.recordVoteResult(
      dataHash,
      proposal.communityId
    );
    await tx.wait();
  
    // 6. 更新记录状态
    await db.publicRecord.update(record.id, {
      txHash: tx.hash,
      status: 'recorded',
      recordedAt: new Date()
    });
  
    return record;
  } catch (error) {
    // 上链失败，标记状态
    await db.publicRecord.update(record.id, {
      status: 'failed'
    });
    throw error;
  }
}
```

---

## 11. Demo 数据设计

**用途**：用于 Hackathon 演示和评委展示

### 11.1 Demo 社群

**社群信息**：

- 名称：AdventureX Community
- 类型：黑客松
- 成员规模：20-30人
- 状态：公开展示

---

### 11.2 Demo 成员数据

| 姓名  | 角色   | 发言权 | 贡献次数 | 标签      |
| ----- | ------ | -----: | -------: | --------- |
| Dan   | Owner  |    800 |        5 | Organizer |
| Eve   | Member |    600 |        3 | Sponsor   |
| Carol | Member |    500 |        8 | Mentor    |
| Bob   | Member |    300 |        4 | 志愿者    |
| Alice | Member |    100 |        2 | 参赛者    |
| Frank | Member |    150 |        3 | 参赛者    |
| Grace | Member |    200 |        3 | 志愿者    |
| Henry | Member |    450 |        6 | Mentor    |

**总计**：25 名成员，总发言权 5,280

---

### 11.3 Demo 贡献记录

| 成员  | 贡献描述                     | 类型       | 发言权 | 状态     |
| ----- | ---------------------------- | ---------- | -----: | -------- |
| Alice | 提交项目作品：AI社群治理工具 | 提交作品   |   +100 | ✅已批准 |
| Bob   | 现场志愿服务，协助签到和引导 | 担任志愿者 |   +150 | ✅已批准 |
| Carol | 辅导3个团队进行技术指导      | 担任mentor |   +300 | ✅已批准 |
| Dan   | 组织本次黑客松活动           | 组织活动   |   +300 | ✅已批准 |
| Eve   | 提供场地和资金支持           | Sponsor    |   +600 | ✅已批准 |
| Frank | 帮助 Team Alpha 测试 Demo    | 帮助他人   |    +50 | ✅已批准 |
| Grace | 负责现场摄影和宣传           | 担任志愿者 |   +150 | ✅已批准 |
| Henry | 担任技术导师，解答区块链问题 | 担任mentor |   +300 | ✅已批准 |

---

### 11.4 Demo 投票议题

**议题 1**（已结束）：

```
标题：AdventureX 下一次最应该增加什么？

选项：
- AI x Blockchain 专场 - 450 VP (35%) - 8人投票
- Founder Office Hour - 300 VP (23%) - 5人投票
- Demo Day - 280 VP (22%) - 6人投票
- Build in Public 展区 - 260 VP (20%) - 6人投票

状态：已结束
可信记录：✅ 已生成
投票人数：12/25
总发言权：1,290
```

**议题 2**（进行中）：

```
标题：社群规则调整：是否增加"code review"贡献类型？

选项：
- 是，+80 发言权 - 当前 520 VP
- 是，+50 发言权 - 当前 380 VP
- 不需要 - 当前 180 VP

状态：进行中
截止时间：2026-07-25 23:59
```

---

## 12. 权限设计

### 12.1 角色权限矩阵

| 功能               | Owner | Manager | Member | Visitor |
| ------------------ | :---: | :-----: | :----: | :-----: |
| **社群管理** |      |        |        |        |
| 创建社群           |  ✅  |   ❌   |   ❌   |   ❌   |
| 编辑社群信息       |  ✅  |   ✅   |   ❌   |   ❌   |
| 删除社群           |  ✅  |   ❌   |   ❌   |   ❌   |
| 编辑参与规则       |  ✅  |   ❌   |   ❌   |   ❌   |
| **成员管理** |      |        |        |        |
| 添加成员           |  ✅  |   ✅   |   ❌   |   ❌   |
| 删除成员           |  ✅  |   ✅   |   ❌   |   ❌   |
| 修改成员角色       |  ✅  |   ❌   |   ❌   |   ❌   |
| 手动调整发言权     |  ✅  |   ✅   |   ❌   |   ❌   |
| **贡献管理** |      |        |        |        |
| 添加贡献记录       |  ✅  |   ✅   |   ❌   |   ❌   |
| 提交贡献申报       |  ✅  |   ✅   |   ✅   |   ❌   |
| 审核贡献           |  ✅  |   ✅   |   ❌   |   ❌   |
| 批准发放发言权     |  ✅  |   ✅   |   ❌   |   ❌   |
| **议题管理** |      |        |        |        |
| 创建议题           |  ✅  |   ✅   |   ❌   |   ❌   |
| 编辑议题           |  ✅  |   ✅   |   ❌   |   ❌   |
| 结束投票           |  ✅  |   ✅   |   ❌   |   ❌   |
| 删除议题           |  ✅  |   ❌   |   ❌   |   ❌   |
| 参与投票           |  ✅  |   ✅   |   ✅   |   ❌   |
| **可信记录** |      |        |        |        |
| 生成可信记录       |  ✅  |   ✅   |   ❌   |   ❌   |
| 查看可信记录       |  ✅  |   ✅   |   ✅   |   ✅   |
| **查看权限** |      |        |        |        |
| 查看社群后台       |  ✅  |   ✅   |   ❌   |   ❌   |
| 查看成员页         |  ✅  |   ✅   |   ✅   |   ❌   |
| 查看公开社群页     |  ✅  |   ✅   |   ✅   |   ✅   |

### 12.2 MVP 简化方案

MVP 可以简化为三个角色：

- **Owner**：社群创建者，拥有全部权限
- **Member**：普通成员，可投票、提交贡献
- **Visitor**：访客，只能查看公开社群页

---

## 13. 风险与规避策略

| 风险                           | 影响               | 规避策略                                              |
| ------------------------------ | ------------------ | ----------------------------------------------------- |
| **被认为是普通积分系统** | 评委认为缺乏创新   | 强调重要决策可生成 Injective 可信记录，展示区块链价值 |
| **被认为 Web3 门槛高**   | 用户不愿使用       | 前台完全无链感，只在可信记录处展示                    |
| **合规风险**             | 被认为是金融产品   | 发言权不可交易、不能提现、不能转让                    |
| **AI 分配不公**          | 运营者质疑 AI 判断 | AI 只建议，运营者必须批准才生效                       |
| **像 DAO 工具**          | 用户觉得太复杂     | 强调无代码社群运营，不讲 DAO、治理等术语              |
| **用户不理解发言权**     | 概念太抽象         | 用"你对社区未来有多少话语权"解释                      |
| **投票结果作假**         | 信任度下降         | 关键投票生成链上记录，公开可验证                      |
| **成员刷发言权**         | 系统被滥用         | 贡献需要运营者审核，记录 IP 防刷                      |

---

## 14. 赛道叙事

### 14.1 Injective 赛道叙事

**核心论点**：把 Injective 带给非 Web3 用户

**叙事内容**：

> 有份儿把 Injective 带给非 Web3 社群运营者。普通用户不需要理解区块链，不需要连接钱包，也不需要支付 gas 费。但关键的社区发言权分配、规则版本变更和投票结果，都可以通过 Injective 生成公开可信记录。
>
> 这不是把复杂的 Web3 工具简化，而是把 Web3 的价值（透明、可信、不可篡改）无感地融入到传统社群运营中。

**技术亮点**：

- 使用 Injective EVM 部署记录合约
- 前台完全无钱包感，后台自动生成链上记录
- 展示区块浏览器验证功能

---

### 14.2 Build in Public 赛道叙事

**核心论点**：用自己的产品实践 Build in Public

**叙事内容**：

> 有份儿本身就是在 AdventureX 社区中公开构建的产品。我们不只是"发动态"，而是用自己的产品让用户投票决定产品下一步要做什么。
>
> 每个重要决策都有社区成员的发言权参与，每次投票都生成公开可信记录。Build in Public 从"展示过程"变成了"社区共同治理"。

**展示重点**：

- Build in Public 页面展示开发日志
- 用户反馈直接影响产品方向
- 社区投票决定功能优先级
- 所有决策透明可追溯

---

## 15. 最终 Pitch

### 15.1 中文版

> 有份儿是一个无代码社群共治网站，帮助社群运营者把成员的真实参与转化为发言权。成员不再只是群里的旁观者，而是可以用自己贡献获得的话语权参与社区决策。
>
> AI 帮运营者生成参与规则、识别贡献和总结议题，Injective 在后台为重要投票和规则变化生成公开可信记录。
>
> 我们想解决的问题很简单：让每个真正参与社区的人，都能在社区里真的有份儿。

### 15.2 英文版

> YouFen is a no-code community governance website that turns real participation into voice power. Members are no longer just observers in the group chat—they earn voice power through contributions and use it to participate in community decisions.
>
> AI helps operators design contribution rules, recognize contributions, and summarize proposals. Injective provides a public record layer for important votes and rule changes in the background.
>
> The problem we're solving is simple: ensure that everyone who truly participates in the community genuinely has a stake in it.

---

## 16. 产品记忆点

### 16.1 核心 Slogan

**中文**：

> 有份儿：让每个参与者，在社区里真的有份儿。

**英文**：

> YouFen: Everyone who participates, has a stake.

### 16.2 关键差异化

| 维度               | 传统工具        | 有份儿                           |
| ------------------ | --------------- | -------------------------------- |
| **用户门槛** | 需要懂 DAO/Web3 | 完全无代码、无链感               |
| **核心概念** | 积分/Token      | 发言权（话语权）                 |
| **决策方式** | 普通问卷投票    | 发言权加权 + 链上记录            |
| **透明度**   | 结果可能被篡改  | 关键决策生成公开可信记录         |
| **AI 角色**  | 无              | 辅助规则生成和贡献识别           |
| **适用场景** | Web3 原生社区   | 任何社群（黑客松、读书会、社团） |

### 16.3 Demo 展示要点

**30秒快速演示流程**：

1. **创建社群** - 填写信息，AI 生成参与规则（10秒）
2. **添加成员** - 展示 AdventureX 社群成员列表（5秒）
3. **发放发言权** - 批准贡献，自动计算发言权（5秒）
4. **创建投票** - 展示正在进行的投票（5秒）
5. **查看结果** - 展示投票结果和 Injective 可信记录（5秒）

**强调点**：

- 移动端浏览器体验流畅
- 无需连接钱包
- AI 自动建议发言权
- 一键生成链上可信记录

---

## 17. MVP 开发优先级

### P0（必须完成）

- [ ] 首页 Landing
- [ ] 创建社群 + AI 生成规则
- [ ] 添加成员
- [ ] 发放发言权
- [ ] 创建议题
- [ ] 成员投票（移动端）
- [ ] 投票结果展示
- [ ] 生成 Injective 可信记录（至少1条）
- [ ] 公开社群页
- [ ] Build in Public 页面
- [ ] Demo 数据预设

### P1（如有时间）

- [ ] 成员贡献自申报
- [ ] 批量导入成员
- [ ] 社群报告导出
- [ ] 一人一票投票模式
- [ ] 投票匿名模式
- [ ] Manager 角色权限


### P2（未来版本）

- [ ] 微信小程序封装（中国市场）
- [ ] 多语言支持
- [ ] 社群模板库
- [ ] 发言权历史曲线
- [ ] 成员徽章系统
- [ ] 微信生态集成（小程序、公众号、通知）
- [ ] 数据分析看板

---

**文档完成时间**: 2026-07-23
**下一步**: 技术架构设计
