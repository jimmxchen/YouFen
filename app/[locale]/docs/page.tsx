import { getTranslations } from 'next-intl/server'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'

export default async function DocsPage() {
  const t = await getTranslations('nav')

  const steps = [
    { num: '01', title: 'Create Account', desc: 'Sign up with email or phone. Every community starts with an owner account.' },
    { num: '02', title: 'Build Your Community', desc: 'Name your community, set participation rules, and invite your first members.' },
    { num: '03', title: 'Start Tracking Contributions', desc: 'Members submit contributions. AI helps review and suggest voice power allocations.' },
    { num: '04', title: 'Run Your First Vote', desc: 'Create proposals, let members vote with their voice power, and see results in real time.' },
    { num: '05', title: 'Generate Trusted Records', desc: 'Important decisions can be recorded on Injective for public verification.' },
  ]

  const concepts = [
    { title: 'Voice Power', desc: 'The weight of your vote. Earned through verified contributions — the more you contribute, the more influence you have.' },
    { title: 'Communities', desc: 'Each community has its own rules, members, and governance. One account can belong to many communities.' },
    { title: 'Proposals', desc: 'Formal decisions put to a vote. Any member can propose, and voice power determines the outcome.' },
    { title: 'Trusted Records', desc: 'On-chain receipts for important votes and rule changes. Immutable, public, and independently verifiable.' },
    { title: 'AI Rules Engine', desc: 'Describe your community goals and the AI generates participation rules tailored to your needs.' },
    { title: 'Contribution Review', desc: 'Operators review member contributions and allocate voice power. AI suggestions help speed up the process.' },
  ]

  const integrations = [
    {
      name: 'GitHub',
      desc: 'Connect your community repo. Code contributions — PRs, reviews, issues — automatically count toward voice power.',
      color: 'bg-purple-50 border-purple-200',
      textColor: 'text-purple-700',
    },
    {
      name: 'Discord',
      desc: 'Link your Discord server. Track message activity, event attendance, and role assignments as community contributions.',
      color: 'bg-indigo-50 border-indigo-200',
      textColor: 'text-indigo-700',
    },
    {
      name: 'Injective',
      desc: 'Publish trusted records on-chain. Voting results and rule changes become permanent, publicly verifiable receipts.',
      color: 'bg-emerald-50 border-emerald-200',
      textColor: 'text-emerald-700',
    },
  ]

  return (
    <>
      <Navbar forceLight />
      <main className="pt-16">
        {/* Hero */}
        <section className="bg-gradient-to-b from-[#fafafa] to-white px-6 pb-16 pt-20">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl font-semibold tracking-tight text-[#131517] lg:text-5xl">
              Documentation
            </h1>
            <p className="mt-4 text-lg text-[#525252] max-w-2xl mx-auto">
              Everything you need to set up no-code community governance — from creating your first community to generating on-chain trusted records.
            </p>
          </div>
        </section>

        {/* Quick Start */}
        <section className="px-6 py-20">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-semibold text-[#131517] mb-10 text-center">Quick Start Guide</h2>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
              {steps.map((step) => (
                <div key={step.num} className="relative group">
                  <div className="text-5xl font-bold text-[#f0f0f0] group-hover:text-emerald-100 transition-colors mb-3">
                    {step.num}
                  </div>
                  <h3 className="text-sm font-semibold text-[#131517] mb-1.5">{step.title}</h3>
                  <p className="text-sm text-[#939597] leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Core Concepts */}
        <section className="px-6 py-20 bg-[#fafafa]">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-semibold text-[#131517] mb-10 text-center">Core Concepts</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {concepts.map((c) => (
                <div key={c.title} className="bg-white rounded-2xl p-6 border border-gray-100 hover:border-gray-200 transition-colors">
                  <h3 className="text-base font-semibold text-[#131517] mb-2">{c.title}</h3>
                  <p className="text-sm text-[#939597] leading-relaxed">{c.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Integrations */}
        <section className="px-6 py-20">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-semibold text-[#131517] mb-4 text-center">Integrations</h2>
            <p className="text-sm text-[#939597] text-center mb-10 max-w-xl mx-auto">
              Connect the tools your community already uses. Contributions from linked platforms automatically count toward voice power.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {integrations.map((i) => (
                <div key={i.name} className={`rounded-2xl p-6 border ${i.color}`}>
                  <h3 className={`text-base font-semibold mb-2 ${i.textColor}`}>{i.name}</h3>
                  <p className="text-sm text-[#525252] leading-relaxed">{i.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
