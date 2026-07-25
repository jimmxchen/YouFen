"use client";

import { useTranslations } from 'next-intl'
import { motion } from 'framer-motion'

export function ValueCards() {
  const t = useTranslations('valueCards')

  const values = [
    {
      title: t('visible'),
      description: t('visibleDesc'),
    },
    {
      title: t('power'),
      description: t('powerDesc'),
    },
    {
      title: t('trusted'),
      description: t('trustedDesc'),
    },
  ]

  return (
    <section className="relative py-20 px-6 bg-[#FAFAFA]">
      <div className="max-w-6xl mx-auto">
        {/* 区块标题 */}
        <div className="text-center mb-16">
          <h2 className="text-[40px] font-medium text-[#131517] leading-[48px] mb-4">
            {t('title')}
          </h2>
          <p className="text-xl text-[#525252] leading-[30px]">
            {t('subtitle')}
          </p>
        </div>

        {/* 价值卡片网格 - Aceternity简约风格 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {values.map((value, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true }}
              className="relative group"
            >
              {/* 边框光晕效果 */}
              <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-purple-500 rounded-2xl opacity-0 group-hover:opacity-20 blur transition duration-500"></div>

              {/* 卡片内容 */}
              <div className="relative bg-white border border-gray-200 rounded-2xl p-8 h-full group-hover:border-gray-300 transition-all duration-300">
                <h3 className="text-2xl font-semibold text-[#131517] mb-4">
                  {value.title}
                </h3>
                <p className="text-[#525252] leading-relaxed">
                  {value.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* 底部说明 */}
        <div className="mt-16 text-center">
          <p className="text-sm text-gray-500">
            {t('using')}
          </p>
        </div>
      </div>
    </section>
  )
}
