'use client'

import { useEffect, useState } from 'react'
import { Clock3 } from 'lucide-react'
import { memberCard, memberInset, memberMuted, memberSubtle } from '@/components/member/ui'

interface PendingContribution {
  id: string
  title: string
  typeLabel: string
  details: string
  proofLink?: string
  evidenceName?: string
  createdAt: string
}

interface PendingContributionListProps {
  communityId: string
  labels: {
    title: string
    status: string
    submittedAt: string
    proof: string
    evidence: string
  }
}

export function pendingContributionStorageKey(communityId: string) {
  return `youfen:pending-contributions:${communityId}`
}

export function PendingContributionList({ communityId, labels }: PendingContributionListProps) {
  const [items, setItems] = useState<PendingContribution[]>([])

  useEffect(() => {
    const raw = window.localStorage.getItem(pendingContributionStorageKey(communityId))
    if (!raw) return

    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        setItems(parsed)
      }
    } catch {
      setItems([])
    }
  }, [communityId])

  if (items.length === 0) {
    return null
  }

  return (
    <section className="mb-4 space-y-3">
      {items.map((item) => (
        <article key={item.id} className={memberCard}>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Clock3 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold leading-6 text-[#131517]">{item.title}</h3>
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                  {labels.status}
                </span>
              </div>
              <p className={`mt-1 text-sm leading-6 ${memberMuted}`}>{item.details}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className={memberInset}>
                  <p className={`text-xs ${memberSubtle}`}>{labels.title}</p>
                  <p className="mt-1 text-sm font-medium text-[#131517]">{item.typeLabel}</p>
                </div>
                <div className={memberInset}>
                  <p className={`text-xs ${memberSubtle}`}>{labels.submittedAt}</p>
                  <p className="mt-1 text-sm font-medium text-[#131517]">{item.createdAt}</p>
                </div>
              </div>
              {item.proofLink || item.evidenceName ? (
                <p className={`mt-3 truncate text-xs ${memberSubtle}`}>
                  {item.evidenceName ? `${labels.evidence}: ${item.evidenceName}` : null}
                  {item.evidenceName && item.proofLink ? ' · ' : null}
                  {item.proofLink ? `${labels.proof}: ${item.proofLink}` : null}
                </p>
              ) : null}
            </div>
          </div>
        </article>
      ))}
    </section>
  )
}
