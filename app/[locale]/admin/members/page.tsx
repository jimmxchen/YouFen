'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Search, ChevronUp, ChevronDown, Edit2 } from 'lucide-react'
import { VoicePowerBadge } from '@/components/admin/voice-power-badge'
import { demoMembers } from '@/lib/demo-data'
import { type Member, MemberRole } from '@/types/admin'
import { cn } from '@/lib/utils'
import { Link } from '@/i18n/navigation'

type SortKey = 'name' | 'voicePower' | 'contributionCount' | 'joinedAt'
type SortDir = 'asc' | 'desc'

const roleLabels: Record<MemberRole, string> = {
  owner: 'roleOwner',
  manager: 'roleManager',
  member: 'roleMember',
}

const roleColors: Record<MemberRole, string> = {
  owner: 'bg-purple-50 text-purple-700',
  manager: 'bg-blue-50 text-blue-700',
  member: 'bg-gray-100 text-gray-700',
}

export default function MembersPage() {
  const t = useTranslations('admin')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('voicePower')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const filtered = demoMembers
    .filter(m => m.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
    })

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null
    return sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[40px] font-medium text-[#131517] leading-[48px]">
            {t('members')}
          </h1>
          <p className="text-lg text-[#525252] mt-2">
            {t('membersSubtitle')}
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#131517] text-white text-sm font-medium hover:bg-[#262626] hover:-translate-y-0.5 transition-all duration-200">
          <Edit2 className="w-4 h-4" />
          {t('addMember')}
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#939597]" />
        <input
          type="text"
          placeholder={t('searchMembers')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-2xl border border-[#F0F0F0] bg-white text-sm text-[#131517] placeholder:text-[#A3A3A3] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
        />
      </div>

      {/* Members table */}
      <div className="rounded-2xl border border-[#F0F0F0] bg-white overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#F0F0F0]">
              <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">
                {t('memberName')}
              </th>
              <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">
                {t('role')}
              </th>
              <th
                className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider cursor-pointer hover:text-[#525252]"
                onClick={() => toggleSort('voicePower')}
              >
                <span className="inline-flex items-center gap-1">
                  {t('voicePower')}
                  <SortIcon col="voicePower" />
                </span>
              </th>
              <th
                className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider cursor-pointer hover:text-[#525252]"
                onClick={() => toggleSort('contributionCount')}
              >
                <span className="inline-flex items-center gap-1">
                  {t('contributions')}
                  <SortIcon col="contributionCount" />
                </span>
              </th>
              <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">
                {t('tags')}
              </th>
              <th
                className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider cursor-pointer hover:text-[#525252]"
                onClick={() => toggleSort('joinedAt')}
              >
                <span className="inline-flex items-center gap-1">
                  {t('joinedAt')}
                  <SortIcon col="joinedAt" />
                </span>
              </th>
              <th className="text-right text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">
                {t('actions')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0F0F0]">
            {filtered.map((member, i) => (
              <tr key={member.id} className={cn('hover:bg-[#FAFAFA] transition-colors', i % 2 === 1 && 'bg-[#FAFAFA]/50')}>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-green-400 flex items-center justify-center text-white text-sm font-medium shrink-0">
                      {member.name[0]}
                    </div>
                    <div>
                      <Link
                        href={`/admin/members/${member.id}`}
                        className="text-sm font-medium text-[#131517] hover:text-emerald-600 transition-colors"
                      >
                        {member.name}
                      </Link>
                      {member.email && <p className="text-xs text-[#939597]">{member.email}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={cn(
                    'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                    roleColors[member.role]
                  )}>
                    {t(roleLabels[member.role])}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <VoicePowerBadge value={member.voicePower} size="sm" />
                </td>
                <td className="px-6 py-4 text-sm text-[#525252]">{member.contributionCount}</td>
                <td className="px-6 py-4">
                  <div className="flex gap-1.5 flex-wrap">
                    {member.tags.map(tag => (
                      <span key={tag} className="px-2 py-0.5 rounded-md bg-[#FAFAFA] border border-[#F0F0F0] text-xs text-[#525252]">
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-[#525252]">{member.joinedAt}</td>
                <td className="px-6 py-4 text-right">
                  <button className="p-1.5 rounded-2xl hover:bg-[#FAFAFA] text-[#939597] hover:text-[#131517] transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
