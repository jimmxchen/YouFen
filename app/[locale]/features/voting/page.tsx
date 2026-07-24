'use client'

import { useTranslations, useLocale } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { ArrowRight, Equal, Hash, EyeOff, Layers, FileCheck, ShieldCheck } from 'lucide-react'

export default function VotingPage() {
  const t = useTranslations('infoPages')
  const locale = useLocale()
  const isZh = locale === 'zh'

  const modes = [
    {
      icon: Hash,
      title: isZh ? '加权投票' : 'Weighted Voting',
      tag: isZh ? '推荐' : 'Recommended',
      body: isZh
        ? '每位成员的票数 = 其当前发言权值。贡献越多，票越重。适用于技术决策、资金分配等需要体现专业贡献差异的场景。投票结果自动乘以各成员的有效 VP，实时计算。'
        : "Each member's vote = their current voting power. More contribution, heavier vote. Ideal for technical decisions, fund allocation, and scenarios where expertise should carry weight. Results auto-multiply by each member's effective VP in real time.",
      example: isZh
        ? '例：技术委员会选举。核心贡献者李四(12 VP)投票给候选人A，普通成员王五(2 VP)投票给候选人B。候选人A 获得 12 票，候选人B 获得 2 票。'
        : 'Ex: Tech committee election. Core contributor Sarah (12 VP) votes for candidate A, regular member Tom (2 VP) votes for B. Candidate A gets 12 votes, B gets 2.',
    },
    {
      icon: Equal,
      title: isZh ? '一人一票' : 'One Person One Vote',
      tag: isZh ? '公平优先' : 'Fairness',
      body: isZh
        ? '每成员一票，权重相同。适用于社群规则变更、人事任免等需要体现民主平等原则的决策。所有成员无论贡献多少，在此模式下发言权相等。'
        : "One member, one vote. Equal weight for all. Best for community rule changes, personnel decisions, and scenarios where democratic equality is paramount. All members have equal say regardless of contribution history.",
      example: isZh
        ? '例：社群行为准则修订。200 名成员每人一票，需要 60% 赞成通过。所有人权重相同，确保规则变更获得广泛的社群共识。'
        : 'Ex: Code of conduct revision. 200 members each get 1 vote, 60% approval required for passage. Equal weight ensures broad community consensus.',
    },
    {
      icon: Layers,
      title: isZh ? '混合模式' : 'Hybrid Mode',
      tag: isZh ? '高级' : 'Advanced',
      body: isZh
        ? '将投票分为两阶段：第一阶段一人一票决定是否推进提案（达到法定人数即可），第二阶段加权投票决定具体方案选择。兼顾广泛参与和专家决策。'
        : 'Two-phase vote: Phase 1 uses 1P1V to decide whether to proceed (quorum-based), Phase 2 uses weighted voting to choose the specific option. Balances broad participation with expert decision-making.',
      example: isZh
        ? '例：年度预算分配。第一阶段：是否批准总预算？一人一票，需 50% 法定人数。第二阶段：预算如何分配？加权投票，各方案按 VP 总分排序。'
        : 'Ex: Annual budget. Phase 1: Approve total budget? 1P1V, 50% quorum. Phase 2: How to allocate? Weighted voting, options ranked by total VP.',
    },
    {
      icon: EyeOff,
      title: isZh ? '匿名投票' : 'Anonymous Voting',
      tag: isZh ? '隐私保护' : 'Privacy',
      body: isZh
        ? '投票内容对所有人不可见，仅公布最终统计结果。适用于敏感议题（人事评价、争议裁决），保护投票者免受潜在压力或报复。技术上通过链上零知识证明保证匿名性。'
        : 'Individual votes are hidden from everyone — only aggregate results are published. Best for sensitive topics (personnel reviews, dispute resolution), protecting voters from potential pressure or retaliation. Anonymity is technically guaranteed via on-chain zero-knowledge proofs.',
      example: isZh
        ? '例：社群管理员续任投票。成员匿名投票赞成/反对/弃权，最终只公布各选项的票数和百分比，无法追溯个人投票记录。'
        : 'Ex: Community admin renewal vote. Members anonymously vote approve/reject/abstain. Only total counts and percentages are published — individual votes cannot be traced.',
    },
  ]

  return (
    <main className="min-h-screen bg-white">
      <Navbar forceLight />

      <section className="pt-32 pb-12 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 text-sm text-[#939597] mb-8">
            <Link href="/" className="hover:text-[#131517] transition-colors">{isZh ? '首页' : 'Home'}</Link>
            <span>/</span>
            <span className="text-[#131517]">{isZh ? '投票与决策' : 'Voting & Decisions'}</span>
          </div>
          <h1 className="text-[48px] font-semibold text-[#131517] leading-[1.08] tracking-[-0.03em] mb-6">
            {isZh ? '投票与决策' : 'Voting & Decision-Making'}
          </h1>
          <p className="text-xl text-[#525252] max-w-2xl leading-relaxed">
            {isZh
              ? '不同的决策需要不同的投票方式。四种模式覆盖从日常事务到重大治理的所有场景，让你的社群在任何情况下都能做出公正的决定。'
              : 'Different decisions demand different voting methods. Four modes cover everything from day-to-day matters to critical governance, ensuring fair outcomes in every scenario.'}
          </p>
        </div>
      </section>

      {/* Voting modes */}
      <section className="pt-8 pb-20 px-6">
        <div className="max-w-4xl mx-auto space-y-12">
          {modes.map((mode, i) => (
            <div key={i} className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
              <div className="flex items-start gap-4 mb-4">
                <div className="shrink-0 size-10 rounded-xl bg-[#f5f5f5] flex items-center justify-center">
                  <mode.icon className="size-5 text-[#131517]" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-[#131517]">{mode.title}</h3>
                    <span className="text-[10px] font-bold text-[#939597] bg-[#f5f5f5] px-2 py-0.5 rounded-full uppercase tracking-wider">
                      {mode.tag}
                    </span>
                  </div>
                  <p className="text-sm text-[#525252] leading-relaxed mb-4">{mode.body}</p>
                  <div className="bg-[#fafafa] rounded-xl p-4 border border-gray-100">
                    <p className="text-xs text-[#939597] leading-relaxed">{mode.example}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Process */}
      <section className="py-20 px-6 bg-[#131517] text-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-white mb-12">
            {isZh ? '提案生命周期' : 'Proposal lifecycle'}
          </h2>
          <div className="grid grid-cols-5 gap-4">
            {[
              { step: '01', label: isZh ? '发起' : 'Draft', desc: isZh ? '撰写提案\n选择投票模式' : 'Write proposal\nChoose mode' },
              { step: '02', label: isZh ? '公示' : 'Discuss', desc: isZh ? '社群讨论\n修改完善' : 'Community review\nRefine' },
              { step: '03', label: isZh ? '投票' : 'Vote', desc: isZh ? '开放投票\n实时计票' : 'Open voting\nReal-time tally' },
              { step: '04', label: isZh ? '结束' : 'Close', desc: isZh ? '自动统计\n公布结果' : 'Auto-tally\nPublish result' },
              { step: '05', label: isZh ? '上链' : 'Record', desc: isZh ? '生成可信记录\n链上存证' : 'On-chain record\nVerifiable proof' },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <div className="text-3xl font-bold text-white/20 mb-3">{s.step}</div>
                <div className="text-sm font-semibold text-white mb-1">{s.label}</div>
                <div className="text-xs text-white/40 whitespace-pre-line leading-relaxed">{s.desc}</div>
                {i < 4 && <div className="hidden md:block absolute text-white/10">→</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-[#f8f8f8] rounded-2xl p-12 border border-gray-100">
            <FileCheck className="size-8 text-[#131517] mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-[#131517] mb-3">
              {isZh ? '发起你的第一个提案' : 'Create your first proposal'}
            </h2>
            <p className="text-[#939597] mb-8 max-w-md mx-auto">
              {isZh ? '选择投票模式，发起提案，让社群一起决策。' : 'Choose a voting mode, create a proposal, and let your community decide together.'}
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
