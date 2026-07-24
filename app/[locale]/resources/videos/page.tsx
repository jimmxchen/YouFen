'use client'

import { useLocale } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { ArrowRight, Play, Clock, BarChart3, Users, FileText, Zap, Youtube } from 'lucide-react'

export default function VideosPage() {
  const locale = useLocale()
  const isZh = locale === 'zh'

  const series = [
    {
      icon: Play,
      title: isZh ? '入门系列' : 'Getting Started',
      count: isZh ? '5 集' : '5 episodes',
      duration: isZh ? '每集 3–5 分钟' : '3–5 min each',
      episodes: isZh
        ? ['创建你的第一个社群', '邀请成员与设置角色', '定义贡献类型与权重', '发起第一次投票', '解读 AI 分析面板']
        : ['Create your first community', 'Invite members & set roles', 'Define contribution types & weights', 'Run your first vote', 'Reading the AI analysis dashboard'],
    },
    {
      icon: BarChart3,
      title: isZh ? '高级治理' : 'Advanced Governance',
      count: isZh ? '4 集' : '4 episodes',
      duration: isZh ? '每集 8–12 分钟' : '8–12 min each',
      episodes: isZh
        ? ['加权投票策略深度解析', 'AI 规则生成与手动微调', '混合投票模式实战', '链上可信记录生成与验证']
        : ['Weighted voting strategies deep dive', 'AI rule generation & manual tuning', 'Hybrid voting mode in practice', 'On-chain trusted records: generation & verification'],
    },
    {
      icon: Users,
      title: isZh ? '社群案例' : 'Community Spotlights',
      count: isZh ? '6 集' : '6 episodes',
      duration: isZh ? '每集 10–15 分钟' : '10–15 min each',
      episodes: isZh
        ? ['开源项目如何用有份管理 300+ 贡献者', 'DAO 治理：从一人一票到加权投票的演进', '志愿者组织：按活动结算贡献', '技术社区：代码审查与贡献追踪', '内容社群：文档贡献如何被看见', '混合型社群：多维度贡献评估体系']
        : ['How an OSS project manages 300+ contributors', 'DAO governance: from 1P1V to weighted voting', 'Volunteer orgs: per-event contribution settlement', 'Tech communities: code review & contribution tracking', 'Content communities: making docs contributions visible', 'Hybrid communities: multi-dimensional contribution scoring'],
    },
  ]

  const comingSoon = isZh
    ? ['使用 Injective SDK 构建自定义上链逻辑', 'Webhook 实战：连接 Slack 和 Telegram', '多社群管理：一个账号，多个治理体系']
    : ['Building custom on-chain logic with Injective SDK', 'Webhook in action: connecting Slack & Telegram', 'Multi-community management: one account, many governance systems']

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
            <span className="text-[#131517]">{isZh ? '视频教程' : 'Video Tutorials'}</span>
          </div>
          <h1 className="text-[48px] font-semibold text-[#131517] leading-[1.08] tracking-[-0.03em] mb-6">
            {isZh ? '视频教程' : 'Video Tutorials'}
          </h1>
          <p className="text-xl text-[#525252] max-w-2xl leading-relaxed">
            {isZh
              ? '通过视频学习有份的每一项功能。从 3 分钟快速上手到深度治理策略，适合不同阶段的社群管理者。'
              : 'Learn every feature of YouFen through video. From 3-minute quick starts to deep governance strategy — for community managers at every stage.'}
          </p>
        </div>
      </section>

      {/* Series list */}
      <section className="py-20 px-6 bg-[#fafafa]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-[#131517] mb-12">
            {isZh ? '三大系列' : 'Three series'}
          </h2>
          <div className="space-y-6">
            {series.map((s, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <div className="flex items-start gap-4 mb-5">
                  <div className="shrink-0 size-12 rounded-xl bg-[#131517] flex items-center justify-center">
                    <s.icon className="size-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-lg font-semibold text-[#131517]">{s.title}</h3>
                      <span className="text-xs text-[#939597] bg-[#f5f5f5] px-2 py-0.5 rounded-full">
                        {s.count}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-[#939597]">
                      <Clock className="size-3" />
                      <span>{s.duration}</span>
                    </div>
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-2">
                  {s.episodes.map((ep, j) => (
                    <div key={j} className="flex items-center gap-2 text-sm text-[#525252] py-2 px-3 rounded-lg hover:bg-[#f8f8f8] transition-colors cursor-pointer">
                      <Play className="size-3 text-[#939597] shrink-0" />
                      <span>{ep}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Coming soon */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-[#131517] mb-4">
            {isZh ? '即将上线' : 'Coming soon'}
          </h2>
          <p className="text-[#939597] mb-8 max-w-xl">
            {isZh
              ? '更多视频正在制作中。以下是接下来会覆盖的主题。'
              : 'More videos are in production. Here is what we are covering next.'}
          </p>
          <div className="space-y-3">
            {comingSoon.map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-sm text-[#939597] bg-[#f8f8f8] rounded-xl px-5 py-3 border border-gray-100">
                <Zap className="size-4 text-amber-400" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-[#f8f8f8] rounded-2xl p-12 border border-gray-100">
            <Youtube className="size-8 text-[#131517] mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-[#131517] mb-3">
              {isZh ? '边看边做，学得更快' : 'Watch and build — learn faster'}
            </h2>
            <p className="text-[#939597] mb-8 max-w-md mx-auto">
              {isZh ? '打开有份，跟着视频一起操作。' : 'Open YouFen and follow along with the videos.'}
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
