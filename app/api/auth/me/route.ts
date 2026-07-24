import { NextResponse } from "next/server"
import { db } from "@/db"
import { users } from "@/db/schema"
import { eq } from "drizzle-orm"
import { getSession } from "@/lib/auth"

export async function GET() {
  const userId = await getSession()
  if (!userId) {
    return NextResponse.json({ user: null }, { status: 401 })
  }

  const rows = await db.select({ id: users.id, name: users.name, email: users.email, avatar: users.avatar }).from(users).where(eq(users.id, userId)).limit(1)
  if (rows.length === 0) {
    return NextResponse.json({ user: null }, { status: 401 })
  }

  return NextResponse.json({ user: rows[0] })
}
