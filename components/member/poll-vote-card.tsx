'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import type { MemberProposalOption } from '@/types/proposal'
import { PollOptionBar } from '@/components/ui/poll-option-bar'
import { memberCard, memberMuted, memberPrimaryButton, memberSubtle } from '@/components/member/ui'

interface PollVoteCardProps {
  communityId: string
  proposalId: string
  options: MemberProposalOption[]
  votable: boolean
  initialVotedOptionId?: string
  labels: {
    /** Raw template containing a literal "{count}" token, interpolated client-side. */
    votesLabelTemplate: string
    castVote: string
    voteCast: string
    /** Raw template containing a literal "{option}" token, interpolated client-side. */
    voteCastBodyTemplate: string
    votingUpcoming: string
  }
}

function fillTemplate(template: string, token: string, value: string) {
  return template.replace(token, value)
}

export function PollVoteCard({
  communityId,
  proposalId,
  options,
  votable,
  initialVotedOptionId,
  labels,
}: PollVoteCardProps) {
  const storageKey = `youfen:vote:${communityId}:${proposalId}`
  const [votedOptionId, setVotedOptionId] = useState<string | undefined>(initialVotedOptionId)
  const [selectedOptionId, setSelectedOptionId] = useState<string | undefined>(initialVotedOptionId)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Rehydrate a previously cast vote so it survives navigation and reloads.
  useEffect(() => {
    if (initialVotedOptionId) return
    const stored = window.localStorage.getItem(storageKey)
    if (stored && options.some((opt) => opt.id === stored)) {
      setVotedOptionId(stored)
      setSelectedOptionId(stored)
    }
  }, [storageKey, initialVotedOptionId, options])

  const displayOptions = options.map((opt) =>
    votedOptionId && opt.id === votedOptionId && !initialVotedOptionId
      ? { ...opt, votes: opt.votes + 1 }
      : opt,
  )
  const totalVotes = displayOptions.reduce((sum, opt) => sum + opt.votes, 0)
  const maxVotes = Math.max(...displayOptions.map((opt) => opt.votes), 0)
  const hasVoted = Boolean(votedOptionId)

  async function handleSubmit() {
    if (!selectedOptionId || votedOptionId || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/member/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, proposalId, optionId: selectedOptionId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `${res.status}`)
      }
      window.localStorage.setItem(storageKey, selectedOptionId)
      setVotedOptionId(selectedOptionId)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to submit vote')
    } finally {
      setSubmitting(false)
    }
  }

  const votedOption = options.find((opt) => opt.id === votedOptionId)

  return (
    <div className={memberCard}>
      <div className="space-y-3">
        {displayOptions.map((opt) => {
          const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0
          const isWinning = opt.votes === maxVotes && opt.votes > 0
          return (
            <PollOptionBar
              key={opt.id}
              text={opt.text}
              pct={pct}
              isWinning={hasVoted && isWinning}
              selected={selectedOptionId === opt.id}
              interactive={votable && !hasVoted}
              disabled={hasVoted}
              showResults={hasVoted || !votable}
              onSelect={() => setSelectedOptionId(opt.id)}
              meta={hasVoted || !votable ? fillTemplate(labels.votesLabelTemplate, '{count}', String(opt.votes)) : undefined}
            />
          )
        })}
      </div>

      {votable && !hasVoted ? (
        <div className="mt-5 space-y-3">
          {submitError && (
            <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{submitError}</p>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!selectedOptionId || submitting}
            className={`${memberPrimaryButton} disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0`}
          >
            {submitting ? '...' : labels.castVote}
          </button>
        </div>
      ) : null}

      {!votable && !hasVoted ? (
        <p className={`mt-4 text-sm ${memberSubtle}`}>{labels.votingUpcoming}</p>
      ) : null}

      {hasVoted && votedOption ? (
        <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-emerald-800">{labels.voteCast}</p>
            <p className={`mt-0.5 text-sm ${memberMuted}`}>{fillTemplate(labels.voteCastBodyTemplate, '{option}', votedOption.text)}</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
