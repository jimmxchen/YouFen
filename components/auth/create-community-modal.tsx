"use client"

import { useState } from "react"
import { useRouter } from "@/i18n/navigation"
import { useTranslations, useLocale } from "next-intl"
import { X, Loader2 } from "lucide-react"

interface Props {
  open: boolean
  onClose: () => void
}

export function CreateCommunityModal({ open, onClose }: Props) {
  const t = useTranslations("auth")
  const locale = useLocale()
  const router = useRouter()
  const isZh = locale === "zh"

  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [description, setDescription] = useState("")
  const [goal, setGoal] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  // Token policy defaults
  const [initialSupply, setInitialSupply] = useState(10000)
  const [inflationRate, setInflationRate] = useState(5)
  const [advanceRate, setAdvanceRate] = useState(25)
  const [memberCapRate, setMemberCapRate] = useState(10)

  if (!open) return null

  function handleNameChange(value: string) {
    setName(value)
    // Only auto-fill slug if the user hasn't manually edited it
    if (!slug || slug === name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")) {
      setSlug(value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 64))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/admin/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim() || undefined,
          goal: goal.trim() || undefined,
          initialSupply,
          inflationRateBps: inflationRate * 100,
          advanceRateBps: advanceRate * 100,
          memberCapRateBps: memberCapRate * 100,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.error === "SLUG_TAKEN") {
          setError(isZh ? "该标识已被使用，请换一个" : "This URL slug is already taken. Try another one.")
        } else if (data.error === "NAME_REQUIRED") {
          setError(isZh ? "请输入社群名称" : "Community name is required.")
        } else {
          setError(isZh ? "创建失败，请重试" : "Failed to create community. Please try again.")
        }
        setLoading(false)
        return
      }

      router.push(`/admin?communityId=${data.community.id}`)
    } catch {
      setError(isZh ? "网络错误，请检查连接后重试" : "Network error. Check your connection and try again.")
      setLoading(false)
    }
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={handleBackdropClick}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
      <div className="relative w-full max-w-lg my-8 rounded-3xl bg-white shadow-xl border border-[#F0F0F0] p-8">
        <button
          onClick={onClose}
          className="absolute right-6 top-6 p-1.5 rounded-xl text-[#939597] hover:bg-[#FAFAFA] hover:text-[#131517] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-2xl font-semibold text-[#131517]">
          {isZh ? "创建你的社群" : "Create your community"}
        </h2>
        <p className="text-sm text-[#939597] mt-1.5">
          {isZh
            ? "填写以下信息开始运营你的社群。"
            : "Fill in the details below to start running your community."}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-[#131517] mb-1.5">
              {isZh ? "社群名称" : "Community name"} <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder={isZh ? "例如：AdventureX" : "e.g. AdventureX"}
              required
              className="w-full px-4 py-2.5 rounded-2xl border border-[#F0F0F0] bg-white text-sm text-[#131517] placeholder:text-[#A3A3A3] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#131517] mb-1.5">
              {isZh ? "URL 标识" : "URL slug"} <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""))}
              placeholder={isZh ? "adventurex" : "adventurex"}
              required
              className="w-full px-4 py-2.5 rounded-2xl border border-[#F0F0F0] bg-white text-sm text-[#131517] font-mono placeholder:text-[#A3A3A3] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
            />
            <p className="text-xs text-[#939597] mt-1">
              {isZh ? "用于社群链接：youfen.app/" : "Used in your community link: youfen.app/"}
              <span className="font-medium text-[#525252]">{slug || "..."}</span>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#131517] mb-1.5">
              {isZh ? "社群简介" : "Description"}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={isZh ? "简要描述你的社群…" : "Briefly describe your community..."}
              className="w-full px-4 py-2.5 rounded-2xl border border-[#F0F0F0] bg-white text-sm text-[#131517] placeholder:text-[#A3A3A3] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#131517] mb-1.5">
              {isZh ? "社群目标" : "Goal"}
            </label>
            <input
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder={isZh ? "例如：打造最好的 Web3 开发者社群" : "e.g. Build the best Web3 developer community"}
              className="w-full px-4 py-2.5 rounded-2xl border border-[#F0F0F0] bg-white text-sm text-[#131517] placeholder:text-[#A3A3A3] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
            />
          </div>

          {/* Token policy settings */}
          <fieldset className="space-y-4 rounded-2xl border border-[#F0F0F0] p-4">
            <legend className="text-sm font-medium text-[#131517] px-1">
              {isZh ? "投票权设置" : "Voting power settings"}
            </legend>
            <p className="text-xs text-[#939597] -mt-1">
              {isZh
                ? "这些参数决定社区 Token 的增发速度和分配规则，创建后可通过治理提案修改。"
                : "These control how fast new tokens are minted and distributed. They can be changed later via governance proposals."}
            </p>

            <div>
              <label className="block text-sm font-medium text-[#131517] mb-1.5">
                {isZh ? "初始投票权数量" : "Initial voting power"}
              </label>
              <input
                type="number"
                min={100}
                max={1000000}
                step={100}
                value={initialSupply}
                onChange={(e) => setInitialSupply(Math.max(100, Number(e.target.value)))}
                className="w-full px-4 py-2.5 rounded-2xl border border-[#F0F0F0] bg-white text-sm text-[#131517] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
              />
              <p className="text-xs text-[#939597] mt-1">
                {isZh
                  ? `创建者将自动获得全部 ${initialSupply.toLocaleString()} 初始投票权`
                  : `Creator automatically receives all ${initialSupply.toLocaleString()} initial voting power`}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#131517] mb-1.5">
                {isZh ? "月通胀率" : "Monthly inflation rate"}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="1" max="20" step="1"
                  value={inflationRate}
                  onChange={(e) => setInflationRate(Number(e.target.value))}
                  className="flex-1 accent-emerald-500"
                />
                <span className="text-sm font-semibold text-[#131517] min-w-[3rem] text-right">
                  {inflationRate}%
                </span>
              </div>
              <p className="text-xs text-[#939597] mt-1">
                {isZh
                  ? `每月增发当前总供应量的 ${inflationRate}% 作为预算`
                  : `${inflationRate}% of current supply minted as monthly budget`}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#131517] mb-1.5">
                {isZh ? "最大预支比例" : "Max advance rate"}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0" max="50" step="5"
                  value={advanceRate}
                  onChange={(e) => setAdvanceRate(Number(e.target.value))}
                  className="flex-1 accent-emerald-500"
                />
                <span className="text-sm font-semibold text-[#131517] min-w-[3rem] text-right">
                  {advanceRate}%
                </span>
              </div>
              <p className="text-xs text-[#939597] mt-1">
                {isZh
                  ? '允许提前使用下月预算的比例（预支 Token 下一 Epoch 才激活治理权）'
                  : "Portion of next month's budget that can be used early (governance activates next epoch)"}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#131517] mb-1.5">
                {isZh ? "单成员获发上限" : "Per-member cap"}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="1" max="30" step="1"
                  value={memberCapRate}
                  onChange={(e) => setMemberCapRate(Number(e.target.value))}
                  className="flex-1 accent-emerald-500"
                />
                <span className="text-sm font-semibold text-[#131517] min-w-[3rem] text-right">
                  {memberCapRate}%
                </span>
              </div>
              <p className="text-xs text-[#939597] mt-1">
                {isZh
                  ? `单个成员单期最多获得月预算的 ${memberCapRate}%`
                  : `Single member can receive at most ${memberCapRate}% of the monthly budget per epoch`}
              </p>
            </div>
          </fieldset>

          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-xl">{error}</div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-2xl border border-[#F0F0F0] text-sm font-medium text-[#525252] hover:bg-[#FAFAFA] hover:text-[#131517] transition-all"
            >
              {isZh ? "取消" : "Cancel"}
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim() || !slug.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#131517] text-white text-sm font-medium hover:bg-[#262626] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isZh ? "创建社群" : "Create community"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
