type Locale = 'en' | 'zh'

export interface MarketingAction {
  href: string
  label: string
  external?: boolean
}

export interface MarketingPageContent {
  eyebrow: string
  title: string
  description: string
  primaryAction?: MarketingAction
  secondaryAction?: MarketingAction
  sections: Array<{
    title: string
    body: string
  }>
}

type MarketingPageMap = Record<string, Record<Locale, MarketingPageContent>>

const pageContent: MarketingPageMap = {
  demo: {
    en: {
      eyebrow: 'Demo',
      title: 'Explore YouFen from both sides',
      description:
        'Use the demo workspace to inspect the member experience, manager dashboard, trusted records, chat, and contribution flows.',
      primaryAction: { href: '/member/demo', label: 'Open member demo' },
      secondaryAction: { href: '/admin', label: 'Open manager demo' },
      sections: [
        {
          title: 'Member view',
          body: 'Members can submit contributions, join events, inspect their records, and follow community chat from one mobile-first workspace.',
        },
        {
          title: 'Manager view',
          body: 'Managers can review members, proposals, contributions, records, chat, and community operations from the admin dashboard.',
        },
      ],
    },
    zh: {
      eyebrow: 'Demo',
      title: '从成员和管理端体验有份儿',
      description:
        '进入演示空间，查看成员端、管理端、可信记录、聊天和贡献提交流程。',
      primaryAction: { href: '/member/demo', label: '打开成员端 Demo' },
      secondaryAction: { href: '/admin', label: '打开管理端 Demo' },
      sections: [
        {
          title: '成员端',
          body: '成员可以提交贡献、参加活动、查看自己的记录，并在移动优先的工作台里跟进社群聊天。',
        },
        {
          title: '管理端',
          body: '管理者可以在后台查看成员、提案、贡献、可信记录、聊天和社群运营。',
        },
      ],
    },
  },
  create: {
    en: {
      eyebrow: 'Create',
      title: 'Start a contribution-driven community',
      description:
        'Create a YouFen workspace for a community where contribution evidence, voice power, and decision records stay connected.',
      primaryAction: { href: '/admin', label: 'Create account' },
      secondaryAction: { href: '/admin/management', label: 'Preview setup tools' },
      sections: [
        {
          title: 'Define how contribution becomes voice',
          body: 'Set the activities, proof standards, and approval rules that determine how members earn voice power.',
        },
        {
          title: 'Operate with records',
          body: 'Every approved contribution and decision can be presented as a transparent record for the whole community.',
        },
      ],
    },
    zh: {
      eyebrow: '创建社群',
      title: '创建一个由贡献驱动的社群',
      description:
        '用有份儿搭建社群空间，把贡献凭证、发言权和决策记录连在一起。',
      primaryAction: { href: '/admin', label: '创建账号' },
      secondaryAction: { href: '/admin/management', label: '预览配置工具' },
      sections: [
        {
          title: '定义贡献如何转化为发言权',
          body: '设置活动、凭证标准和审核规则，让成员的贡献可以被认可并转化为发言权。',
        },
        {
          title: '用记录运营',
          body: '每一次被认可的贡献和决策，都可以成为社群成员能够查看的透明记录。',
        },
      ],
    },
  },
  bip: {
    en: {
      eyebrow: 'Build in Public',
      title: 'Follow the records behind the product',
      description:
        'YouFen is built around visible contribution and governance records. The public records explorer shows how those records can be inspected.',
      primaryAction: { href: '/records', label: 'Open records explorer' },
      secondaryAction: {
        href: 'https://github.com/Simon-Snow/YouFen',
        label: 'View GitHub',
        external: true,
      },
      sections: [
        {
          title: 'Transparent progress',
          body: 'The product model favors visible evidence, repeatable review, and community-facing outcomes.',
        },
        {
          title: 'Inspectable provenance',
          body: 'Trusted records make it possible to verify what happened without exposing private member data.',
        },
      ],
    },
    zh: {
      eyebrow: 'Build in Public',
      title: '查看产品背后的公开记录',
      description:
        '有份儿围绕可见的贡献和治理记录构建。公开记录浏览器展示这些记录如何被检查。',
      primaryAction: { href: '/records', label: '打开记录浏览器' },
      secondaryAction: {
        href: 'https://github.com/Simon-Snow/YouFen',
        label: '查看 GitHub',
        external: true,
      },
      sections: [
        {
          title: '透明进展',
          body: '产品模型强调可见凭证、可复核审核和面向社群的结果。',
        },
        {
          title: '可检查来源',
          body: '可信记录让外部可以验证发生过什么，同时不暴露成员隐私数据。',
        },
      ],
    },
  },
  docs: {
    en: {
      eyebrow: 'Docs',
      title: 'YouFen operating notes',
      description:
        'Use these notes as a quick guide to the current demo surface and the contribution-to-governance model.',
      primaryAction: { href: '/demo', label: 'Open demo' },
      secondaryAction: { href: '/records', label: 'Inspect records' },
      sections: [
        {
          title: 'Contribution intake',
          body: 'Members submit contribution evidence. Managers review, approve, and convert accepted work into community voice power.',
        },
        {
          title: 'Governance trail',
          body: 'Proposals, votes, records, and public receipts create a visible path from contribution to decision.',
        },
      ],
    },
    zh: {
      eyebrow: '文档',
      title: '有份儿操作说明',
      description:
        '这里是当前演示界面和“贡献到治理”模型的简要说明。',
      primaryAction: { href: '/demo', label: '打开 Demo' },
      secondaryAction: { href: '/records', label: '查看记录' },
      sections: [
        {
          title: '贡献提交',
          body: '成员提交贡献凭证；管理者审核、认可，并把被接受的贡献转化为社群发言权。',
        },
        {
          title: '治理轨迹',
          body: '提案、投票、记录和公开凭证，让贡献到决策的路径可以被看见。',
        },
      ],
    },
  },
  about: {
    en: {
      eyebrow: 'About',
      title: 'A governance layer for real communities',
      description:
        'YouFen helps communities recognize work, assign voice power, and make decisions with transparent records.',
      primaryAction: { href: '/demo', label: 'Explore demo' },
      sections: [
        {
          title: 'Built for participation',
          body: 'The product starts from the member experience: what did someone do, how was it reviewed, and how does it affect their voice?',
        },
        {
          title: 'Built for operators',
          body: 'Managers get the review, record, and communication tools needed to run the system repeatedly.',
        },
      ],
    },
    zh: {
      eyebrow: '关于',
      title: '面向真实社群的治理层',
      description:
        '有份儿帮助社群认可成员贡献、分配发言权，并用透明记录完成决策。',
      primaryAction: { href: '/demo', label: '查看 Demo' },
      sections: [
        {
          title: '为参与者而建',
          body: '产品从成员体验出发：一个人做了什么，如何被审核，以及如何影响他的发言权。',
        },
        {
          title: '为运营者而建',
          body: '管理者获得审核、记录和沟通工具，可以反复运行整套机制。',
        },
      ],
    },
  },
  privacy: {
    en: {
      eyebrow: 'Privacy',
      title: 'Privacy principles',
      description:
        'The demo keeps private member data out of public records and focuses public visibility on proofs, fingerprints, and outcomes.',
      primaryAction: { href: '/', label: 'Back home' },
      sections: [
        {
          title: 'Public does not mean personal',
          body: 'Public records should prove that an event happened without exposing unnecessary names, emails, or private details.',
        },
        {
          title: 'Evidence stays contextual',
          body: 'Contribution evidence is reviewed in context by managers before it becomes part of the community record.',
        },
      ],
    },
    zh: {
      eyebrow: '隐私',
      title: '隐私原则',
      description:
        '演示版本避免把成员隐私数据放入公开记录，公开可见的重点是凭证、指纹和结果。',
      primaryAction: { href: '/', label: '返回首页' },
      sections: [
        {
          title: '公开不等于暴露个人信息',
          body: '公开记录应该证明事情发生过，而不是暴露不必要的姓名、邮箱或私密细节。',
        },
        {
          title: '凭证需要上下文',
          body: '贡献凭证需要由管理者结合上下文审核，再成为社群记录的一部分。',
        },
      ],
    },
  },
  terms: {
    en: {
      eyebrow: 'Terms',
      title: 'Demo terms',
      description:
        'This prototype is for product exploration. Demo records, votes, and balances are illustrative unless explicitly connected to production infrastructure.',
      primaryAction: { href: '/', label: 'Back home' },
      sections: [
        {
          title: 'Prototype surface',
          body: 'The current app demonstrates workflows and UI states while backend protocol work continues on the integration branch.',
        },
        {
          title: 'No production guarantee',
          body: 'Do not treat demo balances, records, or permissions as production commitments.',
        },
      ],
    },
    zh: {
      eyebrow: '条款',
      title: '演示条款',
      description:
        '当前原型用于产品探索。除非明确接入生产基础设施，演示记录、投票和余额都只用于说明。',
      primaryAction: { href: '/', label: '返回首页' },
      sections: [
        {
          title: '原型界面',
          body: '当前应用展示工作流和界面状态，后端协议工作仍在 integration 分支推进。',
        },
        {
          title: '非生产承诺',
          body: '不要把演示余额、记录或权限视为生产环境承诺。',
        },
      ],
    },
  },
}

const featureContent: MarketingPageMap = {
  ai: {
    en: {
      eyebrow: 'Feature',
      title: 'AI-assisted contribution rules',
      description:
        'Use AI to turn messy community activity into reviewable contribution categories, evidence requirements, and decision rules.',
      primaryAction: { href: '/demo', label: 'See it in the demo' },
      sections: [
        {
          title: 'Rule drafts',
          body: 'Operators can start with AI-generated rule drafts, then refine them into community-specific contribution standards.',
        },
        {
          title: 'Review support',
          body: 'AI helps reviewers summarize evidence and apply rules consistently without replacing human approval.',
        },
      ],
    },
    zh: {
      eyebrow: '功能',
      title: 'AI 辅助贡献规则',
      description:
        '用 AI 把复杂社群活动转化为可审核的贡献分类、凭证要求和决策规则。',
      primaryAction: { href: '/demo', label: '在 Demo 中查看' },
      sections: [
        {
          title: '规则草稿',
          body: '运营者可以从 AI 生成的规则草稿开始，再调整成适合自己社群的贡献标准。',
        },
        {
          title: '审核辅助',
          body: 'AI 帮助审核者总结凭证并一致地应用规则，但不取代人的最终审批。',
        },
      ],
    },
  },
  'voting-power': {
    en: {
      eyebrow: 'Feature',
      title: 'Contribution-weighted voice power',
      description:
        'Members earn influence through accepted work, so the people building the community can help steer it.',
      primaryAction: { href: '/member/demo/me', label: 'View member record' },
      sections: [
        {
          title: 'Earned influence',
          body: 'Voice power is tied to contribution history instead of static status alone.',
        },
        {
          title: 'Visible balances',
          body: 'Members can inspect active, pending, and historical voice power from their profile.',
        },
      ],
    },
    zh: {
      eyebrow: '功能',
      title: '由贡献加权的发言权',
      description:
        '成员通过被认可的工作获得影响力，让真正建设社群的人参与方向决策。',
      primaryAction: { href: '/member/demo/me', label: '查看成员记录' },
      sections: [
        {
          title: '赢得影响力',
          body: '发言权来自贡献历史，而不只是固定身份。',
        },
        {
          title: '可见余额',
          body: '成员可以在个人页查看当前、待确认和历史发言权。',
        },
      ],
    },
  },
  voting: {
    en: {
      eyebrow: 'Feature',
      title: 'Governance voting',
      description:
        'Run proposals where voting weight can reflect community contribution, then preserve the outcome as a record.',
      primaryAction: { href: '/member/demo/vote', label: 'Preview voting' },
      sections: [
        {
          title: 'Proposal context',
          body: 'Members see the proposal, timing, voting power, and trusted record status in one place.',
        },
        {
          title: 'Outcome trail',
          body: 'Voting outcomes can connect back to the records and rule versions that shaped eligibility.',
        },
      ],
    },
    zh: {
      eyebrow: '功能',
      title: '治理投票',
      description:
        '发起提案，让投票权重反映社群贡献，并把结果保存为记录。',
      primaryAction: { href: '/member/demo/vote', label: '预览投票' },
      sections: [
        {
          title: '提案上下文',
          body: '成员可以在同一页面查看提案、时间、发言权和可信记录状态。',
        },
        {
          title: '结果轨迹',
          body: '投票结果可以关联到决定资格的记录和规则版本。',
        },
      ],
    },
  },
  contribution: {
    en: {
      eyebrow: 'Feature',
      title: 'Contribution submission',
      description:
        'Members can submit proof, describe work, and track pending or approved contributions.',
      primaryAction: { href: '/member/demo/contribute', label: 'Submit a demo contribution' },
      sections: [
        {
          title: 'Evidence-first',
          body: 'Each contribution can include a description, category, proof link, and supporting file name.',
        },
        {
          title: 'Member feedback',
          body: 'Submitted demo contributions appear back on the member profile as pending review.',
        },
      ],
    },
    zh: {
      eyebrow: '功能',
      title: '贡献提交',
      description:
        '成员可以提交凭证、描述工作，并跟踪待审核或已认可的贡献。',
      primaryAction: { href: '/member/demo/contribute', label: '提交演示贡献' },
      sections: [
        {
          title: '凭证优先',
          body: '每条贡献都可以包含描述、分类、证明链接和支持文件名。',
        },
        {
          title: '成员反馈',
          body: '提交后的演示贡献会回到成员个人页，并显示为待审核。',
        },
      ],
    },
  },
}

const resourceContent: MarketingPageMap = {
  'best-practices': {
    en: {
      eyebrow: 'Resource',
      title: 'Community governance best practices',
      description:
        'Start with contribution rules that are specific, evidence-based, and easy for members to understand.',
      primaryAction: { href: '/docs', label: 'Read docs' },
      sections: [
        {
          title: 'Keep rules inspectable',
          body: 'A good rule explains what counts, what proof is needed, who reviews it, and how much voice power it earns.',
        },
        {
          title: 'Review repeatedly',
          body: 'Treat contribution review as an operating cadence, not a one-off admin task.',
        },
      ],
    },
    zh: {
      eyebrow: '资源',
      title: '社群治理最佳实践',
      description:
        '从具体、基于凭证、成员容易理解的贡献规则开始。',
      primaryAction: { href: '/docs', label: '阅读文档' },
      sections: [
        {
          title: '让规则可检查',
          body: '好的规则会说明什么算贡献、需要什么凭证、由谁审核、能获得多少发言权。',
        },
        {
          title: '持续审核',
          body: '把贡献审核当作运营节奏，而不是一次性的后台任务。',
        },
      ],
    },
  },
  videos: {
    en: {
      eyebrow: 'Resource',
      title: 'Video walkthroughs',
      description:
        'Video walkthroughs are planned. For now, use the live demo pages to explore the product flows interactively.',
      primaryAction: { href: '/demo', label: 'Open demo' },
      sections: [
        {
          title: 'Member walkthrough',
          body: 'Preview member contribution, event, chat, and public record flows in the demo workspace.',
        },
        {
          title: 'Manager walkthrough',
          body: 'Use the admin dashboard to inspect review and operations workflows.',
        },
      ],
    },
    zh: {
      eyebrow: '资源',
      title: '视频演示',
      description:
        '视频演示正在规划中。现在可以先通过在线 Demo 交互式查看产品流程。',
      primaryAction: { href: '/demo', label: '打开 Demo' },
      sections: [
        {
          title: '成员端演示',
          body: '在演示空间中预览成员贡献、活动、聊天和公开记录流程。',
        },
        {
          title: '管理端演示',
          body: '使用管理后台查看审核和运营工作流。',
        },
      ],
    },
  },
  api: {
    en: {
      eyebrow: 'Resource',
      title: 'API and protocol surface',
      description:
        'The integration branch includes API and protocol work for contribution review, records, token ledgers, and chain actions.',
      primaryAction: { href: '/records', label: 'Inspect public records' },
      sections: [
        {
          title: 'Contribution APIs',
          body: 'Contribution endpoints support intake, analysis, approval, rejection, and minting workflows.',
        },
        {
          title: 'Record APIs',
          body: 'Public record endpoints support submission, verification, retry, and inspection flows.',
        },
      ],
    },
    zh: {
      eyebrow: '资源',
      title: 'API 与协议界面',
      description:
        'integration 分支包含贡献审核、记录、token 账本和链上动作相关的 API 与协议工作。',
      primaryAction: { href: '/records', label: '查看公开记录' },
      sections: [
        {
          title: '贡献 API',
          body: '贡献端点支持提交、分析、批准、拒绝和铸造流程。',
        },
        {
          title: '记录 API',
          body: '公开记录端点支持提交、验证、重试和检查流程。',
        },
      ],
    },
  },
}

export function normalizeLocale(locale: string): Locale {
  return locale === 'en' ? 'en' : 'zh'
}

export function getMarketingPage(locale: string, page: string) {
  return pageContent[page]?.[normalizeLocale(locale)]
}

export function getFeaturePage(locale: string, feature: string) {
  return featureContent[feature]?.[normalizeLocale(locale)]
}

export function getResourcePage(locale: string, resource: string) {
  return resourceContent[resource]?.[normalizeLocale(locale)]
}

export const marketingPageSlugs = Object.keys(pageContent)
export const featurePageSlugs = Object.keys(featureContent)
export const resourcePageSlugs = Object.keys(resourceContent)
