import type { MemberProposal } from './proposal'
import type { ContributionTokenEvent, TokenReceipt } from './token'

export interface MemberVoicePower {
  total: number
  active: number
  pending: number
  rankPercent: number
  earnedThisMonth: number
}

export interface CommunityStats {
  members: number
  activeProposals: number
  contributionsThisWeek: number
  trustedRecords: number
}

export interface CommunityAnnouncement {
  title: string
  body: string
  createdAt: string
}

export interface CommunityEvent {
  title: string
  description: string
  startsAt: string
  location: string
  status: 'open' | 'joined' | 'ended'
}

export interface MemberActivityItem {
  id: string
  type: 'update' | 'event' | 'contribution' | 'vote' | 'record'
  title: string
  description: string
  createdAt: string
  status?: 'new' | 'joined' | 'approved' | 'active' | 'verified'
}

export interface FeaturedContributor {
  name: string
  role: string
  voicePower: number
}

export interface ChatMessage {
  id: string
  author: string
  role: string
  avatarInitials: string
  body: string
  createdAt: string
  isOperator?: boolean
  isCurrentMember?: boolean
  reactions?: number
}

export interface CommunityMember {
  id: string
  name: string
  role: string
  tags: string[]
  avatarInitials: string
  communityId: string
  communityName: string
  communityDescription: string
  voicePower: MemberVoicePower
  stats: CommunityStats
  announcement: CommunityAnnouncement
  nextEvent: CommunityEvent
  activity: MemberActivityItem[]
  chatMessages: ChatMessage[]
  featuredContributors: FeaturedContributor[]
  contributions: ContributionTokenEvent[]
  availableProposals: MemberProposal[]
  receipts: TokenReceipt[]
}
