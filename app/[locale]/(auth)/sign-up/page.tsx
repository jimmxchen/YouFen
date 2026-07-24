"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useTranslations, useLocale } from "next-intl"
import { Navbar } from "@/components/layout/navbar"
import { AuthVisual } from "@/components/auth/auth-visual"

function WeChatIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="mr-3">
      <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 01.213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 00.167-.054l1.903-1.114a.864.864 0 01.717-.098 10.16 10.16 0 002.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 01-1.162 1.178 1.17 1.17 0 01-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 01-1.162 1.178 1.17 1.17 0 01-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 01.598.082l1.584.926a.272.272 0 00.14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 01-.023-.156.49.49 0 01.201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 01-.969.983.976.976 0 01-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 01-.969.983.976.976 0 01-.969-.983c0-.542.434-.982.969-.982z" fill="#07C160"/>
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" className="mr-3">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

export default function SignUpPage() {
  const t = useTranslations("auth")
  const locale = useLocale()
  const router = useRouter()
  const isZh = locale === "zh"

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [phone, setPhone] = useState("")
  const [smsCode, setSmsCode] = useState("")
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!isZh) {
      if (password !== confirmPassword) {
        setError("Passwords do not match")
        return
      }
    }

    setLoading(true)
    setLoading(false)
    router.push("/admin")
  }

  return (
    <main className="h-screen bg-gray-100 flex flex-col overflow-hidden">
      <Navbar forceLight />
      <div className="flex flex-1 w-full min-h-0 pt-16">
        <div className="w-full hidden md:block relative overflow-hidden">
          <AuthVisual />
        </div>

        <div className="w-full flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-sm border border-gray-200 px-8 py-8">
            <form onSubmit={handleSubmit} className="flex flex-col items-center">
              <h2 className="text-3xl text-[#131517] font-semibold">
                {t("signUp")}
              </h2>
              <p className="text-sm text-gray-500 mt-1.5">{t("createAccount")}</p>

              <button
                type="button"
                className="w-full mt-5 bg-gray-100 hover:bg-gray-200/80 flex items-center justify-center h-11 rounded-full transition-colors"
              >
                {isZh ? (
                  <>
                    <WeChatIcon />
                    <span className="text-sm font-medium text-[#131517]">{t("wechatSignIn")}</span>
                  </>
                ) : (
                  <>
                    <GoogleIcon />
                    <span className="text-sm font-medium text-[#131517]">{t("googleSignIn")}</span>
                  </>
                )}
              </button>

              <div className="flex items-center gap-3 w-full my-4">
                <div className="w-full h-px bg-gray-200" />
                <p className="text-nowrap text-xs text-gray-400">{t("orContinueWith")}</p>
                <div className="w-full h-px bg-gray-200" />
              </div>

              {error && (
                <div className="w-full mb-3 p-3 text-sm text-red-600 bg-red-50 rounded-xl">{error}</div>
              )}

              <div className="flex items-center w-full bg-transparent border border-gray-200 hover:border-gray-300 focus-within:border-black/30 focus-within:ring-1 focus-within:ring-black/5 h-11 rounded-full overflow-hidden pl-5 gap-2.5 transition-all">
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="shrink-0">
                  <path d="M7.5 0a4 4 0 00-4 4c0 2.2 1.8 4 4 4s4-1.8 4-4-1.8-4-4-4zm0 10c-2.67 0-8 1.34-8 4v1h16v-1c0-2.66-5.33-4-8-4z" fill="#9CA3AF" />
                </svg>
                <input type="text" placeholder={t("name")} value={name} onChange={(e) => setName(e.target.value)} className="bg-transparent text-[#131517] placeholder-gray-400 outline-none text-sm w-full h-full" required />
              </div>

              {isZh ? (
                <>
                  <div className="flex items-center mt-3 w-full bg-transparent border border-gray-200 hover:border-gray-300 focus-within:border-black/30 focus-within:ring-1 focus-within:ring-black/5 h-11 rounded-full overflow-hidden pl-5 gap-2.5 transition-all">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="shrink-0">
                      <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" fill="#9CA3AF"/>
                    </svg>
                    <input type="tel" placeholder={t("phone")} value={phone} onChange={(e) => setPhone(e.target.value)} className="bg-transparent text-[#131517] placeholder-gray-400 outline-none text-sm w-full h-full" required />
                  </div>

                  <div className="flex items-center mt-3 w-full gap-2.5">
                    <div className="flex items-center flex-1 bg-transparent border border-gray-200 hover:border-gray-300 focus-within:border-black/30 focus-within:ring-1 focus-within:ring-black/5 h-11 rounded-full overflow-hidden pl-5 gap-2.5 transition-all">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="shrink-0">
                        <rect x="3" y="3" width="18" height="18" rx="2" stroke="#9CA3AF" strokeWidth="2"/>
                        <path d="M3 9h18M9 3v18" stroke="#9CA3AF" strokeWidth="2"/>
                      </svg>
                      <input type="text" placeholder={t("smsCode")} value={smsCode} onChange={(e) => setSmsCode(e.target.value)} className="bg-transparent text-[#131517] placeholder-gray-400 outline-none text-sm w-full h-full" required />
                    </div>
                    <button type="button" className="shrink-0 px-4 h-11 rounded-full text-sm font-medium text-[#131517] bg-gray-100 hover:bg-gray-200 transition-colors">
                      {t("sendCode")}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center mt-3 w-full bg-transparent border border-gray-200 hover:border-gray-300 focus-within:border-black/30 focus-within:ring-1 focus-within:ring-black/5 h-11 rounded-full overflow-hidden pl-5 gap-2.5 transition-all">
                    <svg width="16" height="12" viewBox="0 0 16 12" fill="none" className="shrink-0">
                      <path fillRule="evenodd" clipRule="evenodd" d="M0 1.1L.571.55H15.43l.57.55v9.9l-.571.55H.57L0 11.45zm1.143 1.138V10.9h13.714V2.69l-6.503 4.8h-.697zM13.749 2.1H2.25L8 6.356z" fill="#9CA3AF" />
                    </svg>
                    <input type="email" placeholder={t("email")} value={email} onChange={(e) => setEmail(e.target.value)} className="bg-transparent text-[#131517] placeholder-gray-400 outline-none text-sm w-full h-full" required />
                  </div>

                  <div className="flex items-center mt-3 w-full bg-transparent border border-gray-200 hover:border-gray-300 focus-within:border-black/30 focus-within:ring-1 focus-within:ring-black/5 h-11 rounded-full overflow-hidden pl-5 gap-2.5 transition-all">
                    <svg width="13" height="17" viewBox="0 0 13 17" fill="none" className="shrink-0">
                      <path d="M13 8.5c0-.938-.729-1.7-1.625-1.7h-.812V4.25C10.563 1.907 8.74 0 6.5 0S2.438 1.907 2.438 4.25V6.8h-.813C.729 6.8 0 7.562 0 8.5v6.8c0 .938.729 1.7 1.625 1.7h9.75c.896 0 1.625-.762 1.625-1.7zM4.063 4.25c0-1.406 1.093-2.55 2.437-2.55s2.438 1.144 2.438 2.55V6.8H4.061z" fill="#9CA3AF" />
                    </svg>
                    <input type="password" placeholder={t("password")} value={password} onChange={(e) => setPassword(e.target.value)} className="bg-transparent text-[#131517] placeholder-gray-400 outline-none text-sm w-full h-full" required />
                  </div>

                  <div className="flex items-center mt-3 w-full bg-transparent border border-gray-200 hover:border-gray-300 focus-within:border-black/30 focus-within:ring-1 focus-within:ring-black/5 h-11 rounded-full overflow-hidden pl-5 gap-2.5 transition-all">
                    <svg width="13" height="17" viewBox="0 0 13 17" fill="none" className="shrink-0">
                      <path d="M13 8.5c0-.938-.729-1.7-1.625-1.7h-.812V4.25C10.563 1.907 8.74 0 6.5 0S2.438 1.907 2.438 4.25V6.8h-.813C.729 6.8 0 7.562 0 8.5v6.8c0 .938.729 1.7 1.625 1.7h9.75c.896 0 1.625-.762 1.625-1.7zM4.063 4.25c0-1.406 1.093-2.55 2.437-2.55s2.438 1.144 2.438 2.55V6.8H4.061z" fill="#9CA3AF" />
                    </svg>
                    <input type="password" placeholder={t("confirmPassword")} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="bg-transparent text-[#131517] placeholder-gray-400 outline-none text-sm w-full h-full" required />
                  </div>
                </>
              )}

              <div className="w-full mt-4">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="size-4 mt-0.5 rounded border-gray-300 text-black focus:ring-black accent-black" required />
                  <span className="text-sm text-gray-500">
                    {t("agreeToTerms")}{" "}
                    <Link href="/terms" className="text-[#131517] font-medium hover:underline">{t("termsOfService")}</Link>{" "}
                    {t("and")}{" "}
                    <Link href="/privacy" className="text-[#131517] font-medium hover:underline">{t("privacyPolicy")}</Link>
                  </span>
                </label>
              </div>

              <button type="submit" disabled={loading} className="mt-5 w-full h-11 rounded-full text-white bg-[#131517] hover:bg-black transition-colors font-medium text-sm disabled:opacity-60">
                {loading ? "..." : t("create")}
              </button>

              <p className="text-gray-500 text-sm mt-4">
                {t("hasAccount")}{" "}
                <Link href="/sign-in" className="text-[#131517] font-medium hover:underline underline-offset-2">
                  {t("signIn")}
                </Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </main>
  )
}
