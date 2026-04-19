# YouFen.io - Product Requirements Document (PRD)

**Version**: v0.1 Hackathon MVP
**Last Updated**: 2026-07-23
**Product Format**: Responsive Web App (Desktop + Mobile Adaptive)
**Target Track**: Injective Blockchain x AI / Build in Public
**Demo Community**: AdventureX Community

**Important Notes**:
- The current MVP focuses on a responsive web application, supporting access from both desktop and mobile browsers.
- WeChat Mini Program / Official Account integration is a future expansion plan (P2).
- The product is positioned as a global blockchain application, prioritizing open Web environments.

---

## 1. Product Overview

### 1.1 One-Line Pitch

YouFen is a no-code community co-governance platform that helps community operators convert member participation and contributions into "voice power," enabling members to collectively participate in community voting, rule co-creation, and important decision-making. AI handles rule generation and contribution summaries, while Injective records key votes and rule versions.

### 1.2 Product Positioning

**Chinese Positioning**:

> Let every participant genuinely have a stake in their community.

**English Positioning**:

> No-code participation governance for communities.

**Core Value**: Users don't need to know code, blockchain, or connect wallets. The frontend is a community tool; the backend is an Injective trusted record layer.

---

## 2. Target Users

| User Role | Description | Core Needs |
| --------- | ----------- | ---------- |
| **Community Operator** | Leaders of reading clubs, hackathons, associations, creator communities | No-code community rule creation, voice power distribution, vote organization |
| **Community Member** | Regular participants, volunteers, mentors, contributors | To be seen, earn voice power, participate in community decisions |
| **Event Organizer** | Hackathon, offline event, camp organizers | Quantify contributions, distribute speaking power, enhance belonging |
| **Sponsor / Ecosystem Partner** | Party providing resources or funding | See real contributions and publicly verifiable vote results |
| **Judge** | Injective and Build in Public track judges | See the AI + Chain + Community co-creation closed loop |

---

## 3. Core Problems and Solutions

### 3.1 Core Problems

The problem with communities today isn't a lack of groups — it's:

- ❌ Members lack a sense of presence
- ❌ Contributors go unseen
- ❌ Voting is just a regular survey, not reflective of real participation
- ❌ Community decisions lack transparency
- ❌ Contributions from volunteers, mentors, and behind-the-scenes organizers are hard to track
- ❌ Community operators don't know how to use DAOs, smart contracts, or wallets

### 3.2 Solution

> Let community members earn voice power through genuine participation and use it to make community decisions.

---

## 4. Core Concept Design

### 4.1 User-Facing Terminology Mapping

| User-Facing Concept | Meaning | Technical Term |
| ------------------ | ------- | -------------- |
| **Voice Power** | Voting rights earned through member contributions | Voice Power / VP |
| **Participation Rules** | What behaviors earn how much voice power | Rule Config |
| **Community Proposal** | A question the community votes on together | Proposal |
| **Contribution Record** | Things a member has done | Contribution |
| **Trusted Record** | Public proof of important results | Injective tx / hash |
| **Co-creation Report** | Summary of community participation | AI Summary |

### 4.2 Terminology Avoidance List

To lower the barrier to entry, the frontend **avoids** the following Web3 terms:

- ❌ token
- ❌ DAO
- ❌ gas / wallet
- ❌ on-chain assets
- ❌ transaction / mining / airdrop

---

## 5. MVP Scope

### 5.1 Core Flow

The MVP delivers one complete closed loop:

```
Create Community
  ↓
AI Generates Rules
  ↓
Add Members
  ↓
Distribute Voice Power
  ↓
Create Proposals
  ↓
Members Vote
  ↓
AI Summarizes
  ↓
Generate Injective Trusted Record
  ↓
Display Build in Public Page
```

### 5.2 Success Criteria

The Hackathon MVP must complete:

- ✅ Landing page is accessible
- ✅ Communities can be created
- ✅ AI can generate rules
- ✅ Members can be added
- ✅ Voice power can be distributed
- ✅ Proposals can be created
- ✅ Voting can be completed
- ✅ Vote results can be displayed
- ✅ At least 1 Injective trusted record can be generated
- ✅ Build in Public page can be displayed
- ✅ Mobile experience is complete

---

## 6. Information Architecture

### 6.1 Site Page Structure

```
YouFen.xyz
├── Landing Page
├── Create Community
├── Community Admin (Admin Panel) - Desktop First 💻
│   ├── Dashboard
│   ├── Member Management
│   ├── Contribution Review
│   ├── Proposal Management
│   └── Trusted Records
├── Member Dashboard - Mobile First 📱
│   ├── My Voice Power
│   ├── My Contributions
│   └── Available Votes
├── Vote Page - Mobile First 📱
├── Public Community Page
└── Build in Public Page
```

### 6.2 Device Priority Design

| Page Type | Priority Device | Design Principle |
| --------- | --------------- | ---------------- |
| **Operations (Admin)** | 💻 Desktop First | Needs to handle large amounts of info, batch operations, data visualization |
| **Member (Voting, Contributions)** | 📱 Mobile First | Members participate anytime; convenience when opening in WeChat |
| **Public (Display)** | 📱💻 Responsive | Community image must display well on all devices |

---

## 7. Detailed Page Requirements

### 7.1 Landing Page

**Goal**: Let users know within 5 seconds that this is a tool for community operators

**Page Structure**:

- **Top Navigation**: YouFen / Demo / Build in Public
- **Main Headline**: Let every participant genuinely have a stake in their community
- **Sub-headline**: No-code community participation rules. Turn member contributions into voice power. Let everyone decide the community's future together.
- **CTA Buttons**:
  - Create Community (Primary)
  - View AdventureX Demo (Secondary)

**Three Value Cards**:

| Title | Description | Icon Suggestion |
| ----- | ----------- | -------------- |
| Visible Contributions | Volunteers, mentors, and active members no longer overlooked | 👁️ |
| Voice Power | Members gain community voice power through participation | 🗣️ |
| Trusted Results | Important votes generate publicly verifiable records | 🔒 |

---

### 7.2 Create Community Page

**User**: Community Operator

**Form Fields**:

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| Community Name | Text | ✅ | Max 30 characters |
| Community Type | Dropdown | ✅ | See options below |
| Community Size | Dropdown | ✅ | <30 / 30-100 / 100-500 / 500+ |
| Community Goal | Textarea | ✅ | Used for AI rule generation |
| Is Public | Toggle | ❌ | Default: on |

**Community Type Options**:

- Hackathon
- Book Club
- Campus Club
- Creator Community
- Open Source
- Volunteer Organization
- Custom (requires input)

**AI-Generated Default Participation Rules**:

Based on community type and goals, AI generates rules like:

```
Join Community: +10 voice power
Event Check-in: +20 voice power
Help Others: +50 voice power
Submit Work: +100 voice power
Volunteer: +150 voice power
Organize Event: +300 voice power
Mentor: +300 voice power
```

**Workflow**:

1. User fills out the form
2. Clicks "Use AI Recommended Rules"
3. AI returns rule templates
4. User can manually edit rules
5. Clicks "Create Community"
6. On success, redirects to community admin

---

### 7.3 Community Admin - Desktop First

**User**: Community Operator

**Core Modules**:

#### 1. Dashboard

**Key Metric Cards**:

| Metric | Description |
| ------ | ----------- |
| Members | Current total members |
| Total Voice Power | Sum of all member voice power |
| Active Proposals | Number of votes in progress |
| Today's Contributions | New contribution records today |
| Trusted Records | Number of on-chain records generated |

#### 2. Quick Actions

- Add Member
- Distribute Voice Power
- Create Proposal
- Generate Community Report

#### 3. Member List

**Table Columns**:

| Field | Description | Actions |
| ----- | ----------- | ------- |
| Name | Member nickname | Clickable for details |
| Role | Owner/Member | Editable |
| Voice Power | Current VP value | Manually adjustable |
| Contributions | Total contribution records | Display |

**Features**:

- Search members
- Sort by voice power
- Batch import members
- Export member list

#### 4. Proposal List

**Table Columns**:

| Field | Description |
| ------ | ----------- |
| Title | Proposal name |
| Status | Voting / Ended |
| Voters | Voted count / Total count |
| Trusted Record | Whether on-chain record generated |
| Created At | Timestamp |

**Actions**:

- View details
- End vote
- Generate trusted record
- Delete (only before start)

#### 5. Trusted Records List

**Record Card Display**:

```
Record Type: Vote Result
Community: AdventureX Community
Network: Injective Testnet
Transaction Hash: 0x7a8b9c...
Time: 2026-07-23 13:45:00
```

**Filter Options**:

- All Records
- Community Records
- Rule Versions
- VP Batches
- Proposal Records
- Vote Results

---

### 7.4 Member Dashboard - Mobile First

**User**: Regular Member

**Page Layout**:

#### 1. My Voice Power Card

```
You currently have 180 voice power
Ranking: Top 15%
```

#### 2. My Role Tags

Display: Participant / Volunteer / Mentor, etc.

#### 3. My Contribution History

**Timeline Display**:

```
2026-07-20  Submitted project work  +100 VP  Approved
2026-07-18  Helped Team Alpha test Demo  +50 VP  Approved
2026-07-15  Event Check-in  +20 VP  Approved
```

#### 4. Available Votes

**Vote Card**:

```
In Progress
What should AdventureX add next?
Your voice power: 180
Deadline: 2026-07-25

Vote Now
```

#### 5. Quick Actions

- Submit New Contribution
- View Community Public Page
- Share My Contributions

---

### 7.5 Contribution Review Page - Desktop First

**User**: Community Operator

**Contribution Sources**:

- Operator manually adds
- Member self-reports
- Both parties confirm
- Demo data import (batch)

#### Contribution Submission Form

**Fields**:

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| Member | Dropdown | ✅ | Select community member |
| Contribution Description | Textarea | ✅ | Detailed description of contribution |
| Contribution Type | Dropdown | ❌ | AI can auto-detect |
| Suggested VP | Number | ❌ | AI can auto-suggest |
| Proof Materials | File Upload | ❌ | Images, documents, etc. |

#### AI-Assisted Features

**Input Example**:

> I helped Team Alpha test their Demo and pointed out the wallet connection issue.

**AI Output**:

```
Contribution Type: Help Others / Technical Testing
Suggested VP: +50
Reason: This member helped another team discover Demo issues, which qualifies as effective community collaboration.
```

#### Operator Actions

**Pending Review List**:

| Member | Contribution | AI Suggested VP | Status | Actions |
| ------ | ------------ | --------------- | ------ | ------- |
| Alice | Submitted project work | +100 | Pending | Approve / Reject / Edit |
| Bob | Helped test Demo | +50 | Pending | Approve / Reject / Edit |

**Batch Operations**:

- Batch approve
- Batch distribute voice power
- Export contribution report

---

### 7.6 Vote Page - Mobile First

**User**: Community Member

**Page Content**:

#### 1. Proposal Title

```
What should AdventureX add next?
```

#### 2. AI Summary (Optional)

Briefly explains the voting background and core differences between options

#### 3. Voting Options

**Option Cards**:

```
AI x Blockchain Track
  Current votes: 450 VP (35%)

Founder Office Hour
  Current votes: 300 VP (23%)

Demo Day
  Current votes: 280 VP (22%)

Build in Public Exhibition
  Current votes: 260 VP (20%)
```

#### 4. Voting Info Bar

```
Your voice power: 180
Deadline: 2026-07-25 23:59
Voters: 12/25
```

#### 5. Vote Button

- Confirm Vote (Primary)
- Note: This vote is weighted by voice power

#### 6. Vote Confirmation

```
Vote successful
A trusted record will be generated after the vote ends
```

**Voting Methods**:

- MVP: Weighted by voice power
- P1: Support one-person-one-vote mode
- P1: Support anonymous results mode

---

### 7.7 Public Community Page

**User**: Everyone (including visitors)

**Page Goal**: Showcase community co-creation and transparency

#### 1. Community Header

```
AdventureX Community
A hackathon community shaped by its participants
```

#### 2. Community Data Overview

| Metric | Value |
| ------ | ----- |
| Members | 25 |
| Total Voice Power | 5,280 |
| Active Proposals | 1 |
| Completed Votes | 3 |
| Trusted Records | 4 |

#### 3. Top Contributors This Week

```
Dan (Organizer) - 800 voice power
Eve (Sponsor) - 600 voice power
Carol (Mentor) - 500 voice power
```

#### 4. Voice Power Distribution Visualization

Pie chart or bar chart showing member voice power distribution

#### 5. Recent Co-creation Timeline

```
2026-07-23  Vote completed: Next event theme  Trusted record generated
2026-07-22  Voice power distributed: 5 volunteers
2026-07-20  New members: 3 joined
```

#### 6. Public Trusted Records

Display all on-chain records, clickable for details

#### 7. Footer Message

```
This community's rules and decisions are shaped by real participants.
```

---

### 7.8 Build in Public Page

**Goal**: Adapt to the Build in Public track, showcasing the product development process

**Page Structure**:

#### 1. Today's Update

```
Day 3 - 2026-07-23

Done
- Implemented AI-assisted contribution review
- Completed mobile voting page optimization
- Integrated Injective testnet recording

In Progress
- Optimizing community admin data visualization
- Testing mobile browser experience
```

#### 2. User Feedback Wall

```
Feedback from Operators
"Please don't use the word 'token' — my members will be scared off."
Adopted: Completely removed Web3 terminology from the frontend

Feedback from Members
"I want members to be able to decide the next event theme with voice power."
Implemented: Voting feature is now live
```

#### 3. What the Community Decided

```
Recent Vote Results

Vote: What to prioritize next?
Member self-reporting contributions - 65%
Community report export - 25%
Email notifications - 10%

12 members participated, 1,580 total voice power
```

#### 4. Next Steps

```
Roadmap

This Week
- [ ] Member self-reporting feature
- [ ] Batch member import tool
- [ ] Vote result AI summary

Next Week
- [ ] PWA progressive app wrapper
- [ ] Multi-language support
- [ ] Community template library
```

#### 5. Product Data Dashboard

```
Current Stats

Total Communities: 1
Total Members: 25
Total Voice Power: 5,280
Completed Votes: 3
On-chain Records: 4
```

#### 6. Development Log

**Timeline Format**:

```
2026-07-23
We discovered that what community operators care about most isn't a points system, but whether "members are seen."
So we shifted the product core from "points" to "voice power."

2026-07-22
Completed first user testing and received key feedback:
"I don't understand blockchain, but I understand the concept of voice power."
```

---

## 8. Data Model Design

### 8.1 Community

```typescript
interface Community {
  id: string                    // UUID
  name: string                  // Community name
  type: CommunityType           // Community type
  description: string           // Community description
  goal: string                  // Community goal
  size: string                  // Member size range
  rules: Rule[]                 // Participation rules
  isPublic: boolean             // Is public
  createdAt: Date               // Creation time
  updatedAt: Date               // Update time
  chainRecordHash?: string      // On-chain record hash
  ownerId: string               // Creator ID
}

enum CommunityType {
  HACKATHON = 'hackathon',
  BOOK_CLUB = 'book_club',
  CAMPUS_CLUB = 'campus_club',
  CREATOR = 'creator',
  OPEN_SOURCE = 'open_source',
  VOLUNTEER = 'volunteer',
  CUSTOM = 'custom'
}

interface Rule {
  id: string
  name: string                  // Rule name, e.g. "Event Check-in"
  description: string           // Rule description
  voicePower: number            // Voice power awarded
  category: string              // Rule category
  isActive: boolean             // Is enabled
}
```

### 8.2 Member

```typescript
interface Member {
  id: string                    // UUID
  communityId: string           // Community ID
  name: string                  // Member nickname
  email?: string                // Email (optional)
  phone?: string                // Phone (optional)
  role: MemberRole              // Role
  voicePower: number            // Current voice power
  contributionCount: number     // Contribution count
  tags: string[]                // Tags, e.g. ["volunteer", "mentor"]
  joinedAt: Date                // Join time
  lastActiveAt: Date            // Last active time
}

enum MemberRole {
  OWNER = 'owner',              // Creator
  MANAGER = 'manager',          // Admin
  MEMBER = 'member',            // Regular member
}
```

### 8.3 Contribution

```typescript
interface Contribution {
  id: string                    // UUID
  communityId: string           // Community ID
  memberId: string              // Member ID
  description: string           // Contribution description
  type: string                  // Contribution type
  suggestedVP: number           // AI-suggested voice power
  approvedVP?: number           // Approved voice power
  status: ContributionStatus    // Status
  aiReason?: string             // AI analysis reason
  evidence?: string[]           // Proof material URLs
  submittedBy: string           // Submitter ID (member or operator)
  reviewedBy?: string           // Reviewer ID
  createdAt: Date               // Creation time
  reviewedAt?: Date             // Review time
}

enum ContributionStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}
```

### 8.4 Proposal

```typescript
interface Proposal {
  id: string                    // UUID
  communityId: string           // Community ID
  title: string                 // Proposal title
  description: string           // Proposal description
  summary?: string              // AI-generated summary
  options: ProposalOption[]     // Voting options
  status: ProposalStatus        // Status
  voteType: VoteType            // Voting method
  startTime: Date               // Start time
  endTime: Date                 // End time
  createdBy: string             // Creator ID
  createdAt: Date               // Creation time
  resultHash?: string           // Result hash
  chainTxHash?: string          // On-chain transaction hash
}

interface ProposalOption {
  id: string
  text: string                  // Option text
  votes: number                 // Votes received (VP sum)
  voterCount: number            // Number of voters
}

enum ProposalStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ENDED = 'ended',
  RECORDED = 'recorded',
}

enum VoteType {
  WEIGHTED = 'weighted',
  ONE_PERSON_ONE_VOTE = 'one_person_one_vote',
}
```

### 8.5 Vote

```typescript
interface Vote {
  id: string                    // UUID
  proposalId: string            // Proposal ID
  memberId: string              // Member ID
  optionId: string              // Selected option ID
  voicePowerUsed: number        // Voice power used
  comment?: string              // Vote comment (optional)
  isAnonymous: boolean          // Is anonymous (P1)
  createdAt: Date               // Vote time
  ipAddress?: string            // IP address (anti-abuse)
}
```

### 8.6 PublicRecord

```typescript
interface PublicRecord {
  id: string                    // UUID
  communityId: string           // Community ID
  type: RecordType              // Record type
  hash: string                  // Data hash
  txHash?: string               // Injective transaction hash
  network: string               // Network name
  status: RecordStatus          // Status
  data: any                     // Raw data
  createdBy: string             // Creator ID
  createdAt: Date               // Creation time
  recordedAt?: Date             // On-chain time
}

enum RecordType {
  COMMUNITY = 'community',
  RULE = 'rule',
  VP_BATCH = 'vp_batch',
  PROPOSAL = 'proposal',
  VOTE_RESULT = 'vote_result',
}

enum RecordStatus {
  PENDING = 'pending',
  RECORDING = 'recording',
  RECORDED = 'recorded',
  FAILED = 'failed',
}
```

---

## 9. AI Feature Design

**Design Principle**: AI only assists; it does not make final decisions. Operators always have the final say.

### 9.1 Generate Participation Rules

**Trigger**: Create Community page

**Input**: Community type, goal, member size

**Output Example**:

```
Based on your hackathon community, we recommend the following participation rules:

Join Community: +10 voice power
Event Check-in: +20 voice power
Help Others: +50 voice power
Submit Work: +100 voice power
Volunteer: +150 voice power
Organize Event: +300 voice power
Mentor: +300 voice power
```

**Editable**: Operators can modify rule names, VP values, add/remove rules

### 9.2 Identify Contribution Type

**Trigger**: Contribution review page

**Input**: Member name, contribution description, community rules

**Output Example**:

```
Contribution Type: Help Others / Technical Testing
Suggested VP: +50
Reason: This member helped another team discover Demo issues, which qualifies as effective community collaboration.
```

### 9.3 Optimize Proposal Wording

**Trigger**: Create Vote page

**Input**: Operator's raw proposal text

**Output**: Clearer, neutral voting question

**Example**:

Input: "Should we have an AI track next time?"

Output: "Which segment should AdventureX add to its next event?"

### 9.4 Summarize Vote Perspectives

**Trigger**: Vote in-progress page (optional)

**Output**: Pro/con perspective summary

### 9.5 Generate Community Report

**Trigger**: Community admin, operator clicks "Generate Community Report"

**Input**: Community info, member list, contributions, vote history

### 9.6 Generate Build in Public Updates

**Trigger**: Build in Public page, auto or manual

**Input**: Development log, user feedback, vote results, data changes

---

## 10. Injective Feature Design

**Design Principle**: The frontend presents it as "public trusted records," avoiding blockchain terminology.

### 10.1 MVP On-Chain Content

| Record Type | Data Content | When Generated |
| ----------- | ------------ | -------------- |
| Community Record | communityHash | At community creation |
| Rule Version | ruleHash | At rule creation/modification |
| VP Batch | vpBatchHash | When batch distributing voice power |
| Proposal Record | proposalHash | At proposal creation |
| Vote Result | voteResultHash | When vote ends |

### 10.2 Minimal Contract Interface

Solidity contract with `createRecord` and `verifyRecord` functions. See full code in the Chinese ARCHITECTURE.md.

### 10.3 Frontend Display

**Trusted Record Detail Page**:

```
Public Trusted Record

Record Type: Vote Result
Community: AdventureX Community
Network: Injective Testnet
Transaction Hash: 0x7a8b9c1d2e3f4g5h6i7j8k9l0m1n2o3p
Block Height: #1,234,567
Time: 2026-07-23 14:30:00

Original Data Hash:
0xabcd1234...ef5678

View on Block Explorer
```

**Terms to Avoid**: "On-chain", "gas fee", "wallet signing", "smart contract"

**Recommended Terms**: "Generate public trusted record", "Permanently preserved", "Publicly verifiable"

### 10.4 Backend Implementation Flow

Full TypeScript flow for creating vote result trusted records. See ARCHITECTURE.en.md for complete code.

---

## 11. Demo Data Design

### 11.1 Demo Community

- Name: AdventureX Community
- Type: Hackathon
- Size: 20-30 people
- Status: Public display

### 11.2 Demo Members

| Name | Role | Voice Power | Contributions | Tags |
| ---- | ---- | ----------: | ------------: | ---- |
| Dan | Owner | 800 | 5 | Organizer |
| Eve | Member | 600 | 3 | Sponsor |
| Carol | Member | 500 | 8 | Mentor |
| Bob | Member | 300 | 4 | Volunteer |
| Alice | Member | 100 | 2 | Participant |
| Frank | Member | 150 | 3 | Participant |
| Grace | Member | 200 | 3 | Volunteer |
| Henry | Member | 450 | 6 | Mentor |

**Total**: 25 members, total voice power: 5,280

### 11.3 Demo Contribution Records

| Member | Contribution | Type | VP | Status |
| ------ | ------------ | ---- | -- | ------ |
| Alice | Submitted project: AI community governance tool | Submit Work | +100 | Approved |
| Bob | On-site volunteer service | Volunteer | +150 | Approved |
| Carol | Mentored 3 teams with technical guidance | Mentor | +300 | Approved |
| Dan | Organized this hackathon | Organize Event | +300 | Approved |
| Eve | Provided venue and funding | Sponsor | +600 | Approved |
| Frank | Helped Team Alpha test their Demo | Help Others | +50 | Approved |
| Grace | On-site photography and promotion | Volunteer | +150 | Approved |
| Henry | Served as technical mentor | Mentor | +300 | Approved |

### 11.4 Demo Voting Proposals

**Proposal 1** (Ended):

```
Title: What should AdventureX add next?

Options:
- AI x Blockchain Track - 450 VP (35%) - 8 voters
- Founder Office Hour - 300 VP (23%) - 5 voters
- Demo Day - 280 VP (22%) - 6 voters
- Build in Public Exhibition - 260 VP (20%) - 6 voters

Status: Ended
Trusted Record: Generated
Voters: 12/25
Total Voice Power: 1,290
```

**Proposal 2** (In Progress):

```
Title: Should we add "code review" as a contribution type?

Options:
- Yes, +80 voice power - Currently 520 VP
- Yes, +50 voice power - Currently 380 VP
- No need - Currently 180 VP

Status: In Progress
Deadline: 2026-07-25 23:59
```

---

## 12. Permission Design

### 12.1 Role Permission Matrix

| Feature | Owner | Manager | Member | Visitor |
| ------- | :---: | :-----: | :----: | :-----: |
| **Community Management** | | | | |
| Create Community | Yes | No | No | No |
| Edit Community Info | Yes | Yes | No | No |
| Delete Community | Yes | No | No | No |
| Edit Participation Rules | Yes | No | No | No |
| **Member Management** | | | | |
| Add Member | Yes | Yes | No | No |
| Remove Member | Yes | Yes | No | No |
| Change Member Role | Yes | No | No | No |
| Manually Adjust VP | Yes | Yes | No | No |
| **Contribution Management** | | | | |
| Add Contribution Record | Yes | Yes | No | No |
| Submit Contribution Report | Yes | Yes | Yes | No |
| Review Contribution | Yes | Yes | No | No |
| Approve VP Distribution | Yes | Yes | No | No |
| **Proposal Management** | | | | |
| Create Proposal | Yes | Yes | No | No |
| Edit Proposal | Yes | Yes | No | No |
| End Vote | Yes | Yes | No | No |
| Delete Proposal | Yes | No | No | No |
| Participate in Vote | Yes | Yes | Yes | No |
| **Trusted Records** | | | | |
| Generate Trusted Record | Yes | Yes | No | No |
| View Trusted Record | Yes | Yes | Yes | Yes |
| **View Permissions** | | | | |
| View Community Admin | Yes | Yes | No | No |
| View Member Dashboard | Yes | Yes | Yes | No |
| View Public Community | Yes | Yes | Yes | Yes |

### 12.2 MVP Simplified Approach

The MVP can be simplified to three roles:

- **Owner**: Community creator, has all permissions
- **Member**: Regular member, can vote, submit contributions
- **Visitor**: Can only view public community pages

---

## 13. Risks and Mitigation Strategies

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| **Perceived as a simple points system** | Judges may see it as uninnovative | Emphasize that key decisions generate Injective trusted records, showcasing blockchain value |
| **Perceived Web3 barrier too high** | Users reluctant to adopt | Completely chain-free frontend; blockchain only visible in trusted records |
| **Compliance risk** | May be classified as a financial product | Voice power cannot be traded, withdrawn, or transferred |
| **Unfair AI allocation** | Operators may question AI judgments | AI only suggests; operator approval required before taking effect |
| **Looks like a DAO tool** | Users find it too complex | Emphasize no-code community operations; avoid DAO/governance terminology |
| **Users don't understand voice power** | Concept too abstract | Explain as "how much say you have in the community's future" |
| **Vote result tampering** | Trust decreases | Key votes generate on-chain records, publicly verifiable |
| **Members farming voice power** | System abuse | Contributions require operator review; IP tracking to prevent abuse |

---

## 14. Track Narratives

### 14.1 Injective Track Narrative

**Core Argument**: Bring Injective to non-Web3 users

**Narrative**:

> YouFen brings Injective to non-Web3 community operators. Regular users don't need to understand blockchain, connect wallets, or pay gas fees. But key community voice power allocations, rule version changes, and vote results can all generate public trusted records through Injective.
>
> This isn't about simplifying complex Web3 tools — it's about seamlessly embedding Web3's value (transparency, trust, immutability) into traditional community operations.

**Technical Highlights**:

- Use Injective EVM to deploy record contract
- Completely wallet-free frontend; backend auto-generates on-chain records
- Demonstrate block explorer verification

### 14.2 Build in Public Track Narrative

**Core Argument**: Practice Build in Public with our own product

**Narrative**:

> YouFen itself is a product being built in public within the AdventureX community. We don't just "post updates" — we let users vote on what the product should do next.
>
> Every important decision involves community voice power; every vote generates a public trusted record. Build in Public has evolved from "showing the process" to "community co-governance."

---

## 15. Final Pitch

### 15.1 Chinese Version

> YouFen is a no-code community governance platform that turns real participation into voice power. Members are no longer just observers in the group chat — they earn voice power through contributions and use it to participate in community decisions.
>
> AI helps operators design contribution rules, recognize contributions, and summarize proposals. Injective provides a public record layer for important votes and rule changes in the background.
>
> The problem we're solving is simple: ensure that everyone who truly participates in the community genuinely has a stake in it.

### 15.2 English Version

> YouFen is a no-code community governance website that turns real participation into voice power. Members are no longer just observers in the group chat — they earn voice power through contributions and use it to participate in community decisions.
>
> AI helps operators design contribution rules, recognize contributions, and summarize proposals. Injective provides a public record layer for important votes and rule changes in the background.
>
> The problem we're solving is simple: ensure that everyone who truly participates in the community genuinely has a stake in it.

---

## 16. Product Memorable Points

### 16.1 Core Slogan

**Chinese**: Let every participant genuinely have a stake in their community.

**English**: YouFen: Everyone who participates, has a stake.

### 16.2 Key Differentiation

| Dimension | Traditional Tools | YouFen |
| --------- | ---------------- | ------ |
| **User Barrier** | Need to understand DAO/Web3 | Completely no-code, no chain feel |
| **Core Concept** | Points / Token | Voice Power (speaking power) |
| **Decision Method** | Regular survey voting | Voice power weighted + on-chain records |
| **Transparency** | Results may be tampered | Key decisions generate public trusted records |
| **AI Role** | None | Assists rule generation and contribution recognition |
| **Applicable Scenarios** | Web3 native communities | Any community (hackathons, book clubs, associations) |

### 16.3 Demo Highlights

**30-Second Quick Demo Flow**:

1. Create Community — Fill in info, AI generates rules (10s)
2. Add Members — Show AdventureX member list (5s)
3. Distribute VP — Approve contributions, auto-calculate VP (5s)
4. Create Vote — Show active vote (5s)
5. View Results — Show vote results and Injective trusted records (5s)

**Emphasis Points**:

- Smooth mobile browser experience
- No wallet connection needed
- AI auto-suggests voice power
- One-click on-chain trusted records

---

## 17. MVP Development Priority

### P0 (Must Complete)

- [ ] Landing page
- [ ] Create community + AI rule generation
- [ ] Add members
- [ ] Distribute voice power
- [ ] Create proposals
- [ ] Member voting (mobile)
- [ ] Vote result display
- [ ] Generate Injective trusted records (at least 1)
- [ ] Public community page
- [ ] Build in Public page
- [ ] Demo data preset

### P1 (If Time Permits)

- [ ] Member self-reporting contributions
- [ ] Batch member import
- [ ] Community report export
- [ ] One-person-one-vote mode
- [ ] Anonymous voting mode
- [ ] Manager role permissions

### P2 (Future Versions)

- [ ] WeChat Mini Program wrapper (China market)
- [ ] Multi-language support
- [ ] Community template library
- [ ] Voice power history curve
- [ ] Member badge system
- [ ] WeChat ecosystem integration
- [ ] Data analytics dashboard

---

**Document Completed**: 2026-07-23
**Next Step**: Technical Architecture Design
