'use client'

import { GradientWave } from '@/components/ui/gradient-wave'
import { useTranslations } from 'next-intl'

export function Features() {
  const t = useTranslations('features')

  const features = [
    {
      title: t('aiRules'),
      description: t('aiRulesDesc'),
      colors: ['#3B82F6', '#FFFFFF', '#60A5FA', '#FFFFFF'],
    },
    {
      title: t('votingPower'),
      description: t('votingPowerDesc'),
      colors: ['#10B981', '#FFFFFF', '#34D399', '#FFFFFF'],
    },
    {
      title: t('voting'),
      description: t('votingDesc'),
      colors: ['#F59E0B', '#FFFFFF', '#FBBF24', '#FFFFFF'],
    },
  ]

  return (
    <section className="relative py-32 px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        {/* 标题 */}
        <div className="text-center mb-20">
          <h2 className="text-[40px] font-medium text-[#131517] leading-[48px] mb-4">
            {t('title')}
          </h2>
          <p className="text-xl text-[#333537] leading-[30px]">
            {t('subtitle')}
          </p>
        </div>

        {/* 功能列表 */}
        <div className="space-y-32">
          {features.map((feature, index) => (
            <div
              key={index}
              className={`flex flex-col ${
                index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'
              } items-center gap-12`}
            >
              {/* 渐变容器 - 标题在中间 */}
              <div className="flex-1 w-full">
                <div className="relative h-[320px] rounded-[24px] overflow-hidden">
                  <GradientWave
                    colors={feature.colors}
                    isPlaying={true}
                    className="rounded-[24px]"
                  />
                  {/* 标题叠加在渐变中间 */}
                  <div className="absolute inset-0 flex items-center justify-center z-10">
                    <h3 className="text-4xl font-semibold text-white drop-shadow-lg">
                      {feature.title}
                    </h3>
                  </div>
                </div>
              </div>

              {/* 描述和小字 */}
              <div className="flex-1">
                <p className="text-lg text-[#525252] leading-relaxed mb-4">
                  {feature.description}
                </p>
                <p className="text-sm text-[#939597]">
                  简化社群管理流程
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
