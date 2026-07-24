'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Plus, Square, ExternalLink, Trash2, X } from 'lucide-react'
import { useAdminProposals, apiPost, apiPatch } from '@/lib/hooks/use-admin-data'
import { useCommunity } from '@/lib/hooks/use-community'
import { type Proposal, ProposalStatus } from '@/types/admin'
import { cn } from '@/lib/utils'
import { PollOptionBar } from '@/components/ui/poll-option-bar'

const statusColors: Record<ProposalStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-emerald-50 text-emerald-700',
  ended: 'bg-amber-50 text-amber-700',
  recorded: 'bg-blue-50 text-blue-700',
}

const MIN_OPTIONS = 2

export default function ProposalsPage() {
  const t = useTranslations('admin')
  const { communityId } = useCommunity()
  const { proposals, refetch } = useAdminProposals(communityId)
  const [showCreate, setShowCreate] = useState(false)
  const [options, setOptions] = useState<string[]>([t('optionA'), t('optionB')])
  const [createTitle, setCreateTitle] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [createDeadline, setCreateDeadline] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleAddOption = () => {
    setOptions((prev) => [...prev, ''])
  }

  const handleRemoveOption = (index: number) => {
    setOptions((prev) => (prev.length > MIN_OPTIONS ? prev.filter((_, i) => i !== index) : prev))
  }

  const handleOptionChange = (index: number, value: string) => {
    setOptions((prev) => prev.map((opt, i) => (i === index ? value : opt)))
  }

  const closeCreate = () => {
    setShowCreate(false)
    setOptions([t('optionA'), t('optionB')])
    setCreateTitle('')
    setCreateDesc('')
    setCreateDeadline('')
  }

  const handleCreate = async () => {
    if (!createTitle.trim() || options.filter(o => o.trim()).length < 2) return
    setSubmitting(true)
    try {
      await apiPost('/proposals', {
        communityId,
        title: createTitle.trim(),
        description: createDesc.trim(),
        options: options.filter(o => o.trim()).map((text, i) => ({ id: `opt-${i + 1}`, text: text.trim() })),
        endTime: createDeadline ? new Date(createDeadline).toISOString() : undefined,
      })
      closeCreate()
      refetch()
    } catch {
      // silent
    } finally {
      setSubmitting(false)
    }
  }

  const handleEndVote = async (id: string) => {
    try {
      await apiPatch(`/proposals/${id}`, { status: 'ended' })
      refetch()
    } catch {
      // silent
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await apiPatch(`/proposals/${id}`, { status: 'draft' })
      refetch()
    } catch {
      // silent
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[40px] font-medium text-[#131517] leading-[48px]">
            {t('proposals')}
          </h1>
          <p className="text-lg text-[#525252] mt-2">
            {t('proposalsSubtitle')}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#131517] text-white text-sm font-medium hover:bg-[#262626] hover:-translate-y-0.5 transition-all duration-200"
        >
          <Plus className="w-4 h-4" />
          {t('createProposal')}
        </button>
      </div>

      {/* Proposals grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {proposals.map((proposal) => (
          <ProposalCard
            key={proposal.id}
            proposal={proposal}
            onEndVote={handleEndVote}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {/* Create Proposal Dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={closeCreate} />
          <div className="relative bg-white rounded-2xl border border-[#F0F0F0] shadow-xl w-full max-w-lg mx-4 p-8 space-y-6">
            <h2 className="text-xl font-semibold text-[#131517]">
              {t('createProposal')}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#525252] mb-1.5">
                  {t('proposalTitle')}
                </label>
                <input
                  type="text"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  placeholder={t('proposalTitlePlaceholder')}
                  className="w-full px-4 py-2.5 rounded-2xl border border-[#F0F0F0] bg-white text-sm text-[#131517] placeholder:text-[#A3A3A3] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#525252] mb-1.5">
                  {t('description')}
                </label>
                <textarea
                  rows={3}
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  placeholder={t('descriptionPlaceholder')}
                  className="w-full px-4 py-2.5 rounded-2xl border border-[#F0F0F0] bg-white text-sm text-[#131517] placeholder:text-[#A3A3A3] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#525252] mb-1.5">
                  {t('options')}
                </label>
                <div className="space-y-2">
                  {options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => handleOptionChange(i, e.target.value)}
                        placeholder={t('optionPlaceholder')}
                        className="w-full px-4 py-2.5 rounded-2xl border border-[#F0F0F0] bg-white text-sm text-[#131517] placeholder:text-[#A3A3A3] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveOption(i)}
                        disabled={options.length <= MIN_OPTIONS}
                        title={t('removeOption')}
                        className="shrink-0 p-2 rounded-xl text-[#939597] hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#939597]"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleAddOption}
                  className="mt-2 flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('addOption')}
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#525252] mb-1.5">
                  {t('deadline')}
                </label>
                <input
                  type="date"
                  value={createDeadline}
                  onChange={(e) => setCreateDeadline(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl border border-[#F0F0F0] bg-white text-sm text-[#131517] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={closeCreate}
                className="px-4 py-2.5 rounded-2xl border border-[#F0F0F0] text-sm font-medium text-[#525252] hover:bg-[#FAFAFA] hover:text-[#131517] transition-all"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleCreate}
                disabled={submitting || !createTitle.trim()}
                className="px-4 py-2.5 rounded-2xl bg-[#131517] text-white text-sm font-medium hover:bg-[#262626] hover:-translate-y-0.5 transition-all disabled:opacity-50"
              >
                {submitting ? 'Creating...' : t('create')}
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

  // Stretched-link pattern: an <a> must not contain other interactive elements
  // (the end-vote/delete buttons and the on-chain <a> below), so the card link
  // is an absolutely-positioned overlay instead of a wrapper.
  return (
    <div className="relative rounded-2xl border border-[#F0F0F0] bg-white p-6 hover:border-[#E5E5E5] hover:-translate-y-0.5 transition-all duration-200">
      <Link
        href={`/admin/proposals/${proposal.id}`}
        aria-label={proposal.title}
        className="absolute inset-0 rounded-2xl"
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

        {/* Options with bar visualization */}
        <div className="space-y-2.5 mb-4">
          {proposal.options.map(opt => {
            const pct = totalVP > 0 ? Math.round((opt.votes / totalVP) * 100) : 0
            const isWinning = opt.votes === maxVP && opt.votes > 0
            return (
              <PollOptionBar
                key={opt.id}
                text={opt.text}
                pct={pct}
                meta={`${opt.votes} VP`}
                isWinning={isWinning}
              />
            )
          })}
        </div>

        {/* Meta info */}
        <div className="flex items-center justify-between pt-4 border-t border-[#F0F0F0]">
          <div className="flex items-center gap-4 text-xs text-[#939597]">
            <span>{t('voters')}: {proposal.voterCount}/{proposal.totalMembers}</span>
            <span>{t('deadline')}: {proposal.endTime}</span>
          </div>
          <div className="relative z-10 flex items-center gap-1">
            {proposal.status === 'active' && (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEndVote?.(proposal.id) }}
                className="p-1.5 rounded-2xl hover:bg-red-50 text-[#939597] hover:text-red-500 transition-colors"
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
                className="p-1.5 rounded-2xl hover:bg-blue-50 text-blue-500 transition-colors"
                title={t('viewOnChain')}
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            {proposal.status === 'draft' && (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete?.(proposal.id) }}
                className="p-1.5 rounded-2xl hover:bg-red-50 text-[#939597] hover:text-red-500 transition-colors"
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
