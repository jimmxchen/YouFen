'use client'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Calendar, LucideIcon, MapIcon, Users } from 'lucide-react'
import { ReactNode } from 'react'
import { useTranslations } from 'next-intl'

interface FeatureCardProps {
  children: ReactNode
  className?: string
}

const FeatureCard = ({ children, className }: FeatureCardProps) => (
  <Card className={cn('group relative rounded-[24px] shadow-lg', className)}>
    <CardDecorator />
    {children}
  </Card>
)

const CardDecorator = () => (
  <>
    <span className="absolute -left-px -top-px block size-2 border-l-2 border-t-2 border-blue-500"></span>
    <span className="absolute -right-px -top-px block size-2 border-r-2 border-t-2 border-blue-500"></span>
    <span className="absolute -bottom-px -left-px block size-2 border-b-2 border-l-2 border-blue-500"></span>
    <span className="absolute -bottom-px -right-px block size-2 border-b-2 border-r-2 border-blue-500"></span>
  </>
)

interface CardHeadingProps {
  icon: LucideIcon
  title: string
  description: string
  variant?: 'light' | 'dark'
}

const CardHeading = ({ icon: Icon, title, description, variant = 'dark' }: CardHeadingProps) => (
  <div className="p-6">
    <span className={cn('flex items-center gap-2 text-sm', variant === 'light' ? 'text-[#525252]' : 'text-white/70')}>
      <Icon className="size-4" />
      {title}
    </span>
    <p className={cn('mt-8 text-2xl font-semibold', variant === 'light' ? 'text-[#131517]' : 'text-white')}>{description}</p>
  </div>
)

interface DualModeImageProps {
  darkSrc: string
  lightSrc: string
  alt: string
  width: number
  height: number
  className?: string
}

const DualModeImage = ({ darkSrc, lightSrc, alt, width, height, className }: DualModeImageProps) => (
  <>
    <img
      src={darkSrc}
      className={cn('hidden dark:block', className)}
      alt={`${alt} dark`}
      width={width}
      height={height}
    />
    <img
      src={lightSrc}
      className={cn('shadow dark:hidden', className)}
      alt={`${alt} light`}
      width={width}
      height={height}
    />
  </>
)

interface CircleConfig {
  pattern: 'none' | 'border' | 'primary' | 'blue'
}

interface CircularUIProps {
  label: string
  circles: CircleConfig[]
  className?: string
}

const CircularUI = ({ label, circles, className }: CircularUIProps) => (
  <div className={className}>
    <div className="bg-gradient-to-b from-[#e5e5e5] size-fit rounded-2xl to-transparent p-px">
      <div className="bg-gradient-to-b from-white to-gray-50 relative flex aspect-square w-fit items-center -space-x-4 rounded-[15px] p-4">
        {circles.map((circle, i) => (
          <div
            key={i}
            className={cn('size-7 rounded-full border sm:size-8', {
              'border-emerald-500': circle.pattern === 'none',
              'border-emerald-500 bg-[repeating-linear-gradient(-45deg,#e5e5e5,#e5e5e5_1px,transparent_1px,transparent_4px)]': circle.pattern === 'border',
              'border-emerald-500 bg-white bg-[repeating-linear-gradient(-45deg,#10B981,#10B981_1px,transparent_1px,transparent_4px)]': circle.pattern === 'primary',
              'bg-white z-1 border-blue-500 bg-[repeating-linear-gradient(-45deg,#3B82F6,#3B82F6_1px,transparent_1px,transparent_4px)]': circle.pattern === 'blue',
            })}
          ></div>
        ))}
      </div>
    </div>
    <span className="text-[#525252] mt-1.5 block text-center text-sm">{label}</span>
  </div>
)

export function AdvancedFeatures() {
  const t = useTranslations('advancedFeatures')

  return (
    <section className="bg-[#FAFAFA] py-16 md:py-32">
      <div className="mx-auto max-w-2xl px-6 lg:max-w-5xl">
        <div className="mx-auto grid gap-4 lg:grid-cols-2">
          <FeatureCard>
            <CardHeader className="pb-3">
              <CardHeading
                icon={MapIcon}
                title={t('aiRecommend.title')}
                description={t('aiRecommend.description')}
              />
            </CardHeader>

            <div className="relative mb-6 border-t border-dashed sm:mb-0">
              <div className="absolute inset-0 [background:radial-gradient(125%_125%_at_50%_0%,transparent_40%,#93c5fd,white_125%)]"></div>
              <div className="aspect-[76/59] p-1 px-6">
                <DualModeImage
                  darkSrc="https://tailark.com/_next/image?url=%2Fpayments.png&w=3840&q=75"
                  lightSrc="https://tailark.com/_next/image?url=%2Fpayments-light.png&w=3840&q=75"
                  alt={t('aiRecommend.alt')}
                  width={1207}
                  height={929}
                />
              </div>
            </div>
          </FeatureCard>

          <FeatureCard>
            <CardHeader className="pb-3">
              <CardHeading
                icon={Calendar}
                title={t('timeline.title')}
                description={t('timeline.description')}
              />
            </CardHeader>

            <CardContent>
              <div className="relative mb-6 sm:mb-0">
                <div className="absolute -inset-6 [background:radial-gradient(50%_50%_at_75%_50%,transparent,white_100%)]"></div>
                <div className="aspect-[76/59] border rounded-xl overflow-hidden">
                  <DualModeImage
                    darkSrc="https://tailark.com/_next/image?url=%2Forigin-cal-dark.png&w=3840&q=75"
                    lightSrc="https://tailark.com/_next/image?url=%2Forigin-cal.png&w=3840&q=75"
                    alt={t('timeline.alt')}
                    width={1207}
                    height={929}
                  />
                </div>
              </div>
            </CardContent>
          </FeatureCard>

          <FeatureCard className="p-6 lg:col-span-2">
            <p className="mx-auto my-6 max-w-md text-balance text-center text-2xl font-semibold text-[#131517]">
              {t('votingModes.title')}
            </p>

            <div className="flex justify-center gap-6 overflow-hidden">
              <CircularUI
                label={t('votingModes.weighted')}
                circles={[{ pattern: 'border' }, { pattern: 'border' }]}
              />

              <CircularUI
                label={t('votingModes.onePersonOneVote')}
                circles={[{ pattern: 'none' }, { pattern: 'primary' }]}
              />

              <CircularUI
                label={t('votingModes.hybrid')}
                circles={[{ pattern: 'blue' }, { pattern: 'none' }]}
              />

              <CircularUI
                label={t('votingModes.anonymous')}
                circles={[{ pattern: 'primary' }, { pattern: 'none' }]}
                className="hidden sm:block"
              />
            </div>
          </FeatureCard>
        </div>
      </div>
    </section>
  )
}
