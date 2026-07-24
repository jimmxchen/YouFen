import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

async function setup() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      avatar TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS communities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS community_members (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      voice_power INTEGER DEFAULT 0 NOT NULL,
      contribution_count INTEGER DEFAULT 0 NOT NULL,
      tags TEXT[] DEFAULT '{}' NOT NULL,
      joined_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS contributions (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL REFERENCES community_members(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      type TEXT NOT NULL,
      suggested_vp INTEGER DEFAULT 0 NOT NULL,
      approved_vp INTEGER,
      status TEXT DEFAULT 'pending' NOT NULL,
      ai_reason TEXT,
      submitted_by TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      reviewed_at TIMESTAMP
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS proposals (
      id TEXT PRIMARY KEY,
      community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      summary TEXT,
      options JSONB DEFAULT '[]' NOT NULL,
      status TEXT DEFAULT 'draft' NOT NULL,
      vote_type TEXT DEFAULT 'weighted' NOT NULL,
      start_time TIMESTAMP NOT NULL,
      end_time TIMESTAMP NOT NULL,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      total_votes INTEGER DEFAULT 0 NOT NULL,
      total_vp INTEGER DEFAULT 0 NOT NULL,
      voter_count INTEGER DEFAULT 0 NOT NULL,
      result_hash TEXT,
      chain_tx_hash TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `

  console.log("All tables created successfully.")
}

setup().catch((e) => {
  console.error(e)
  process.exit(1)
})
