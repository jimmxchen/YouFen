'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

export function Footer() {
  const t = useTranslations('footer')

  return (
    <footer className="relative border-t border-gray-200 bg-white py-12 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* 品牌信息 */}
          <div className="col-span-1 md:col-span-2">
            <div className="text-xl font-semibold text-gray-900 mb-3">
              {t('brand')}
            </div>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">
              {t('description')}
            </p>
            <div className="flex items-center space-x-2 text-xs text-gray-500">
              <span>{t('poweredBy')}</span>
              <span className="font-semibold text-emerald-600">{t('injective')}</span>
              <span>×</span>
              <span className="font-semibold text-blue-600">{t('ai')}</span>
            </div>
          </div>

          {/* 产品链接 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-4">{t('products.title')}</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/create" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  {t('products.createCommunity')}
                </Link>
              </li>
              <li>
                <Link href="/demo" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  {t('products.viewDemo')}
                </Link>
              </li>
              <li>
                <Link href="/docs" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  {t('products.docs')}
                </Link>
              </li>
            </ul>
          </div>

          {/* 关于链接 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-4">{t('about.title')}</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/bip" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  {t('about.buildInPublic')}
                </Link>
              </li>
              <li>
                <Link href="/about" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  {t('about.aboutUs')}
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/Simon-Snow/YouFen"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  {t('about.github')}
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* 底部版权 */}
        <div className="pt-8 border-t border-gray-200">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <p className="text-xs text-gray-500">
              {t('copyright')}
            </p>
            <div className="flex items-center space-x-6">
              <Link href="/privacy" className="text-xs text-gray-500 hover:text-gray-900 transition-colors">
                {t('privacy')}
              </Link>
              <Link href="/terms" className="text-xs text-gray-500 hover:text-gray-900 transition-colors">
                {t('terms')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
