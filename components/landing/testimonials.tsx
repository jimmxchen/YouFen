"use client"

import { useTranslations } from 'next-intl'
import { Marquee } from "@/registry/magicui/marquee"

interface TestimonialItem {
  name: string
  handle: string
  content: string
}

const AVATARS = [
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&q=80",
  "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=100&q=80",
  "https://images.unsplash.com/photo-1534308143481-c55f00be8bd7?w=100&q=80",
  "https://images.unsplash.com/photo-1529068755536-a5ade0dcb4e8?w=100&q=80",
  "https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=100&q=80",
  "https://images.unsplash.com/photo-1522529599102-193c0d76b5b6?w=100&q=80",
  "https://images.unsplash.com/photo-1464863979621-258859e62245?w=100&q=80",
  "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=100&q=80",
  "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&q=80",
  "https://images.unsplash.com/photo-1543610892-0b1f7e6d8ac1?w=100&q=80",
  "https://images.unsplash.com/photo-1506277886164-e25aa3f4ef7f?w=100&q=80",
  "https://images.unsplash.com/photo-1489980557514-251d61e3eeb6?w=100&q=80",
  "https://images.unsplash.com/photo-1552374196-c4e7ffc6e126?w=100&q=80",
  "https://images.unsplash.com/photo-1509460913899-515f1df34fea?w=100&q=80",
  "https://images.unsplash.com/photo-1499996860823-5214fcc65f8f?w=100&q=80",
  "https://images.unsplash.com/photo-1552053831-71594a27632d?w=100&q=80",
  "https://images.unsplash.com/photo-1474176857210-7287d38d27c6?w=100&q=80",
  "https://images.unsplash.com/photo-1491349174775-aaafddd81942?w=100&q=80",
  "https://images.unsplash.com/photo-1531891437562-4301cf35b7e4?w=100&q=80",
  "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100&q=80",
]

function Card({ item, index }: { item: TestimonialItem; index: number }) {
  const avatar = AVATARS[index % AVATARS.length]
  return (
    <div className="mb-3 rounded-2xl bg-white p-5 border border-gray-100 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <img src={avatar} alt={item.name} className="size-10 rounded-full object-cover" />
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
  const items = t.raw('items') as TestimonialItem[]

  const withIndex = items.map((item, i) => ({ ...item, _idx: i }))

  return (
    <section className="relative w-full py-24 overflow-hidden bg-white">
      <div className="max-w-7xl mx-auto mb-14 px-6">
        <h2 className="text-4xl font-bold text-center mb-4 text-black">{t('title')}</h2>
        <p className="text-center text-gray-500 text-lg">{t('subtitle')}</p>
      </div>

      <div className="relative flex h-[580px] w-full flex-row items-start justify-center overflow-hidden px-2">
        <Marquee pauseOnHover vertical repeat={5} className="[--duration:28s]">
          {withIndex.filter((_, i) => i % 5 === 0).map((item) => <Card key={item._idx} item={item} index={item._idx} />)}
        </Marquee>

        <Marquee reverse pauseOnHover vertical repeat={5} className="[--duration:24s]">
          {withIndex.filter((_, i) => i % 5 === 1).map((item) => <Card key={item._idx} item={item} index={item._idx} />)}
        </Marquee>

        <Marquee pauseOnHover vertical repeat={5} className="[--duration:26s]">
          {withIndex.filter((_, i) => i % 5 === 2).map((item) => <Card key={item._idx} item={item} index={item._idx} />)}
        </Marquee>

        <Marquee reverse pauseOnHover vertical repeat={5} className="[--duration:22s] hidden md:flex">
          {withIndex.filter((_, i) => i % 5 === 3).map((item) => <Card key={item._idx} item={item} index={item._idx} />)}
        </Marquee>

        <Marquee pauseOnHover vertical repeat={5} className="[--duration:25s] hidden lg:flex">
          {withIndex.filter((_, i) => i % 5 === 4).map((item) => <Card key={item._idx} item={item} index={item._idx} />)}
        </Marquee>

        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white via-white/80 to-transparent z-10" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-white via-white/80 to-transparent z-10" />
        <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-white via-white/60 to-transparent z-10" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-white via-white/60 to-transparent z-10" />
      </div>
    </section>
  )
}
