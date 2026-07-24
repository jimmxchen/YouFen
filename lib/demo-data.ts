import { type Member, type Contribution, type Proposal, type PublicRecord, type DashboardStats } from '@/types/admin'

export const demoMembers: Member[] = [
  { id: 'm1', name: 'Dan', email: 'dan@example.com', role: 'owner', voicePower: 800, contributionCount: 5, tags: ['Organizer'], joinedAt: '2026-07-01', lastActiveAt: '2026-07-23' },
  { id: 'm2', name: 'Eve', email: 'eve@example.com', role: 'member', voicePower: 600, contributionCount: 3, tags: ['Sponsor'], joinedAt: '2026-07-02', lastActiveAt: '2026-07-22' },
  { id: 'm3', name: 'Carol', email: 'carol@example.com', role: 'member', voicePower: 500, contributionCount: 8, tags: ['Mentor'], joinedAt: '2026-07-03', lastActiveAt: '2026-07-23' },
  { id: 'm4', name: 'Bob', email: 'bob@example.com', role: 'member', voicePower: 300, contributionCount: 4, tags: ['Volunteer'], joinedAt: '2026-07-04', lastActiveAt: '2026-07-21' },
  { id: 'm5', name: 'Alice', email: 'alice@example.com', role: 'member', voicePower: 100, contributionCount: 2, tags: ['Participant'], joinedAt: '2026-07-05', lastActiveAt: '2026-07-20' },
  { id: 'm6', name: 'Frank', email: 'frank@example.com', role: 'member', voicePower: 150, contributionCount: 3, tags: ['Participant'], joinedAt: '2026-07-06', lastActiveAt: '2026-07-19' },
  { id: 'm7', name: 'Grace', email: 'grace@example.com', role: 'member', voicePower: 200, contributionCount: 3, tags: ['Volunteer'], joinedAt: '2026-07-07', lastActiveAt: '2026-07-22' },
  { id: 'm8', name: 'Henry', email: 'henry@example.com', role: 'member', voicePower: 450, contributionCount: 6, tags: ['Mentor'], joinedAt: '2026-07-08', lastActiveAt: '2026-07-23' },
]

export const demoContributions: Contribution[] = [
  { id: 'c1', memberId: 'm5', memberName: 'Alice', description: 'Submitted project: AI community governance tool', type: 'Submit Work', suggestedVP: 100, status: 'approved', aiReason: 'Complete project submission demonstrating high-quality work output.', submittedBy: 'm5', createdAt: '2026-07-20', reviewedAt: '2026-07-20', approvedVP: 100 },
  { id: 'c2', memberId: 'm4', memberName: 'Bob', description: 'On-site volunteer service during the event', type: 'Volunteer', suggestedVP: 150, status: 'approved', aiReason: 'Volunteer service during the event qualifies for volunteer recognition.', submittedBy: 'm4', createdAt: '2026-07-18', reviewedAt: '2026-07-18', approvedVP: 150 },
  { id: 'c3', memberId: 'm3', memberName: 'Carol', description: 'Mentored 3 teams with technical guidance throughout the hackathon', type: 'Mentor', suggestedVP: 300, status: 'approved', aiReason: 'Mentoring multiple teams demonstrates significant community impact.', submittedBy: 'm3', createdAt: '2026-07-17', reviewedAt: '2026-07-17', approvedVP: 300 },
  { id: 'c4', memberId: 'm1', memberName: 'Dan', description: 'Organized the entire hackathon event', type: 'Organize Event', suggestedVP: 300, status: 'approved', aiReason: 'Event organization is the highest contribution tier.', submittedBy: 'm1', createdAt: '2026-07-15', reviewedAt: '2026-07-15', approvedVP: 300 },
  { id: 'c5', memberId: 'm2', memberName: 'Eve', description: 'Provided venue and funding for the hackathon', type: 'Sponsor', suggestedVP: 600, status: 'approved', aiReason: 'Sponsorship providing venue and funding is a major contribution.', submittedBy: 'm2', createdAt: '2026-07-14', reviewedAt: '2026-07-14', approvedVP: 600 },
  { id: 'c6', memberId: 'm6', memberName: 'Frank', description: 'Helped Team Alpha test their Demo and pointed out wallet connection issues', type: 'Help Others', suggestedVP: 50, status: 'approved', aiReason: 'Helping another team discover Demo issues qualifies as effective community collaboration.', submittedBy: 'm6', createdAt: '2026-07-22', reviewedAt: '2026-07-22', approvedVP: 50 },
  { id: 'c7', memberId: 'm7', memberName: 'Grace', description: 'On-site photography and promotion for the event', type: 'Volunteer', suggestedVP: 150, status: 'approved', aiReason: 'Photography and promotion are valuable volunteer contributions.', submittedBy: 'm7', createdAt: '2026-07-19', reviewedAt: '2026-07-19', approvedVP: 150 },
  { id: 'c8', memberId: 'm8', memberName: 'Henry', description: 'Served as technical mentor for 4 teams during the hackathon', type: 'Mentor', suggestedVP: 300, status: 'approved', aiReason: 'Technical mentorship for multiple teams is a high-value contribution.', submittedBy: 'm8', createdAt: '2026-07-16', reviewedAt: '2026-07-16', approvedVP: 300 },
]

export const demoProposals: Proposal[] = [
  {
    id: 'p1', title: 'What should AdventureX add next?', description: 'Vote on which segment to add to the next AdventureX event.',
    summary: 'Community members voted on the next event theme. AI x Blockchain Track received the most support.',
    options: [
      { id: 'o1', text: 'AI x Blockchain Track', votes: 450, voterCount: 8 },
      { id: 'o2', text: 'Founder Office Hour', votes: 300, voterCount: 5 },
      { id: 'o3', text: 'Demo Day', votes: 280, voterCount: 6 },
      { id: 'o4', text: 'Build in Public Exhibition', votes: 260, voterCount: 6 },
    ],
    status: 'ended', voteType: 'weighted', startTime: '2026-07-21', endTime: '2026-07-23', createdBy: 'm1', createdAt: '2026-07-21',
    totalVotes: 4, totalVP: 1290, voterCount: 12, totalMembers: 25,
    resultHash: '0xabcd1234ef5678...', chainTxHash: '0x7a8b9c1d2e3f4g5h6i7j8k9l0m1n2o3p',
  },
  {
    id: 'p2', title: 'Should we add "code review" as a contribution type?', description: 'Proposal to introduce code review as a recognized contribution type with voice power rewards.',
    options: [
      { id: 'o5', text: 'Yes, +80 voice power', votes: 520, voterCount: 10 },
      { id: 'o6', text: 'Yes, +50 voice power', votes: 380, voterCount: 8 },
      { id: 'o7', text: 'No need', votes: 180, voterCount: 5 },
    ],
    status: 'active', voteType: 'weighted', startTime: '2026-07-23', endTime: '2026-07-25', createdBy: 'm1', createdAt: '2026-07-23',
    totalVotes: 3, totalVP: 1080, voterCount: 23, totalMembers: 25,
  },
]

export const demoRecords: PublicRecord[] = [
  {
    id: 'r1', type: 'vote_result', hash: '0xabcd1234ef567890abcd1234ef567890', txHash: '0x7a8b9c1d2e3f4g5h6i7j8k9l0m1n2o3p',
    network: 'injective-testnet', status: 'recorded',
    data: { proposalId: 'p1', proposalTitle: 'What should AdventureX add next?', totalVP: 1290, totalVoters: 12 },
    createdBy: 'm1', createdAt: '2026-07-23T13:45:00Z', recordedAt: '2026-07-23T13:45:12Z',
  },
  {
    id: 'r2', type: 'rule', hash: '0xrule1234ef567890abcd1234ef567890', network: 'injective-testnet', status: 'recorded',
    data: { communityId: 'comm1', rules: [
      { name: 'Join Community', voicePower: 10 }, { name: 'Event Check-in', voicePower: 20 },
      { name: 'Help Others', voicePower: 50 }, { name: 'Submit Work', voicePower: 100 },
      { name: 'Volunteer', voicePower: 150 }, { name: 'Organize Event', voicePower: 300 }, { name: 'Mentor', voicePower: 300 },
    ]},
    createdBy: 'm1', createdAt: '2026-07-01T10:00:00Z', recordedAt: '2026-07-01T10:00:08Z',
  },
  {
    id: 'r3', type: 'community', hash: '0xcomm567890abcd1234ef567890abcd', network: 'injective-testnet', status: 'recorded',
    data: { name: 'AdventureX Community', type: 'hackathon', ownerId: 'm1' },
    createdBy: 'm1', createdAt: '2026-07-01T09:30:00Z', recordedAt: '2026-07-01T09:30:05Z',
  },
  {
    id: 'r4', type: 'vp_batch', hash: '0xvp1234ef567890abcd1234ef567890', network: 'injective-testnet', status: 'pending',
    data: { communityId: 'comm1', memberCount: 8, totalVP: 500 },
    createdBy: 'm1', createdAt: '2026-07-23T14:00:00Z',
  },
]

export const demoStats: DashboardStats = {
  members: 8, totalVoicePower: 5280, activeProposals: 1, todayContributions: 1, trustedRecords: 4,
}
