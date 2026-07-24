"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { useLocale } from "next-intl"
import { X, Loader2, Search, Check, Plus } from "lucide-react"

interface UserResult {
  id: string
  name: string
  email: string
  avatar?: string | null
}

interface Props {
  open: boolean
  communityId: string
  onClose: () => void
  onAdded: () => void
}

const ROLE_PRESETS = ["member", "manager", "contributor", "reviewer", "moderator"]

export function AddMemberModal({ open, communityId, onClose, onAdded }: Props) {
  const locale = useLocale()
  const isZh = locale === "zh"

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<UserResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null)
  const [displayName, setDisplayName] = useState("")
  const [role, setRole] = useState("member")
  const [customRole, setCustomRole] = useState("")
  const [isCustomRole, setIsCustomRole] = useState(false)
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!open) {
      setQuery("")
      setResults([])
      setSelectedUser(null)
      setDisplayName("")
      setRole("member")
      setCustomRole("")
      setIsCustomRole(false)
      setError("")
    }
  }, [open])

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 1) {
      setResults([])
      return
    }
    setSearching(true)
    try {
      const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(q)}&communityId=${encodeURIComponent(communityId)}`)
      const data = await res.json()
      if (res.ok) {
        setResults(data.users ?? [])
      }
    } catch {
      // ignore
    } finally {
      setSearching(false)
    }
  }, [communityId])

  function handleQueryChange(value: string) {
    setQuery(value)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => doSearch(value), 300)
  }

  function handleSelectUser(user: UserResult) {
    setSelectedUser(user)
    setDisplayName(user.name)
    setQuery("")
    setResults([])
  }

  function handleRemoveSelection() {
    setSelectedUser(null)
    setDisplayName("")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedUser) return

    setError("")
    setSubmitting(true)

    const finalRole = isCustomRole ? customRole.trim() : role

    try {
      const res = await fetch("/api/admin/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUser.id,
          communityId,
          displayName: displayName.trim() || selectedUser.name,
          role: finalRole,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.error === "ALREADY_MEMBER") {
          setError(isZh ? "该用户已是社群成员" : "This user is already a member.")
        } else {
          setError(isZh ? "添加失败，请重试" : "Failed to add member. Please try again.")
        }
        setSubmitting(false)
        return
      }

      onAdded()
      onClose()
    } catch {
      setError(isZh ? "网络错误，请检查连接后重试" : "Network error. Check your connection and try again.")
      setSubmitting(false)
    }
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg rounded-3xl bg-white shadow-xl border border-[#F0F0F0] p-8">
        <button
          onClick={onClose}
          className="absolute right-6 top-6 p-1.5 rounded-xl text-[#939597] hover:bg-[#FAFAFA] hover:text-[#131517] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-2xl font-semibold text-[#131517]">
          {isZh ? "添加成员" : "Add member"}
        </h2>
        <p className="text-sm text-[#939597] mt-1.5">
          {isZh ? "搜索用户并为其分配社群角色。" : "Search for a user and assign them a community role."}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          {/* User search */}
          {!selectedUser ? (
            <div>
              <label className="block text-sm font-medium text-[#131517] mb-1.5">
                {isZh ? "搜索用户" : "Search user"} <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#939597]" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  placeholder={isZh ? "输入姓名或邮箱搜索…" : "Search by name or email..."}
                  className="w-full pl-9 pr-4 py-2.5 rounded-2xl border border-[#F0F0F0] bg-white text-sm text-[#131517] placeholder:text-[#A3A3A3] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-[#939597]" />
                )}
              </div>

              {results.length > 0 && (
                <div className="mt-2 border border-[#F0F0F0] rounded-2xl overflow-hidden">
                  {results.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => handleSelectUser(user)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#FAFAFA] transition-colors"
                    >
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-green-400 flex items-center justify-center text-white text-sm font-medium shrink-0">
                        {user.name[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#131517]">{user.name}</p>
                        <p className="text-xs text-[#939597] truncate">{user.email}</p>
                      </div>
                      <Plus className="w-4 h-4 text-[#939597] ml-auto shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {query.length >= 1 && !searching && results.length === 0 && (
                <p className="text-xs text-[#939597] mt-2">
                  {isZh ? "未找到匹配的用户" : "No matching users found"}
                </p>
              )}
            </div>
          ) : (
            /* Selected user card */
            <div>
              <label className="block text-sm font-medium text-[#131517] mb-1.5">
                {isZh ? "已选用户" : "Selected user"}
              </label>
              <div className="flex items-center gap-3 p-3 rounded-2xl border border-emerald-200 bg-emerald-50/50">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-green-400 flex items-center justify-center text-white text-sm font-medium shrink-0">
                  {selectedUser.name[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#131517]">{selectedUser.name}</p>
                  <p className="text-xs text-[#939597] truncate">{selectedUser.email}</p>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveSelection}
                  className="p-1.5 rounded-xl text-[#939597] hover:bg-white hover:text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Display name */}
          <div>
            <label className="block text-sm font-medium text-[#131517] mb-1.5">
              {isZh ? "显示名称" : "Display name"}
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={selectedUser?.name || ""}
              className="w-full px-4 py-2.5 rounded-2xl border border-[#F0F0F0] bg-white text-sm text-[#131517] placeholder:text-[#A3A3A3] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
            />
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-[#131517] mb-1.5">
              {isZh ? "角色" : "Role"} <span className="text-red-400">*</span>
            </label>

            {!isCustomRole ? (
              <>
                <div className="flex flex-wrap gap-2 mb-2">
                  {ROLE_PRESETS.map((preset) => {
                    const active = role === preset
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setRole(preset)}
                        className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
                          active
                            ? "bg-[#131517] text-white"
                            : "bg-[#FAFAFA] text-[#525252] border border-[#F0F0F0] hover:bg-[#F0F0F0]"
                        }`}
                      >
                        {preset}
                      </button>
                    )
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setIsCustomRole(true)}
                  className="text-sm text-[#939597] hover:text-[#131517] underline underline-offset-2 transition-colors"
                >
                  {isZh ? "自定义角色…" : "Custom role..."}
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customRole}
                  onChange={(e) => setCustomRole(e.target.value)}
                  placeholder={isZh ? "输入自定义角色名" : "Enter custom role name"}
                  className="flex-1 px-4 py-2.5 rounded-2xl border border-[#F0F0F0] bg-white text-sm text-[#131517] placeholder:text-[#A3A3A3] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setIsCustomRole(false)}
                  className="text-sm text-[#939597] hover:text-[#131517] whitespace-nowrap"
                >
                  {isZh ? "用预设" : "Presets"}
                </button>
              </div>
            )}
          </div>

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
              disabled={submitting || !selectedUser || (isCustomRole && !customRole.trim())}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#131517] text-white text-sm font-medium hover:bg-[#262626] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isZh ? "添加" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
