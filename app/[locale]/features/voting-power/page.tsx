'use client'

import { useTranslations, useLocale } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { ArrowRight, TrendingUp, UserCheck, Clock, Shield, BarChart3 } from 'lucide-react'

export default function VotingPowerPage() {
  const t = useTranslations('infoPages')
  const locale = useLocale()
  const isZh = locale === 'zh'

  const features = [
    {
      icon: TrendingUp,
      title: isZh ? '多维贡献计分' : 'Multi-dimensional scoring',
      body: isZh
        ? '不只是看代码量。系统从代码贡献、内容产出、社群运营、mentor 指导四个维度计算综合贡献分。每个维度可配权重，管理者根据社群特点调整侧重点——技术社群可以偏重代码，知识社群可以偏重内容。'
        : 'Beyond just lines of code. The system scores contributions across four dimensions: code, content, community operations, and mentorship. Weights are adjustable per dimension — tech communities can emphasize code, knowledge communities can emphasize content.',
    },
    {
      icon: Clock,
      title: isZh ? '时间衰减机制' : 'Time decay mechanism',
      body: isZh
        ? '发言权不是永久的。超过 30 天未产生新贡献的成员，其发言权每日递减 2%，直至回到基础值（1 票）。这确保社群决策始终由当前活跃的参与者主导，避免"早期贡献者永久控盘"。'
        : 'Voting power is not permanent. Members inactive for > 30 days see their power decay 2% daily back to the base 1 vote. This keeps decision-making in the hands of currently active contributors, preventing early-contributor entrenchment.',
    },
    {
      icon: Shield,
      title: isZh ? '防寡头机制' : 'Anti-oligarchy safeguards',
      body: isZh
        ? '单人发言权上限为总发言权的 15%，无论贡献多少。当某人接近阈值时，系统自动将溢出权重按比例分配给其他活跃成员。同时，任何单一投票中，前 3 名成员的票数合计不得超过总票数的 40%。'
        : 'Individual voting power is capped at 15% of total, regardless of contribution volume. When someone nears the threshold, overflow weight is redistributed proportionally to other active members. Additionally, the top 3 voters combined cannot exceed 40% in any single proposal.',
    },
    {
      icon: BarChart3,
      title: isZh ? '可视化面板' : 'Visual dashboard',
      body: isZh
        ? '每位成员的发言权组成完全透明——基础票数、各项贡献加成、时间衰减值、当前有效票数。社群管理者可以查看发言权分布曲线，及时发现集中的风险。成员也能看到自己的成长轨迹。'
        : "Every member's voting power breakdown is fully transparent — base vote, contribution bonuses, decay status, current effective weight. Managers can view power distribution curves to detect concentration risks early. Members see their own growth trajectory too.",
    },
  ]

  const formula = isZh
    ? 'VP = 1 + Σ(贡献i × 权重i × 新鲜度i)\nVP ≤ 总发言权 × 15%\n新鲜度 = max(0, 1 - 距上次贡献天数 × 0.02)'
    : 'VP = 1 + Σ(contribution_i × weight_i × freshness_i)\nVP ≤ total_VP × 15%\nfreshness = max(0, 1 - days_since_last_contribution × 0.02)'

  return (
    <main className="min-h-screen bg-white">
      <Navbar forceLight />

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 text-sm text-[#939597] mb-8">
            <Link href="/" className="hover:text-[#131517] transition-colors">{isZh ? '首页' : 'Home'}</Link>
            <span>/</span>
            <span className="text-[#131517]">{isZh ? '发言权管理' : 'Voting Power'}</span>
          </div>
          <h1 className="text-[48px] font-semibold text-[#131517] leading-[1.08] tracking-[-0.03em] mb-6">
            {isZh ? '发言权管理' : 'Voting Power Management'}
          </h1>
          <p className="text-xl text-[#525252] max-w-2xl leading-relaxed">
            {isZh
              ? '不是拍脑袋分配权力，而是一套可量化、可验证、可演进的数学模型。每一次投票背后都有清晰的贡献支撑。'
              : 'Not arbitrary power allocation — a quantifiable, verifiable, evolvable mathematical model. Every vote is backed by clear, traceable contributions.'}
          </p>
        </div>
      </section>

      {/* Formula highlight */}
      <section className="py-16 px-6 bg-[#131517] text-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-sm font-semibold text-white/40 uppercase tracking-widest mb-8">
            {isZh ? '核心公式' : 'Core Formula'}
          </h2>
          <pre className="text-lg md:text-xl text-white/80 font-mono leading-relaxed whitespace-pre-wrap bg-white/5 rounded-xl p-8 border border-white/10">
            {formula}
          </pre>
        </div>
      </section>

      {/* Feature cards */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-[#131517] mb-12">
            {isZh ? '四个核心机制' : 'Four core mechanisms'}
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {features.map((f, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="size-10 rounded-xl bg-[#f5f5f5] flex items-center justify-center mb-4">
                  <f.icon className="size-5 text-[#131517]" />
                </div>
                <h3 className="text-base font-semibold text-[#131517] mb-3">{f.title}</h3>
                <p className="text-sm text-[#525252] leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Example scenario */}
      <section className="py-20 px-6 bg-[#fafafa]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-[#131517] mb-8">
            {isZh ? '实际场景' : 'Real scenario'}
          </h2>
          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
            <div className="space-y-6">
              {[
                { member: isZh ? '张三 (核心开发者)' : 'Alex (Core Dev)', contrib: 127, vp: 14.2, cap: false },
                { member: isZh ? '李四 (文档贡献者)' : 'Sarah (Docs)', contrib: 43, vp: 5.8, cap: false },
                { member: isZh ? '王五 (社群运营)' : 'Marcus (Community)', contrib: 89, vp: 9.1, cap: false },
                { member: isZh ? '赵六 (超级贡献者)' : 'Jordan (Power user)', contrib: 341, vp: 15.0, cap: true },
              ].map((row, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-[#131517]">{row.member}</div>
                    <div className="text-xs text-[#939597]">{isZh ? `${row.contrib} 次贡献` : `${row.contrib} contributions`}</div>
                  </div>
                  <div className="w-48 h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#131517] rounded-full transition-all"
                      style={{ width: `${(row.vp / 15) * 100}%` }}
                    />
                  </div>
                  <div className="text-sm font-mono font-semibold text-[#131517] w-16 text-right">
                    {row.vp} VP
                  </div>
                  {row.cap && (
                    <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full uppercase">
                      {isZh ? '已达上限' : 'CAPPED'}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-[#939597] mt-6">
              {isZh
                ? '赵六贡献最多，但受 15% 上限约束，超出部分已重新分配。'
                : 'Jordan contributed the most but is capped at 15%. Excess weight has been redistributed.'}
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-[#f8f8f8] rounded-2xl p-12 border border-gray-100">
            <UserCheck className="size-8 text-[#131517] mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-[#131517] mb-3">
              {isZh ? '让贡献真正被看见' : 'Make contributions truly visible'}
            </h2>
            <p className="text-[#939597] mb-8 max-w-md mx-auto">
              {isZh ? '创建一个社群，开始追踪成员的贡献并分配发言权。' : 'Create a community and start tracking contributions with real voting power.'}
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
