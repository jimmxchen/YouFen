'use client'

import { useEffect, useRef, useState } from 'react'
import { Bell, BellOff, Check, Languages, Loader2, LogOut, Mail, Settings, User, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/navigation'
import { useAuth } from '@/components/auth/auth-context'
import { cn } from '@/lib/utils'

const NOTIFICATION_STORAGE_KEY = 'youfen:settings:notifications'

function getErrorMessage(error: string | undefined, labels: {
  fallback: string
  emailTaken: string
  invalidEmail: string
  nameTooLong: string
  missingFields: string
}) {
  if (!error) return labels.fallback
  if (error === 'EMAIL_TAKEN') return labels.emailTaken
  if (error === 'INVALID_EMAIL') return labels.invalidEmail
  if (error === 'NAME_TOO_LONG') return labels.nameTooLong
  if (error === 'MISSING_FIELDS') return labels.missingFields
  return labels.fallback
}

export function SidebarSettings() {
  const t = useTranslations('settingsPanel')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const { user, signOut, refresh } = useAuth()
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const otherLocale = locale === 'zh' ? 'en' : 'zh'
  const localeLabel = otherLocale === 'en' ? 'English' : '中文'

  useEffect(() => {
    setName(user?.name ?? '')
    setEmail(user?.email ?? '')
  }, [user?.email, user?.name])

  useEffect(() => {
    const stored = window.localStorage.getItem(NOTIFICATION_STORAGE_KEY)
    if (stored) setNotificationsEnabled(stored === 'on')
  }, [])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  const switchLanguage = () => {
    router.replace(pathname, { locale: otherLocale })
    setOpen(false)
  }

  const toggleNotifications = () => {
    setNotificationsEnabled((current) => {
      const next = !current
      window.localStorage.setItem(NOTIFICATION_STORAGE_KEY, next ? 'on' : 'off')
      setMessage(next ? t('notificationsOn') : t('notificationsOff'))
      setError(null)
      return next
    })
  }

  const saveAccount = async () => {
    setSaving(true)
    setMessage(null)
    setError(null)

    try {
      const res = await fetch('/api/auth/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(getErrorMessage(data.error, {
          fallback: t('saveError'),
          emailTaken: t('emailTaken'),
          invalidEmail: t('invalidEmail'),
          nameTooLong: t('nameTooLong'),
          missingFields: t('missingFields'),
        }))
        return
      }

      await refresh()
      setName(data.user?.name ?? name)
      setEmail(data.user?.email ?? email)
      setMessage(t('saved'))
    } catch {
      setError(t('saveError'))
    } finally {
      setSaving(false)
    }
  }

  const handleSignOut = async () => {
    await signOut()
    router.replace('/sign-in')
  }

  return (
    <div ref={panelRef} className="relative">
      {open ? (
        <div className="absolute bottom-[calc(100%+0.5rem)] left-0 right-0 z-50 overflow-hidden rounded-2xl border border-[#F0F0F0] bg-white shadow-[0_18px_60px_rgba(19,21,23,0.12)]">
          <div className="flex items-center justify-between border-b border-[#F0F0F0] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-[#131517]">{t('title')}</p>
              <p className="mt-0.5 text-xs text-[#939597]">{t('subtitle')}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-[#525252] transition-colors hover:bg-[#FAFAFA] hover:text-[#131517]"
              aria-label={t('close')}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-4 p-4">
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium uppercase text-[#939597]">
                <User className="h-3.5 w-3.5" aria-hidden="true" />
                {t('account')}
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-[#525252]">{t('name')}</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="min-h-10 w-full rounded-xl border border-[#F0F0F0] bg-[#FAFAFA] px-3 text-sm text-[#131517] outline-none transition focus:border-[#DADADA] focus:bg-white focus:ring-2 focus:ring-emerald-500/15"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[#525252]">
                  <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('email')}
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="min-h-10 w-full rounded-xl border border-[#F0F0F0] bg-[#FAFAFA] px-3 text-sm text-[#131517] outline-none transition focus:border-[#DADADA] focus:bg-white focus:ring-2 focus:ring-emerald-500/15"
                />
              </label>
              <button
                type="button"
                onClick={saveAccount}
                disabled={saving || !name.trim() || !email.trim()}
                className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#131517] px-3 text-sm font-medium text-white transition hover:bg-[#262626] disabled:cursor-not-allowed disabled:bg-[#D4D4D4]"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                {saving ? t('saving') : t('save')}
              </button>
            </section>

            <section className="space-y-2">
              <button
                type="button"
                onClick={toggleNotifications}
                className="flex min-h-10 w-full items-center gap-3 rounded-xl border border-[#F0F0F0] bg-[#FAFAFA] px-3 text-left text-sm text-[#525252] transition hover:bg-white hover:text-[#131517]"
              >
                {notificationsEnabled ? <Bell className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <BellOff className="h-4 w-4" aria-hidden="true" />}
                <span className="flex-1">{t('notifications')}</span>
                <span className={cn('h-5 w-9 rounded-full p-0.5 transition', notificationsEnabled ? 'bg-emerald-500' : 'bg-[#D4D4D4]')}>
                  <span className={cn('block h-4 w-4 rounded-full bg-white transition', notificationsEnabled && 'translate-x-4')} />
                </span>
              </button>
              <button
                type="button"
                onClick={switchLanguage}
                className="flex min-h-10 w-full items-center gap-3 rounded-xl border border-[#F0F0F0] bg-[#FAFAFA] px-3 text-left text-sm text-[#525252] transition hover:bg-white hover:text-[#131517]"
              >
                <Languages className="h-4 w-4" aria-hidden="true" />
                <span className="flex-1">{t('language')}</span>
                <span className="text-xs font-medium text-[#939597]">{localeLabel}</span>
              </button>
            </section>

            {message ? <p className="text-xs text-emerald-600">{message}</p> : null}
            {error ? <p className="text-xs text-red-500">{error}</p> : null}

            <button
              type="button"
              onClick={handleSignOut}
              className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 text-sm font-medium text-red-600 transition hover:border-red-200 hover:bg-red-100"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {t('signOut')}
            </button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current)
          setMessage(null)
          setError(null)
        }}
        className={cn(
          'flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-sm transition-colors',
          open ? 'bg-white text-[#131517]' : 'text-[#939597] hover:bg-white/60 hover:text-[#131517]'
        )}
      >
        <Settings className="h-4 w-4" aria-hidden="true" />
        {t('title')}
      </button>
    </div>
  )
}
