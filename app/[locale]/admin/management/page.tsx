'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Plus, Square, ExternalLink, Trash2, Search, Filter, Check, X, Eye } from 'lucide-react'
import { demoProposals, demoTasks, demoActivities } from '@/lib/demo-data'
import { type Proposal, ProposalStatus, type Task, TaskStatus, type Activity, ActivityStatus, ActivityType } from '@/types/admin'
import { cn } from '@/lib/utils'

type Tab = 'proposals' | 'tasks' | 'activities'

const statusColors: Record<ProposalStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-emerald-50 text-emerald-700',
  ended: 'bg-amber-50 text-amber-700',
  recorded: 'bg-blue-50 text-blue-700',
}

const taskStatusColors: Record<TaskStatus, string> = {
  pending: 'bg-amber-50 text-amber-700',
  inProgress: 'bg-blue-50 text-blue-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-gray-100 text-gray-700',
}

const activityStatusColors: Record<ActivityStatus, string> = {
  upcoming: 'bg-blue-50 text-blue-700',
  ongoing: 'bg-emerald-50 text-emerald-700',
  completed: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-50 text-red-700',
}

const activityTypeLabels: Record<ActivityType, string> = {
  meetup: 'activityTypeMeetup',
  workshop: 'activityTypeWorkshop',
  hackathon: 'activityTypeHackathon',
  social: 'activityTypeSocial',
  other: 'activityTypeOther',
}

const priorityColors: Record<string, string> = {
  high: 'bg-red-50 text-red-700',
  medium: 'bg-amber-50 text-amber-700',
  low: 'bg-gray-100 text-gray-700',
}

export default function ManagementPage() {
  const t = useTranslations('admin')
  const [activeTab, setActiveTab] = useState<Tab>('proposals')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'proposals', label: t('proposals') },
    { key: 'tasks', label: t('tasks') },
    { key: 'activities', label: t('activities') },
  ]

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[40px] font-medium text-[#131517] leading-[48px]">
          {t('management')}
        </h1>
        <p className="text-lg text-[#525252] mt-2">
          {t('tasksSubtitle')}
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-[#F0F0F0]">
        <nav className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium transition-all duration-200 border-b-2',
                activeTab === tab.key
                  ? 'border-[#10B981] text-[#131517]'
                  : 'border-transparent text-[#939597] hover:text-[#525252]'
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'proposals' && <ProposalsTab />}
      {activeTab === 'tasks' && <TasksTab />}
      {activeTab === 'activities' && <ActivitiesTab />}
    </div>
  )
}

function ProposalsTab() {
  const t = useTranslations('admin')
  const [showCreate, setShowCreate] = useState(false)

  const handleEndVote = (id: string) => {
    alert(t('voteEnded'))
  }

  const handleDelete = (id: string) => {
    alert(t('proposalDeleted'))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[#131517]">{t('proposals')}</h2>
          <p className="text-sm text-[#525252] mt-1">{t('proposalsSubtitle')}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0A0A0A] text-white text-sm font-medium hover:bg-[#262626] hover:-translate-y-0.5 transition-all duration-200 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          {t('createProposal')}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {demoProposals.map(proposal => (
          <ProposalCard
            key={proposal.id}
            proposal={proposal}
            onEndVote={handleEndVote}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="relative bg-white rounded-2xl border border-[#F0F0F0] shadow-xl w-full max-w-lg mx-4 p-8 space-y-6">
            <h2 className="text-xl font-semibold text-[#131517]">{t('createProposal')}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#525252] mb-1.5">{t('proposalTitle')}</label>
                <input
                  type="text"
                  placeholder={t('proposalTitlePlaceholder')}
                  className="w-full px-4 py-2.5 rounded-xl border border-[#F0F0F0] bg-white text-sm text-[#131517] placeholder:text-[#A3A3A3] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#525252] mb-1.5">{t('description')}</label>
                <textarea
                  rows={3}
                  placeholder={t('descriptionPlaceholder')}
                  className="w-full px-4 py-2.5 rounded-xl border border-[#F0F0F0] bg-white text-sm text-[#131517] placeholder:text-[#A3A3A3] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#525252] mb-1.5">{t('options')}</label>
                <div className="space-y-2">
                  {['optionA', 'optionB', 'optionC'].map((opt, i) => (
                    <input
                      key={i}
                      type="text"
                      defaultValue={t(opt)}
                      className="w-full px-4 py-2.5 rounded-xl border border-[#F0F0F0] bg-white text-sm text-[#131517] placeholder:text-[#A3A3A3] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#525252] mb-1.5">{t('deadline')}</label>
                <input
                  type="date"
                  className="w-full px-4 py-2.5 rounded-xl border border-[#F0F0F0] bg-white text-sm text-[#131517] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2.5 rounded-xl border border-[#F0F0F0] text-sm font-medium text-[#525252] hover:bg-[#FAFAFA] hover:text-[#131517] transition-all"
              >
                {t('cancel')}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2.5 rounded-xl bg-[#0A0A0A] text-white text-sm font-medium hover:bg-[#262626] hover:-translate-y-0.5 transition-all shadow-sm"
              >
                {t('create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ProposalCard({ proposal, onEndVote, onDelete }: { proposal: Proposal; onEndVote?: (id: string) => void; onDelete?: (id: string) => void }) {
  const t = useTranslations('admin')
  const totalVP = proposal.options.reduce((sum, o) => sum + o.votes, 0)
  const maxVP = Math.max(...proposal.options.map(o => o.votes))

  return (
    <div className="relative rounded-xl border border-[#F0F0F0] bg-white p-6 hover:shadow-md hover:border-[#E5E5E5] hover:-translate-y-0.5 transition-all duration-200">
      <Link
        href={`/admin/proposals/${proposal.id}`}
        aria-label={proposal.title}
        className="absolute inset-0 rounded-xl"
      />
      <div className="space-y-4">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className={cn(
                'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                statusColors[proposal.status]
              )}>
                {t(proposal.status)}
              </span>
              <span className="text-xs text-[#939597]">
                {proposal.voteType === 'weighted' ? t('weighted') : t('onePersonOneVote')}
              </span>
            </div>
            <h3 className="text-base font-semibold text-[#131517] leading-snug">
              {proposal.title}
            </h3>
            {proposal.summary && (
              <p className="text-sm text-[#525252] mt-1.5 line-clamp-2">{proposal.summary}</p>
            )}
          </div>
        </div>

        <div className="space-y-2.5 mb-4">
          {proposal.options.map(opt => {
            const pct = totalVP > 0 ? Math.round((opt.votes / totalVP) * 100) : 0
            const isWinning = opt.votes === maxVP && opt.votes > 0
            return (
              <div key={opt.id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className={cn('text-[#131517]', isWinning && 'font-medium')}>{opt.text}</span>
                  <span className="text-xs text-[#939597]">
                    {opt.votes} VP ({pct}%)
                  </span>
                </div>
                <div className="h-1.5 bg-[#FAFAFA] rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      isWinning ? 'bg-gradient-to-r from-emerald-500 to-green-400' : 'bg-[#E5E5E5]'
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-[#F0F0F0]">
          <div className="flex items-center gap-4 text-xs text-[#939597]">
            <span>{t('voters')}: {proposal.voterCount}/{proposal.totalMembers}</span>
            <span>{t('deadline')}: {proposal.endTime}</span>
          </div>
          <div className="relative z-10 flex items-center gap-1">
            {proposal.status === 'active' && (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEndVote?.(proposal.id) }}
                className="p-1.5 rounded-xl hover:bg-red-50 text-[#939597] hover:text-red-500 transition-colors"
                title={t('endVote')}
              >
                <Square className="w-4 h-4" />
              </button>
            )}
            {proposal.chainTxHash && (
              <a
                href={`https://explorer.injective.network/tx/${proposal.chainTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-xl hover:bg-blue-50 text-blue-500 transition-colors"
                title={t('viewOnChain')}
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            {proposal.status === 'draft' && (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete?.(proposal.id) }}
                className="p-1.5 rounded-xl hover:bg-red-50 text-[#939597] hover:text-red-500 transition-colors"
                title={t('delete')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function TasksTab() {
  const t = useTranslations('admin')
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string | 'all'>('all')

  const filtered = filter === 'all'
    ? demoTasks
    : demoTasks.filter(task => task.status === filter)

  const searched = search
    ? filtered.filter(task => task.title.toLowerCase().includes(search.toLowerCase()) || task.assigneeName.toLowerCase().includes(search.toLowerCase()))
    : filtered

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[#131517]">{t('tasks')}</h2>
          <p className="text-sm text-[#525252] mt-1">{t('tasksSubtitle')}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0A0A0A] text-white text-sm font-medium hover:bg-[#262626] hover:-translate-y-0.5 transition-all duration-200 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          {t('createTask')}
        </button>
      </div>

      {/* Search and filters */}
      <div className="flex items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#939597]" />
          <input
            type="text"
            placeholder={t('search') + '...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#F0F0F0] bg-white text-sm text-[#131517] placeholder:text-[#A3A3A3] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
          />
        </div>
        <Filter className="w-4 h-4 text-[#939597]" />
        {(['all', 'pending', 'inProgress', 'completed', 'cancelled'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              'px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-200',
              filter === s
                ? 'bg-[#0A0A0A] text-white'
                : 'bg-white border border-[#F0F0F0] text-[#525252] hover:border-[#E5E5E5] hover:text-[#131517]'
            )}
          >
            {s === 'all' ? t('all') : t(s)}
            {s !== 'all' && (
              <span className="ml-1.5 text-xs opacity-70">
                ({demoTasks.filter(task => task.status === s).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tasks table */}
      <div className="rounded-xl border border-[#F0F0F0] bg-white overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#F0F0F0]">
              <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">{t('taskTitle')}</th>
              <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">{t('assignee')}</th>
              <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">{t('priority')}</th>
              <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">{t('status')}</th>
              <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">{t('dueDate')}</th>
              <th className="text-right text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">{t('actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0F0F0]">
            {searched.map((task, i) => (
              <tr key={task.id} className={cn(i % 2 === 1 ? 'bg-[#FAFAFA]/50' : '', 'hover:bg-[#FAFAFA] transition-colors')}>
                <td className="px-6 py-4">
                  <div>
                    <p className="text-sm font-medium text-[#131517]">{task.title}</p>
                    <p className="text-xs text-[#939597] mt-1 line-clamp-1">{task.description}</p>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-green-400 flex items-center justify-center text-white text-xs font-medium">
                      {task.assigneeName[0]}
                    </div>
                    <span className="text-sm text-[#525252]">{task.assigneeName}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={cn(
                    'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                    priorityColors[task.priority]
                  )}>
                    {t('priority' + task.priority.charAt(0).toUpperCase() + task.priority.slice(1))}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={cn(
                    'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                    taskStatusColors[task.status]
                  )}>
                    {t(task.status)}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-[#525252]">{task.dueDate}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-1">
                    {task.status === 'pending' || task.status === 'inProgress' ? (
                      <button
                        onClick={() => alert(t('markComplete'))}
                        className="p-1.5 rounded-xl hover:bg-emerald-50 text-emerald-600 transition-colors"
                        title={t('markComplete')}
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    ) : null}
                    {(task.status === 'pending' || task.status === 'inProgress') && (
                      <button
                        onClick={() => alert(t('cancelItem'))}
                        className="p-1.5 rounded-xl hover:bg-red-50 text-red-500 transition-colors"
                        title={t('cancelItem')}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <button className="p-1.5 rounded-xl hover:bg-[#FAFAFA] text-[#939597] hover:text-[#131517] transition-colors" title={t('viewDetails')}>
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Task Dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="relative bg-white rounded-2xl border border-[#F0F0F0] shadow-xl w-full max-w-lg mx-4 p-8 space-y-6">
            <h2 className="text-xl font-semibold text-[#131517]">{t('createTask')}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#525252] mb-1.5">{t('taskTitle')}</label>
                <input
                  type="text"
                  placeholder={t('taskTitle')}
                  className="w-full px-4 py-2.5 rounded-xl border border-[#F0F0F0] bg-white text-sm text-[#131517] placeholder:text-[#A3A3A3] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#525252] mb-1.5">{t('description')}</label>
                <textarea
                  rows={3}
                  placeholder={t('descriptionPlaceholder')}
                  className="w-full px-4 py-2.5 rounded-xl border border-[#F0F0F0] bg-white text-sm text-[#131517] placeholder:text-[#A3A3A3] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#525252] mb-1.5">{t('assignee')}</label>
                  <select className="w-full px-4 py-2.5 rounded-xl border border-[#F0F0F0] bg-white text-sm text-[#131517] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all">
                    <option>Dan</option>
                    <option>Eve</option>
                    <option>Carol</option>
                    <option>Bob</option>
                    <option>Alice</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#525252] mb-1.5">{t('priority')}</label>
                  <select className="w-full px-4 py-2.5 rounded-xl border border-[#F0F0F0] bg-white text-sm text-[#131517] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all">
                    <option value="high">{t('priorityHigh')}</option>
                    <option value="medium">{t('priorityMedium')}</option>
                    <option value="low">{t('priorityLow')}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#525252] mb-1.5">{t('dueDate')}</label>
                <input
                  type="date"
                  className="w-full px-4 py-2.5 rounded-xl border border-[#F0F0F0] bg-white text-sm text-[#131517] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2.5 rounded-xl border border-[#F0F0F0] text-sm font-medium text-[#525252] hover:bg-[#FAFAFA] hover:text-[#131517] transition-all"
              >
                {t('cancel')}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2.5 rounded-xl bg-[#0A0A0A] text-white text-sm font-medium hover:bg-[#262626] hover:-translate-y-0.5 transition-all shadow-sm"
              >
                {t('create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ActivitiesTab() {
  const t = useTranslations('admin')
  const [showCreate, setShowCreate] = useState(false)
  const [filter, setFilter] = useState<string | 'all'>('all')

  const filtered = filter === 'all'
    ? demoActivities
    : demoActivities.filter(activity => activity.status === filter)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[#131517]">{t('activities')}</h2>
          <p className="text-sm text-[#525252] mt-1">{t('activitiesSubtitle')}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0A0A0A] text-white text-sm font-medium hover:bg-[#262626] hover:-translate-y-0.5 transition-all duration-200 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          {t('createActivity')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-[#939597]" />
        {(['all', 'upcoming', 'ongoing', 'completed', 'cancelled'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              'px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-200',
              filter === s
                ? 'bg-[#0A0A0A] text-white'
                : 'bg-white border border-[#F0F0F0] text-[#525252] hover:border-[#E5E5E5] hover:text-[#131517]'
            )}
          >
            {s === 'all' ? t('all') : t(s)}
            {s !== 'all' && (
              <span className="ml-1.5 text-xs opacity-70">
                ({demoActivities.filter(a => a.status === s).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Activities table */}
      <div className="rounded-xl border border-[#F0F0F0] bg-white overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#F0F0F0]">
              <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">{t('activityTitle')}</th>
              <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">{t('activityType')}</th>
              <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">{t('status')}</th>
              <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">{t('participants')}</th>
              <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">{t('startTime')}</th>
              <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">{t('endTime')}</th>
              <th className="text-left text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">{t('location')}</th>
              <th className="text-right text-xs font-medium text-[#939597] px-6 py-3 uppercase tracking-wider">{t('actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0F0F0]">
            {filtered.map((activity, i) => (
              <tr key={activity.id} className={cn(i % 2 === 1 ? 'bg-[#FAFAFA]/50' : '', 'hover:bg-[#FAFAFA] transition-colors')}>
                <td className="px-6 py-4">
                  <div>
                    <p className="text-sm font-medium text-[#131517]">{activity.title}</p>
                    <p className="text-xs text-[#939597] mt-1 line-clamp-1">{activity.description}</p>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700">
                    {t(activityTypeLabels[activity.type])}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={cn(
                    'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                    activityStatusColors[activity.status]
                  )}>
                    {t(activity.status)}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-[#525252]">{activity.participantCount}</td>
                <td className="px-6 py-4 text-sm text-[#525252]">{new Date(activity.startTime).toLocaleString()}</td>
                <td className="px-6 py-4 text-sm text-[#525252]">{new Date(activity.endTime).toLocaleString()}</td>
                <td className="px-6 py-4 text-sm text-[#525252]">{activity.location}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-1">
                    {(activity.status === 'upcoming' || activity.status === 'ongoing') && (
                      <button
                        onClick={() => alert(t('cancelItem'))}
                        className="p-1.5 rounded-xl hover:bg-red-50 text-red-500 transition-colors"
                        title={t('cancelItem')}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <button className="p-1.5 rounded-xl hover:bg-[#FAFAFA] text-[#939597] hover:text-[#131517] transition-colors" title={t('viewDetails')}>
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Activity Dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="relative bg-white rounded-2xl border border-[#F0F0F0] shadow-xl w-full max-w-lg mx-4 p-8 space-y-6">
            <h2 className="text-xl font-semibold text-[#131517]">{t('createActivity')}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#525252] mb-1.5">{t('activityTitle')}</label>
                <input
                  type="text"
                  placeholder={t('activityTitle')}
                  className="w-full px-4 py-2.5 rounded-xl border border-[#F0F0F0] bg-white text-sm text-[#131517] placeholder:text-[#A3A3A3] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#525252] mb-1.5">{t('description')}</label>
                <textarea
                  rows={3}
                  placeholder={t('descriptionPlaceholder')}
                  className="w-full px-4 py-2.5 rounded-xl border border-[#F0F0F0] bg-white text-sm text-[#131517] placeholder:text-[#A3A3A3] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#525252] mb-1.5">{t('activityType')}</label>
                  <select className="w-full px-4 py-2.5 rounded-xl border border-[#F0F0F0] bg-white text-sm text-[#131517] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all">
                    <option value="meetup">{t('activityTypeMeetup')}</option>
                    <option value="workshop">{t('activityTypeWorkshop')}</option>
                    <option value="hackathon">{t('activityTypeHackathon')}</option>
                    <option value="social">{t('activityTypeSocial')}</option>
                    <option value="other">{t('activityTypeOther')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#525252] mb-1.5">{t('location')}</label>
                  <input
                    type="text"
                    placeholder={t('location')}
                    className="w-full px-4 py-2.5 rounded-xl border border-[#F0F0F0] bg-white text-sm text-[#131517] placeholder:text-[#A3A3A3] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#525252] mb-1.5">{t('startTime')}</label>
                  <input
                    type="datetime-local"
                    className="w-full px-4 py-2.5 rounded-xl border border-[#F0F0F0] bg-white text-sm text-[#131517] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#525252] mb-1.5">{t('endTime')}</label>
                  <input
                    type="datetime-local"
                    className="w-full px-4 py-2.5 rounded-xl border border-[#F0F0F0] bg-white text-sm text-[#131517] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2.5 rounded-xl border border-[#F0F0F0] text-sm font-medium text-[#525252] hover:bg-[#FAFAFA] hover:text-[#131517] transition-all"
              >
                {t('cancel')}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2.5 rounded-xl bg-[#0A0A0A] text-white text-sm font-medium hover:bg-[#262626] hover:-translate-y-0.5 transition-all shadow-sm"
              >
                {t('create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
