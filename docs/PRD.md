# 有份儿 YouFen.xyz — 产品需求文档

**版本**：v0.6 Inflationary Ownership Protocol
**更新日期**：2026-07-23
**产品形态**：响应式 Web 应用
**目标赛道**：Injective Blockchain × AI / Build in Public
**核心 Demo 社区**：AdventureX Community
**文档用途**：Hackathon MVP Developer Build Spec

---

# 1. 产品概述

## 1.1 产品一句话

有份儿是一个无代码社区共同所有平台，把成员的真实贡献转化为不可交易的社区所有权 Token，让持续建设社区的人持续拥有更高的相对所有权和决策影响力。

## 1.2 核心理念

> 你建设了社区，社区就应该有你的一份。

传统社区的权力通常由创建者和管理员长期掌握。

有份儿通过持续增发社区所有权 Token，将新的所有权分配给正在创造价值的成员。

早期成员的 Token 不会被没收或清零，但如果他们停止贡献，随着社区向新贡献者持续增发 Token，其相对所有权和相对投票影响力会自然下降。

## 1.3 核心机制

```text
成员完成贡献
  ↓
AI 分析贡献并匹配 Token 规则
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

## 1.4 产品核心表达

> 过去的贡献让你获得 Token。

> 持续的贡献让你保持相对所有权。

> 不没收旧成员的所有权，而是持续奖励新的贡献者。

## 1.5 核心 Slogan

中文：

> 有份儿：让所有权持续流向建设社区的人。

英文：

> YouFen: Ownership flows to those who keep building.

---

# 2. 产品目标

## 2.1 对社区成员

成员可以：

* 通过真实贡献获得社区所有权 Token
* 查看自己的 Token 来源
* 查看自己的相对所有权
* 查看社区总供应量和通胀情况
* 参与社区重要决策
* 验证每一次 Token 增发
* 看到自己对社区产生的真实影响

## 2.2 对社区管理者

管理者可以：

* 无代码创建社区 Token 规则
* 设置月度通胀率
* 设置每月增发额度
* 使用 AI 分析成员贡献
* 审核并发放 Token
* 在受限条件下预支下月额度
* 创建社区 Proposal
* 查看 Token 分布和通胀健康度
* 生成 Injective 可信记录

## 2.3 对公开访客与评委

访客可以查看：

* Token 总供应量
* 当前月度通胀率
* 本月增发额度和使用情况
* Token 分布
* 历史增发记录
* 预算预支记录
* 社区投票结果
* Injective 交易哈希
* 完整规则版本

---

# 3. 社区所有权 Token

## 3.1 用户侧名称

前端可以明确使用：

* Token
* 社区所有权 Token
* Community Ownership Token
* Token 增发
* Token 通胀
* Token 总供应量
* 相对所有权
* 治理 Token

每个社区拥有独立的 Token 系统。

示例：

```text
AdventureX Ownership Token
Symbol：AXO
```

## 3.2 Token 属性

社区所有权 Token：

* 不可购买
* 不可出售
* 不可提现
* 不可转让
* 不可在成员之间发送
* 不提供分红
* 不代表公司股权
* 不代表金融资产
* 只能通过社区贡献或正式治理决策获得
* 用于计算社区决策权重

## 3.3 前端风险说明

所有权页面必须展示：

> 社区所有权 Token 代表成员在社区内部的贡献记录和决策参与权，不代表公司股权、收益权、金融资产或法律意义上的财产所有权。

---

# 4. 所有权计算

## 4.1 Token 余额

```text
成员 Token 余额
=
历史获得 Token
- 已正式冲销 Token
```

成员不活跃不会直接减少 Token 余额。

## 4.2 相对所有权

```text
相对所有权
=
成员 Token 余额 ÷ 社区 Token 总供应量
```

示例：

```text
Alice Token：1,000
社区总供应量：10,000

Alice 相对所有权：10%
```

社区随后向当前贡献者增发 5,000 Token：

```text
Alice Token：1,000
社区总供应量：15,000

Alice 相对所有权：6.67%
```

Alice 的绝对 Token 数量没有变化，但其相对所有权自然下降。

## 4.3 有效治理 Token

成员页面需要区分：

1. Token 总余额
2. 当前有效治理 Token
3. 待激活治理 Token

```text
Token 总余额
=
有效治理 Token
+ 待激活治理 Token
```

正常月度预算内铸造的 Token：

* 立即进入 Token 总余额
* 只影响尚未开始的 Proposal
* 不影响已经创建快照的 Proposal

预支下月预算铸造的 Token：

* 立即进入 Token 总余额
* 立即计入社区总供应量
* 暂时不计入有效治理 Token
* 下一 Epoch 开始时激活

## 4.4 投票权重

```text
Proposal 投票权重
=
Proposal 创建快照时的有效治理 Token
```

---

# 5. 固定月度通胀机制

## 5.1 Epoch

每个社区通过 Epoch 管理 Token 增发。

MVP 默认：

```text
一个 Epoch = 30 天
```

每个 Epoch 开始时生成固定增发预算。

## 5.2 月度基础增发额度

```text
本月基础增发额度
=
本月开始时 Token 总供应量
× 固定月度通胀率
```

示例：

```text
月初 Token 总供应量：100,000
固定月度通胀率：5%

本月基础增发额度：5,000 Token
```

必须使用月初供应量快照计算。

禁止根据月内实时增长后的总供应量重新计算，否则会形成月内复利增发。

## 5.3 固定月度通胀率

MVP 默认：

```text
月度通胀率：5%
```

创建社区时可以选择：

| 社区阶段 | 推荐月度通胀率 |
| ---- | ------: |
| 冷启动期 |      5% |
| 增长期  |   2%–3% |
| 稳定期  | 0.5%–1% |

通胀率属于社区宪法级参数。

管理者不能直接即时修改。

修改流程：

```text
创建通胀率修改 Proposal
  ↓
社区成员投票
  ↓
Proposal 通过
  ↓
等待当前 Epoch 结束
  ↓
下一 Epoch 正式生效
  ↓
生成新的 Token Policy 版本
  ↓
记录到 Injective
```

## 5.4 额度不是必须发完

本月预算代表最大可增发量，不代表必须发完。

示例：

```text
基础增发额度：5,000
实际有效贡献对应增发：3,500
未使用额度：1,500
```

MVP 规则：

> 未使用的月度基础额度在 Epoch 结束时自动作废，不滚入下一期。

这样可以防止：

* 管理者为了用完预算而乱发 Token
* 多个月额度堆积后突然大量增发
* 通过历史余额进行投票突袭

---

# 6. 预支下月 Token 预算

## 6.1 预支定义

在当月基础预算不足，但社区出现额外高价值贡献时，可以有限预支下一 Epoch 的 Token 额度。

前端名称：

> 未来增发额度预支

英文：

> Mint Budget Advance

预支不是额外创造免费预算。

预支金额会在下一 Epoch 的预算中自动扣除。

## 6.2 预支上限

MVP 默认：

```text
最大预支额度
=
本月基础增发额度 × 25%
```

示例：

```text
本月基础额度：5,000
最大预支比例：25%

最大可预支：1,250
本月理论最大增发：6,250
```

## 6.3 下月偿还

示例：

```text
下月基础增发额度：5,300
上期预支债务：1,250

下月实际基础可用额度：4,050
```

计算公式：

```text
下月实际基础可用额度
=
下月基础增发额度
- 上期预支债务
```

最低为 0。

## 6.4 预支范围

规则：

* 只能预支下一 Epoch
* 不能预支下下个 Epoch
* 不能连续滚动未来债务
* 已存在未偿还预支时，不得再次开启新的预支
* 当前预支必须在下一 Epoch 预算中完成扣除

禁止：

```text
本月预支下月
下月再预支下下月偿还本月债务
```

## 6.5 预支 Token 治理激活

使用预支预算铸造的 Token：

* 立即增加成员 Token 总余额
* 立即增加社区 Token 总供应量
* 立即反映在相对 Token 所有权中
* 不立即进入有效治理 Token
* 下一 Epoch 开始时统一激活

成员页面示例：

```text
Token 总余额：1,500 AXO
当前有效治理 Token：1,000 AXO
待激活 Token：500 AXO

500 AXO 来自未来预算预支，
将在下一 Epoch 开始时激活治理权。
```

## 6.6 预支审批权限

阈值一律按**本 Epoch 累计**判定，而非单笔判定，防止连续多笔各 9% 绕过治理：

```text
判定口径 = 本期已预支累计 + 本次申请

当 (本期已预支累计 + 本次申请) > 基础预算 × 10%  →  触发 Proposal 要求
当 (本期已预支累计 + 本次申请) > 基础预算 × 25%  →  系统禁止
```

| 预支情况                          | 审批方式            |
| ----------------------------- | --------------- |
| 未使用预支，只使用本月正常额度               | 按现有贡献规则审批       |
| 本期累计预支不超过基础额度的10%             | 至少两名管理员批准       |
| 本期累计预支超过10%，但不超过25%           | 必须通过社区 Proposal |
| 给 Steward 或审批人增发              | 必须通过社区 Proposal |
| 无对应贡献的特殊奖励                    | 必须通过社区 Proposal |
| 本期累计预支超过25%                   | 系统禁止            |

## 6.7 预支前端警告

```text
你正在使用下一 Epoch 的 Token 预算。

预支金额：500 AXO
下期预算将自动减少：500 AXO

通过预支额度获得的 Token，
将在下一 Epoch 激活治理权。
```

---

# 7. Token 增发来源

## 7.1 普通贡献增发

主要增发方式。

示例规则：

| 贡献类型           | Token |
| -------------- | ----: |
| 完成社区介绍         |   +10 |
| 有效参与活动         |   +20 |
| 帮助其他成员         |   +50 |
| 完成 Code Review |   +80 |
| 提交项目作品         |  +100 |
| 担任志愿者          |  +150 |
| 担任 Mentor      |  +300 |
| 组织社区活动         |  +300 |

流程：

```text
成员提交贡献
  ↓
AI 分析并匹配规则
  ↓
管理员审核
  ↓
系统检查成员单期上限
  ↓
系统检查本期剩余额度
  ↓
额度充足：正常增发
额度不足：申请预支或延迟至下期
  ↓
写入 Token Ledger
  ↓
提交 Injective 记录
```

## 7.2 初始 Token 分配

社区创建时可以设置初始供应量。

初始分配必须：

* 明确每位成员获得数量
* 明确分配理由
* 公布初始所有权分布
* 生成初始分配记录
* 写入 Injective
* 创建后不能覆盖，只能通过新增纠正记录调整

## 7.3 特殊奖励

适用于：

* 完成关键基础设施
* 承担重大紧急任务
* 创建长期公共资源
* 为社区带来重要战略价值

特殊奖励必须：

* 有明确说明
* 有公开 Proposal
* 有 Token 数量
* 有受益人
* 有投票快照
* 有执行记录
* 通过后才能铸造

## 7.4 Token 冲销

只有以下情况可以冲销 Token：

* 贡献材料造假
* 同一贡献重复领取
* 多账户作弊
* 明确操纵投票
* Token 录入错误
* 社区正式 Proposal 通过撤销

不得直接修改原余额记录。

必须新增 Reversal Event：

```text
原增发：
帮助 Team Alpha 完成测试
+100 AXO

冲销记录：
贡献证明被确认无效
-100 AXO

原始记录和冲销记录同时永久保留。
```

---

# 8. 对抗性增发控制

## 8.1 管理者不能自由铸币

管理者的权限是：

> 确认贡献是否符合预先公布的规则。

管理者不能：

* 自定义任意增发数量
* 绕过月度预算
* 绕过成员单期上限
* 删除增发记录
* 修改历史供应量
* 在 Proposal 期间改变快照
* 给自己单独审批 Token

## 8.2 成员单期上限

MVP 默认：

```text
单成员每 Epoch 最大增发量
=
本月基础增发额度 × 10%
```

示例：

```text
本月基础额度：5,000
成员单期上限：500
```

超过上限需要社区 Proposal。

## 8.3 关联方增发

以下情况标记为 Related-party Mint：

* 接收人与审批人相同
* 接收人为 Steward
* 接收人为审批人的家庭成员或关联账号
* 接收人为拥有管理员权限的成员

关联方增发要求：

* 审批人不得单独执行
* 必须至少有第二审核人
* 超过普通规则数量时必须社区投票
* 前端公开显示“关联方增发”

## 8.4 投票前增发攻击

攻击方式：

1. 管理者创建 Proposal；
2. 在投票前给支持者增发；
3. 支持者使用新增 Token 投票。

防御方式：

> Proposal 创建时立即锁定 Token 快照。

快照后铸造的 Token 不影响当前 Proposal。

## 8.5 预支增发攻击

攻击方式：

1. 管理者预支下月额度；
2. 给支持自己的人发 Token；
3. 立即操纵当前决策；
4. 让未来成员承担通胀成本。

防御方式：

* 预支超过10%必须投票——阈值按本 Epoch 累计判定：`(本期已预支累计 + 本次申请) > 基础预算 × 10%` 即触发 Proposal，防止连续多笔各 9% 绕过治理
* 预支 Token 下一 Epoch 才激活治理权
* 已开始 Proposal 使用固定快照
* 预支记录公开展示
* 下期预算自动扣除

---

# 9. Proposal 与投票机制

## 9.1 Proposal 快照

Proposal 从 Draft 变为 Active 时，系统必须保存：

* Snapshot Time
* Snapshot Block
* Token 总供应量
* 每位成员有效治理 Token
* Token Policy Version
* 当前 Epoch
* 当前预支债务
* 当前通胀率

```text
本次投票权重
=
Snapshot 时的有效治理 Token
```

## 9.2 投票期间新 Token

Proposal 开始后新增的 Token：

* 不影响当前 Proposal
* 正常预算 Token 可用于之后创建的 Proposal
* 预支 Token 需要等下一 Epoch 激活
* 历史 Proposal 结果不得重新计算

## 9.3 投票信息

成员投票页显示：

```text
你的 Token 总余额：1,500 AXO
当前有效治理 Token：1,000 AXO
本次 Proposal 快照权重：900 AXO
待激活 Token：500 AXO

快照区块：#1,234,567
```

快照权重可能小于当前有效治理 Token，因为成员在 Proposal 开始后又获得了正常 Token。

## 9.4 MVP 最低参与条件

MVP 默认：

* 至少 3 名成员参与
* 社区可以设置更高的最低参与人数
* 不使用总供应量百分比作为唯一 Quorum

原因：

大量早期 Token 可能由已经离开的成员持有，使用总供应量 Quorum 可能使治理停止。

## 9.5 Proposal 类型

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

---

# 10. 区块链可信记录

## 10.1 前端信任表达

首页和公开社区页可以展示：

```text
Powered by Injective

100% Token 增发可溯源
所有规则版本永久保留
无人可以静默修改历史
任何人都可以公开验证
```

## 10.2 “100% 可溯源”定义

MVP 中，以下事件必须进入不可删除的产品账本：

* 初始 Token 分配
* 普通 Token 增发
* 预支 Token 增发
* Token 冲销
* 月度预算创建
* 预算预支
* 预支债务偿还
* 通胀率修改
* Token 规则版本修改
* Proposal 创建
* Proposal 快照
* Proposal 最终结果

关键事件生成 Injective 可信记录。

## 10.3 “无人可修改”定义

推荐用户文案：

> 已确认记录无法被任何人静默覆盖。

技术要求：

* 不允许 Update 原 Ledger Event
* 不允许 Delete 原 Ledger Event
* 纠错必须追加 Correction 或 Reversal
* 新记录必须引用原记录
* 前端同时展示原版本和纠正版本
* 链上哈希必须对应当时的标准化数据

## 10.4 记录状态

```typescript
type VerificationStatus =
  | 'pending'
  | 'submitting'
  | 'confirming'
  | 'verified'
  | 'failed'
  | 'superseded';
```

只有 `verified` 状态可以展示：

> Injective 已确认

失败或等待状态不得显示：

* 永久保存
* 无人可修改
* 已完成区块链验证

---

# 11. 信息架构

```text
YouFen.xyz
├── /                          首页
├── /demo                      AdventureX Demo
├── /create                    创建社区
├── /communities/:slug         公开社区页
├── /communities/:id/admin
│   ├── /overview              社区概览
│   ├── /members               成员管理
│   ├── /contributions         贡献审核
│   ├── /token                 Token 总览
│   ├── /epochs                月度预算
│   ├── /ledger                Token 账本
│   ├── /proposals             社区 Proposal
│   ├── /records               Injective 记录
│   └── /settings              Token Policy
├── /member/:communityId       成员 Dashboard
├── /vote/:proposalId          投票页
├── /results/:proposalId       投票结果
├── /records/:recordId         可信记录详情
└── /build-in-public           Build in Public
```

---

# 12. 首页

## 12.1 Hero

主标题：

> 你建设了社区，社区就应该有你的一份。

副标题：

> 通过真实贡献获得社区所有权 Token。社区每月持续增发奖励新的贡献者，让所有权始终流向正在建设社区的人。

CTA：

* 创建共同所有的社区
* 查看 AdventureX Demo

## 12.2 信任标签

```text
⛓ Powered by Injective
✓ 100% Token 增发可溯源
✓ 所有历史永久保留
✓ 无人可以静默修改
```

## 12.3 核心价值卡片

### 贡献获得 Token

每一项被社区确认的真实贡献，都可以获得社区所有权 Token。

### 持续贡献保持所有权

旧 Token 不会被没收，但社区持续奖励当前贡献者。不再贡献的成员会被自然稀释。

### 公开通胀，透明治理

每月通胀率、增发预算、预算预支和投票结果全部公开验证。

## 12.4 核心流程

```text
贡献
→ AI 分析
→ 社区确认
→ Token 增发
→ 相对所有权更新
→ 社区投票
→ Injective 验证
```

---

# 13. 创建社区页

## 13.1 表单字段

| 字段           | 类型   | 默认值      |
| ------------ | ---- | -------- |
| 社区名称         | 文本   | 必填       |
| Token 名称     | 文本   | 自动生成     |
| Token Symbol | 文本   | 自动生成     |
| 初始总供应量       | 数字   | 10,000   |
| Epoch 长度     | 数字   | 30天      |
| 固定月度通胀率      | 百分比  | 5%       |
| 最大预支比例       | 百分比  | 25%      |
| 单成员月度上限      | 百分比  | 基础预算的10% |
| 社区类型         | 下拉   | 必填       |
| 社区目标         | 多行文本 | 必填       |
| 是否公开         | 开关   | 开启       |

## 13.2 创建前确认

```text
该社区采用固定月度通胀机制。

成员的 Token 不会因为停止参与而被直接删除。
但随着社区向新的贡献者增发 Token，
不再贡献成员的相对所有权会自然下降。

每月 Token 预算、预算预支、增发记录和投票结果
都将公开记录并通过 Injective 验证。
```

---

# 14. 社区 Dashboard

## 14.1 核心指标

* Token 总供应量
* 当前 Epoch
* 固定月度通胀率
* 本期基础增发额度
* 本期正常增发量
* 本期已预支金额
* 本期剩余额度
* 下一期预支债务
* Token 持有人数
* 最大成员所有权占比
* 待审核贡献
* 进行中 Proposal
* Injective 已确认记录

## 14.2 月度预算卡片

```text
本月 Token 预算

月初供应量：100,000 AXO
固定通胀率：5%

基础增发额度：5,000 AXO
已正常增发：4,600 AXO
正常剩余额度：400 AXO

下月额度预支：
最大可预支：1,250 AXO
已预支：500 AXO
剩余可预支：750 AXO

下期自动扣除：500 AXO
```

## 14.3 风险提示

```text
本期已使用下一 Epoch 的 500 AXO 预算。

这些 Token 当前不会获得治理权，
并将在下一 Epoch 开始时激活。

下一 Epoch 的基础可用预算将自动减少 500 AXO。
```

---

# 15. 成员管理页

## 15.1 表格字段

| 字段         | 说明                  |
| ---------- | ------------------- |
| 成员         | 成员名称                |
| Token 总余额  | 所有已获得 Token         |
| 有效治理 Token | 当前可用于新 Proposal     |
| 待激活 Token  | 预支预算对应 Token        |
| 相对所有权      | 总余额 / 总供应量          |
| 治理占比       | 有效治理 Token / 有效治理总量 |
| 本期获得       | 当前 Epoch 获得量        |
| 最近贡献       | 最后一次有效贡献            |
| 历史贡献       | 已批准贡献数量             |
| 30天变化      | 相对所有权变化             |

## 15.2 成员详情

```text
Liam

Token 总余额：1,300 AXO
有效治理 Token：1,000 AXO
待激活 Token：300 AXO

相对所有权：9.77%
当前治理占比：7.69%

过去90天：
社区总供应量：10,000 → 13,300
Liam Token：1,000 → 1,300
相对所有权：10.00% → 9.77%
```

---

# 16. 贡献审核页

## 16.1 AI 分析结果

```text
贡献类型：帮助其他成员
建议增发：+50 AXO

理由：
该成员帮助 Team Alpha 发现 Demo 钱包连接问题，
符合“帮助其他成员”规则。

本成员本期已获得：150 / 500 AXO
社区正常预算已使用：4,600 / 5,000 AXO

正常预算剩余：400 AXO
无需使用未来预算。
```

额度不足时：

```text
建议增发：+300 AXO
当前正常预算剩余：100 AXO
需要预支：200 AXO

该预支金额占本期基础预算的4%，
需要两名管理员共同批准。

预支 Token 将在下一 Epoch 激活治理权。
```

## 16.2 审核操作

* 使用正常预算批准
* 申请未来预算预支
* 修改 Token 数量
* 请求补充证明
* 拒绝贡献
* 延迟到下一 Epoch 发放

## 16.3 增发确认框

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

---

# 17. Token 预算与 Epoch 页面

## 17.1 Epoch 列表

每个 Epoch 显示：

* Epoch 编号
* 开始时间
* 结束时间
* 月初供应量
* 通胀率
* 基础预算
* 上期预支债务
* 实际基础可用预算
* 本期预支上限
* 正常增发量
* 预支增发量
* 未使用额度
* 状态

## 17.2 关闭 Epoch

Epoch 结束时系统自动：

1. 停止使用当前预算；
2. 作废未使用正常额度；
3. 计算下一 Epoch 月初供应量；
4. 按通胀率生成下一期基础预算；
5. 扣除当前预支债务；
6. 激活当前所有待激活治理 Token；
7. 关闭当前 Epoch；
8. 创建下一 Epoch；
9. 生成 Epoch Summary Record；
10. 提交 Injective 验证。

---

# 18. Token 账本页

## 18.1 字段

| 字段           | 说明                             |
| ------------ | ------------------------------ |
| 时间           | 事件时间                           |
| 成员           | Token 接收者                      |
| 事件           | Mint / Advance Mint / Reversal |
| 数量           | Token 数量                       |
| 预算来源         | 正常预算 / 未来预算                    |
| 治理状态         | Active / Pending               |
| 激活 Epoch     | 治理权生效周期                        |
| 成员余额变化       | 增发前后                           |
| 总供应量变化       | 增发前后                           |
| 相对所有权变化      | 增发前后                           |
| 关联贡献         | Contribution                   |
| 规则版本         | Token Rule Version             |
| 审批人          | 操作人                            |
| Proposal     | 如需投票                           |
| Injective 状态 | Pending / Verified / Failed    |
| 交易哈希         | Tx Hash                        |

## 18.2 过滤器

* 全部
* 正常增发
* 预支增发
* 初始分配
* 特殊奖励
* 关联方增发
* Token 冲销
* 治理权待激活
* 已通过 Injective 验证
* 验证失败

---

# 19. 成员 Dashboard

## 19.1 所有权卡片

```text
你的社区所有权

Token 总余额：1,500 AXO
有效治理 Token：1,000 AXO
待激活 Token：500 AXO

相对 Token 所有权：7.50%
当前治理占比：5.00%
```

## 19.2 所有权趋势

```text
过去30天：

你获得：+50 AXO
社区增发：+2,000 AXO
相对所有权：5.00% → 4.58%
```

相对所有权下降：

> 社区正在持续奖励新的贡献者。继续创造价值可以帮助你维持或提高相对所有权。

相对所有权上升：

> 你获得 Token 的速度高于社区整体通胀，相对所有权正在上升。

## 19.3 待激活 Token

```text
待激活治理 Token：500 AXO

来源：
未来增发预算预支

治理权激活时间：
下一 Epoch 开始时

这些 Token 已计入你的总余额，
但暂时不能影响社区 Proposal。
```

---

# 20. Proposal 页面

## 20.1 创建 Proposal

字段：

* Proposal 标题
* 背景说明
* Proposal 类型
* 投票选项
* 开始时间
* 结束时间
* 最低参与人数
* 执行负责人
* 预计执行时间
* 是否生成 Injective 记录

特殊 Proposal 额外字段：

* Token Policy 修改内容
* 预支金额
* 特殊增发接收人
* 特殊增发 Token 数量
* 关联方关系说明

## 20.2 Proposal 激活

激活时保存：

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

## 20.3 投票页

```text
你的 Token 总余额：1,500 AXO
有效治理 Token：1,000 AXO
本次快照投票权重：900 AXO
待激活 Token：500 AXO

本次快照时间：2026-07-23 14:00
快照区块：#1,234,567
```

提示：

> 本次投票使用 Proposal 激活时的 Token 快照。快照之后获得的 Token 不会影响本次结果。

---

# 21. 投票结果页

必须展示：

* 每个选项获得的 Token 权重
* 每个选项的成员人数
* 总参与人数
* 总参与 Token
* 有效治理 Token 总量
* 快照总供应量
* Token 参与率
* 最终选项
* 执行负责人
* 执行状态
* Snapshot Block
* Injective 交易哈希

区块链模块：

```text
✓ 已通过 Injective 确认

快照总供应量：100,000 AXO
参与治理 Token：32,500 AXO
参与成员：18 人

交易哈希：0x7a8b...
区块高度：#1,234,567

该结果无法被管理员静默覆盖。
任何纠正都会作为新版本公开追加。
```

---

# 22. 公开社区页

## 22.1 信任栏

```text
⛓ Powered by Injective

100% Token 增发可溯源
每月通胀预算公开
所有未来预算预支公开
无人可以静默修改历史
```

## 22.2 数据概览

* Token 总供应量
* Token 持有人数
* 当前月度通胀率
* 当前 Epoch
* 本期基础预算
* 本期正常增发
* 本期预支增发
* 下期预支债务
* 最大成员相对所有权
* 已完成 Proposal
* Injective 记录数

## 22.3 Token 分布

至少展示：

* Top 5 成员所有权
* 其他成员所有权
* 最近90天集中度变化
* 本期 Token 分配类型
* 正常预算与预支预算比例

## 22.4 预算透明度

```text
本 Epoch：

基础预算：5,000 AXO
正常增发：4,600 AXO
未来预算预支：500 AXO
剩余正常额度：400 AXO

下一 Epoch 将自动扣除：500 AXO
```

---

# 23. AI 功能

## 23.1 AI 生成 Token 规则

输出结构：

```typescript
interface GeneratedTokenRule {
  name: string;
  description: string;
  tokenAmount: number;
  repeatLimitPerEpoch?: number;
  evidenceRequired: boolean;
  abuseRisk: string;
  reasoning: string;
}
```

## 23.2 AI 分析贡献

输出：

* 匹配规则
* 建议 Token
* 贡献价值
* 是否重复
* 是否超过成员单期上限
* 正常预算是否足够
* 是否需要预算预支
* 预支比例
* 是否存在关联方风险
* 所需审批方式
* 风险提示

AI 不得：

* 自动批准增发
* 自动预支预算
* 绕过预算限制
* 绕过 Proposal
* 修改历史记录
* 改变 Proposal 快照

## 23.3 AI 通胀健康报告

每个 Epoch 结束时生成：

```text
AdventureX Token Health Report

本期基础通胀率：5%
正常增发：4.6%
预支增发：0.5%
本期总供应增长：5.1%

未来预算债务：500 AXO

Token 分布：
志愿者：35%
Mentor：28%
项目贡献者：27%
管理者：10%

集中度：
前3名成员：31.4%
上期：38.2%

风险：
本期使用了未来预算。
建议下一期优先控制特殊奖励数量。
```

---

# 24. 数据模型

## 24.1 CommunityTokenPolicy

```typescript
interface CommunityTokenPolicy {
  id: string;
  communityId: string;

  tokenName: string;
  tokenSymbol: string;

  initialSupply: number;
  // 注意：currentTotalSupply 不属于 Policy（规则）。
  // 总供应量是独立的社区 Token 状态（独立状态行 / 账本投影），
  // 由 TokenMintEvent、TokenReversalEvent 累加得出，不写入 Policy 版本行。

  epochDurationDays: number;

  // 500 = 5%
  monthlyInflationRateBps: number;

  // 2500 = 25%
  maxAdvanceRateBps: number;

  // 1000 = 10%
  memberMintCapRateBps: number;

  policyVersion: number;
  isTransferable: false;

  pendingPolicyVersionId?: string;
  pendingPolicyEffectiveEpoch?: number;

  createdAt: Date;
  updatedAt: Date;
}
```

> **规则与状态分离 / 版本不可变。**
> Policy 版本行一经写入即不可变，永不 Update：每次规则变更都新增一行新版本，历史版本永久保留、永不覆盖。
> 上面结构中的 `updatedAt` 只存在于可变的“当前生效指针”行（指向当前生效的 Policy 版本），
> 用于记录指针最近一次切换的时间；具体的历史版本行只有 `createdAt`，没有可变的 `updatedAt` 语义。
> `currentTotalSupply` 已从 Policy 移除，见上方注释：它属于独立的社区 Token 状态，而非规则。

## 24.2 TokenEpoch

```typescript
interface TokenEpoch {
  id: string;
  communityId: string;

  epochNumber: number;
  startTime: Date;
  endTime: Date;

  openingSupply: number;
  inflationRateBps: number;

  baseMintBudget: number;

  advanceDebtFromPreviousEpoch: number;
  effectiveRegularBudget: number;

  maxAdvanceAmount: number;

  regularMintedAmount: number;
  advancedMintedAmount: number;

  unusedRegularBudget: number;

  status: 'upcoming' | 'active' | 'closing' | 'closed';

  createdAt: Date;
  closedAt?: Date;

  publicRecordId?: string;
}
```

## 24.3 MemberTokenBalance

```typescript
interface MemberTokenBalance {
  id: string;
  communityId: string;
  memberId: string;

  totalBalance: number;
  activeGovernanceBalance: number;
  pendingGovernanceBalance: number;

  // 所有权与治理权百分比是派生值，不作为权威字段存储：
  //   ownershipPercentage  = totalBalance / currentTotalSupply
  //   governancePercentage = activeGovernanceBalance / activeGovernanceTotalSupply
  // 一律在查询时按“余额 ÷ 总供应量”实时计算，避免与账本产生漂移。

  tokensEarnedCurrentEpoch: number;
  tokensEarnedLifetime: number;
  tokensReversedLifetime: number;

  lastContributionAt?: Date;
  lastMintAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}
```

## 24.4 TokenMintEvent

```typescript
interface TokenMintEvent {
  id: string;
  communityId: string;
  memberId: string;
  epochId: string;

  mintType: TokenMintType;
  budgetSource: TokenBudgetSource;

  amount: number;

  governanceStatus: 'active' | 'pending';
  governanceActivationEpoch?: number;

  memberBalanceBefore: number;
  memberBalanceAfter: number;

  activeGovernanceBefore: number;
  activeGovernanceAfter: number;

  totalSupplyBefore: number;
  totalSupplyAfter: number;

  ownershipPercentageBefore: number;
  ownershipPercentageAfter: number;

  contributionId?: string;
  ruleId?: string;
  proposalId?: string;

  tokenPolicyVersion: number;

  reason: string;
  evidenceUrls: string[];

  approvedBy: string;
  secondApprovedBy?: string;

  relatedParty: boolean;

  publicRecordId?: string;

  createdAt: Date;
}
```

```typescript
enum TokenMintType {
  INITIAL_ALLOCATION = 'initial_allocation',
  CONTRIBUTION = 'contribution',
  SPECIAL_REWARD = 'special_reward',
  HISTORICAL_CORRECTION = 'historical_correction',
}
```

```typescript
enum TokenBudgetSource {
  CURRENT_EPOCH = 'current_epoch',
  NEXT_EPOCH_ADVANCE = 'next_epoch_advance',
}
```

> **跨额度奖励必须拆分为两条 MintEvent。**
> `budgetSource` 保持单值枚举，链上事件 schema 不变。
> 当一笔奖励同时动用正常额度与预支额度时，不得写入混合来源，
> 而是拆成两条 `TokenMintEvent`，共享同一个 `contributionId`：
>
> * 一条 `budgetSource = CURRENT_EPOCH`，`governanceStatus = 'active'`（治理立即生效）；
> * 一条 `budgetSource = NEXT_EPOCH_ADVANCE`，`governanceStatus = 'pending'`（治理待下一 Epoch 激活）。
>
> 两条记录金额之和等于本次奖励总额；正常额度部分用满后剩余部分才计入预支。

## 24.5 TokenAdvanceRequest

```typescript
interface TokenAdvanceRequest {
  id: string;
  communityId: string;
  epochId: string;

  requestedAmount: number;
  approvedAmount?: number;

  advanceRateBps: number;

  reason: string;
  contributionIds: string[];

  status:
    | 'draft'
    | 'pending_second_approval'
    | 'pending_proposal'
    | 'approved'
    | 'rejected'
    | 'executed';

  requestedBy: string;
  secondApprovedBy?: string;
  proposalId?: string;

  createdAt: Date;
  approvedAt?: Date;
  executedAt?: Date;

  publicRecordId?: string;
}
```

## 24.6 TokenReversalEvent

```typescript
interface TokenReversalEvent {
  id: string;
  communityId: string;
  memberId: string;

  originalMintEventId: string;
  amount: number;
  reason: string;

  totalBalanceAfter: number;
  activeGovernanceBalanceAfter: number;
  pendingGovernanceBalanceAfter: number;
  totalSupplyAfter: number;

  approvedBy: string;
  proposalId?: string;

  publicRecordId?: string;
  createdAt: Date;
}
```

## 24.7 Proposal

```typescript
interface Proposal {
  id: string;
  communityId: string;

  type: ProposalType;

  title: string;
  description: string;

  status: 'draft' | 'active' | 'ended' | 'recorded';

  startTime: Date;
  endTime: Date;

  snapshotTime?: Date;
  snapshotBlock?: number;

  epochIdSnapshot?: string;
  totalSupplySnapshot?: number;
  activeGovernanceSupplySnapshot?: number;
  tokenPolicyVersionSnapshot?: number;

  minimumVoterCount: number;

  createdBy: string;
  createdAt: Date;

  resultPublicRecordId?: string;
}
```

## 24.8 Vote

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

---

# 25. 核心计算逻辑

## 25.1 Epoch 基础预算

```typescript
function calculateBaseMintBudget(
  openingSupply: number,
  inflationRateBps: number
): number {
  return Math.floor(
    openingSupply * inflationRateBps / 10_000
  );
}
```

## 25.2 实际基础可用预算与债务滚存

```typescript
function calculateEffectiveRegularBudget(
  baseMintBudget: number,
  advanceDebtFromPreviousEpoch: number
): number {
  return Math.max(
    0,
    baseMintBudget - advanceDebtFromPreviousEpoch
  );
}

// 当本期基础预算不足以偿清上期预支债务时，
// 未清偿的剩余债务必须滚存到后续 Epoch 继续锁定预算，
// 超额部分不得静默免除。
function calculateCarriedOverDebt(
  baseMintBudget: number,
  advanceDebtFromPreviousEpoch: number
): number {
  return Math.max(
    0,
    advanceDebtFromPreviousEpoch - baseMintBudget
  );
}
```

> **债务滚存规则：**
> `effectiveRegularBudget = max(0, 基础预算 − 未清债务)`。
> 若 `未清债务 > 基础预算`，本期有效基础预算为 0，且 `未清债务 − 基础预算` 作为剩余债务滚存至下一 Epoch，继续锁定其预算，直至清零——超额债务不得静默免除。
> **债务未清零期间，禁止任何新的预支。**

## 25.3 最大预支额度

```typescript
function calculateMaxAdvanceAmount(
  baseMintBudget: number,
  maxAdvanceRateBps: number
): number {
  return Math.floor(
    baseMintBudget * maxAdvanceRateBps / 10_000
  );
}
```

## 25.4 成员单期上限

```typescript
function calculateMemberEpochCap(
  baseMintBudget: number,
  memberMintCapRateBps: number
): number {
  return Math.floor(
    baseMintBudget * memberMintCapRateBps / 10_000
  );
}
```

## 25.5 相对所有权

```typescript
function calculateOwnershipPercentage(
  memberBalance: number,
  totalSupply: number
): number {
  if (totalSupply === 0) return 0;
  return memberBalance / totalSupply;
}
```

---

# 26. 后端事务要求

## 26.1 正常增发事务

一次正常 Token 增发必须原子完成：

1. 验证 Contribution 为 Approved；
2. 验证尚未生成 Token；
3. 验证 Token Rule；
4. 验证成员本期上限；
5. 锁定 TokenEpoch；
6. 验证正常剩余额度；
7. 创建 TokenMintEvent；
8. 更新成员余额；
9. 更新有效治理余额；
10. 更新总供应量；
11. 更新 Epoch 正常增发量；
12. 创建待验证 PublicRecord；
13. 提交事务。

> 若一笔奖励在正常额度用满后仍有剩余，需要跨额度：本步骤只铸造落在正常额度内的部分（`budgetSource = CURRENT_EPOCH`），剩余部分按 §26.2 另铸一条预支 MintEvent，二者共享同一 `contributionId`，在同一事务内完成。

## 26.2 预支增发事务

1. 验证正常额度不足；
2. 验证预支上限（按本 Epoch 累计判定：`本期已预支累计 + 本次申请 ≤ 基础预算 × 25%`，同时用同一累计口径判断是否触及 10% 治理阈值）；
3. 验证不存在未偿还的滚动预支；
4. 验证审批权限；
5. 验证 Proposal 或第二审核人；
6. 锁定 TokenEpoch；
7. 创建 TokenMintEvent；
8. 更新成员总余额；
9. 增加成员 Pending Governance Balance；
10. 更新总供应量；
11. 更新 advancedMintedAmount；
12. 创建 TokenAdvanceRequest 执行记录；
13. 创建 PublicRecord；
14. 提交事务。

> 当同一笔奖励跨额度时，本事务只铸造预支部分（`budgetSource = NEXT_EPOCH_ADVANCE`，`governanceStatus = 'pending'`），正常额度部分按 §26.1 铸造；两条 MintEvent 共享同一 `contributionId`，在同一事务内原子完成。

## 26.3 Epoch 切换事务

1. 锁定当前 Epoch；
2. 计算未使用额度；
3. 关闭当前 Epoch；
4. 读取当前总供应量；
5. 计算下期基础预算；
6. 结算预支债务：`effectiveRegularBudget = max(0, 下期基础预算 − 未清债务)`；若未清债务超过下期基础预算，剩余债务（`未清债务 − 下期基础预算`）滚存至再下一 Epoch 继续锁定预算，超额部分不得静默免除；债务未清零期间禁止任何新预支；
7. 激活所有到期 Pending Governance Token；
8. 创建下一 Epoch；
9. 更新 Token Policy 当前周期；
10. 创建 Epoch Summary PublicRecord；
11. 提交事务。

区块链提交在数据库事务完成后异步执行。

---

# 27. API 需求

> **幂等要求。**
> 仅以下三个创建类写端点要求客户端携带 `Idempotency-Key` 请求头，服务端据此去重（重复键返回首次结果，不重复创建）：
> `POST /api/contributions`、`POST /api/proposals`、`POST /api/token-advances`。
> 资金路径不额外引入通用幂等键，而是依赖既有的域级幂等：`(contributionId, budgetSource)` 复合唯一约束（同一贡献同一预算来源至多一条，跨额度拆分时两条事件各占一来源）、`execute` 端点幂等、`recordHash` 含主键、合约 `require(!exists)`。

## Token Policy

```http
GET    /api/communities/:id/token-policy
POST   /api/communities/:id/token-policy/proposals
GET    /api/communities/:id/token-policy/versions
```

## Epoch

```http
GET    /api/communities/:id/token-epochs
GET    /api/token-epochs/:id
POST   /api/internal/token-epochs/:id/close
POST   /api/internal/token-epochs/create-next
```

## Token Balance

```http
GET    /api/members/:id/token-balance
GET    /api/members/:id/token-history
```

## Contribution Mint

```http
POST   /api/contributions              # 需 Idempotency-Key 请求头去重
POST   /api/contributions/:id/analyze
POST   /api/contributions/:id/approve
POST   /api/contributions/:id/mint
POST   /api/contributions/:id/reject
```

## Token Advance

```http
POST   /api/token-advances             # 需 Idempotency-Key 请求头去重
GET    /api/token-advances/:id
POST   /api/token-advances/:id/second-approve
POST   /api/token-advances/:id/create-proposal
POST   /api/token-advances/:id/execute
```

## Token Ledger

```http
GET    /api/communities/:id/token-ledger
POST   /api/token/reverse
```

## Proposal

```http
POST   /api/proposals                  # 需 Idempotency-Key 请求头去重
POST   /api/proposals/:id/start
GET    /api/proposals/:id/snapshot
POST   /api/proposals/:id/vote
POST   /api/proposals/:id/end
```

## Public Records

```http
POST   /api/public-records/:id/submit
POST   /api/public-records/:id/retry
GET    /api/public-records/:id
GET    /api/public-records/:id/verify
```

---

# 28. Injective 合约需求

## 28.1 MVP 合约职责

合约记录：

* Token Mint
* Advance Mint
* Token Reversal
* Epoch Summary
* Token Policy Version
* Proposal Snapshot
* Proposal Result

用户不需要连接钱包。

交易由平台 Server Wallet 统一签名。

## 28.2 Token 不可转让

合约不得提供：

* `transfer`
* `transferFrom`
* `approve`
* `allowance`

允许：

* Mint
* Reverse
* Read Balance
* Read Total Supply
* Read Record Hash

## 28.3 链上事件

```solidity
event TokensMinted(
    bytes32 indexed communityId,
    bytes32 indexed memberId,
    uint256 amount,
    uint256 memberBalanceAfter,
    uint256 totalSupplyAfter,
    uint8 budgetSource,
    uint64 activationEpoch,
    bytes32 indexed recordHash
);

event TokensReversed(
    bytes32 indexed communityId,
    bytes32 indexed memberId,
    uint256 amount,
    uint256 memberBalanceAfter,
    uint256 totalSupplyAfter,
    bytes32 indexed recordHash
);

event EpochRecorded(
    bytes32 indexed communityId,
    uint64 indexed epochNumber,
    uint256 openingSupply,
    uint256 baseBudget,
    uint256 regularMinted,
    uint256 advancedMinted,
    uint256 advanceDebt,
    bytes32 indexed recordHash
);

// weightsMerkleRoot / votesMerkleRoot 为非索引数据字段，紧邻（仍为最后索引的）recordHash 之前，
// 故 recordHash 恒在 topics[3]。root 提交个体可验证性承诺，bytes32(0) 表示本记录未发布对应 Merkle 树。
event ProposalSnapshotRecorded(
    bytes32 indexed communityId,
    bytes32 indexed proposalId,
    uint64 epochNumber,
    uint256 totalSupplySnapshot,
    uint256 activeGovernanceSupplySnapshot,
    uint32 policyVersion,
    bytes32 weightsMerkleRoot,
    bytes32 indexed recordHash
);

event ProposalResultRecorded(
    bytes32 indexed communityId,
    bytes32 indexed proposalId,
    bytes32 winningOptionIdHash,
    uint32 voterCount,
    uint256 totalVoteWeight,
    bytes32 votesMerkleRoot,
    bytes32 indexed recordHash
);
```

## 28.4 隐私

不得直接写入链上：

* 成员姓名
* 邮箱
* 手机号
* IP 地址
* 私密证明材料
* AI Prompt
* 管理员内部备注

链上使用：

* Community ID Hash
* Member ID Hash
* Record Hash
* 数值和版本信息

---

# 29. Demo 数据

## 29.1 AdventureX Token

```text
AdventureX Ownership Token
Symbol：AXO

初始总供应量：100,000 AXO
Epoch：30天
固定月度通胀率：5%
月度基础预算：5,000 AXO
最大预支比例：25%
最大预支额度：1,250 AXO
成员月度上限：500 AXO
```

## 29.2 Liam 稀释 Demo

初始：

```text
Liam Token：10,000 AXO
总供应量：100,000 AXO
相对所有权：10%
```

三个 Epoch 后：

```text
Liam Token：10,000 AXO
总供应量：115,763 AXO
相对所有权：8.64%
```

Liam 重新贡献：

```text
贡献：
帮助新成员完成 Injective Testnet 部署

奖励：
+500 AXO
```

更新后：

```text
Liam Token：10,500 AXO
总供应量：116,263 AXO
相对所有权：9.03%
```

## 29.3 预支 Demo

本月情况：

```text
基础预算：5,000 AXO
已正常增发：4,900 AXO
正常剩余：100 AXO
```

Carol 完成重大社区基础设施贡献：

```text
建议奖励：500 AXO
正常额度剩余：100 AXO
需要预支：400 AXO
```

这笔 500 AXO 奖励跨额度，必须拆成两条 TokenMintEvent（共享同一 contributionId）：

```text
MintEvent #1
  contributionId   = carol-infra-001
  amount           = 100 AXO
  budgetSource     = CURRENT_EPOCH        （正常额度）
  governanceStatus = active               （治理立即生效）

MintEvent #2
  contributionId   = carol-infra-001
  amount           = 400 AXO
  budgetSource     = NEXT_EPOCH_ADVANCE   （预支额度）
  governanceStatus = pending              （治理下一 Epoch 激活）
```

预支比例（按本 Epoch 累计判定）：

```text
本期已预支累计 0 + 本次 400 = 400
400 ÷ 5,000 = 8%
```

审批：

* 8% 未超过基础额度的 10%
* 两名管理员共同批准
* 不需要社区 Proposal

铸造后（两条记录汇总）：

```text
Carol Token 总余额：+500 AXO
立即有效治理 Token：+100 AXO（来自 MintEvent #1）
待激活治理 Token：+400 AXO（来自 MintEvent #2）

下期预算债务：400 AXO
```

---

# 30. MVP 验收标准

## 通胀机制

* [ ] 每个社区有独立 Token
* [ ] 可以设置初始供应量
* [ ] 可以设置固定月度通胀率
* [ ] 使用月初供应量计算基础预算
* [ ] 月内增发不会提高当月基础预算
* [ ] 未使用额度月底作废
* [ ] Token 增发会稀释旧成员相对所有权
* [ ] 不活跃不会直接扣除 Token

## 预算预支

* [ ] 可以预支下一 Epoch 额度
* [ ] 最大预支比例为25%
* [ ] 不能预支下下个 Epoch
* [ ] 下一 Epoch 自动扣除预支债务
* [ ] 未偿还债务不能继续滚动预支
* [ ] 预支不超过10%需要双管理员审批
* [ ] 预支超过10%需要社区 Proposal
* [ ] 预支超过25%系统禁止
* [ ] 预支 Token 进入 Pending Governance
* [ ] 预支 Token 下一 Epoch 自动激活

## 增发控制

* [ ] 普通增发必须关联贡献
* [ ] 增发必须符合 Token Rule
* [ ] 增发受成员单期上限限制
* [ ] 管理者不能直接修改余额
* [ ] 关联方增发需要额外审批
* [ ] 所有增发写入不可删除账本
* [ ] 所有增发保存供应量快照
* [ ] 冲销通过新增 Reversal Event

## 投票

* [ ] Proposal 激活时创建 Token 快照
* [ ] 投票权重使用有效治理 Token 快照
* [ ] 快照后增发不影响当前 Proposal
* [ ] 预支 Token 不立即获得治理权
* [ ] 结果页显示快照时间与区块
* [ ] 结果页显示参与 Token 和成员数
* [ ] 投票结果生成 Injective 记录

## 区块链

* [ ] 合约部署到 Injective Testnet
* [ ] 至少完成一次正常 Mint
* [ ] 至少完成一次 Advance Mint
* [ ] 至少完成一次 Proposal Result 记录
* [ ] 前端显示真实 Tx Hash
* [ ] 前端显示 Block Height
* [ ] 记录可以在区块浏览器验证
* [ ] 历史记录不能被静默覆盖
* [ ] 纠正必须追加新记录

---

# 31. 核心风险与应对

| 风险                   | 应对机制                       |
| -------------------- | -------------------------- |
| 管理者无限增发              | 固定月度通胀预算                   |
| 月内复利增发               | 使用月初供应量快照                  |
| 为用完预算乱发 Token        | 未使用额度自动作废                  |
| 早期成员永久控制             | 持续通胀自然稀释                   |
| 新成员快速垄断              | 成员单期上限                     |
| 管理者给自己增发             | 关联方审批与 Proposal            |
| 投票前突击增发              | Proposal 快照                |
| 预支 Token 操纵投票        | 延迟至下一 Epoch 激活             |
| 无限透支未来预算             | 只允许预支下一 Epoch              |
| 滚动债务                 | 未偿还时禁止再次预支                 |
| 突然修改通胀率              | Proposal 通过且下期生效           |
| Token 金融化            | 不可交易、不可提现、无收益权             |
| 错误记录被删除              | Reversal 和 Correction 追加机制 |
| 旧 Token 导致 Quorum 停摆 | 最低参与人数而非仅供应量 Quorum        |
| 管理者合法稀释异议者           | 预算上限、规则限制、快照和公开记录          |

---

# 32. 最终产品叙事

## 中文版

有份儿是一个无代码社区共同所有平台，把成员的真实贡献转化为不可交易的社区所有权 Token。

每个社区拥有固定的月度 Token 通胀率。新的 Token 被用于奖励当月帮助他人、组织活动、提交作品和建设公共资源的成员。

早期成员的 Token 不会因为停止活跃而被直接没收。但随着社区持续向新的贡献者增发 Token，他们的相对所有权会自然下降。想持续拥有社区，就必须持续为社区创造价值。

当本月出现超出预算的高价值贡献时，社区可以在严格限制下预支下一期额度。所有预支都会从下一期预算中扣除，预支 Token 也必须等到下一 Epoch 才能获得治理权，防止管理者通过突击增发操纵投票。

AI 帮助社区识别贡献、设计 Token 规则和分析通胀健康度。Injective 记录每次增发、预算预支、规则修改和投票结果。

管理者可以确认贡献，但不能隐藏增发、无限透支未来预算或重写过去的历史。

有份儿让社区所有权持续流向正在创造价值的人。

## 英文版

YouFen is a no-code community ownership platform that turns real contributions into non-transferable community ownership tokens.

Each community operates with a fixed monthly inflation rate. Newly minted tokens reward members who help others, organize events, build projects, and create shared resources.

Early contributors never have their tokens confiscated simply because they stop participating. However, as the community continuously rewards current contributors, inactive members are naturally diluted. Maintaining relative ownership requires continued contribution.

When exceptional contributions exceed the current monthly budget, the community may borrow a limited amount from the next epoch. The borrowed amount is automatically deducted from the next budget, and tokens minted from future capacity cannot gain governance power until the next epoch.

AI helps communities recognize contributions, design token rules, and evaluate inflation health. Injective records every mint, budget advance, policy change, and voting result.

Community managers can confirm contributions, but they cannot hide issuance, borrow unlimited future capacity, or rewrite historical records.

YouFen keeps community ownership flowing toward the people who continue to create value.

---

# 33. 核心记忆点

> Token 永远属于你，但你的相对所有权取决于你是否持续贡献。

> 不没收过去的所有权，通过奖励现在的贡献者完成自然稀释。

> 每月固定增发，特殊情况下有限预支，所有行为公开可验证。

> Your tokens remain yours. Your share depends on whether you keep building.
