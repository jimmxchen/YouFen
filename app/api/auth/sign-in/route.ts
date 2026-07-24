import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { users } from "@/db/schema"
import { eq } from "drizzle-orm"
import { verifyPassword } from "@/lib/crypto"
import { setSession } from "@/lib/auth"
import { getPrisma } from "@/lib/db/client"
import { rateLimit } from "@/lib/rate-limit"

const WINDOW_MS = 60 * 1000 // 1 minute
const MAX_ATTEMPTS = 5

async function getRedirectPath(userId: string): Promise<string> {
  try {
    const prisma = getPrisma()
    const membership = await prisma.member.findFirst({
      where: { userId },
      select: { role: true },
    })
    if (!membership) return "/choose-role"
    if (membership.role === "owner" || membership.role === "manager") return "/admin"
    return "/member"
  } catch {
    return "/choose-role"
  }
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  const rl = rateLimit(`sign-in:${ip}`, MAX_ATTEMPTS, WINDOW_MS)

  if (!rl.ok) {
    return NextResponse.json(
      { error: `请求过于频繁，请 ${rl.retryAfter} 秒后再试` },
      { status: 429 },
    )
  }

  try {
    const { email, phone, password } = await req.json()
    const loginId = email || phone

    if (!loginId || !password) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 })
    }

    const rows = await db.select().from(users).where(eq(users.email, loginId)).limit(1)
    if (rows.length === 0) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    const user = rows[0]
    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    await setSession(user.id)

    const redirectTo = await getRedirectPath(user.id)

    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email },
      redirectTo,
    })
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
