export interface MemberProposalOption {
  id: string
  text: string
  votes: number
}

export interface MemberProposal {
  id: string
  title: string
  description: string
  status: 'active' | 'upcoming' | 'ended'
  endsAt: string
  snapshotWeight: number
  voterCount: number
  trustedRecordStatus?: 'pending' | 'verified'
  href: string
  options: MemberProposalOption[]
  /** Option id the member already voted for, if any. */
  votedOptionId?: string
}
