'use client'

import { ReactNode } from 'react'
import { Link } from '@/i18n/navigation'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { ArrowRight } from 'lucide-react'

interface InfoPageShellProps {
  breadcrumb: { label: string; href?: string }[]
  title: string
  subtitle: string
  sections: { heading: string; body: ReactNode }[]
  cta?: { label: string; href: string }
}

export function InfoPageShell({ breadcrumb, title, subtitle, sections, cta }: InfoPageShellProps) {
  return (
    <main className="min-h-screen bg-white">
      <Navbar forceLight />

      {/* Breadcrumb */}
      <div className="pt-24 pb-4 max-w-4xl mx-auto px-6">
        <div className="flex items-center gap-2 text-sm text-[#939597]">
          {breadcrumb.map((item, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <span>/</span>}
              {item.href ? (
                <Link href={item.href} className="hover:text-[#131517] transition-colors">
                  {item.label}
                </Link>
              ) : (
                <span className="text-[#131517]">{item.label}</span>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Hero */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-[44px] font-semibold text-[#131517] leading-[1.1] tracking-[-0.03em] mb-6">
            {title}
          </h1>
          <p className="text-lg text-[#525252] max-w-xl mx-auto leading-relaxed">
            {subtitle}
          </p>
        </div>
      </section>

      {/* Content Sections */}
      <section className="pb-24 px-6">
        <div className="max-w-4xl mx-auto space-y-20">
          {sections.map((section, i) => (
            <div key={i} className="group">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-px w-8 bg-[#d4d4d4] group-hover:w-12 group-hover:bg-[#131517] transition-all duration-300" />
                <span className="text-xs font-semibold text-[#939597] uppercase tracking-widest">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>
              <h2 className="text-2xl font-semibold text-[#131517] mb-5">{section.heading}</h2>
              <div className="text-[#525252] leading-relaxed text-[15px] space-y-4">
                {section.body}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      {cta && (
        <section className="pb-24 px-6">
          <div className="max-w-4xl mx-auto">
            <div className="bg-[#f8f8f8] rounded-2xl p-10 text-center border border-gray-100">
              <p className="text-lg font-medium text-[#131517] mb-6">Ready to get started?</p>
              <Link
                href={cta.href}
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#131517] text-white rounded-full text-sm font-medium hover:bg-black transition-colors"
              >
                {cta.label}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      <Footer />
    </main>
  )
}
