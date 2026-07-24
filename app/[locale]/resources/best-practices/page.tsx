'use client'

import { useLocale } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { ArrowRight, Lightbulb, TrendingUp, Shield, ThumbsUp, AlertTriangle, Target, Scale, Eye, Repeat } from 'lucide-react'

export default function BestPracticesPage() {
  const locale = useLocale()
  const isZh = locale === 'zh'

  const strategies = [
    {
      icon: Target,
      title: isZh ? '从小处着手，逐步演进' : 'Start small, evolve gradually',
      body: isZh
        ? '第一个月只开启基础贡献追踪和一人一票。等成员熟悉平台后再引入加权投票和时间衰减。过早引入复杂机制会让成员困惑，反而降低参与度。建议节奏：第 1 周熟悉基础功能 → 第 2 周引入贡献加权 → 第 4 周开启 AI 辅助审核。'
        : 'Month one: only basic contribution tracking and 1P1V. Introduce weighted voting and time decay only after members are comfortable. Complex mechanics too early confuse members and reduce participation. Suggested pace: Week 1 — basics → Week 2 — contribution weights → Week 4 — AI-assisted review.',
    },
    {
      icon: Scale,
      title: isZh ? '权力分散，而非集中' : 'Distribute power, don\'t concentrate it',
      body: isZh
        ? '发言权上限设为 15% 是起点，不是终点。建议同时开启「前 3 名合计不超过 40%」的二次保护。定期检查发言权分布曲线——如果前 10% 成员掌握超过 50% 总发言权，说明需要调整权重或增加多样性维度。'
        : 'The 15% individual cap is a starting point, not the finish line. Enable the secondary safeguard: "top 3 combined ≤ 40%". Regularly check power distribution curves — if the top 10% hold over 50% of total power, it is time to adjust weights or add diversity dimensions.',
    },
    {
      icon: Eye,
      title: isZh ? '默认透明，例外保密' : 'Transparent by default, private by exception',
      body: isZh
        ? '所有提案讨论、投票记录、贡献审核结果默认公开。仅对敏感议题（人事评价、争议裁决）使用匿名投票模式。透明不是口号——当新成员能看到完整的治理历史时，信任不需要从头建立。建议每季度发布一份「治理健康报告」。'
        : 'All proposal discussions, voting records, and contribution reviews are public by default. Reserve anonymous voting only for sensitive topics (personnel reviews, dispute resolution). Transparency is not a slogan — when newcomers see the full governance history, trust doesn\'t need to be built from scratch. Publish a quarterly "governance health report."',
    },
    {
      icon: Repeat,
      title: isZh ? '规则也需迭代' : 'Rules need iteration too',
      body: isZh
        ? '治理规则不是一成不变的宪法。每季度用 AI 分析贡献数据，识别：哪些贡献类型参与最多？哪些权重设置导致了意外行为？有没有成员接近发言权上限？将分析结果作为规则调整提案，由社群投票决定是否采纳。'
        : 'Governance rules are not a fixed constitution. Use AI quarterly to analyze contribution data and identify: which contribution types have the most engagement? Which weight settings cause unexpected behavior? Is anyone nearing the power cap? Turn findings into rule-change proposals for community vote.',
    },
  ]

  const antipatterns = [
    {
      icon: AlertTriangle,
      title: isZh ? '过早引入加权投票' : 'Weighted voting too early',
      body: isZh
        ? '社群前 2 周活跃成员少，贡献数据稀疏。此时开启加权投票会导致少数早期参与者掌握不成比例的权力，后来者感觉不公平。建议至少积累 50 条贡献记录后再启用加权模式。'
        : 'In the first 2 weeks, active members are few and contribution data is sparse. Enabling weighted voting now gives disproportionate power to a handful of early participants, making latecomers feel it is unfair. Wait until at least 50 contribution records exist.',
    },
    {
      icon: AlertTriangle,
      title: isZh ? '贡献类型过于细化' : 'Over-granular contribution types',
      body: isZh
        ? '创建 20 种贡献类型并分配不同权重看似精细，实则增加提交摩擦。成员不知道该选哪个类别，管理者审核负担重。建议从 3-4 个粗粒度类型开始（代码、内容、社群），随需求自然增长。'
        : 'Creating 20 contribution types with different weights seems precise but adds submission friction. Members don\'t know which category to pick, and managers drown in review work. Start with 3-4 coarse types (code, content, community) and let them grow organically.',
    },
    {
      icon: AlertTriangle,
      title: isZh ? '忽略时间衰减' : 'Neglecting time decay',
      body: isZh
        ? '没有衰减机制的发言权系统会被「历史贡献者」锁定。早期活跃但现已离开的成员仍拥有大量投票权，而新加入的核心成员无法获得匹配的影响力。务必从第一天就开启 30 天衰减。'
        : 'Without decay, your voting power system gets locked by "historical contributors." Early-active members who have since left still hold large voting power, while new core members cannot gain matching influence. Always enable 30-day decay from day one.',
    },
    {
      icon: AlertTriangle,
      title: isZh ? '投票门槛过高' : 'Quorum set too high',
      body: isZh
        ? '要求 80% 成员参与才能通过提案听起来很民主，实际会导致提案永远无法通过。建议日常提案法定人数设为 20-30%，重大治理变更设为 50-60%。先用低门槛让投票文化运转起来。'
        : 'Requiring 80% participation for proposals to pass sounds democratic but guarantees nothing ever passes. Set daily proposal quorum at 20-30%, major governance changes at 50-60%. Start with low thresholds to get the voting culture moving first.',
    },
  ]

  const scenario = isZh
    ? {
        title: '开源项目治理案例',
        subtitle: '一个 300 人 TypeScript 工具库社群的治理演进',
        phases: [
          { label: '第 1 月 — 冷启动', items: ['创建社群，连接 GitHub 仓库', '定义两种贡献：代码提交(×1.5) 和文档编写(×1.0)', '一人一票模式通过了 3 个早期提案', '核心团队 8 人自然形成'] },
          { label: '第 2 月 — 激活', items: ['引入加权投票，前 10 名贡献者获得有意义的投票权重', 'Discord 集成上线，社群运营贡献自动记录', '首个 AI 审核通过的 PR 贡献被自动识别', '月活跃贡献者从 8 人增长到 34 人'] },
          { label: '第 3 月 — 成熟', items: ['开启时间衰减，清理了 12 个不活跃账号的发言权', '首次混合模式投票：功能优先级排序', '防寡头上限触发一次——最高贡献者的溢出权重自动分配', '生成了第一份链上可信记录'] },
        ],
      }
    : {
        title: 'Open-source governance case study',
        subtitle: 'The governance evolution of a 300-member TypeScript utility library community',
        phases: [
          { label: 'Month 1 — Cold start', items: ['Created community, connected GitHub repo', 'Defined two contribution types: code commits (×1.5) and docs (×1.0)', '1P1V mode passed 3 early proposals', 'Core team of 8 emerged naturally'] },
          { label: 'Month 2 — Activation', items: ['Introduced weighted voting — top 10 contributors gained meaningful voting weight', 'Discord integration live — community ops contributions auto-tracked', 'First AI-reviewed PR contribution auto-recognized', 'Monthly active contributors grew from 8 to 34'] },
          { label: 'Month 3 — Maturation', items: ['Enabled time decay — cleaned up 12 inactive accounts\' voting power', 'First hybrid-mode vote: feature priority ranking', 'Anti-oligarchy cap triggered once — overflow redistributed from top contributor', 'Generated the first on-chain trusted record'] },
        ],
      }

  return (
    <main className="min-h-screen bg-white">
      <Navbar forceLight />

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 text-sm text-[#939597] mb-8">
            <Link href="/" className="hover:text-[#131517] transition-colors">{isZh ? '首页' : 'Home'}</Link>
            <span>/</span>
            <span className="text-[#939597]">{isZh ? '资源' : 'Resources'}</span>
            <span>/</span>
            <span className="text-[#131517]">{isZh ? '最佳实践' : 'Best Practices'}</span>
          </div>
          <h1 className="text-[48px] font-semibold text-[#131517] leading-[1.08] tracking-[-0.03em] mb-6">
            {isZh ? '最佳实践' : 'Best Practices'}
          </h1>
          <p className="text-xl text-[#525252] max-w-2xl leading-relaxed">
            {isZh
              ? '经过验证的策略和真实案例，帮助你的社群治理从「能跑通」到「跑得好」。'
              : 'Proven strategies and real-world case studies to take your community governance from "it works" to "it works well."'}
          </p>
        </div>
      </section>

      {/* Core strategies */}
      <section className="py-20 px-6 bg-[#fafafa]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-[#131517] mb-4">
            {isZh ? '四项核心策略' : 'Four core strategies'}
          </h2>
          <p className="text-[#939597] mb-10 max-w-xl">
            {isZh
              ? '每个策略都来自真实社群的经验总结，而非理论推导。'
              : 'Every strategy comes from real community experience, not theoretical deduction.'}
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            {strategies.map((s, i) => (
              <div key={i} className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="size-9 rounded-lg bg-[#f5f5f5] flex items-center justify-center mb-4">
                  <s.icon className="size-4 text-[#131517]" />
                </div>
                <h3 className="text-sm font-semibold text-[#131517] mb-2">{s.title}</h3>
                <p className="text-xs text-[#525252] leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Case study */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-[#131517] mb-2">{scenario.title}</h2>
          <p className="text-[#939597] mb-10">{scenario.subtitle}</p>
          <div className="space-y-6">
            {scenario.phases.map((phase, i) => (
              <div key={i} className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-xs font-bold text-[#939597] bg-[#f5f5f5] px-2 py-0.5 rounded-full">
                    {isZh ? `阶段 ${i + 1}` : `Phase ${i + 1}`}
                  </span>
                  <h3 className="text-base font-semibold text-[#131517]">{phase.label}</h3>
                </div>
                <ul className="space-y-2">
                  {phase.items.map((item, j) => (
                    <li key={j} className="text-sm text-[#525252] pl-5 relative before:content-[''] before:absolute before:left-0 before:top-[9px] before:w-1.5 before:h-1.5 before:rounded-full before:bg-[#d1d1d1]">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Anti-patterns */}
      <section className="py-20 px-6 bg-[#fafafa]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-[#131517] mb-4">
            {isZh ? '常见误区' : 'Common pitfalls'}
          </h2>
          <p className="text-[#939597] mb-10 max-w-xl">
            {isZh
              ? '这些错误我们见过太多次。避开它们，少走弯路。'
              : 'We have seen these mistakes too many times. Avoid them and save yourself the detour.'}
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            {antipatterns.map((a, i) => (
              <div key={i} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="size-4 text-amber-500" />
                  <h3 className="text-sm font-semibold text-[#131517]">{a.title}</h3>
                </div>
                <p className="text-xs text-[#525252] leading-relaxed">{a.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-[#f8f8f8] rounded-2xl p-12 border border-gray-100">
            <ThumbsUp className="size-8 text-[#131517] mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-[#131517] mb-3">
              {isZh ? '在实践中找到最适合你的方式' : 'Find what works best in practice'}
            </h2>
            <p className="text-[#939597] mb-8 max-w-md mx-auto">
              {isZh ? '每个社群都不同。创建你的社群，边做边迭代。' : 'Every community is different. Create yours and iterate as you go.'}
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
