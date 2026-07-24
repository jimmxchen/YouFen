'use client'

import Link from 'next/link'
import { ArrowRight, Share2 } from 'lucide-react'
import { useState } from 'react'
import { memberPrimaryButton } from '@/components/member/ui'

interface MemberProfileActionsProps {
  publicHref: string
  contributeHref: string
  labels: {
    submitContribution: string
    viewPublicCommunity: string
    shareContributions: string
    shareCopied: string
  }
}

export function MemberProfileActions({
  publicHref,
  contributeHref,
  labels,
}: MemberProfileActionsProps) {
  const [copied, setCopied] = useState(false)

  async function shareContributions() {
    const url = `${window.location.origin}${window.location.pathname}#contributions`

    try {
      if (navigator.share) {
        await navigator.share({
          title: document.title,
          url,
        })
        return
      }

      await navigator.clipboard?.writeText(url)
      setCopied(true)
    } catch {
      try {
        await navigator.clipboard?.writeText(url)
        setCopied(true)
      } catch {
        setCopied(false)
      }
    }
  }

  return (
    <div className="space-y-3">
      <Link href={contributeHref} className={memberPrimaryButton}>
        {labels.submitContribution}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
      <Link
        href={publicHref}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#F0F0F0] bg-white px-4 text-sm font-medium text-[#131517] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#E5E5E5] hover:bg-[#FAFAFA] hover:shadow-md active:translate-y-0"
      >
        {labels.viewPublicCommunity}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
      <button
        type="button"
        onClick={shareContributions}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#F0F0F0] bg-white px-4 text-sm font-medium text-[#131517] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#E5E5E5] hover:bg-[#FAFAFA] hover:shadow-md active:translate-y-0"
      >
        {labels.shareContributions}
        <Share2 className="h-4 w-4" aria-hidden="true" />
      </button>
      {copied ? <p className="text-xs font-medium text-emerald-700">{labels.shareCopied}</p> : null}
    </div>
  )
}
