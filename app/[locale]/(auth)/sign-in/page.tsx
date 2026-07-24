"use client"

import { useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Navbar } from "@/components/layout/navbar"
import { AuthVisual } from "@/components/auth/auth-visual"

export default function SignInPage() {
  const t = useTranslations("auth")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [rememberMe, setRememberMe] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // TODO: auth logic
  }

  return (
    <main className="min-h-screen bg-white flex flex-col">
      <Navbar forceLight />
      <div className="flex flex-1 w-full pt-16">
        {/* Left: artistic visual — hidden on mobile */}
        <div className="w-full hidden md:block">
          <AuthVisual />
        </div>

        {/* Right: form */}
        <div className="w-full flex flex-col items-center justify-center px-6">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-96 flex flex-col items-center justify-center"
          >
            <h2 className="text-4xl text-[#131517] font-semibold">
              {t("signIn")}
            </h2>
            <p className="text-sm text-gray-500 mt-3">{t("welcomeBack")}</p>

            {/* Google sign-in */}
            <button
              type="button"
              className="w-full mt-8 bg-gray-100 hover:bg-gray-200/80 flex items-center justify-center h-12 rounded-full transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" className="mr-3">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              <span className="text-sm font-medium text-[#131517]">
                {t("googleSignIn")}
              </span>
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 w-full my-6">
              <div className="w-full h-px bg-gray-200" />
              <p className="text-nowrap text-xs text-gray-400">
                {t("orContinueWith")}
              </p>
              <div className="w-full h-px bg-gray-200" />
            </div>

            {/* Email input */}
            <div className="flex items-center w-full bg-transparent border border-gray-200 hover:border-gray-300 focus-within:border-black/30 focus-within:ring-1 focus-within:ring-black/5 h-12 rounded-full overflow-hidden pl-5 gap-2.5 transition-all">
              <svg
                width="16"
                height="12"
                viewBox="0 0 16 12"
                fill="none"
                className="shrink-0"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M0 1.1L.571.55H15.43l.57.55v9.9l-.571.55H.57L0 11.45zm1.143 1.138V10.9h13.714V2.69l-6.503 4.8h-.697zM13.749 2.1H2.25L8 6.356z"
                  fill="#9CA3AF"
                />
              </svg>
              <input
                type="email"
                placeholder={t("email")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-transparent text-[#131517] placeholder-gray-400 outline-none text-sm w-full h-full"
                required
              />
            </div>

            {/* Password input */}
            <div className="flex items-center mt-4 w-full bg-transparent border border-gray-200 hover:border-gray-300 focus-within:border-black/30 focus-within:ring-1 focus-within:ring-black/5 h-12 rounded-full overflow-hidden pl-5 gap-2.5 transition-all">
              <svg
                width="13"
                height="17"
                viewBox="0 0 13 17"
                fill="none"
                className="shrink-0"
              >
                <path
                  d="M13 8.5c0-.938-.729-1.7-1.625-1.7h-.812V4.25C10.563 1.907 8.74 0 6.5 0S2.438 1.907 2.438 4.25V6.8h-.813C.729 6.8 0 7.562 0 8.5v6.8c0 .938.729 1.7 1.625 1.7h9.75c.896 0 1.625-.762 1.625-1.7zM4.063 4.25c0-1.406 1.093-2.55 2.437-2.55s2.438 1.144 2.438 2.55V6.8H4.061z"
                  fill="#9CA3AF"
                />
              </svg>
              <input
                type="password"
                placeholder={t("password")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-transparent text-[#131517] placeholder-gray-400 outline-none text-sm w-full h-full"
                required
              />
            </div>

            {/* Remember me + Forgot password */}
            <div className="w-full flex items-center justify-between mt-5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="size-4 rounded border-gray-300 text-black focus:ring-black accent-black"
                />
                <span className="text-sm text-gray-500">
                  {t("rememberMe")}
                </span>
              </label>
              <Link
                href="/forgot-password"
                className="text-sm text-gray-500 hover:text-[#131517] underline underline-offset-2 transition-colors"
              >
                {t("forgotPassword")}
              </Link>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              className="mt-8 w-full h-11 rounded-full text-white bg-[#131517] hover:bg-black transition-colors font-medium text-sm"
            >
              {t("login")}
            </button>

            {/* Sign up link */}
            <p className="text-gray-500 text-sm mt-5">
              {t("noAccount")}{" "}
              <Link
                href="/sign-up"
                className="text-[#131517] font-medium hover:underline underline-offset-2"
              >
                {t("signUp")}
              </Link>
            </p>
          </form>
        </div>
      </div>
    </main>
  )
}
