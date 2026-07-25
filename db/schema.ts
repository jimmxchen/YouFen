import { pgTable, text, timestamp, integer, real, jsonb } from "drizzle-orm/pg-core"

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  avatar: text("avatar"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const communities = pgTable("communities", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  ownerId: text("owner_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const communityMembers = pgTable("community_members", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  communityId: text("community_id").references(() => communities.id, { onDelete: "cascade" }).notNull(),
  role: text("role", { enum: ["owner", "manager", "member"] }).notNull().default("member"),
  voicePower: integer("voice_power").default(0).notNull(),
  contributionCount: integer("contribution_count").default(0).notNull(),
  tags: text("tags").array().default([]).notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
})

export const contributions = pgTable("contributions", {
  id: text("id").primaryKey(),
  memberId: text("member_id").references(() => communityMembers.id, { onDelete: "cascade" }).notNull(),
  description: text("description").notNull(),
  type: text("type").notNull(),
  suggestedVP: integer("suggested_vp").default(0).notNull(),
  approvedVP: integer("approved_vp"),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).default("pending").notNull(),
  aiReason: text("ai_reason"),
  submittedBy: text("submitted_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
})

export const proposals = pgTable("proposals", {
  id: text("id").primaryKey(),
  communityId: text("community_id").references(() => communities.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  summary: text("summary"),
  options: jsonb("options").notNull().default([]),
  status: text("status", { enum: ["draft", "active", "ended", "recorded"] }).default("draft").notNull(),
  voteType: text("vote_type", { enum: ["weighted", "one_person_one_vote"] }).default("weighted").notNull(),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  totalVotes: integer("total_votes").default(0).notNull(),
  totalVP: integer("total_vp").default(0).notNull(),
  voterCount: integer("voter_count").default(0).notNull(),
  resultHash: text("result_hash"),
  chainTxHash: text("chain_tx_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const chatConversations = pgTable("chat_conversations", {
  id: text("id").primaryKey(),
  communityId: text("community_id").notNull(),
  type: text("type", { enum: ["member_group", "admin_direct"] }).notNull().default("member_group"),
  title: text("title").notNull(),
  memberId: text("member_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const chatMessages = pgTable("chat_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  senderId: text("sender_id").notNull(),
  senderName: text("sender_name").notNull(),
  senderRole: text("sender_role", { enum: ["admin", "member"] }).notNull().default("member"),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const chatParticipants = pgTable("chat_participants", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  memberId: text("member_id").notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
})
