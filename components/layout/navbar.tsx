'use client'

import { Link } from '@/i18n/navigation'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { useAuth } from '@/components/auth/auth-context'
import { LanguageSwitcher } from '@/components/ui/language-switcher'

export function Navbar({ forceLight = false }: { forceLight?: boolean }) {
  const t = useTranslations('nav');
  const { user } = useAuth()
  const [isHeroScrolled, setIsHeroScrolled] = useState(forceLight)
  const [isMounted, setIsMounted] = useState(false)
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)

  useEffect(() => {
    setIsMounted(true)

    if (forceLight) return

    const handleScroll = () => {
      const heroHeight = window.innerHeight
      setIsHeroScrolled(window.scrollY > heroHeight)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [forceLight])

  const dropdownMenus = {
    features: [
      { label: t('dropdown.aiRules'), href: '/features/ai', description: t('dropdown.aiRulesDesc') },
      { label: t('dropdown.votingPower'), href: '/features/voting-power', description: t('dropdown.votingPowerDesc') },
      { label: t('dropdown.voting'), href: '/features/voting', description: t('dropdown.votingDesc') },
      { label: t('dropdown.contribution'), href: '/features/contribution', description: t('dropdown.contributionDesc') },
    ],
    resources: [
      { label: t('dropdown.docs'), href: '/docs', description: t('dropdown.docsDesc') },
      { label: t('dropdown.bestPractices'), href: '/resources/best-practices', description: t('dropdown.bestPracticesDesc') },
      { label: t('dropdown.videos'), href: '/resources/videos', description: t('dropdown.videosDesc') },
      { label: t('dropdown.api'), href: '/resources/api', description: t('dropdown.apiDesc') },
    ],
  }

  return (
    <motion.nav
      initial={false}
      animate={{
        backgroundColor: isHeroScrolled ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 1)',
      }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
      className="fixed top-0 left-0 right-0 z-50 h-16 backdrop-blur-[20px]"
      style={{ opacity: isMounted ? 1 : 0 }}
      onMouseLeave={() => setActiveDropdown(null)}
    >
      <div className="relative h-full max-w-7xl mx-auto px-6 flex items-center justify-between">
        {/* 左侧：Logo + 功能菜单 */}
        <div className="flex items-center space-x-1">
          {/* Logo */}
          <Link href="/" className="relative flex items-center mr-4 ml-2">
            <Image
              src="/YouFen_Logo_White.png"
              alt="YouFen"
              width={100}
              height={32}
              className="h-8 w-auto transition-opacity duration-500"
              style={{ opacity: isHeroScrolled ? 0 : 1 }}
              priority
            />
            <Image
              src="/brand/youfen-logo-black.png"
              alt="YouFen"
              width={100}
              height={32}
              className="h-8 w-auto transition-opacity duration-500 absolute"
              style={{ opacity: isHeroScrolled ? 1 : 0, mixBlendMode: 'multiply' }}
              priority
            />
          </Link>

          {/* 带下拉菜单的功能链接 */}
          <div
            className="relative"
            onMouseEnter={() => setActiveDropdown('features')}
          >
            <button
              className={`px-4 py-2 text-sm font-normal rounded-lg transition-all flex items-center gap-1 ${
                isHeroScrolled
                  ? 'text-[#131517] hover:text-[#939597] hover:bg-black/4'
                  : 'text-gray-300 hover:text-white hover:bg-white/10'
              }`}
            >
              {t('features')}
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>

          {/* 带下拉菜单的资源链接 */}
          <div
            className="relative"
            onMouseEnter={() => setActiveDropdown('resources')}
          >
            <button
              className={`px-4 py-2 text-sm font-normal rounded-lg transition-all flex items-center gap-1 ${
                isHeroScrolled
                  ? 'text-[#131517] hover:text-[#939597] hover:bg-black/4'
                  : 'text-gray-300 hover:text-white hover:bg-white/10'
              }`}
            >
              {t('resources')}
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* 右侧：其他导航链接 */}
        <div className="flex items-center space-x-1">
          <LanguageSwitcher isDark={!isHeroScrolled} />

          {user ? (
            <Link
              href="/admin"
              className={`ml-4 px-6 py-2 text-sm font-normal rounded-[15px] transition-all active:scale-[0.97] ${
                isHeroScrolled
                  ? 'text-[#131517] bg-[#f5f5f5] hover:bg-[#e5e5e5]'
                  : 'text-black bg-white hover:bg-gray-100'
              }`}
            >
              {t('dashboard')}
            </Link>
          ) : (
            <Link
              href="/sign-in"
              className={`ml-4 px-6 py-2 text-sm font-normal rounded-[15px] transition-all active:scale-[0.97] ${
                isHeroScrolled
                  ? 'text-[#131517] bg-[#f5f5f5] hover:bg-[#e5e5e5]'
                  : 'text-black bg-white hover:bg-gray-100'
              }`}
            >
              {t('create')}
            </Link>
          )}

        </div>
      </div>

      {/* 底部分割线 */}
      <motion.div
        animate={{
          backgroundColor: isHeroScrolled ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.15)',
        }}
        transition={{ duration: 0.5 }}
        className="absolute bottom-0 left-0 right-0 h-[0.5px]"
      />

      {/* 下拉菜单面板 */}
      <AnimatePresence>
        {activeDropdown && dropdownMenus[activeDropdown as keyof typeof dropdownMenus] && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute top-16 left-0 right-0 backdrop-blur-[20px]"
            style={{
              backgroundColor: isHeroScrolled ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.95)',
            }}
          >
            <div className="max-w-7xl mx-auto px-6 py-8">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {dropdownMenus[activeDropdown as keyof typeof dropdownMenus].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`p-4 rounded-lg transition-all hover:scale-105 ${
                      isHeroScrolled
                        ? 'hover:bg-black/5'
                        : 'hover:bg-white/10'
                    }`}
                  >
                    <div
                      className={`font-medium mb-1 ${
                        isHeroScrolled ? 'text-[#131517]' : 'text-white'
                      }`}
                    >
                      {item.label}
                    </div>
                    <div
                      className={`text-sm ${
                        isHeroScrolled ? 'text-[#939597]' : 'text-gray-400'
                      }`}
                    >
                      {item.description}
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* 下拉菜单底部分割线 */}
            <div
              className="h-[0.5px]"
              style={{
                backgroundColor: isHeroScrolled ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.15)',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  )
}
