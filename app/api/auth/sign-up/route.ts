import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { users } from "@/db/schema"
import { eq } from "drizzle-orm"
import { hashPassword, generateId } from "@/lib/crypto"
import { setSession } from "@/lib/auth"
import { rateLimit } from "@/lib/rate-limit"

const WINDOW_MS = 60 * 1000 // 1 minute
const MAX_ATTEMPTS = 3

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  const rl = rateLimit(`sign-up:${ip}`, MAX_ATTEMPTS, WINDOW_MS)

  if (!rl.ok) {
    return NextResponse.json(
      { error: `请求过于频繁，请 ${rl.retryAfter} 秒后再试` },
      { status: 429 },
    )
  }

  try {
    const { name, email, password } = await req.json()

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password too short" }, { status: 400 })
    }

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
    if (existing.length > 0) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 })
    }

    const id = generateId()
    const passwordHash = await hashPassword(password)

    await db.insert(users).values({ id, name, email, passwordHash })
    await setSession(id)

    return NextResponse.json({ user: { id, name, email } })
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
