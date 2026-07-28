import { ArrowRight } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { Footer } from '@/components/layout/footer'
import { Navbar } from '@/components/layout/navbar'
import type { MarketingAction, MarketingPageContent } from '@/lib/marketing-pages'

function ActionLink({ action, secondary = false }: { action: MarketingAction; secondary?: boolean }) {
  const className = secondary
    ? 'inline-flex min-h-11 items-center justify-center rounded-xl border border-[#E5E5E5] bg-white px-5 text-sm font-medium text-[#131517] transition-all hover:-translate-y-0.5 hover:border-[#D4D4D4] hover:bg-[#FAFAFA] hover:shadow-md'
    : 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#131517] px-5 text-sm font-medium text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#262626] hover:shadow-md'

  if (action.external) {
    return (
      <a href={action.href} target="_blank" rel="noopener noreferrer" className={className}>
        {action.label}
        {!secondary ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
      </a>
    )
  }

  return (
    <Link href={action.href} className={className}>
      {action.label}
      {!secondary ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
    </Link>
  )
}

export function MarketingInfoPage({ content }: { content: MarketingPageContent }) {
  return (
    <main className="min-h-screen bg-white">
      <Navbar forceLight />
      <section className="px-6 pb-20 pt-32">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-600">
            {content.eyebrow}
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-normal text-[#131517] md:text-6xl">
            {content.title}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[#525252]">
            {content.description}
          </p>
          {content.primaryAction || content.secondaryAction ? (
            <div className="mt-8 flex flex-wrap gap-3">
              {content.primaryAction ? <ActionLink action={content.primaryAction} /> : null}
              {content.secondaryAction ? (
                <ActionLink action={content.secondaryAction} secondary />
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <section className="border-y border-[#F0F0F0] bg-[#FAFAFA] px-6 py-16">
        <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-2">
          {content.sections.map((section) => (
            <article key={section.title} className="rounded-xl border border-[#F0F0F0] bg-white p-6">
              <h2 className="text-xl font-semibold text-[#131517]">{section.title}</h2>
              <p className="mt-3 text-sm leading-6 text-[#525252]">{section.body}</p>
            </article>
          ))}
        </div>
      </section>
      <Footer />
    </main>
  )
}
