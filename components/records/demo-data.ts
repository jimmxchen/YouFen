// 可信记录演示数据 —— 数值取自 PRD §29 AdventureX Demo。
// 集成点：真实环境下由 GET /api/public-records?communityId=... 提供同构数据，
// 每条记录的 verify 走 GET /api/public-records/:id/verify（见 records-explorer.tsx）。
// demo: true 的记录跳过真实请求，查验流程以本地模拟演示。

export type RecordStatus =
  | 'pending'
  | 'submitting'
  | 'confirming'
  | 'verified'
  | 'failed'
  | 'superseded'

export type RecordKind =
  | 'tokenMint'
  | 'advanceMint'
  | 'tokenReversal'
  | 'epochSummary'
  | 'policyVersion'
  | 'proposalResult'

export interface VoteStats {
  /** 获胜选项的加权赞同百分比（0-100） */
  approvalPct: number
  /** 实际投票人数 */
  voters: number
  /** 有投票资格的成员总数 */
  totalMembers: number
}

export interface ChainRecord {
  id: string
  kind: RecordKind
  status: RecordStatus
  /** ISO 日期 YYYY-MM-DD */
  date: string
  /** 数字指纹（recordHash，keccak256） */
  recordHash: string
  /** 链上交易哈希；未上链完成时为空 */
  txHash?: string
  /** 存档区块高度（账本"页码"）；确认完成后才有 */
  blockNumber?: number
  /** 链上盖章时间（ISO datetime）；确认完成后才有 */
  sealedAt?: string
  /** 投票结果记录的统计数据（仅 proposalResult） */
  vote?: VoteStats
  /** 该记录被哪条新记录更正（superseded 时） */
  supersededById?: string
  demo: true
}

/** 页面分区：Token 发放（含预支/冲销）、投票结果、规则更新、月度结算 */
export type RecordCategory = 'token' | 'votes' | 'rules' | 'epoch'

export const KIND_CATEGORY: Record<RecordKind, RecordCategory> = {
  tokenMint: 'token',
  advanceMint: 'token',
  tokenReversal: 'token',
  proposalResult: 'votes',
  policyVersion: 'rules',
  epochSummary: 'epoch',
}

const EXPLORER_BASE = 'https://testnet-injective.cloud.blockscout.com'

export function explorerTxUrl(txHash: string): string {
  return `${EXPLORER_BASE}/tx/${txHash}`
}

/** 按时间倒序（最新在前）。标题与摘要文案在 messages/<locale>.json 的 records.demo.<id> 下。 */
export const demoRecords: ChainRecord[] = [
  {
    id: 'r6',
    kind: 'tokenMint',
    status: 'confirming',
    date: '2026-07-23',
    recordHash:
      '0x8c41f7a2d95e03b6c8a1f04e7d2b9c5a3e6f08d1b4a7c290e5d8f3a6b1c4e708',
    txHash:
      '0x5e92c07b3f6a1d84e0b7c2a95f38d61c4a0e9b72d5c8f13a6e4b09d7c2a58f31',
    demo: true,
  },
  {
    id: 'r5',
    kind: 'proposalResult',
    status: 'verified',
    date: '2026-07-21',
    recordHash:
      '0x3fa2c81b09d4e675a2b8c30f19e7d5a4c6b2e809f7d1a35c8e60b94d2f7a1c5e',
    txHash:
      '0x91d40cf7a25e83b6d1c09e4a7f52b38c60a4d97e2b15f80c3d6a29e7b41c50f8',
    blockNumber: 29786540,
    sealedAt: '2026-07-21T20:14:07+08:00',
    vote: { approvalPct: 62, voters: 18, totalMembers: 25 },
    demo: true,
  },
  {
    id: 'r4',
    kind: 'epochSummary',
    status: 'verified',
    date: '2026-07-20',
    recordHash:
      '0x6b90e3d2c17f48a5b0e69c2d84f13a7e5c08b6d4a29f71e0c3b58d6a94e207f1',
    txHash:
      '0x2a75e09c4d18f36b7a92c05e81d4f7a3b6c19e08d52a4f7c0b3e68d19a25c47e',
    blockNumber: 29682157,
    sealedAt: '2026-07-20T09:30:41+08:00',
    demo: true,
  },
  {
    id: 'r3',
    kind: 'advanceMint',
    status: 'verified',
    date: '2026-07-18',
    recordHash:
      '0xd147a09b5e28c36f4d0a19e7b823c5f6a4d07e19b3c62f85a0d94b7e21c63f08',
    txHash:
      '0x7c30b95d2e64f18a0c5b7d29e46a83f1b0d5c7a92e64f08b3d1a5c92e7b40f68',
    blockNumber: 29473598,
    sealedAt: '2026-07-18T15:02:19+08:00',
    demo: true,
  },
  {
    id: 'r2',
    kind: 'tokenMint',
    status: 'verified',
    date: '2026-07-15',
    recordHash:
      '0xa59c3e07d61b84f2a3c50e98d74b16fa2c85e30d97b41f6a8c20d5e93b71f4c6',
    txHash:
      '0x48f1b6d03a75c92e84d0b61f5a29c73e08b4d6a15f92c70e3b8d54a267c91e0f',
    blockNumber: 29160433,
    sealedAt: '2026-07-15T11:47:53+08:00',
    demo: true,
  },
  {
    id: 'r9',
    kind: 'tokenReversal',
    status: 'verified',
    date: '2026-07-13',
    recordHash:
      '0x4c72e91a5d0b68f30c2a94d17e85b36f0a4d92c75e18b60f3a2d85c94b17e60a',
    txHash:
      '0x8a15c96d3e70b42f81d6a05c97e34b28f60d1a49c85e72b03f6d18a5c92e74b0',
    blockNumber: 28951720,
    sealedAt: '2026-07-13T10:08:26+08:00',
    demo: true,
  },
  {
    id: 'r1',
    kind: 'tokenMint',
    status: 'superseded',
    date: '2026-07-12',
    recordHash:
      '0xe28b50c7a94d16f3b8a20c67e51d94fb03c7a6e28d50b91f4a7c30e86d21b5f9',
    txHash:
      '0x0d64a92c7e51f38b06d4a17c95e82f30b6d0a48c72e15f93a8b0c6d247e91a5c',
    supersededById: 'r9',
    blockNumber: 28847166,
    sealedAt: '2026-07-12T18:21:34+08:00',
    demo: true,
  },
  {
    id: 'r0',
    kind: 'policyVersion',
    status: 'verified',
    date: '2026-07-01',
    recordHash:
      '0xf70d29c5a83b41e6f2d80a95c37b64ed19f05c8a2b7d63e40f18a9c5d2b70e64',
    txHash:
      '0x3b86d51f0a94c27e63b1d80f5c4a29e71d06b83f5a20c94d7e61b35a08c72f94',
    blockNumber: 27699504,
    sealedAt: '2026-07-01T00:05:12+08:00',
    demo: true,
  },
  {
    id: 'r7',
    kind: 'proposalResult',
    status: 'verified',
    date: '2026-06-25',
    recordHash:
      '0x1e94b70d5c83a26f40e7d19b52c86a3f7d05e94b18c62a50f3e87d09c41b26e5',
    txHash:
      '0x6d20a85c94e17b3f08d5a62c91e40f7b3a8d06c52e94f17b0a3d68c25e91f40a',
    blockNumber: 27073412,
    sealedAt: '2026-06-25T21:40:55+08:00',
    vote: { approvalPct: 58, voters: 21, totalMembers: 25 },
    demo: true,
  },
  {
    id: 'r8',
    kind: 'policyVersion',
    status: 'verified',
    date: '2026-06-20',
    recordHash:
      '0x9b37e60d14c85a2f70b9e36d08c41a5f92d7b30e68c14a5d97b20e83f61c40d9',
    txHash:
      '0x5f08c73b91d46a2e80f5c17d94b63a08e52f90d17c48b6a3e05d92f71c84b60e',
    blockNumber: 26551880,
    sealedAt: '2026-06-20T14:00:03+08:00',
    demo: true,
  },
]

export function shortHash(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`
}
