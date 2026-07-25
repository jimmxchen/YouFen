import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { users } from "@/db/schema"
import { eq } from "drizzle-orm"
import {
  getSession,
  isLocalDevAuthEnabled,
  LOCAL_DEV_USER_ID,
  updateLocalDevUserSettings,
} from "@/lib/auth"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeSettings(input: unknown) {
  if (!input || typeof input !== "object") {
    return { error: "MISSING_FIELDS" as const }
  }

  const body = input as { name?: unknown; email?: unknown }
  const name = typeof body.name === "string" ? body.name.trim() : ""
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""

  if (!name || !email) {
    return { error: "MISSING_FIELDS" as const }
  }

  if (name.length > 80) {
    return { error: "NAME_TOO_LONG" as const }
  }

  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return { error: "INVALID_EMAIL" as const }
  }

  return { value: { name, email } }
}

export async function PATCH(req: NextRequest) {
  const userId = await getSession()
  if (!userId) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  }

  let parsed: ReturnType<typeof normalizeSettings>
  try {
    parsed = normalizeSettings(await req.json())
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }

  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const { name, email } = parsed.value

  if (isLocalDevAuthEnabled()) {
    if (userId !== LOCAL_DEV_USER_ID) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
    }
    return NextResponse.json({ user: updateLocalDevUserSettings({ name, email }) })
  }

  try {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    if (existing[0] && existing[0].id !== userId) {
      return NextResponse.json({ error: "EMAIL_TAKEN" }, { status: 409 })
    }

    const updated = await db
      .update(users)
      .set({ name, email })
      .where(eq(users.id, userId))
      .returning({ id: users.id, name: users.name, email: users.email, avatar: users.avatar })

    if (!updated[0]) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
    }

    return NextResponse.json({ user: updated[0] })
  } catch (error) {
    console.error("[auth/settings]", error)
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 })
  }
}
