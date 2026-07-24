'use client'

import { useTranslations, useLocale } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { ArrowRight, GitCommit, FileText, Users, Mic, Code, BookOpen, Calendar, MessageCircle, CheckCircle2, Cpu } from 'lucide-react'

export default function ContributionPage() {
  const locale = useLocale()
  const isZh = locale === 'zh'

  const types = [
    { icon: Code, label: isZh ? '代码贡献' : 'Code', weight: '×1.5', desc: isZh ? 'PR 合并、代码审查、Bug 修复' : 'Merged PRs, code reviews, bug fixes' },
    { icon: FileText, label: isZh ? '文档编写' : 'Documentation', weight: '×1.0', desc: isZh ? '技术文档、教程、翻译' : 'Technical docs, tutorials, translations' },
    { icon: Calendar, label: isZh ? '活动组织' : 'Events', weight: '×1.2', desc: isZh ? '线上/线下活动策划与执行' : 'Online/offline event planning & execution' },
    { icon: Users, label: isZh ? 'Mentor 指导' : 'Mentorship', weight: '×2.0', desc: isZh ? '一对一辅导、新人引导' : '1-on-1 mentoring, newcomer onboarding' },
    { icon: MessageCircle, label: isZh ? '社群运营' : 'Community Ops', weight: '×1.0', desc: isZh ? 'Discord/微信群管理、答疑' : 'Discord/WeChat moderation, support' },
    { icon: Mic, label: isZh ? '内容创作' : 'Content', weight: '×0.8', desc: isZh ? '博客、视频、社交媒体推广' : 'Blog posts, videos, social media' },
  ]

  return (
    <main className="min-h-screen bg-white">
      <Navbar forceLight />

      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 text-sm text-[#939597] mb-8">
            <Link href="/" className="hover:text-[#131517] transition-colors">{isZh ? '首页' : 'Home'}</Link>
            <span>/</span>
            <span className="text-[#131517]">{isZh ? '贡献追踪' : 'Contribution Tracking'}</span>
          </div>
          <h1 className="text-[48px] font-semibold text-[#131517] leading-[1.08] tracking-[-0.03em] mb-6">
            {isZh ? '贡献追踪' : 'Contribution Tracking'}
          </h1>
          <p className="text-xl text-[#525252] max-w-2xl leading-relaxed">
            {isZh
              ? '社群里每个人都有贡献，但不是每份贡献都被看见。我们给每种贡献类型定义了权重，让写文档和写代码一样被认可。'
              : 'Everyone in your community contributes — but not all contributions get noticed. We define weight for every contribution type, so writing docs is recognized just as much as writing code.'}
          </p>
        </div>
      </section>

      {/* Contribution types */}
      <section className="py-20 px-6 bg-[#fafafa]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-[#131517] mb-4">
            {isZh ? '六种贡献类型' : 'Six contribution types'}
          </h2>
          <p className="text-[#939597] mb-10 max-w-xl">
            {isZh
              ? '不同类型有不同权重。管理者可以自定义权重值，让激励机制匹配社群的价值观。'
              : 'Different types carry different weights. Managers can customize weight values to align incentives with community values.'}
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {types.map((t, i) => (
              <div key={i} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className="size-9 rounded-lg bg-[#f5f5f5] flex items-center justify-center">
                    <t.icon className="size-4 text-[#131517]" />
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                    {t.weight}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-[#131517] mb-1">{t.label}</h3>
                <p className="text-xs text-[#939597]">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Analysis */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start gap-6">
            <div className="shrink-0 size-14 rounded-2xl bg-[#131517] flex items-center justify-center">
              <Cpu className="size-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-[#131517] mb-4">
                {isZh ? 'AI 辅助审核' : 'AI-assisted review'}
              </h2>
              <p className="text-[#525252] leading-relaxed mb-6 max-w-xl">
                {isZh
                  ? '成员提交贡献后，AI 自动分析内容质量和相关性，给出初始评分和建议发言权值。管理者可以直接采纳或手动调整。对于代码类贡献，AI 会分析 commit diff 大小、review 次数、合并状态；对于文档类贡献，AI 会评估字数、结构完整度和引用质量。'
                  : 'After a member submits a contribution, AI analyzes content quality and relevance, providing an initial score and suggested voting power value. Managers can accept or adjust. For code contributions, AI analyzes commit diff size, review rounds, and merge status. For docs, AI evaluates word count, structure, and reference quality.'}
              </p>
              <div className="flex gap-3">
                {[isZh ? '自动检测重复提交' : 'Auto-detect duplicates', isZh ? '识别低质量灌水' : 'Flag low-quality spam', isZh ? '推荐相似贡献合并' : 'Suggest merging similar items'].map((tag, i) => (
                  <span key={i} className="text-xs text-[#939597] bg-[#f5f5f5] px-3 py-1.5 rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Integration */}
      <section className="py-20 px-6 bg-[#fafafa]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-[#131517] mb-8">
            {isZh ? '自动同步' : 'Auto-sync integrations'}
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { name: 'GitHub', desc: isZh ? 'PR / Issue / Commit 自动记录' : 'Auto-record PRs, issues, commits' },
              { name: 'Discord', desc: isZh ? '消息数、帮助频次统计' : 'Message count, help frequency stats' },
              { name: 'Notion', desc: isZh ? '文档更新自动追踪' : 'Auto-track doc updates' },
            ].map((item, i) => (
              <div key={i} className="bg-white rounded-xl p-5 border border-gray-100 text-center">
                <div className="text-sm font-semibold text-[#131517] mb-1">{item.name}</div>
                <div className="text-xs text-[#939597]">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-[#f8f8f8] rounded-2xl p-12 border border-gray-100">
            <CheckCircle2 className="size-8 text-[#131517] mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-[#131517] mb-3">
              {isZh ? '开始记录每一份贡献' : 'Start tracking every contribution'}
            </h2>
            <p className="text-[#939597] mb-8 max-w-md mx-auto">
              {isZh ? '让你的社群成员知道：每一份付出都会被看见。' : 'Let your members know: every contribution will be seen and valued.'}
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
