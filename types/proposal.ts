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
}
