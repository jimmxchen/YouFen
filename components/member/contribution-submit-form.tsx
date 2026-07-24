'use client'

import { useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { CheckCircle2, ImagePlus, ShieldCheck, Upload } from 'lucide-react'
import {
  memberCard,
  memberInset,
  memberMuted,
  memberPrimaryButton,
  memberSubtle,
} from '@/components/member/ui'
import { pendingContributionStorageKey } from '@/components/member/pending-contribution-list'

export interface ContributionTypeOption {
  id: string
  label: string
}

interface ContributionSubmitFormProps {
  communityId: string
  meHref: string
  types: ContributionTypeOption[]
  labels: {
    titleField: string
    titlePlaceholder: string
    type: string
    details: string
    detailsPlaceholder: string
    evidence: string
    evidenceHint: string
    evidenceChosen: string
    proofLink: string
    proofLinkPlaceholder: string
    reviewTitle: string
    reviewNote: string
    submit: string
    successTitle: string
    successBody: string
    backToMe: string
    required: string
  }
}

const fieldClass =
  'mt-2 w-full min-h-11 rounded-xl border border-[#F0F0F0] bg-white px-4 text-sm text-[#131517] outline-none transition placeholder:text-[#939597] focus:border-[#E5E5E5] focus:ring-2 focus:ring-emerald-500/15'

const textareaClass =
  'mt-2 w-full min-h-[120px] resize-none rounded-xl border border-[#F0F0F0] bg-white px-4 py-3 text-sm leading-6 text-[#131517] outline-none transition placeholder:text-[#939597] focus:border-[#E5E5E5] focus:ring-2 focus:ring-emerald-500/15'

export function ContributionSubmitForm({
  communityId,
  meHref,
  types,
  labels,
}: ContributionSubmitFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [typeId, setTypeId] = useState(types[0]?.id ?? '')
  const [details, setDetails] = useState('')
  const [proofLink, setProofLink] = useState('')
  const [evidenceName, setEvidenceName] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!title.trim() || !details.trim() || !typeId) {
      setShowErrors(true)
      return
    }

    const typeLabel = types.find((type) => type.id === typeId)?.label ?? typeId
    const storageKey = pendingContributionStorageKey(communityId)
    const raw = window.localStorage.getItem(storageKey)
    let existing: unknown = []

    try {
      existing = raw ? JSON.parse(raw) : []
    } catch {
      existing = []
    }

    const next = Array.isArray(existing) ? existing : []

    window.localStorage.setItem(
      storageKey,
      JSON.stringify([
        {
          id: `pending-${Date.now()}`,
          title: title.trim(),
          typeLabel,
          details: details.trim(),
          proofLink: proofLink.trim() || undefined,
          evidenceName: evidenceName || undefined,
          createdAt: new Intl.DateTimeFormat(undefined, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          }).format(new Date()),
        },
        ...next,
      ])
    )

    setSubmitted(true)
  }

  if (submitted) {
    return (
      <section className={memberCard}>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-[#131517]">{labels.successTitle}</h2>
            <p className={`mt-2 text-sm leading-6 ${memberMuted}`}>{labels.successBody}</p>
          </div>
        </div>
        <Link href={meHref} className={`mt-5 ${memberPrimaryButton}`}>
          {labels.backToMe}
        </Link>
      </section>
    )
  }

  return (
    <form onSubmit={handleSubmit} className={`${memberCard} grid gap-5 lg:grid-cols-2`} noValidate>
      <div>
        <label htmlFor="contribution-title" className="block text-sm font-medium text-[#131517]">
          {labels.titleField}
        </label>
        <input
          id="contribution-title"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={labels.titlePlaceholder}
          className={fieldClass}
          autoComplete="off"
        />
        {showErrors && !title.trim() ? (
          <p className="mt-2 text-xs text-red-500">{labels.required}</p>
        ) : null}
      </div>

      <div>
        <p className="text-sm font-medium text-[#131517]">{labels.type}</p>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible">
          {types.map((type) => {
            const selected = type.id === typeId
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => setTypeId(type.id)}
                className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-medium transition ${
                  selected
                    ? 'bg-[#131517] text-white'
                    : 'border border-[#F0F0F0] bg-white text-[#525252] hover:border-[#E5E5E5]'
                }`}
                aria-pressed={selected}
              >
                {type.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="lg:col-span-2">
        <label htmlFor="contribution-details" className="block text-sm font-medium text-[#131517]">
          {labels.details}
        </label>
        <textarea
          id="contribution-details"
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          placeholder={labels.detailsPlaceholder}
          className={textareaClass}
        />
        {showErrors && !details.trim() ? (
          <p className="mt-2 text-xs text-red-500">{labels.required}</p>
        ) : null}
      </div>

      <div>
        <p className="text-sm font-medium text-[#131517]">{labels.evidence}</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            setEvidenceName(file ? file.name : null)
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="mt-2 flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-[#FAFAFA] px-4 text-center transition hover:border-gray-400"
        >
          {evidenceName ? (
            <>
              <Upload className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              <span className="text-sm font-medium text-[#131517]">{labels.evidenceChosen}</span>
              <span className={`max-w-full truncate text-xs ${memberSubtle}`}>{evidenceName}</span>
            </>
          ) : (
            <>
              <ImagePlus className="h-5 w-5 text-[#939597]" aria-hidden="true" />
              <span className={`text-sm leading-6 ${memberMuted}`}>{labels.evidenceHint}</span>
            </>
          )}
        </button>
      </div>

      <div>
        <label htmlFor="contribution-proof" className="block text-sm font-medium text-[#131517]">
          {labels.proofLink}
        </label>
        <input
          id="contribution-proof"
          type="url"
          value={proofLink}
          onChange={(event) => setProofLink(event.target.value)}
          placeholder={labels.proofLinkPlaceholder}
          className={fieldClass}
          inputMode="url"
        />
      </div>

      <div className={`${memberInset} lg:col-span-2`}>
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-[#131517]">{labels.reviewTitle}</p>
            <p className={`mt-1 text-sm leading-6 ${memberMuted}`}>{labels.reviewNote}</p>
          </div>
        </div>
      </div>

      <button type="submit" className={`${memberPrimaryButton} lg:col-span-2 lg:w-auto lg:justify-self-end lg:px-6`}>
        {labels.submit}
      </button>
    </form>
  )
}
