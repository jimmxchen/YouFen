'use client'

import { useTranslations } from 'next-intl'
import { useParams } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { ArrowLeft, Square, ShieldCheck, Trash2, ExternalLink, Users, Vote as VoteIcon } from 'lucide-react'
import { useAdminProposal, apiPatch } from '@/lib/hooks/use-admin-data'
import { type Proposal, ProposalStatus } from '@/types/admin'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { PollOptionBar } from '@/components/ui/poll-option-bar'

const statusColors: Record<ProposalStatus, { bg: string; text: string; border: string }> = {
  draft: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' },
  active: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  ended: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  recorded: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
}

export default function ProposalDetailPage() {
  const t = useTranslations('admin')
  const params = useParams()
  const proposalId = params.id as string

  const { proposal, loading, refetch } = useAdminProposal(proposalId)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="text-center py-20">
          <p className="text-lg text-[#525252]">{t('loading')}</p>
        </div>
      </div>
    )
  }

  if (!proposal) {
    return (
      <div className="space-y-6">
        <div className="text-center py-20">
          <p className="text-lg text-[#525252]">{t('proposalNotFound')}</p>
          <Link href="/admin/proposals" className="text-emerald-600 hover:text-emerald-700 font-medium mt-2 inline-block">
            {t('backToProposals')}
          </Link>
        </div>
      </div>
    )
  }

  const totalVP = proposal.options.reduce((sum, o) => sum + o.votes, 0)
  const maxVP = Math.max(...proposal.options.map(o => o.votes))
  const statusCfg = statusColors[proposal.status]
  const isEnded = proposal.status === 'ended' || proposal.status === 'recorded'
  const isDraft = proposal.status === 'draft'

  const [actionLoading, setActionLoading] = useState(false)

  const handleEndVote = async () => {
    setActionLoading(true)
    try {
      await apiPatch(`/proposals/${proposalId}`, { status: 'ended' })
      refetch()
    } catch {
      // silent
    } finally {
      setActionLoading(false)
    }
  }

  const handleGenerateRecord = async () => {
    // End vote already creates a result record; just end the vote
    await handleEndVote()
  }

  const handleDelete = async () => {
    setShowDeleteConfirm(false)
    setActionLoading(true)
    try {
      await apiPatch(`/proposals/${proposalId}`, { status: 'draft' })
      refetch()
    } catch {
      // silent
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/admin/proposals"
            className="inline-flex items-center gap-1.5 text-sm text-[#939597] hover:text-[#131517] transition-colors mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('backToProposals')}
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <span className={cn(
              'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border',
              statusCfg.bg, statusCfg.text, statusCfg.border
            )}>
              {t(proposal.status)}
            </span>
            <span className="text-xs text-[#939597]">
              {proposal.voteType === 'weighted' ? t('weighted') : t('onePersonOneVote')}
            </span>
          </div>
          <h1 className="text-[40px] font-medium text-[#131517] leading-[48px]">
            {proposal.title}
          </h1>
        </div>
        <div className="flex items-center gap-2 pt-2">
          {!isEnded && !isDraft && (
            <button
              onClick={handleEndVote}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#F0F0F0] text-sm font-medium text-[#525252] hover:bg-[#FAFAFA] hover:text-[#131517] transition-all"
            >
              <Square className="w-4 h-4" />
              {t('endVote')}
            </button>
          )}
          {isEnded && !proposal.chainTxHash && (
            <button
              onClick={handleGenerateRecord}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 hover:-translate-y-0.5 transition-all shadow-sm"
            >
              <ShieldCheck className="w-4 h-4" />
              {t('generateTrustedRecord', { defaultValue: 'Generate Trusted Record' })}
            </button>
          )}
          {isDraft && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50 transition-all"
            >
              <Trash2 className="w-4 h-4" />
              {t('delete')}
            </button>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="rounded-xl border border-[#F0F0F0] bg-white p-6">
        <h2 className="text-base font-semibold text-[#131517] mb-2">
          {t('description', { defaultValue: 'Description' })}
        </h2>
        <p className="text-sm text-[#525252] leading-relaxed">
          {proposal.description}
        </p>
        {proposal.summary && (
          <div className="mt-4 p-4 rounded-xl bg-[#FAFAFA] border border-[#F0F0F0]">
            <p className="text-xs text-[#939597] mb-1">{t('aiSummary', { defaultValue: 'AI Summary' })}</p>
            <p className="text-sm text-[#131517]">{proposal.summary}</p>
          </div>
        )}
        <div className="flex items-center gap-6 mt-4 pt-4 border-t border-[#F0F0F0] text-sm text-[#525252]">
          <span className="flex items-center gap-1.5">
            <Users className="w-4 h-4 text-[#939597]" />
            {proposal.voterCount} / {proposal.totalMembers} {t('voters', { defaultValue: 'voters' })}
          </span>
          <span className="flex items-center gap-1.5">
            <VoteIcon className="w-4 h-4 text-[#939597]" />
            {totalVP.toLocaleString()} {t('totalVP')}
          </span>
          <span>{t('started', { defaultValue: 'Started' })}: {proposal.startTime}</span>
          <span>{t('deadline')}: {proposal.endTime}</span>
        </div>
      </div>

      {/* Vote Results */}
      <div>
        <h2 className="text-xl font-semibold text-[#131517] mb-4">
          {t('voteResults', { defaultValue: 'Vote Results' })}
        </h2>
        <div className="rounded-xl border border-[#F0F0F0] bg-white p-6 space-y-5">
          {proposal.options.map((opt) => {
            const pct = totalVP > 0 ? Math.round((opt.votes / totalVP) * 100) : 0
            const isWinning = opt.votes === maxVP && opt.votes > 0
            return (
              <div key={opt.id} className="space-y-1.5">
                {isWinning && isEnded && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {t('winning', { defaultValue: 'Winning' })}
                  </span>
                )}
                <PollOptionBar
                  text={opt.text}
                  pct={pct}
                  isWinning={isWinning}
                  meta={`${opt.votes.toLocaleString()} VP · ${opt.voterCount} ${t('voters', { defaultValue: 'voters' })}`}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* Trusted Record Info */}
      {(proposal.chainTxHash || proposal.resultHash) && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-6">
          <h2 className="text-base font-semibold text-[#131517] mb-3 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            {t('trustedRecord', { defaultValue: 'Trusted Record' })}
          </h2>
          <div className="space-y-2 text-sm">
            {proposal.resultHash && (
              <div className="flex items-center gap-2">
                <span className="text-[#939597] shrink-0 w-20">{t('dataHash')}</span>
                <code className="flex-1 px-3 py-1.5 rounded-md bg-white border border-blue-200 text-xs text-[#525252] font-mono">
                  {proposal.resultHash}
                </code>
              </div>
            )}
            {proposal.chainTxHash && (
              <div className="flex items-center gap-2">
                <span className="text-[#939597] shrink-0 w-20">{t('txHash')}</span>
                <code className="flex-1 px-3 py-1.5 rounded-md bg-white border border-blue-200 text-xs text-[#525252] font-mono">
                  {proposal.chainTxHash}
                </code>
                <a
                  href={`https://explorer.injective.network/tx/${proposal.chainTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-md hover:bg-blue-100 text-blue-600 transition-colors shrink-0"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative bg-white rounded-2xl border border-[#F0F0F0] shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-[#131517]">
              {t('deleteProposalConfirm')}
            </h3>
            <p className="text-sm text-[#525252]">
              {t('deleteProposalWarning')}
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2.5 rounded-xl border border-[#F0F0F0] text-sm font-medium text-[#525252] hover:bg-[#FAFAFA] transition-all"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-all"
              >
                {t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
