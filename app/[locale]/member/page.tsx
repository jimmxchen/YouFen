'use client'

import { useLocale } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { ArrowRight, Users } from 'lucide-react'

export default function MemberPage() {
  const locale = useLocale()
  const isZh = locale === 'zh'

  const communities = [
    { id: 'adventurex', name: 'AdventureX', members: 200, description: isZh ? '开源基础设施社群' : 'Open-source infrastructure community' },
    { id: 'demo', name: 'Demo Community', members: 45, description: isZh ? '演示测试社群' : 'Demo and testing community' },
  ]

  return (
    <main className="min-h-screen bg-white">
      <Navbar forceLight />

      <section className="pt-32 pb-20 px-6">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-[40px] font-semibold text-[#131517] leading-[1.08] tracking-[-0.03em] mb-4">
            {isZh ? '我的社群' : 'My Communities'}
          </h1>
          <p className="text-lg text-[#939597] mb-10">
            {isZh ? '选择一个社群进入。' : 'Select a community to enter.'}
          </p>

          <div className="space-y-3">
            {communities.map((c) => (
              <Link
                key={c.id}
                href={`/member/${c.id}`}
                className="flex items-center justify-between p-5 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="size-11 rounded-xl bg-[#f5f5f5] flex items-center justify-center">
                    <Users className="size-5 text-[#131517]" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[#131517]">{c.name}</div>
                    <div className="text-xs text-[#939597]">{c.description} · {c.members} {isZh ? '名成员' : 'members'}</div>
                  </div>
                </div>
                <ArrowRight className="size-4 text-[#939597]" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
