import Image from 'next/image'
import { cn } from '@/lib/utils'

interface YouFenLogoProps {
  variant?: 'black' | 'white'
  markClassName?: string
  textClassName?: string
  showText?: boolean
}

export function YouFenLogo({
  variant = 'black',
  markClassName,
  textClassName,
  showText = true,
}: YouFenLogoProps) {
  const isWhite = variant === 'white'

  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span
        className={cn(
          'relative flex h-8 w-8 shrink-0 overflow-hidden',
          markClassName
        )}
      >
        <Image
          src={isWhite ? '/brand/youfen-logo-white.png' : '/brand/youfen-logo-black.png'}
          alt=""
          fill
          sizes="32px"
          className="object-contain"
          priority
        />
      </span>
      {showText ? (
        <span className={cn('truncate font-semibold tracking-normal', textClassName)}>YouFen</span>
      ) : null}
    </span>
  )
}
