import { TrendingDown } from 'lucide-react'

interface OwnershipTrendCardProps {
  description: string
  title: string
}

export function OwnershipTrendCard({ description, title }: OwnershipTrendCardProps) {
  return (
    <section className="rounded-[24px] bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
          <TrendingDown className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-[#6f7174]">
            {description}
          </p>
        </div>
      </div>
    </section>
  )
}
