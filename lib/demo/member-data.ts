import type { CommunityMember } from '@/types/member'

export const demoMember: CommunityMember = {
  id: 'alice',
  name: 'Alice Chen',
  role: 'Builder',
  avatarInitials: 'AC',
  communityId: 'adventurex',
  communityName: 'AdventureX Community',
  communityDescription: 'A builder community shaped by the people who keep showing up.',
  token: {
    symbol: 'AXO',
    totalBalance: 1500,
    activeVotingBalance: 1000,
    pendingBalance: 500,
    ownershipPercentage: 7.5,
    governancePercentage: 5,
    earnedThisMonth: 550,
    communityMintedThisMonth: 2000,
    ownershipChange: {
      from: 5,
      to: 4.58,
    },
  },
  pendingExplanation: {
    amount: 500,
    source: 'Future budget reward for major community help',
    activatesAt: 'Next monthly cycle',
    reason:
      'These tokens count in your total balance now, but they cannot affect votes that already started.',
  },
  contributions: [
    {
      id: 'contribution-wallet-testing',
      title: 'Helped Team Alpha test their demo',
      description: 'Found a wallet connection issue before demo day and shared a fix.',
      amount: 50,
      status: 'approved',
      activationStatus: 'active',
      approvedBy: 'Jimmy',
      createdAt: '2026-07-22',
      receipt: {
        id: 'receipt-alpha-help',
        title: 'Contribution reward verified',
        type: 'token_mint',
        status: 'verified',
        network: 'Injective Testnet',
        txHash: '0x7a8b9c2d4e5f6a1029384756abcdef1234567890',
        explorerUrl:
          'https://testnet.blockscout.injective.network/tx/0x7a8b9c2d4e5f6a1029384756abcdef1234567890',
        blockHeight: '#1,234,567',
        createdAt: '2026-07-22',
      },
    },
    {
      id: 'contribution-project-submission',
      title: 'Submitted AdventureX project',
      description: 'Completed and submitted a working product demo.',
      amount: 100,
      status: 'approved',
      activationStatus: 'active',
      approvedBy: 'Simon',
      createdAt: '2026-07-20',
    },
    {
      id: 'contribution-infrastructure',
      title: 'Built shared setup guide',
      description: 'Created a guide that helped new members deploy on Injective testnet.',
      amount: 500,
      status: 'approved',
      activationStatus: 'pending',
      approvedBy: 'Jimmy and Simon',
      createdAt: '2026-07-19',
    },
  ],
  availableProposals: [
    {
      id: 'next-event-topic',
      title: 'What should AdventureX host next?',
      description: 'Choose the next community event theme.',
      status: 'active',
      endsAt: '2026-07-25',
      snapshotWeight: 900,
      href: '/vote/next-event-topic',
    },
    {
      id: 'mentor-reward-rule',
      title: 'Should mentor rewards increase next month?',
      description: 'Update the reward rule for active mentors.',
      status: 'upcoming',
      endsAt: '2026-07-28',
      snapshotWeight: 1000,
      href: '/vote/mentor-reward-rule',
    },
  ],
  receipts: [
    {
      id: 'receipt-alpha-help',
      title: 'Contribution reward verified',
      type: 'token_mint',
      status: 'verified',
      network: 'Injective Testnet',
      txHash: '0x7a8b9c2d4e5f6a1029384756abcdef1234567890',
      explorerUrl:
        'https://testnet.blockscout.injective.network/tx/0x7a8b9c2d4e5f6a1029384756abcdef1234567890',
      blockHeight: '#1,234,567',
      createdAt: '2026-07-22',
    },
    {
      id: 'receipt-vote-snapshot',
      title: 'Vote snapshot recorded',
      type: 'proposal_snapshot',
      status: 'pending',
      network: 'Injective Testnet',
      createdAt: '2026-07-23',
    },
  ],
}

export function getDemoMember(communityId: string) {
  return {
    ...demoMember,
    communityId,
  }
}
