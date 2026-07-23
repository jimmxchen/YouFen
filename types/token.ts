export type ReceiptStatus = 'pending' | 'verified' | 'failed'

export type TokenActivationStatus = 'active' | 'pending'

export interface TokenReceipt {
  id: string
  title: string
  type: 'token_mint' | 'proposal_snapshot' | 'proposal_result'
  status: ReceiptStatus
  network: string
  txHash?: string
  explorerUrl?: string
  blockHeight?: string
  createdAt: string
}

export interface TokenBalance {
  symbol: string
  totalBalance: number
  activeVotingBalance: number
  pendingBalance: number
  ownershipPercentage: number
  governancePercentage: number
  earnedThisMonth: number
  communityMintedThisMonth: number
  ownershipChange: {
    from: number
    to: number
  }
}

export interface ContributionTokenEvent {
  id: string
  title: string
  description: string
  amount: number
  status: 'approved' | 'pending' | 'rejected'
  activationStatus: TokenActivationStatus
  approvedBy?: string
  createdAt: string
  receipt?: TokenReceipt
}
