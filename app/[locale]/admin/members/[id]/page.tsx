'use client'

import { useTranslations } from 'next-intl'
import { useParams } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { ArrowLeft, Mail, Calendar, Clock, Zap, Edit2, Shield, UserPlus } from 'lucide-react'
import { useAdminMember, apiPatch } from '@/lib/hooks/use-admin-data'
import { useCommunity } from '@/lib/hooks/use-community'
import { type Member, MemberRole } from '@/types/admin'
import { cn } from '@/lib/utils'
import { useState } from 'react'

const roleLabels: Record<MemberRole, string> = {
  owner: 'roleOwner',
  manager: 'roleManager',
  member: 'roleMember',
}

const roleColors: Record<MemberRole, string> = {
  owner: 'bg-purple-50 text-purple-700 border-purple-200',
  manager: 'bg-blue-50 text-blue-700 border-blue-200',
  member: 'bg-gray-100 text-gray-700 border-gray-200',
}

export default function MemberDetailPage() {
  const t = useTranslations('admin')
  const params = useParams()
  const memberId = params.id as string

  const { member, contributions, loading, refetch } = useAdminMember(memberId)
  const { communityId } = useCommunity()

  const [isEditingVP, setIsEditingVP] = useState(false)
  const [vpValue, setVpValue] = useState(member?.voicePower.toString() ?? '0')
  const [showRoleChange, setShowRoleChange] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showAddContribution, setShowAddContribution] = useState(false)
  const [contribTitle, setContribTitle] = useState('')
  const [contribType, setContribType] = useState('contribution')
  const [contribAmount, setContribAmount] = useState('')

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="text-center py-20">
          <p className="text-lg text-[#525252]">{t('loading')}</p>
        </div>
      </div>
    )
  }

  if (!member) {
    return (
      <div className="space-y-6">
        <div className="text-center py-20">
          <p className="text-lg text-[#525252]">{t('memberNotFound')}</p>
          <Link href="/admin/members" className="text-emerald-600 hover:text-emerald-700 font-medium mt-2 inline-block">
            {t('backToMembers')}
          </Link>
        </div>
      </div>
    )
  }

  const memberContributions = contributions
  const totalApprovedVP = memberContributions
    .filter(c => c.status === 'approved')
    .reduce((sum, c) => sum + (c.approvedVP || c.suggestedVP), 0)

  const handleSaveVP = async () => {
    const newVP = parseInt(vpValue, 10)
    if (isNaN(newVP) || newVP < 0) {
      return
    }
    setSaving(true)
    try {
      await apiPatch(`/members/${memberId}`, { voicePower: newVP })
      setIsEditingVP(false)
      refetch()
    } catch {
      // revert on error
      setVpValue(member.voicePower.toString())
    } finally {
      setSaving(false)
    }
  }

  const handleRoleChange = async (newRole: MemberRole) => {
    setShowRoleChange(false)
    setSaving(true)
    try {
      await apiPatch(`/members/${memberId}`, { role: newRole })
      refetch()
    } catch {
      // silent fail
    } finally {
      setSaving(false)
    }
  }

  const handleAddContribution = async () => {
    if (!contribTitle.trim()) return
    setSaving(true)
    try {
      await fetch('/api/admin/contributions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId,
          memberId,
          description: contribTitle.trim(),
          type: contribType,
          suggestedTokenAmount: parseInt(contribAmount, 10) || 0,
        }),
      })
      setShowAddContribution(false)
      setContribTitle('')
      setContribAmount('')
      refetch()
    } catch {
      // silent fail
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Link
          href="/admin/members"
          className="inline-flex items-center gap-1.5 text-sm text-[#939597] hover:text-[#131517] transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('backToMembers', { defaultValue: 'Back to Members' })}
        </Link>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-green-400 flex items-center justify-center text-white text-2xl font-medium">
              {member.name[0]}
            </div>
            <div>
              <h1 className="text-[40px] font-medium text-[#131517] leading-[48px]">
                {member.name}
              </h1>
              <span className={cn(
                'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border mt-1',
                roleColors[member.role]
              )}>
                {t(roleLabels[member.role])}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={() => setShowRoleChange(!showRoleChange)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#F0F0F0] text-sm font-medium text-[#525252] hover:bg-[#FAFAFA] hover:text-[#131517] transition-all"
            >
              <Shield className="w-4 h-4" />
              {t('changeRole', { defaultValue: 'Change Role' })}
            </button>
            <button
              onClick={() => setShowAddContribution(!showAddContribution)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0A0A0A] text-white text-sm font-medium hover:bg-[#262626] hover:-translate-y-0.5 transition-all shadow-sm"
            >
              <UserPlus className="w-4 h-4" />
              {t('addContribution', { defaultValue: 'Add Contribution' })}
            </button>
          </div>
        </div>
      </div>

      {/* Role Change Dropdown */}
      {showRoleChange && (
        <div className="rounded-xl border border-[#F0F0F0] bg-white p-2 space-y-1">
          {(['owner', 'manager', 'member'] as MemberRole[]).filter(r => r !== member.role).map(role => (
            <button
              key={role}
              onClick={() => handleRoleChange(role)}
              className="w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium text-[#525252] hover:bg-[#FAFAFA] hover:text-[#131517] transition-all"
            >
              {t('changeToRole', { role: t(roleLabels[role]) })}
            </button>
          ))}
        </div>
      )}

      {/* Add Contribution Form */}
      {showAddContribution && (
        <div className="rounded-xl border border-[#F0F0F0] bg-white p-4 space-y-3">
          <h3 className="text-sm font-semibold text-[#131517]">
            {t('addContribution', { defaultValue: 'Add Contribution' })}
          </h3>
          <input
            type="text"
            value={contribTitle}
            onChange={(e) => setContribTitle(e.target.value)}
            placeholder={t('contributionDescription', { defaultValue: 'Description' })}
            className="w-full px-3 py-2 rounded-xl border border-[#F0F0F0] text-sm text-[#131517] focus:outline-none focus:border-emerald-500"
          />
          <div className="flex gap-2">
            <select
              value={contribType}
              onChange={(e) => setContribType(e.target.value)}
              className="px-3 py-2 rounded-xl border border-[#F0F0F0] text-sm text-[#131517]"
            >
              <option value="contribution">Contribution</option>
              <option value="social-post">Social Post</option>
              <option value="event-review">Event Review</option>
              <option value="mentorship">Mentorship</option>
              <option value="other">Other</option>
            </select>
            <input
              type="number"
              value={contribAmount}
              onChange={(e) => setContribAmount(e.target.value)}
              placeholder={t('suggestedVP', { defaultValue: 'Suggested VP' })}
              className="w-32 px-3 py-2 rounded-xl border border-[#F0F0F0] text-sm text-[#131517] focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddContribution}
              disabled={saving || !contribTitle.trim()}
              className="px-4 py-2 rounded-xl bg-[#0A0A0A] text-white text-sm font-medium hover:bg-[#262626] disabled:opacity-50"
            >
              {saving ? 'Saving...' : t('save')}
            </button>
            <button
              onClick={() => setShowAddContribution(false)}
              className="px-4 py-2 rounded-xl border border-[#F0F0F0] text-sm text-[#525252] hover:bg-[#FAFAFA]"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-[#F0F0F0] bg-white p-6">
          <p className="text-sm text-[#939597] mb-1">{t('voicePower', { defaultValue: 'Voice Power' })}</p>
          {isEditingVP ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={vpValue}
                onChange={(e) => setVpValue(e.target.value)}
                className="w-24 px-3 py-1.5 rounded-xl border border-[#F0F0F0] text-sm text-[#131517] focus:outline-none focus:border-emerald-500"
                autoFocus
              />
              <button onClick={handleSaveVP} className="text-xs text-emerald-600 font-medium hover:text-emerald-700">
                {t('save')}
              </button>
              <button onClick={() => { setIsEditingVP(false); setVpValue(member.voicePower.toString()) }} className="text-xs text-[#939597] hover:text-[#131517]">
                {t('cancel')}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-2xl font-semibold text-[#131517]">{member.voicePower.toLocaleString()}</p>
              <button onClick={() => setIsEditingVP(true)} className="p-1.5 rounded-xl hover:bg-[#FAFAFA] text-[#939597] hover:text-[#131517] transition-colors">
                <Edit2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        <div className="rounded-xl border border-[#F0F0F0] bg-white p-6">
          <p className="text-sm text-[#939597] mb-1">{t('totalContributions', { defaultValue: 'Total Contributions' })}</p>
          <p className="text-2xl font-semibold text-[#131517]">{member.contributionCount}</p>
        </div>
        <div className="rounded-xl border border-[#F0F0F0] bg-white p-6">
          <p className="text-sm text-[#939597] mb-1">{t('earnedVP', { defaultValue: 'Earned VP' })}</p>
          <p className="text-2xl font-semibold text-[#131517]">+{totalApprovedVP.toLocaleString()}</p>
        </div>
      </div>

      {/* Member Info */}
      <div className="rounded-xl border border-[#F0F0F0] bg-white p-6">
        <h2 className="text-base font-semibold text-[#131517] mb-4">
          {t('memberInfo', { defaultValue: 'Member Information' })}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {member.email && (
            <div className="flex items-center gap-3 text-sm">
              <Mail className="w-4 h-4 text-[#939597]" />
              <span className="text-[#525252]">{member.email}</span>
            </div>
          )}
          <div className="flex items-center gap-3 text-sm">
            <Calendar className="w-4 h-4 text-[#939597]" />
            <span className="text-[#525252]">{t('joined', { defaultValue: 'Joined' })}: {member.joinedAt}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Clock className="w-4 h-4 text-[#939597]" />
            <span className="text-[#525252]">{t('lastActive', { defaultValue: 'Last active' })}: {member.lastActiveAt}</span>
          </div>
        </div>
        {member.tags.length > 0 && (
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[#F0F0F0]">
            <span className="text-xs text-[#939597]">{t('tags', { defaultValue: 'Tags' })}:</span>
            <div className="flex gap-1.5 flex-wrap">
              {member.tags.map(tag => (
                <span key={tag} className="px-2 py-0.5 rounded-md bg-[#FAFAFA] border border-[#F0F0F0] text-xs text-[#525252]">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Contribution History */}
      <div>
        <h2 className="text-xl font-semibold text-[#131517] mb-4">
          {t('contributionHistory', { defaultValue: 'Contribution History' })}
        </h2>
        {memberContributions.length === 0 ? (
          <div className="rounded-xl border border-[#F0F0F0] bg-white p-8 text-center">
            <p className="text-sm text-[#939597]">{t('noContributionsYet')}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-[#F0F0F0] bg-white overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#F0F0F0]">
                  <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">
                    {t('contribution')}
                  </th>
                  <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">
                    {t('type')}
                  </th>
                  <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">
                    {t('voicePower', { defaultValue: 'Voice Power' })}
                  </th>
                  <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">
                    {t('status')}
                  </th>
                  <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">
                    {t('date')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F0F0]">
                {memberContributions.map((c, i) => (
                  <tr key={c.id} className={cn('hover:bg-[#FAFAFA] transition-colors', i % 2 === 1 && 'bg-[#FAFAFA]/50')}>
                    <td className="px-6 py-4 text-sm text-[#131517]">{c.description}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#FAFAFA] border border-[#F0F0F0] text-xs text-[#525252]">
                        {c.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-[#131517] font-medium">
                      +{c.approvedVP || c.suggestedVP}
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                        c.status === 'approved' && 'bg-emerald-50 text-emerald-700',
                        c.status === 'pending' && 'bg-amber-50 text-amber-700',
                        c.status === 'rejected' && 'bg-red-50 text-red-700'
                      )}>
                        {t(c.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-[#525252]">{c.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
