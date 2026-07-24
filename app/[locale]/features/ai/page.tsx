'use client'

import { useTranslations, useLocale } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { ArrowRight, Sparkles, Shield, Sliders, GitBranch, Zap, CheckCircle } from 'lucide-react'

export default function AiRulesPage() {
  const t = useTranslations('infoPages')
  const locale = useLocale()
  const page: any = t.raw('aiRules')

  const isZh = locale === 'zh'

  const steps = [
    {
      icon: Sparkles,
      label: isZh ? '描述社群' : 'Describe',
      detail: isZh
        ? '输入社群名称、类型（开源项目 / DAO / 兴趣小组 / 志愿者组织）、成员规模和核心目标。AI 会提取关键词并构建社群画像。'
        : 'Enter your community name, type (open-source / DAO / interest group / volunteer org), member count, and core goals. The AI extracts keywords and builds a community profile.',
    },
    {
      icon: Sliders,
      label: isZh ? '生成规则' : 'Generate',
      detail: isZh
        ? 'AI 基于社群画像，从规则库中匹配并定制以下模块：贡献认定标准、发言权计算公式、投票门槛、角色权限、提案流程。每项规则附带生成理由。'
        : 'The AI matches your profile against a rule library and tailors: contribution criteria, voting power formula, voting thresholds, role permissions, and proposal workflows. Every rule includes a generation rationale.',
    },
    {
      icon: GitBranch,
      label: isZh ? '调整版本' : 'Iterate',
      detail: isZh
        ? '不满意某条规则？直接编辑或让 AI 重新生成。所有变更自动保存为版本，可随时回滚。规则变更需要社群投票通过后生效。'
        : 'Not satisfied? Edit directly or ask the AI to regenerate. All changes are auto-saved as versions — roll back anytime. Rule changes take effect only after community vote approval.',
    },
  ]

  const ruleExamples = [
    {
      title: isZh ? '贡献认定标准' : 'Contribution Criteria',
      items: isZh
        ? ['代码提交: ≥ 50 行变更 = 1 贡献点', '文档编写: ≥ 500 字 = 0.5 贡献点', '活动组织: 按参与人数 × 时长加权', 'Mentor 指导: 被指导者反馈评分 × 2']
        : ['Code commits: ≥ 50 lines changed = 1 point', 'Documentation: ≥ 500 words = 0.5 points', 'Event hosting: weighted by attendance × duration', 'Mentorship: mentee feedback score × 2'],
    },
    {
      title: isZh ? '发言权计算' : 'Voting Power Formula',
      items: isZh
        ? ['基数: 每位成员 1 票基础权', '贡献加权: 贡献点 × 0.1 加成', '时间衰减: 超过 30 天未活跃，权重每日递减 2%', '上限: 单人最高不超过总发言权的 15%']
        : ['Base: every member gets 1 vote', 'Contribution bonus: points × 0.1 multiplier', 'Decay: inactive > 30 days, weight drops 2%/day', 'Cap: no single member exceeds 15% of total power'],
    },
  ]

  const aiPromptExample = isZh
    ? '社群: "AdventureX 黑客松志愿者组织"\n类型: 志愿者团队\n规模: 200 人\n目标: 公平分配任务、认可志愿者贡献\n\nAI 分析 →\n- 高流动性: 建议按单次活动结算贡献\n- 任务多样性: 需区分执行类 / 组织类贡献\n- 公平需求强: 建议一人一票 + 贡献徽章体系'
    : 'Community: "AdventureX Hackathon Volunteer Org"\nType: Volunteer team\nSize: 200 members\nGoal: Fair task distribution, recognize volunteer contributions\n\nAI Analysis →\n- High churn: recommend per-event contribution settlement\n- Task variety: differentiate execution vs. organization contributions\n- Strong fairness need: recommend 1P1V + contribution badge system'

  return (
    <main className="min-h-screen bg-white">
      <Navbar forceLight />

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 text-sm text-[#939597] mb-8">
            <Link href="/" className="hover:text-[#131517] transition-colors">{isZh ? '首页' : 'Home'}</Link>
            <span>/</span>
            <span className="text-[#131517]">{page.title}</span>
          </div>
          <h1 className="text-[48px] font-semibold text-[#131517] leading-[1.08] tracking-[-0.03em] mb-6">
            {isZh ? 'AI 生成参与规则' : 'AI-Generated Rules'}
          </h1>
          <p className="text-xl text-[#525252] max-w-2xl leading-relaxed">
            {isZh
              ? '不是套模板，而是真正理解你的社群。输入社群特征，AI 从 200+ 治理案例中匹配最佳实践，生成可执行的参与规则。'
              : "Not a template filler — it actually understands your community. Describe your community, and the AI matches best practices from 200+ governance cases to generate actionable rules."}
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6 bg-[#fafafa]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-[#131517] mb-12">
            {isZh ? '三步生成规则' : 'Three steps to generate rules'}
          </h2>
          <div className="space-y-10">
            {steps.map((step, i) => (
              <div key={i} className="flex gap-6">
                <div className="shrink-0 size-12 rounded-xl bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                  <step.icon className="size-5 text-[#131517]" />
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs font-bold text-[#939597]">0{i + 1}</span>
                    <h3 className="text-lg font-semibold text-[#131517]">{step.label}</h3>
                  </div>
                  <p className="text-[#525252] leading-relaxed max-w-xl">{step.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI reasoning example */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-[#131517] mb-6">
            {isZh ? 'AI 推理过程（真实示例）' : 'AI reasoning (real example)'}
          </h2>
          <div className="bg-[#131517] rounded-2xl p-8 overflow-x-auto">
            <pre className="text-sm text-emerald-400 font-mono leading-relaxed whitespace-pre-wrap">
              {aiPromptExample}
            </pre>
          </div>
        </div>
      </section>

      {/* Rule examples */}
      <section className="py-20 px-6 bg-[#fafafa]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-[#131517] mb-12">
            {isZh ? '生成规则示例' : 'Generated rule examples'}
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {ruleExamples.map((group, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <h3 className="text-sm font-semibold text-[#131517] mb-4 flex items-center gap-2">
                  <CheckCircle className="size-4 text-emerald-500" />
                  {group.title}
                </h3>
                <ul className="space-y-3">
                  {group.items.map((item, j) => (
                    <li key={j} className="text-sm text-[#525252] pl-4 border-l-2 border-gray-100 leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-[#f8f8f8] rounded-2xl p-12 border border-gray-100">
            <Zap className="size-8 text-[#131517] mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-[#131517] mb-3">
              {isZh ? '为你的社群生成第一套规则' : 'Generate your first rule set'}
            </h2>
            <p className="text-[#939597] mb-8 max-w-md mx-auto">
              {isZh ? '无需手动编写，AI 理解你的社群后自动生成可执行的治理规则。' : 'No manual writing needed. The AI understands your community and generates executable governance rules.'}
            </p>
            <Link
              href="/sign-in"
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-[#131517] text-white rounded-full text-sm font-medium hover:bg-black transition-colors"
            >
              {isZh ? '免费开始' : 'Get started free'}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
