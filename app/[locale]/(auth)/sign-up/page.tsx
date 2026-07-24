"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useTranslations, useLocale } from "next-intl"
import { Navbar } from "@/components/layout/navbar"
import { AuthVisual } from "@/components/auth/auth-visual"

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

    try {
      const res = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isZh
            ? { name, phone, password }
            : { name, email, password },
        ),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || (isZh ? "注册失败" : "Sign up failed"))
        setLoading(false)
        return
      }

      router.push(data.redirectTo || "/choose-role")
    } catch {
      setError(isZh ? "网络错误，请重试" : "Network error. Please try again.")
      setLoading(false)
    }
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

              {error && (
                <div className="w-full mt-5 p-3 text-sm text-red-600 bg-red-50 rounded-xl">{error}</div>
              )}

              <div className="flex items-center mt-5 w-full bg-transparent border border-gray-200 hover:border-gray-300 focus-within:border-black/30 focus-within:ring-1 focus-within:ring-black/5 h-11 rounded-full overflow-hidden pl-5 gap-2.5 transition-all">
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

                  <div className="flex items-center mt-3 w-full bg-transparent border border-gray-200 hover:border-gray-300 focus-within:border-black/30 focus-within:ring-1 focus-within:ring-black/5 h-11 rounded-full overflow-hidden pl-5 gap-2.5 transition-all">
                    <svg width="13" height="17" viewBox="0 0 13 17" fill="none" className="shrink-0">
                      <path d="M13 8.5c0-.938-.729-1.7-1.625-1.7h-.812V4.25C10.563 1.907 8.74 0 6.5 0S2.438 1.907 2.438 4.25V6.8h-.813C.729 6.8 0 7.562 0 8.5v6.8c0 .938.729 1.7 1.625 1.7h9.75c.896 0 1.625-.762 1.625-1.7zM4.063 4.25c0-1.406 1.093-2.55 2.437-2.55s2.438 1.144 2.438 2.55V6.8H4.061z" fill="#9CA3AF" />
                    </svg>
                    <input type="password" placeholder={t("password")} value={password} onChange={(e) => setPassword(e.target.value)} className="bg-transparent text-[#131517] placeholder-gray-400 outline-none text-sm w-full h-full" required />
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
