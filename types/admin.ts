// Admin page types matching PRD data model

export interface Member {
  id: string
  name: string
  email?: string
  role: MemberRole
  voicePower: number
  contributionCount: number
  tags: string[]
  joinedAt: string
  lastActiveAt: string
}

export type MemberRole = 'owner' | 'manager' | 'member'

export interface Contribution {
  id: string
  memberId: string
  memberName: string
  description: string
  type: string
  suggestedVP: number
  approvedVP?: number
  status: ContributionStatus
  aiReason?: string
  evidence?: string[]
  submittedBy: string
  createdAt: string
  reviewedAt?: string
}

export type ContributionStatus = 'pending' | 'approved' | 'rejected'

export interface Proposal {
  id: string
  title: string
  description: string
  summary?: string
  options: ProposalOption[]
  status: ProposalStatus
  voteType: VoteType
  startTime: string
  endTime: string
  createdBy: string
  createdAt: string
  totalVotes: number
  totalVP: number
  voterCount: number
  totalMembers: number
  resultHash?: string
  chainTxHash?: string
}

export interface ProposalOption {
  id: string
  text: string
  votes: number
  voterCount: number
}

export type ProposalStatus = 'draft' | 'active' | 'ended' | 'recorded'

export type VoteType = 'weighted' | 'one_person_one_vote'

export interface PublicRecord {
  id: string
  type: RecordType
  hash: string
  txHash?: string
  network: string
  status: RecordStatus
  data: RecordData
  createdBy: string
  createdAt: string
  recordedAt?: string
}

export type RecordType = 'community' | 'rule' | 'vp_batch' | 'proposal' | 'vote_result'

export type RecordStatus = 'pending' | 'recording' | 'recorded' | 'failed'

export interface RecordData {
  [key: string]: any
}

export interface DashboardStats {
  members: number
  totalVoicePower: number
  activeProposals: number
  todayContributions: number
  trustedRecords: number
  activeTasks: number
  upcomingActivities: number
}

export type AdminView = 'dashboard' | 'members' | 'contributions' | 'records' | 'management' | 'chat'

export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  assigneeId: string
  assigneeName: string
  priority: TaskPriority
  dueDate: string
  createdAt: string
  completedAt?: string
}

export type TaskStatus = 'pending' | 'inProgress' | 'completed' | 'cancelled'

export type TaskPriority = 'high' | 'medium' | 'low'

export interface Activity {
  id: string
  title: string
  description: string
  status: ActivityStatus
  type: ActivityType
  participantCount: number
  startTime: string
  endTime: string
  location: string
  createdAt: string
}

export type ActivityStatus = 'upcoming' | 'ongoing' | 'completed' | 'cancelled'

export type ActivityType = 'meetup' | 'workshop' | 'hackathon' | 'social' | 'other'

export interface ChatConversation {
  id: string
  memberId: string
  memberName: string
  lastMessage: string
  lastMessageAt: string
  unreadCount: number
}

export interface ChatMessage {
  id: string
  conversationId: string
  senderId: string
  senderName: string
  isAdmin: boolean
  content: string
  createdAt: string
}
