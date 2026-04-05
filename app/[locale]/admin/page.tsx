'use client'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Users, Vote, FileText, ShieldCheck, Plus, UserPlus, BarChart3, FileDown } from 'lucide-react'
import { StatCard } from '@/components/admin/stat-card'
import { demoStats, demoMembers, demoContributions, demoProposals } from '@/lib/demo-data'

const quickActions = [
  { icon: UserPlus, labelKey: 'addMember', href: '/members' },
  { icon: BarChart3, labelKey: 'distributeVP', href: '/contributions' },
  { icon: Vote, labelKey: 'createProposal', href: '/proposals' },
  { icon: FileDown, labelKey: 'generateReport', href: '#' },
]

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ')
}

export default function DashboardPage() {
  const t = useTranslations('admin')

  const recentContributions = demoContributions.slice(0, 5)

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Page title */}
      <div>
        <h1 className="text-[40px] font-medium text-[#131517] leading-[48px]">
          {t('dashboard')}
        </h1>
        <p className="text-lg text-[#525252] mt-2">
          {t('dashboardSubtitle')}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title={t('members')}
          value={demoStats.members}
          icon={Users}
          accent="cyan"
        />
        <StatCard
          title={t('totalVoicePower')}
          value={demoStats.totalVoicePower.toLocaleString()}
          icon={Vote}
          accent="green"
        />
        <StatCard
          title={t('activeProposals')}
          value={demoStats.activeProposals}
          icon={FileText}
          accent="blue"
        />
        <StatCard
          title={t('todayContributions')}
          value={demoStats.todayContributions}
          icon={Plus}
          accent="amber"
        />
        <StatCard
          title={t('trustedRecords')}
          value={demoStats.trustedRecords}
          icon={ShieldCheck}
          accent="blue"
        />
      </div>

      {/* Quick Actions */}
      <section>
        <h2 className="text-xl font-semibold text-[#131517] mb-4">
          {t('quickActions')}
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <Link
              key={action.labelKey}
              href={action.href}
              className="flex items-center gap-3 px-5 py-4 rounded-xl border border-[#F0F0F0] bg-white hover:shadow-md hover:border-[#E5E5E5] hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                <action.icon className="w-5 h-5" />
              </div>
              <span className="text-sm font-medium text-[#131517]">{t(action.labelKey)}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Recent contributions preview */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-[#131517]">
            {t('recentContributions')}
          </h2>
          <Link href="/contributions" className="text-sm text-emerald-600 hover:text-emerald-700 font-medium">
            {t('viewAll')}
          </Link>
        </div>
        <div className="rounded-xl border border-[#F0F0F0] bg-white overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#F0F0F0]">
                <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">
                  {t('member')}
                </th>
                <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">
                  {t('contribution')}
                </th>
                <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">
                  {t('status')}
                </th>
                <th className="text-right text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">
                  {t('voicePower')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F0F0]">
              {recentContributions.map((c, i) => (
                <tr key={c.id} className={i % 2 === 1 ? 'bg-[#FAFAFA]' : ''}>
                  <td className="px-6 py-3.5 text-sm font-medium text-[#131517]">{c.memberName}</td>
                  <td className="px-6 py-3.5 text-sm text-[#525252] max-w-xs truncate">{c.description}</td>
                  <td className="px-6 py-3.5">
                    <span className={cn(
                      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                      c.status === 'approved' && 'bg-emerald-50 text-emerald-700',
                      c.status === 'pending' && 'bg-amber-50 text-amber-700',
                      c.status === 'rejected' && 'bg-red-50 text-red-700'
                    )}>
                      {t(c.status)}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-sm text-right font-medium text-[#131517]">
                    +{c.approvedVP || c.suggestedVP}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Active proposals preview */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-[#131517]">
            {t('activeProposals')}
          </h2>
          <Link href="/proposals" className="text-sm text-emerald-600 hover:text-emerald-700 font-medium">
            {t('viewAll')}
          </Link>
        </div>
        <div className="rounded-xl border border-[#F0F0F0] bg-white overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#F0F0F0]">
                <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">
                  {t('proposalTitle')}
                </th>
                <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">
                  {t('status')}
                </th>
                <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">
                  {t('voters')}
                </th>
                <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">
                  {t('deadline')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F0F0]">
              {demoProposals.map((p, i) => (
                <tr key={p.id} className={i % 2 === 1 ? 'bg-[#FAFAFA]' : ''}>
                  <td className="px-6 py-3.5 text-sm font-medium text-[#131517]">{p.title}</td>
                  <td className="px-6 py-3.5">
                    <span className={cn(
                      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                      p.status === 'active' && 'bg-emerald-50 text-emerald-700',
                      p.status === 'ended' && 'bg-gray-100 text-gray-700',
                      p.status === 'recorded' && 'bg-blue-50 text-blue-700'
                    )}>
                      {t(p.status)}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-sm text-[#525252]">
                    {p.voterCount} / {p.totalMembers}
                  </td>
                  <td className="px-6 py-3.5 text-sm text-[#525252]">{p.endTime}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
