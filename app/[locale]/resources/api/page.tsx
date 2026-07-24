'use client'

import { useLocale } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { ArrowRight, Terminal, Key, Webhook, Shield, GitBranch, Database, FileJson } from 'lucide-react'

export default function ApiPage() {
  const locale = useLocale()
  const isZh = locale === 'zh'

  const endpoints = [
    {
      method: 'GET',
      methodColor: 'text-emerald-600 bg-emerald-50',
      path: '/v1/communities/{id}',
      desc: isZh ? '获取社群基本信息、成员数和发言权分布' : 'Get community info, member count, and power distribution',
    },
    {
      method: 'GET',
      methodColor: 'text-emerald-600 bg-emerald-50',
      path: '/v1/communities/{id}/members',
      desc: isZh ? '获取社群成员列表，支持按角色和发言权范围筛选' : 'List community members, filterable by role and voting power range',
    },
    {
      method: 'POST',
      methodColor: 'text-blue-600 bg-blue-50',
      path: '/v1/contributions',
      desc: isZh ? '提交一条贡献记录，附带类型、描述和证据链接' : 'Submit a contribution record with type, description, and evidence links',
    },
    {
      method: 'GET',
      methodColor: 'text-emerald-600 bg-emerald-50',
      path: '/v1/contributions/{id}',
      desc: isZh ? '查询贡献详情，包含 AI 分析结果和审核状态' : 'Query contribution details including AI analysis and review status',
    },
    {
      method: 'POST',
      methodColor: 'text-blue-600 bg-blue-50',
      path: '/v1/proposals',
      desc: isZh ? '创建提案，指定投票模式、选项和截止时间' : 'Create a proposal with voting mode, options, and deadline',
    },
    {
      method: 'POST',
      methodColor: 'text-blue-600 bg-blue-50',
      path: '/v1/proposals/{id}/vote',
      desc: isZh ? '对指定提案投票，需提供成员身份和选项' : 'Cast a vote on a proposal with member identity and option choice',
    },
    {
      method: 'GET',
      methodColor: 'text-emerald-600 bg-emerald-50',
      path: '/v1/proposals/{id}/results',
      desc: isZh ? '获取投票实时结果，含各选项票数和百分比' : 'Get real-time vote results with counts and percentages per option',
    },
    {
      method: 'POST',
      methodColor: 'text-blue-600 bg-blue-50',
      path: '/v1/records',
      desc: isZh ? '为已结束的投票生成链上可信记录' : 'Generate an on-chain trusted record for a concluded vote',
    },
    {
      method: 'GET',
      methodColor: 'text-emerald-600 bg-emerald-50',
      path: '/v1/records/{id}/verify',
      desc: isZh ? '验证链上记录完整性，返回验证状态和区块信息' : 'Verify on-chain record integrity, returns verification status and block info',
    },
  ]

  const codeExample = `// ${isZh ? '提交贡献记录' : 'Submit a contribution'}
const res = await fetch('https://api.youfen.io/v1/contributions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer yf_sk_xxxxxxxxxxxx',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    community_id: 'comm_3k2j1h',
    member_id: 'mem_9a8b7c',
    type: 'code',
    description: '${isZh ? '修复了登录页面的 CSRF 漏洞' : 'Fixed CSRF vulnerability on login page'}',
    evidence_url: 'https://github.com/org/repo/pull/142',
    metadata: { lines_changed: 87, files_touched: 3 },
  }),
})

const data = await res.json()
// { id: "ctb_...", ai_score: 0.92, suggested_vp: 2.4, status: "pending_review" }`

  const webhooks = [
    {
      event: 'contribution.created',
      desc: isZh ? '成员提交新贡献时触发' : 'Fires when a member submits a new contribution',
    },
    {
      event: 'contribution.reviewed',
      desc: isZh ? '管理者审核通过或拒绝贡献时触发' : 'Fires when a manager approves or rejects a contribution',
    },
    {
      event: 'proposal.created',
      desc: isZh ? '新提案创建时触发' : 'Fires when a new proposal is created',
    },
    {
      event: 'proposal.voted',
      desc: isZh ? '任意成员投票后触发（匿名模式下不含投票内容）' : 'Fires after any member votes (excludes vote content in anonymous mode)',
    },
    {
      event: 'proposal.closed',
      desc: isZh ? '提案截止并生成最终结果时触发' : 'Fires when a proposal closes and final results are generated',
    },
    {
      event: 'record.generated',
      desc: isZh ? '可信记录成功上链后触发，附带交易哈希' : 'Fires when a trusted record is committed on-chain, includes tx hash',
    },
  ]

  return (
    <main className="min-h-screen bg-white">
      <Navbar forceLight />

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 text-sm text-[#939597] mb-8">
            <Link href="/" className="hover:text-[#131517] transition-colors">{isZh ? '首页' : 'Home'}</Link>
            <span>/</span>
            <span className="text-[#939597]">{isZh ? '资源' : 'Resources'}</span>
            <span>/</span>
            <span className="text-[#131517]">API</span>
          </div>
          <h1 className="text-[48px] font-semibold text-[#131517] leading-[1.08] tracking-[-0.03em] mb-6">
            API {isZh ? '文档' : 'Reference'}
          </h1>
          <p className="text-xl text-[#525252] max-w-2xl leading-relaxed">
            {isZh
              ? '通过 REST API 将有份的治理能力嵌入到你的产品中。完整的端点覆盖、一致的认证机制、实时 Webhook 推送。'
              : 'Embed YouFen governance capabilities into your product via REST API. Full endpoint coverage, consistent auth, real-time webhook delivery.'}
          </p>
        </div>
      </section>

      {/* Authentication */}
      <section className="py-16 px-6 bg-[#fafafa]">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start gap-6">
            <div className="shrink-0 size-12 rounded-xl bg-[#131517] flex items-center justify-center">
              <Key className="size-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-[#131517] mb-3">
                {isZh ? '认证' : 'Authentication'}
              </h2>
              <p className="text-sm text-[#525252] leading-relaxed mb-4 max-w-xl">
                {isZh
                  ? '所有 API 请求需在 Header 中携带 API Key。Key 按社群进行范围隔离——一个 Key 只能访问指定社群的数据。你可以在社群管理面板的「设置 → API Keys」中生成和吊销 Key。'
                  : 'All API requests require an API Key in the header. Keys are scoped to communities — one key only accesses data for its designated community. Generate and revoke keys from your community admin panel under "Settings → API Keys."'}
              </p>
              <div className="bg-[#131517] rounded-xl p-4 overflow-x-auto">
                <pre className="text-xs text-emerald-400 font-mono">
{`Authorization: Bearer yf_sk_xxxxxxxxxxxx`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Endpoints */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-[#131517] mb-4">
            {isZh ? '核心端点' : 'Core endpoints'}
          </h2>
          <p className="text-[#939597] mb-8 max-w-xl">
            {isZh
              ? 'RESTful 设计，JSON 响应。基础域名：https://api.youfen.io'
              : 'RESTful design, JSON responses. Base URL: https://api.youfen.io'}
          </p>
          <div className="space-y-2">
            {endpoints.map((ep, i) => (
              <div key={i} className="flex items-center gap-4 py-3 px-4 rounded-xl hover:bg-[#f8f8f8] transition-colors border border-transparent hover:border-gray-100">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${ep.methodColor} shrink-0 w-12 text-center`}>
                  {ep.method}
                </span>
                <code className="text-sm text-[#131517] font-mono shrink-0 w-64">{ep.path}</code>
                <span className="text-xs text-[#939597]">{ep.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Code example */}
      <section className="py-16 px-6 bg-[#131517]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-sm font-semibold text-white/40 uppercase tracking-widest mb-6">
            {isZh ? '代码示例' : 'Code example'}
          </h2>
          <pre className="text-sm text-emerald-400 font-mono leading-relaxed whitespace-pre-wrap bg-white/5 rounded-xl p-6 border border-white/10 overflow-x-auto">
            {codeExample}
          </pre>
        </div>
      </section>

      {/* Webhooks */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-[#131517] mb-4">
            {isZh ? 'Webhook 事件' : 'Webhook events'}
          </h2>
          <p className="text-[#939597] mb-8 max-w-xl">
            {isZh
              ? '在社群设置中配置回调 URL，实时接收治理事件推送。每个事件附带完整 payload 和 HMAC 签名用于验证。'
              : 'Configure a callback URL in community settings to receive real-time governance events. Each event includes a full payload and HMAC signature for verification.'}
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            {webhooks.map((w, i) => (
              <div key={i} className="bg-white rounded-xl p-4 border border-gray-100">
                <code className="text-xs font-mono text-[#131517] font-semibold">{w.event}</code>
                <p className="text-xs text-[#939597] mt-1">{w.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Rate limits */}
      <section className="py-16 px-6 bg-[#fafafa]">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start gap-6">
            <div className="shrink-0 size-12 rounded-xl bg-[#131517] flex items-center justify-center">
              <Shield className="size-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-[#131517] mb-3">
                {isZh ? '频率限制与安全' : 'Rate limits & security'}
              </h2>
              <div className="grid md:grid-cols-3 gap-4 mb-4">
                {[
                  { label: isZh ? '频率上限' : 'Rate limit', value: isZh ? '1000 次/分钟/Key' : '1000 req/min/key' },
                  { label: isZh ? '传输加密' : 'Encryption', value: 'HTTPS / TLS 1.3' },
                  { label: isZh ? 'Key 隔离' : 'Key scoping', value: isZh ? '单社群绑定' : 'Per-community' },
                ].map((item, i) => (
                  <div key={i} className="bg-white rounded-xl p-4 border border-gray-100">
                    <div className="text-xs text-[#939597] mb-1">{item.label}</div>
                    <div className="text-sm font-semibold text-[#131517]">{item.value}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-[#939597] leading-relaxed max-w-xl">
                {isZh
                  ? '超出频率限制的请求返回 429 状态码，携带 Retry-After 头。IP 层面的滥用检测会自动触发临时封禁。完整的速率限制策略和状态码说明请查阅详细文档。'
                  : 'Requests exceeding the rate limit return a 429 status code with a Retry-After header. IP-level abuse detection triggers temporary blocks automatically. See the full docs for complete rate limiting policies and status codes.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-[#f8f8f8] rounded-2xl p-12 border border-gray-100">
            <Terminal className="size-8 text-[#131517] mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-[#131517] mb-3">
              {isZh ? '开始构建集成' : 'Start building integrations'}
            </h2>
            <p className="text-[#939597] mb-8 max-w-md mx-auto">
              {isZh ? '创建一个社群，在设置页面获取你的第一个 API Key。' : 'Create a community and get your first API Key from the settings page.'}
            </p>
            <Link
              href="/sign-in"
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-[#131517] text-white rounded-full text-sm font-medium hover:bg-black transition-colors"
            >
              {isZh ? '免费开始' : 'Get started free'}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
