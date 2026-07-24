import { db } from "./index"
import { users, communities, communityMembers, contributions, proposals } from "./schema"
import { hashPassword, generateId } from "../lib/crypto"
import { eq } from "drizzle-orm"

async function seed() {
  const existing = await db.select({ id: users.id }).from(users).limit(1)
  if (existing.length > 0) {
    console.log("Database already seeded, skipping.")
    process.exit(0)
  }

  const passwordHash = await hashPassword("password123")

  const demoUsers = [
    { id: generateId(), name: "Dan", email: "dan@example.com", passwordHash },
    { id: generateId(), name: "Eve", email: "eve@example.com", passwordHash },
    { id: generateId(), name: "Carol", email: "carol@example.com", passwordHash },
    { id: generateId(), name: "Bob", email: "bob@example.com", passwordHash },
    { id: generateId(), name: "Alice", email: "alice@example.com", passwordHash },
    { id: generateId(), name: "Frank", email: "frank@example.com", passwordHash },
    { id: generateId(), name: "Grace", email: "grace@example.com", passwordHash },
    { id: generateId(), name: "Henry", email: "henry@example.com", passwordHash },
  ]

  for (const u of demoUsers) {
    await db.insert(users).values(u)
  }

  const communityId = generateId()
  const danId = demoUsers[0].id
  const eveId = demoUsers[1].id
  const carolId = demoUsers[2].id
  const bobId = demoUsers[3].id
  const aliceId = demoUsers[4].id
  const frankId = demoUsers[5].id
  const graceId = demoUsers[6].id
  const henryId = demoUsers[7].id

  await db.insert(communities).values({
    id: communityId,
    name: "AdventureX Community",
    description: "A hacker community exploring the frontiers of technology",
    ownerId: danId,
  })

  const memberRows = [
    { userId: danId, role: "owner" as const, voicePower: 800, contributionCount: 5, tags: ["Organizer"] },
    { userId: eveId, role: "member" as const, voicePower: 600, contributionCount: 3, tags: ["Sponsor"] },
    { userId: carolId, role: "member" as const, voicePower: 500, contributionCount: 8, tags: ["Mentor"] },
    { userId: bobId, role: "member" as const, voicePower: 300, contributionCount: 4, tags: ["Volunteer"] },
    { userId: aliceId, role: "member" as const, voicePower: 100, contributionCount: 2, tags: ["Participant"] },
    { userId: frankId, role: "member" as const, voicePower: 150, contributionCount: 3, tags: ["Participant"] },
    { userId: graceId, role: "member" as const, voicePower: 200, contributionCount: 3, tags: ["Volunteer"] },
    { userId: henryId, role: "member" as const, voicePower: 450, contributionCount: 6, tags: ["Mentor"] },
  ]

  const memberIds: string[] = []
  for (const m of memberRows) {
    const mid = generateId()
    memberIds.push(mid)
    await db.insert(communityMembers).values({
      id: mid,
      userId: m.userId,
      communityId,
      role: m.role,
      voicePower: m.voicePower,
      contributionCount: m.contributionCount,
      tags: m.tags,
    })
  }

  await db.insert(contributions).values([
    {
      id: generateId(),
      memberId: memberIds[4], // Alice
      description: "Submitted project: AI community governance tool",
      type: "Submit Work",
      suggestedVP: 100,
      approvedVP: 100,
      status: "approved",
      aiReason: "Complete project submission demonstrating high-quality work output.",
      submittedBy: demoUsers[4].id,
    },
    {
      id: generateId(),
      memberId: memberIds[3], // Bob
      description: "On-site volunteer service during the event",
      type: "Volunteer",
      suggestedVP: 150,
      approvedVP: 150,
      status: "approved",
      aiReason: "Volunteer service during the event qualifies for volunteer recognition.",
      submittedBy: demoUsers[3].id,
    },
    {
      id: generateId(),
      memberId: memberIds[2], // Carol
      description: "Mentored 3 teams with technical guidance throughout the hackathon",
      type: "Mentor",
      suggestedVP: 300,
      approvedVP: 300,
      status: "approved",
      aiReason: "Mentoring multiple teams demonstrates significant community impact.",
      submittedBy: demoUsers[2].id,
    },
    {
      id: generateId(),
      memberId: memberIds[0], // Dan
      description: "Organized the entire hackathon event",
      type: "Organize Event",
      suggestedVP: 300,
      approvedVP: 300,
      status: "approved",
      aiReason: "Event organization is the highest contribution tier.",
      submittedBy: demoUsers[0].id,
    },
  ])

  await db.insert(proposals).values({
    id: generateId(),
    communityId,
    title: "What should AdventureX add next?",
    description: "Vote on which segment to add to the next AdventureX event.",
    summary: "Community members voted on the next event theme. AI x Blockchain Track received the most support.",
    options: [
      { id: "o1", text: "AI x Blockchain Track", votes: 450, voterCount: 8 },
      { id: "o2", text: "Founder Office Hour", votes: 300, voterCount: 5 },
      { id: "o3", text: "Demo Day", votes: 280, voterCount: 6 },
      { id: "o4", text: "Build in Public Exhibition", votes: 260, voterCount: 6 },
    ],
    status: "ended",
    voteType: "weighted",
    startTime: new Date("2026-07-21"),
    endTime: new Date("2026-07-23"),
    createdBy: demoUsers[0].id,
    totalVotes: 4,
    totalVP: 1290,
    voterCount: 12,
    resultHash: "0xabcd1234ef5678...",
    chainTxHash: "0x7a8b9c1d2e3f4g5h6i7j8k9l0m1n2o3p",
  })

  console.log("Seed complete: 8 users, 1 community, 8 memberships, 4 contributions, 1 proposal")
}

seed().catch((e) => {
  console.error(e)
  process.exit(1)
})
