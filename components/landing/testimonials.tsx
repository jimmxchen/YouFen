"use client"

import { useTranslations } from 'next-intl'
import { Marquee } from "@/registry/magicui/marquee"

const testimonialsData = [
  {
    id: "1",
    name: "张伟",
    handle: "@zhangwei_dev",
    avatar: "https://avatar.vercel.sh/zhangwei",
    content: "有份真的解决了我们社群的痛点！成员的贡献终于能被量化，大家参与的积极性明显提高了 🎉",
  },
  {
    id: "2",
    name: "李明",
    handle: "@liming_community",
    avatar: "https://avatar.vercel.sh/liming",
    content: "无代码就能搞定社群治理，这个产品太适合我们这种非技术背景的社群组织者了！AI生成规则功能超好用 👍",
  },
  {
    id: "3",
    name: "王芳",
    handle: "@wangfang_dao",
    avatar: "https://avatar.vercel.sh/wangfang",
    content: "投票系统特别透明，按贡献加权的机制很公平。我们社群用了两周，成员满意度大幅提升！",
  },
  {
    id: "4",
    name: "陈晨",
    handle: "@chenchen_web3",
    avatar: "https://avatar.vercel.sh/chenchen",
    content: "时间线功能让社群历史一目了然，新成员能快速了解社群发展脉络。产品体验很棒！",
  },
  {
    id: "5",
    name: "刘洋",
    handle: "@liuyang_nft",
    avatar: "https://avatar.vercel.sh/liuyang",
    content: "有份的AI推荐功能真的很智能，能根据成员的历史贡献推荐合适的任务，提高了参与效率。",
  },
  {
    id: "6",
    name: "赵静",
    handle: "@zhaojing_design",
    avatar: "https://avatar.vercel.sh/zhaojing",
    content: "界面设计简洁优雅，用户体验非常流畅。作为设计师，我很欣赏这种注重细节的产品！",
  },
  {
    id: "7",
    name: "孙浩",
    handle: "@sunhao_tech",
    avatar: "https://avatar.vercel.sh/sunhao",
    content: "发言权管理让社群更加民主，每个人都有话语权。贡献越多，影响力越大，这很合理！",
  },
  {
    id: "8",
    name: "周琳",
    handle: "@zhoulin_dao",
    avatar: "https://avatar.vercel.sh/zhoulin",
    content: "社群成员参与度明显提高了，大家都很积极。任务分配也变得更加高效了 💪",
  },
  {
    id: "9",
    name: "吴强",
    handle: "@wuqiang_web3",
    avatar: "https://avatar.vercel.sh/wuqiang",
    content: "投票结果公开透明，增强了成员之间的信任。这是我用过最好的社群治理工具！",
  },
  {
    id: "10",
    name: "郑雪",
    handle: "@zhengxue_crypto",
    avatar: "https://avatar.vercel.sh/zhengxue",
    content: "从零开始搭建社群治理体系，有份让这一切变得简单。强烈推荐！✨",
  },
  {
    id: "11",
    name: "马超",
    handle: "@machao_builder",
    avatar: "https://avatar.vercel.sh/machao",
    content: "真的很棒！",
  },
  {
    id: "12",
    name: "林静",
    handle: "@linjing_dao",
    avatar: "https://avatar.vercel.sh/linjing",
    content: "我们社群使用有份后，成员之间的协作效率提升了至少30%。任务分配更加合理，每个人都能发挥自己的长处。特别是AI推荐系统，真的很智能！",
  },
]

const col1 = testimonialsData.filter((_, i) => i % 5 === 0)
const col2 = testimonialsData.filter((_, i) => i % 5 === 1)
const col3 = testimonialsData.filter((_, i) => i % 5 === 2)
const col4 = testimonialsData.filter((_, i) => i % 5 === 3)
const col5 = testimonialsData.filter((_, i) => i % 5 === 4)

function Card({ item }: { item: (typeof testimonialsData)[0] }) {
  return (
    <div className="mb-3 rounded-2xl bg-white p-5 border border-gray-100 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <img src={item.avatar} alt={item.name} className="size-10 rounded-full" />
        <div>
          <div className="font-bold text-[15px] text-[#0F1419]">{item.name}</div>
          <div className="text-[14px] text-[#536471]">{item.handle}</div>
        </div>
      </div>
      <p className="text-[15px] leading-relaxed text-[#0F1419]">{item.content}</p>
    </div>
  )
}

export function Testimonials() {
  const t = useTranslations('testimonials')

  return (
    <section className="relative w-full py-24 overflow-hidden bg-white">
      <div className="max-w-7xl mx-auto mb-14 px-6">
        <h2 className="text-4xl font-bold text-center mb-4 text-black">{t('title')}</h2>
        <p className="text-center text-gray-500 text-lg">{t('subtitle')}</p>
      </div>

      <div className="relative flex h-[580px] w-full flex-row items-start justify-center overflow-hidden px-2">
        <Marquee pauseOnHover vertical repeat={5} className="[--duration:28s]">
          {col1.map((item) => <Card key={item.id} item={item} />)}
        </Marquee>

        <Marquee reverse pauseOnHover vertical repeat={5} className="[--duration:24s]">
          {col2.map((item) => <Card key={item.id} item={item} />)}
        </Marquee>

        <Marquee pauseOnHover vertical repeat={5} className="[--duration:26s]">
          {col3.map((item) => <Card key={item.id} item={item} />)}
        </Marquee>

        <Marquee reverse pauseOnHover vertical repeat={5} className="[--duration:22s] hidden md:flex">
          {col4.map((item) => <Card key={item.id} item={item} />)}
        </Marquee>

        <Marquee pauseOnHover vertical repeat={5} className="[--duration:25s] hidden lg:flex">
          {col5.map((item) => <Card key={item.id} item={item} />)}
        </Marquee>

        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white via-white/80 to-transparent z-10" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-white via-white/80 to-transparent z-10" />
        <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-white via-white/60 to-transparent z-10" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-white via-white/60 to-transparent z-10" />
      </div>
    </section>
  )
}
