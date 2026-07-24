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
  privacy: {
    en: {
      eyebrow: 'Privacy',
      title: 'Privacy Policy',
      description:
        'YouFen values your privacy. This privacy policy explains how we collect, use, and protect your information.',
      primaryAction: { href: '/', label: 'Back home' },
      sections: [
        {
          title: '1. Information We Collect',
          body: 'We collect account information (name, email), community data (contributions, voice power, voting records), usage data (IP address, browser type, access times), and communications you submit through our platform.',
        },
        {
          title: '2. How We Use Your Information',
          body: 'We use your information to provide and improve our community governance services, manage your account and communities, display contribution records within communities, provide context for AI features, and communicate with you about service changes.',
        },
        {
          title: '3. AI Data Processing',
          body: 'Content you input for AI features is sent to our AI service providers solely for generating responses. It is not used to train AI models, and providers will not use your data for model improvement purposes.',
        },
        {
          title: '4. Blockchain Data',
          body: 'When you generate publicly verifiable records, a hash of the relevant data is recorded on the Injective blockchain. On-chain records do not contain personally identifiable information — only community identifiers and data hashes.',
        },
        {
          title: '5. Cookies and Tracking',
          body: 'We use essential cookies to maintain sessions and authentication. We do not currently use third-party tracking cookies or advertising networks.',
        },
        {
          title: '6. Data Sharing',
          body: 'We do not sell your personal information. We may share information as public data on community pages, with AI service providers for processing requests, or as required by law.',
        },
        {
          title: '7. Data Security',
          body: 'We implement reasonable technical and organizational measures to protect your data. However, no internet transmission or electronic storage is 100% secure.',
        },
        {
          title: '8. Data Retention',
          body: 'We retain your personal information for the duration of your account. After deletion, certain data may be retained for backup or legal compliance. Blockchain records cannot be removed.',
        },
        {
          title: '9. Your Rights',
          body: 'You have the right to access, correct, delete, and export your data. To exercise these rights, contact us via GitHub Issues or email.',
        },
        {
          title: '10. Contact Us',
          body: 'If you have questions about this privacy policy, contact us via GitHub Issues at github.com/Simon-Snow/YouFen, or email the project maintainer.',
        },
      ],
    },
    zh: {
      eyebrow: '隐私',
      title: '隐私政策',
      description:
        '有份重视您的隐私。本隐私政策说明了我们如何收集、使用和保护您的信息。',
      primaryAction: { href: '/', label: '返回首页' },
      sections: [
        {
          title: '1. 我们收集的信息',
          body: '我们收集账户信息（姓名、邮箱）、社群数据（贡献、发言权、投票记录）、使用数据（IP 地址、浏览器类型、访问时间）以及您通过平台提交的通信内容。',
        },
        {
          title: '2. 信息的使用方式',
          body: '我们使用您的信息来提供和改进社群治理服务、管理账户和社群、在社群中展示贡献记录、为 AI 功能提供上下文，以及与您就服务变更进行沟通。',
        },
        {
          title: '3. AI 数据处理',
          body: '您输入到 AI 功能中的内容会发送至 AI 服务提供商，仅用于生成回复。不会用于训练 AI 模型，提供商不会将您的数据用于模型改进。',
        },
        {
          title: '4. 区块链数据',
          body: '当您生成公开可信记录时，相关数据的哈希值会被记录在 Injective 区块链上。链上记录不包含个人身份信息，仅包含社群标识符和数据哈希值。',
        },
        {
          title: '5. Cookie 与追踪',
          body: '我们使用必要的 Cookie 来维持会话和身份验证。我们目前不使用第三方追踪 Cookie 或广告网络。',
        },
        {
          title: '6. 数据共享',
          body: '我们不会出售您的个人信息。我们可能在社群公开页面展示公开数据、与 AI 服务提供商共享以处理请求、或在法律要求时共享。',
        },
        {
          title: '7. 数据安全',
          body: '我们采取合理的技术和组织措施保护您的数据。但没有任何互联网传输或电子存储是 100% 安全的。',
        },
        {
          title: '8. 数据保留',
          body: '我们在您账户存续期间保留您的个人信息。账户删除后，部分数据可能为备份或法律合规目的保留。区块链记录无法删除。',
        },
        {
          title: '9. 您的权利',
          body: '您有权访问、更正、删除和导出您的数据。如需行使这些权利，请通过 GitHub Issues 或电子邮件联系我们。',
        },
        {
          title: '10. 联系我们',
          body: '如对本隐私政策有任何疑问，请通过 GitHub Issues 联系我们：github.com/Simon-Snow/YouFen，或发送邮件至项目维护者邮箱。',
        },
      ],
    },
  },
  terms: {
    en: {
      eyebrow: 'Terms',
      title: 'Terms of Service',
      description:
        'Welcome to YouFen. By using our service, you agree to the following terms. Please read them carefully.',
      primaryAction: { href: '/', label: 'Back home' },
      sections: [
        {
          title: '1. Service Description',
          body: 'YouFen is a no-code community governance platform that helps community operators create and manage participation rules, track member contributions, organize voting decisions, and generate publicly verifiable records.',
        },
        {
          title: '2. Accounts and Registration',
          body: 'You must create an account to use our service. You must provide accurate registration information and are responsible for maintaining the security of your account.',
        },
        {
          title: '3. Community Creation and Management',
          body: 'Community operators may customize participation rules, manage members, review contributions, and initiate proposals. Operators are responsible for ensuring community activities comply with applicable laws.',
        },
        {
          title: '4. Voice Power and Contributions',
          body: 'Voice Power is a community-internal participation weight. It does not represent monetary value, financial assets, or tradable rights. It is non-transferable and cannot be exchanged for fiat or cryptocurrency.',
        },
        {
          title: '5. Voting and Decisions',
          body: 'Community voting results are determined by operators and members. Unless an on-chain trusted record is generated, voting data is stored on centralized servers.',
        },
        {
          title: '6. AI Features',
          body: 'AI-generated content is advisory only. The final decision always rests with the user. AI may produce inaccurate results, and you should exercise independent judgment.',
        },
        {
          title: '7. Blockchain Trusted Records',
          body: 'We may generate publicly verifiable records on the Injective blockchain. On-chain records are public and immutable. Once recorded, we cannot delete or modify them.',
        },
        {
          title: '8. Prohibited Conduct',
          body: 'You may not upload illegal content, impersonate others, interfere with our service, attempt unauthorized access, abuse the Voice Power system, or use automated tools for manipulation.',
        },
        {
          title: '9. Intellectual Property',
          body: 'The YouFen name, logo, website code, and design elements are our intellectual property. User-created content belongs to the users, with a license granted to us for service provision.',
        },
        {
          title: '10. Limitation of Liability',
          body: 'The service is provided "as is" without warranties of any kind. We shall not be liable for any direct, indirect, incidental, special, or consequential damages.',
        },
        {
          title: '11. Termination',
          body: 'We reserve the right to suspend or terminate accounts that violate these terms. Data already recorded on-chain cannot be removed.',
        },
        {
          title: '12. Changes to Terms',
          body: 'We may update these terms from time to time. Material changes will be communicated via website notice or email.',
        },
        {
          title: '13. Contact Us',
          body: 'If you have questions about these terms, contact us via GitHub Issues at github.com/Simon-Snow/YouFen, or email the project maintainer.',
        },
      ],
    },
    zh: {
      eyebrow: '条款',
      title: '服务条款',
      description:
        '欢迎使用有份 YouFen。使用我们的服务即表示您同意以下条款。请仔细阅读。',
      primaryAction: { href: '/', label: '返回首页' },
      sections: [
        {
          title: '1. 服务说明',
          body: '有份是一个无代码社群共治平台，帮助社群运营者创建和管理社群参与规则、追踪成员贡献、组织投票决策，并为重要决策生成公开可信记录。',
        },
        {
          title: '2. 账户与注册',
          body: '您需要创建账户才能使用我们的服务。您必须提供准确、完整的注册信息，并对账户安全负责。',
        },
        {
          title: '3. 社群创建与管理',
          body: '社群运营者可自定义参与规则、管理成员、审核贡献和发起投票。运营者有责任确保社群活动合法合规。',
        },
        {
          title: '4. 发言权与贡献',
          body: '发言权是社群内部的参与权重，不代表任何货币价值、金融资产或可交易权利。发言权不可转让、不可兑换为法定货币或加密货币。',
        },
        {
          title: '5. 投票与决策',
          body: '社群投票结果由运营者和成员自行决定。除非生成了链上可信记录，否则投票数据存储在中心化服务器上。',
        },
        {
          title: '6. AI 功能',
          body: 'AI 生成的内容仅为建议，最终决定权始终在用户手中。AI 可能产生不准确的结果，您应在采纳前进行独立判断。',
        },
        {
          title: '7. 区块链可信记录',
          body: '我们可能在 Injective 区块链上生成公开可信记录。链上记录是公开且不可篡改的。一旦记录上链，我们无法删除或修改。',
        },
        {
          title: '8. 禁止行为',
          body: '您不得上传违法内容、冒充他人、干扰服务、未经授权访问系统、滥用发言权系统或使用自动化工具进行操纵。',
        },
        {
          title: '9. 知识产权',
          body: '有份的名称、标识、网站代码和设计元素均为我们的知识产权。用户创建的内容归用户所有，并授予我们提供服务所需的许可。',
        },
        {
          title: '10. 责任限制',
          body: '本服务按"现状"提供，不作任何明示或暗示的保证。我们不对任何直接、间接、附带、特殊或后果性损害承担责任。',
        },
        {
          title: '11. 终止',
          body: '我们保留暂停或终止违反本条款的账户的权利。已上链的数据无法删除。',
        },
        {
          title: '12. 条款变更',
          body: '我们可能不时更新本条款。重大变更将通过网站通知或电子邮件告知。',
        },
        {
          title: '13. 联系我们',
          body: '如对本条款有任何疑问，请通过 GitHub Issues 联系我们：github.com/Simon-Snow/YouFen，或发送邮件至项目维护者邮箱。',
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
        '有份帮助社群认可成员贡献、分配发言权，并用透明记录完成决策。',
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
      title: '有份操作说明',
      description:
        '这里是当前演示界面和"贡献到治理"模型的简要说明。',
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
      title: '从成员和管理端体验有份',
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
}

export function normalizeLocale(locale: string): Locale {
  return locale === 'en' ? 'en' : 'zh'
}

export function getMarketingPage(locale: string, page: string) {
  return pageContent[page]?.[normalizeLocale(locale)]
}

export const marketingPageSlugs = Object.keys(pageContent)
