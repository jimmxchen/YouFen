export const meta = {
  name: 'fable-opus-pipeline',
  description: 'Fable 5 负责规划/设计/对抗性审查，Opus 4.8 负责执行的分层实现流水线',
  whenToUse: '中大型功能实现：Fable 把关计划与质量，Opus 按波次并行编码执行（TDD）',
  phases: [
    { title: 'Plan', detail: 'Fable 5 读库并产出分波次实现计划' },
    { title: 'Challenge', detail: 'Fable 5 双红队对抗性审查计划并修订' },
    { title: 'Execute', detail: 'Opus 4.8 按波次并行实现（TDD）', model: 'opus' },
    { title: 'Review', detail: 'Fable 5 四镜头对抗性代码审查 + 高危复核' },
    { title: 'Fix', detail: 'Opus 4.8 修复 + Fable 5 复审循环', model: 'opus' },
  ],
}

const input = typeof args === 'string' ? { task: args } : (args || {})
if (!input.task) {
  throw new Error('用法: Workflow({name:"fable-opus-pipeline", args:{task:"要实现的功能", context:"可选上下文"}})')
}

// agent() 在 API 瞬断/被跳过时返回 null——自动重试而非让流水线崩溃
async function agentR(prompt, opts, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    const o = i > 1 && opts && opts.label ? { ...opts, label: `${opts.label}~retry${i - 1}` } : opts
    const r = await agent(prompt, o)
    if (r !== null && r !== undefined) return r
    log(`⚠ agent ${opts && opts.label ? opts.label : '(未命名)'} 第 ${i} 次返回空（疑似 API 中断）${i < tries ? '，重试' : '，放弃'}`)
  }
  return null
}
const TASK = input.task
const CONTEXT = input.context || ''
const MAX_FIX_ROUNDS = input.maxFixRounds || 3

// ---------- Schemas ----------
const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    overview: { type: 'string' },
    conventions: { type: 'string', description: '所有执行者必须遵守的共享约定' },
    waves: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          wave: { type: 'integer' },
          rationale: { type: 'string' },
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                spec: { type: 'string', description: '自包含规格：目标、接口签名、边界情况、与其他任务的契约' },
                files: { type: 'array', items: { type: 'string' } },
                mustNotTouch: { type: 'array', items: { type: 'string' } },
                acceptance: { type: 'array', items: { type: 'string' } },
                testCommand: { type: 'string' },
              },
              required: ['id', 'title', 'spec', 'files', 'acceptance'],
            },
          },
        },
        required: ['wave', 'rationale', 'tasks'],
      },
    },
    risks: { type: 'array', items: { type: 'string' } },
  },
  required: ['overview', 'conventions', 'waves', 'risks'],
}

const CRITIQUE_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['approve', 'revise'] },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          area: { type: 'string' },
          issue: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['severity', 'area', 'issue', 'suggestion'],
      },
    },
  },
  required: ['verdict', 'issues'],
}

const EXEC_SCHEMA = {
  type: 'object',
  properties: {
    taskId: { type: 'string' },
    status: { type: 'string', enum: ['done', 'blocked'] },
    filesChanged: { type: 'array', items: { type: 'string' } },
    testsRun: { type: 'string', description: '实际运行的测试命令与输出摘要' },
    testResult: { type: 'string', enum: ['pass', 'fail', 'none'] },
    notes: { type: 'string' },
  },
  required: ['taskId', 'status', 'filesChanged', 'testResult', 'notes'],
}

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'integer' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          category: { type: 'string' },
          summary: { type: 'string' },
          failureScenario: { type: 'string', description: '具体输入/状态 → 错误结果' },
        },
        required: ['file', 'severity', 'category', 'summary', 'failureScenario'],
      },
    },
  },
  required: ['findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    isReal: { type: 'boolean' },
    reasoning: { type: 'string' },
  },
  required: ['isReal', 'reasoning'],
}

const FIX_SCHEMA = {
  type: 'object',
  properties: {
    fixed: { type: 'array', items: { type: 'string' } },
    skipped: { type: 'array', items: { type: 'string' } },
    evidence: {
      type: 'array',
      description: '每处修改的落盘证据，复审员将逐条用 Grep/Read 验证',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          snippet: { type: 'string', description: '修复后关键代码行的原文（磁盘上可 Grep 到）' },
        },
        required: ['file', 'snippet'],
      },
    },
    notes: { type: 'string' },
  },
  required: ['fixed', 'skipped', 'evidence', 'notes'],
}

const RECHECK_SCHEMA = {
  type: 'object',
  properties: {
    unresolved: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          summary: { type: 'string' },
          reason: { type: 'string' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          failureScenario: { type: 'string' },
        },
        required: ['file', 'summary', 'reason', 'severity', 'failureScenario'],
      },
    },
  },
  required: ['unresolved'],
}

// ---------- Phase 1: Plan (Fable 5) ----------
phase('Plan')
const draftPlan = await agentR(
  `你是首席架构师。在当前仓库中为以下任务制定可并行执行的实现计划。

任务：${TASK}
${CONTEXT ? `补充上下文：${CONTEXT}` : ''}

要求：
1. 先实际读仓库（文档、现有代码、配置），计划必须落在真实文件路径上；
2. 把工作拆成若干"波次"（wave）：同一波次内的任务文件互不重叠、可完全并行；波次之间才允许有依赖，顺序执行；
3. 每个任务的 spec 必须完全自包含——执行者是另一个没有本对话任何上下文的模型，spec 要写清目标、精确的接口/类型签名、边界情况、与其他任务共享的契约；
4. 严格 TDD：每个任务的 acceptance 必须包含测试要求，testCommand 给出可直接运行的验证命令；
5. conventions 写明所有执行者共享的约定：错误处理方式、命名、不可变数据、单文件 <400 行、测试框架、绝对禁触目录；
6. 波次尽量少、单波任务尽量多，但绝不允许同一波的两个任务写同一个文件（含测试文件）。`,
  { label: 'plan', phase: 'Plan', schema: PLAN_SCHEMA, effort: 'xhigh' }
)
if (!draftPlan) throw new Error('规划 agent 连续多次失败（API 中断），请稍后 resume 重试')
log(`计划草案：${draftPlan.waves.length} 个波次，共 ${draftPlan.waves.reduce((n, w) => n + w.tasks.length, 0)} 个任务`)

// ---------- Phase 2: Challenge (Fable 5 双红队 → 修订) ----------
phase('Challenge')
const planJson = JSON.stringify(draftPlan)
const critiques = (await parallel([
  () => agentR(
    `你是红队评审 A（完整性与正确性）。对抗性审查这份实现计划，在当前仓库中实际核对文件路径与现有代码。找出：遗漏的必要工作、接口契约错误、波次依赖顺序错误、同一波次内的文件写冲突、验收标准无法客观判定的任务。宁可苛刻，不可放水。\n\n计划：${planJson}`,
    { label: 'redteam:completeness', phase: 'Challenge', schema: CRITIQUE_SCHEMA, effort: 'high' }
  ),
  () => agentR(
    `你是红队评审 B（过度工程与执行风险）。对抗性审查这份实现计划。找出：MVP 不需要的过度设计、spec 里的歧义（执行模型会被迫猜测的地方）、不现实的 testCommand、单任务规模过大（一个 agent 一次做不完）、conventions 缺失导致风格分裂的风险。宁可苛刻，不可放水。\n\n计划：${planJson}`,
    { label: 'redteam:overengineering', phase: 'Challenge', schema: CRITIQUE_SCHEMA, effort: 'high' }
  ),
])).filter(Boolean)

const highIssues = critiques.flatMap(c => c.issues).filter(i => i.severity === 'high')
log(`红队反馈：${critiques.flatMap(c => c.issues).length} 条问题（高危 ${highIssues.length} 条）`)

let plan = draftPlan
if (critiques.some(c => c.verdict === 'revise') || highIssues.length > 0) {
  plan = (await agentR(
    `你是首席架构师。根据红队反馈修订实现计划：所有 high 问题必须解决，medium 酌情采纳，明显错误的建议可拒绝但要在 overview 末尾说明理由。保持波次内文件不重叠、spec 自包含、TDD 要求不变。输出修订后的完整计划。

原计划：${planJson}

红队反馈：${JSON.stringify(critiques)}`,
    { label: 'revise-plan', phase: 'Challenge', schema: PLAN_SCHEMA, effort: 'xhigh' }
  )) || draftPlan
  log(plan === draftPlan ? '⚠ 修订 agent 失败，回退使用原计划' : '计划已按红队意见修订')
}

// ---------- Phase 3: Execute (Opus 4.8，按波次并行) ----------
phase('Execute')
const execResults = []
for (const wave of plan.waves) {
  log(`Wave ${wave.wave}（${wave.tasks.length} 个任务并行，Opus 4.8）：${wave.rationale}`)
  const results = (await parallel(wave.tasks.map(t => () =>
    agentR(
      `你是执行工程师，在当前仓库实现以下任务。严格 TDD：先写测试（确认失败），再实现（测试通过），必要时重构。

共享约定（必须遵守）：
${plan.conventions}

任务 ${t.id}：${t.title}

规格：
${t.spec}

只允许创建/修改这些文件（含其配套测试文件）：${t.files.join('、')}
${t.mustNotTouch && t.mustNotTouch.length ? `绝对禁止触碰：${t.mustNotTouch.join('、')}` : ''}

验收标准（逐条满足）：
${t.acceptance.map(a => `- ${a}`).join('\n')}
${t.testCommand ? `\n完成后运行：${t.testCommand}，把真实输出摘要写进 testsRun，据实填写 testResult。` : ''}

规则：不要 git commit。其他任务正在并行修改其他文件，越界写文件会制造冲突，视为任务失败。如果规格存在无法实现的致命缺陷，返回 status=blocked 并在 notes 说明原因，不要自行更改设计。taskId 填 "${t.id}"。`,
      { label: `exec:${t.id}`, phase: 'Execute', schema: EXEC_SCHEMA, model: 'opus', effort: 'high' }
    )
  ))).filter(Boolean)
  execResults.push(...results)
  const blocked = results.filter(r => r.status === 'blocked')
  const failed = results.filter(r => r.testResult === 'fail')
  if (blocked.length) log(`⚠ Wave ${wave.wave} 有 ${blocked.length} 个任务受阻：${blocked.map(b => b.taskId).join('、')}`)
  if (failed.length) log(`⚠ Wave ${wave.wave} 有 ${failed.length} 个任务测试未过：${failed.map(f => f.taskId).join('、')}`)
}

// ---------- Phase 4: Review (Fable 5 四镜头 + 高危对抗复核) ----------
phase('Review')
const execSummary = JSON.stringify(execResults.map(r => ({ taskId: r.taskId, status: r.status, files: r.filesChanged, testResult: r.testResult })))
const LENSES = [
  { key: 'correctness', prompt: '正确性镜头：逻辑错误、边界条件、并发/事务问题、错误处理缺失。' },
  { key: 'spec', prompt: `规格符合度镜头：对照计划逐任务核对验收标准是否真正满足，接口契约是否与 spec 一致。计划：${JSON.stringify(plan.waves)}` },
  { key: 'security', prompt: '安全镜头：硬编码密钥、注入、未校验输入、敏感信息泄露、权限缺口。' },
  { key: 'tests', prompt: '测试质量镜头：测试是否真的验证了行为（而非同义反复）、是否存在假绿、关键路径是否有测试覆盖。' },
]
let findings = (await parallel(LENSES.map(l => () =>
  agent(
    `你是对抗性代码评审。用 git status / git diff 查看当前仓库刚被并行实现的全部改动，实际读代码、必要时跑测试验证怀疑。只报告有具体失败场景的真实问题，不报风格意见。\n\n${l.prompt}\n\n执行摘要：${execSummary}`,
    { label: `review:${l.key}`, phase: 'Review', schema: FINDINGS_SCHEMA, effort: 'xhigh' }
  )
))).filter(Boolean).flatMap(r => r.findings)
log(`初审发现 ${findings.length} 个问题`)

const highFindings = findings.filter(f => f.severity === 'high')
const verifiedHigh = []
if (highFindings.length) {
  const verdicts = (await parallel(highFindings.map(f => () =>
    agentR(
      `你是怀疑论者。在当前仓库中实际读代码，尝试反驳这个 bug 报告——证明它不成立或不可触发。反驳不了才承认它是真的。\n\n报告：${JSON.stringify(f)}`,
      { label: `verify:${f.file}`, phase: 'Review', schema: VERDICT_SCHEMA, effort: 'high' }
    ).then(v => ({ f, v }))
  ))).filter(Boolean)
  for (const { f, v } of verdicts) if (v && v.isReal) verifiedHigh.push(f)
  log(`高危复核：${highFindings.length} 报告 → ${verifiedHigh.length} 确认`)
}
let toFix = [...verifiedHigh, ...findings.filter(f => f.severity === 'medium')]
const lowOnly = findings.filter(f => f.severity === 'low')

// ---------- Phase 5: Fix loop (Opus 修复 → Fable 复审) ----------
phase('Fix')
let round = 0
while (toFix.length && round < MAX_FIX_ROUNDS) {
  round++
  log(`修复第 ${round} 轮：${toFix.length} 个问题（Opus 4.8）`)
  const byFile = {}
  for (const f of toFix) { (byFile[f.file] = byFile[f.file] || []).push(f) }
  const fixReports = (await parallel(Object.entries(byFile).map(([file, fs]) => () =>
    agentR(
      `你是修复工程师。在当前仓库修复文件 ${file} 中的以下已确认问题。修复前先读代码理解根因；修复后运行相关测试证明问题消除且无回归。不要 git commit，不要顺手重构无关代码。

修复完成后，必须在 evidence 中逐处提交落盘证据：每处修改给出文件路径 + 修复后关键代码行的原文（要能在磁盘上 Grep 到）。复审员会先验证你的修改确实存在于磁盘——只声称修复而磁盘无对应改动，按未修复处理。

问题清单：${JSON.stringify(fs)}

共享约定：${plan.conventions}`,
      { label: `fix:${file}`, phase: 'Fix', schema: FIX_SCHEMA, model: 'opus', effort: 'high' }
    )
  ))).filter(Boolean)
  // 强制复验：先验证据落盘（防修复 agent 谎报），再验问题真正解决
  const recheck = await agentR(
    `你是复审员，执行强制两步复验：

第一步（落盘验证）：下面是各修复 agent 提交的修改证据。逐条用 Grep/Read 验证这些代码确实存在于磁盘上的对应文件中——修复 agent 可能谎报。凡是某问题声称已修但磁盘上找不到对应修改，一律放入 unresolved，reason 标注 "fix-not-landed"。

第二步（语义验证）：对确认已落盘的修复，实际读代码、跑相关测试，验证原问题真正消除且无回归。仍存在的问题放入 unresolved。

绝不轻信任何修复声明，一切以磁盘代码和测试输出为准。

原问题清单：${JSON.stringify(toFix)}

修复证据：${JSON.stringify(fixReports.map(r => ({ fixed: r.fixed, skipped: r.skipped, evidence: r.evidence })))}`,
    { label: `recheck:round${round}`, phase: 'Fix', schema: RECHECK_SCHEMA, effort: 'xhigh' }
  )
  toFix = (recheck && recheck.unresolved) || []
  log(`第 ${round} 轮复审：剩余 ${toFix.length} 个未解决`)
}
if (toFix.length) log(`⚠ 修复循环达到上限（${MAX_FIX_ROUNDS} 轮），仍有 ${toFix.length} 个问题未解决，已列入最终报告`)

return {
  planOverview: plan.overview,
  waves: plan.waves.map(w => ({ wave: w.wave, tasks: w.tasks.map(t => t.id) })),
  execution: execResults,
  review: {
    totalFindings: findings.length,
    confirmedHigh: verifiedHigh.length,
    fixRounds: round,
    stillUnresolved: toFix,
    lowSeverityNotes: lowOnly,
  },
  risks: plan.risks,
}
