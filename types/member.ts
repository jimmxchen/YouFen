import type { MemberProposal } from './proposal'
import type { ContributionTokenEvent, TokenBalance, TokenReceipt } from './token'

export interface CommunityMember {
  id: string
  name: string
  role: string
  avatarInitials: string
  communityId: string
  communityName: string
  communityDescription: string
  token: TokenBalance
  pendingExplanation: {
    amount: number
    source: string
    activatesAt: string
    reason: string
  }
  contributions: ContributionTokenEvent[]
  availableProposals: MemberProposal[]
  receipts: TokenReceipt[]
}

