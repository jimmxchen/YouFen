import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { getPrisma } from "@/lib/db/client"
import { Navbar } from "@/components/layout/navbar"
import { Footer } from "@/components/layout/footer"
import { ArrowRight, Users } from "lucide-react"
import { Link } from "@/i18n/navigation"
import { getLocale, getTranslations } from "next-intl/server"

async function getMemberCommunities(userId: string) {
  try {
    const prisma = getPrisma()
    const memberships = await prisma.member.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    })

    if (memberships.length === 0) return []

    const communityIds = [...new Set(memberships.map(m => m.communityId))]
    const communities = await prisma.community.findMany({
      where: { id: { in: communityIds } },
      select: { id: true, name: true, slug: true, description: true },
    })
    const communityMap = new Map(communities.map(c => [c.id, c]))

    return memberships.map(m => ({
      communityId: m.communityId,
      role: m.role,
      community: communityMap.get(m.communityId) ?? { id: m.communityId, name: m.communityId, slug: m.communityId, description: null },
    }))
  } catch {
    return []
  }
}

export default async function MemberPage() {
  const userId = await getSession()
  if (!userId) {
    redirect("/sign-in")
  }

  const memberships = await getMemberCommunities(userId)

  if (memberships.length === 0) {
    redirect("/choose-role")
  }

  const locale = await getLocale()
  const t = await getTranslations("member")
  const isZh = locale === "zh"

  return (
    <main className="min-h-screen bg-white">
      <Navbar forceLight />

      <section className="pt-32 pb-20 px-6">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-[40px] font-semibold text-[#131517] leading-[1.08] tracking-[-0.03em] mb-4">
            {isZh ? "我的社群" : "My Communities"}
          </h1>
          <p className="text-lg text-[#939597] mb-10">
            {isZh ? "选择一个社群进入。" : "Select a community to enter."}
          </p>

          <div className="space-y-3">
            {memberships.map((m) => {
              const community = m.community
              return (
                <Link
                  key={m.communityId}
                  href={`/member/${community.id}`}
                  className="flex items-center justify-between p-5 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="size-11 rounded-xl bg-[#f5f5f5] flex items-center justify-center">
                      <Users className="size-5 text-[#131517]" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-[#131517]">{community.name}</div>
                      <div className="text-xs text-[#939597]">
                        {community.description || (isZh ? "暂无简介" : "No description")}
                        {" · "}
                        {m.role}
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="size-4 text-[#939597]" />
                </Link>
              )
            })}
          </div>

          {memberships.length > 1 && (
            <p className="text-xs text-[#939597] mt-6 text-center">
              {isZh
                ? `你已加入了 ${memberships.length} 个社群`
                : `You are a member of ${memberships.length} communities`}
            </p>
          )}
        </div>
      </section>

      <Footer />
    </main>
  )
}
