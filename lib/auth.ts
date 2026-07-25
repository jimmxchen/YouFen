import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"

export const LOCAL_DEV_USER_ID = "local-dev-user"
export const LOCAL_DEV_USER_EMAIL = "dev@youfen.local"

interface LocalDevAccount {
  name: string
  email: string
}

const globalForLocalDev = globalThis as typeof globalThis & {
  __youfenLocalDevAccount?: LocalDevAccount
}

export function isLocalDevAuthEnabled() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL
}

export function getLocalDevUser(loginId = LOCAL_DEV_USER_EMAIL, name = "Local Dev") {
  globalForLocalDev.__youfenLocalDevAccount ??= { name, email: loginId }
  const account = globalForLocalDev.__youfenLocalDevAccount
  return {
    id: LOCAL_DEV_USER_ID,
    name: account.name,
    email: account.email,
    avatar: null,
    hasOwnedCommunity: false,
    memberCommunityId: null,
  }
}

export function updateLocalDevUserSettings(input: { name: string; email: string }) {
  globalForLocalDev.__youfenLocalDevAccount = {
    name: input.name,
    email: input.email,
  }

  return getLocalDevUser()
}

function getSecret() {
  const secret = process.env.JWT_SECRET
  if (secret) return new TextEncoder().encode(secret)
  if (process.env.NODE_ENV !== "production") {
    return new TextEncoder().encode("youfen-local-dev-secret")
  }
  throw new Error("JWT_SECRET is required")
}

export async function createToken(userId: string) {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .setIssuedAt()
    .sign(getSecret())
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload.sub as string
  } catch {
    return null
  }
}

export async function getSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get("token")?.value
  if (!token) return null
  return verifyToken(token)
}

export async function setSession(userId: string) {
  const token = await createToken(userId)
  const cookieStore = await cookies()
  cookieStore.set("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  })
}

export async function clearSession() {
  const cookieStore = await cookies()
  cookieStore.delete("token")
}
