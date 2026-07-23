import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { MemberShell } from '@/components/member/member-shell'
import { MobileBottomNav } from '@/components/member/mobile-bottom-nav'
import { RecordReceiptList } from '@/components/member/record-receipt-list'
import { getDemoMember } from '@/lib/demo/member-data'

interface MemberRecordsPageProps {
  params: {
    locale: string
    communityId: string
  }
}

export default async function MemberRecordsPage({ params }: MemberRecordsPageProps) {
  const t = await getTranslations('member')
  const member = getDemoMember(params.communityId)
  const homeHref = `/${params.locale}/member/${params.communityId}`

  return (
    <MemberShell>
      <header className="px-5 pb-4 pt-5">
        <Link
          href={homeHref}
          className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm"
          aria-label={t('nav.home')}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <p className="truncate text-sm text-[#6f7174]">{member.communityName}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-normal">{t('records.title')}</h1>
        <p className="mt-3 text-sm leading-6 text-[#6f7174]">{t('records.description')}</p>
      </header>

      <div className="px-5">
        <RecordReceiptList
          receipts={member.receipts}
          labels={{
            verified: t('status.verified'),
            failed: t('status.failed'),
            pending: t('status.pending'),
            blockHeight: t('records.blockHeight'),
            receiptHash: t('records.receiptHash'),
            waiting: t('records.waiting'),
            viewExplorer: t('records.viewExplorer'),
            emptyTitle: t('records.emptyTitle'),
            emptyBody: t('records.emptyBody'),
          }}
        />
      </div>

      <MobileBottomNav
        locale={params.locale}
        communityId={params.communityId}
        active="records"
        labels={{
          home: t('nav.home'),
          history: t('nav.history'),
          records: t('nav.records'),
        }}
      />
    </MemberShell>
  )
}
