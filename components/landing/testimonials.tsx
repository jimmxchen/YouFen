"use client";

import { cn } from "@/lib/utils";

interface TestimonialCardProps {
  avatar: string;
  username: string;
  handle: string;
  verified?: boolean;
  badge?: string;
  title?: string;
  content: string;
  image?: string;
  stats?: {
    comments?: number;
    retweets?: number;
    likes?: number;
    views?: number;
  };
  tweetUrl: string;
}

function VerifiedBadge() {
  return (
    <img
      src="https://framerusercontent.com/images/ChWiKef1FUFW1Dfe0OumqNzfus.png?width=96&height=96"
      alt="Verified Badge"
      className="w-4 h-4 object-contain flex-shrink-0"
    />
  );
}

function ArrowIcon() {
  return (
    <div className="hover-arrow-icon absolute top-5 right-5 w-[18px] h-[18px] z-[5] opacity-0 translate-x-[-4px] translate-y-[4px] transition-all duration-[350ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:opacity-60 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:hover:opacity-100">
      <svg viewBox="0 0 24 24" className="w-full h-full stroke-black stroke-2 fill-none" style={{ strokeLinecap: 'round', strokeLinejoin: 'round' }}>
        <line x1="7" y1="17" x2="17" y2="7"></line>
        <polyline points="7 7 17 7 17 17"></polyline>
      </svg>
    </div>
  );
}

function TestimonialCard({
  avatar,
  username,
  handle,
  verified = true,
  title,
  content,
  image,
  stats,
  tweetUrl,
}: TestimonialCardProps) {
  return (
    <a
      href={tweetUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative w-full flex flex-col justify-center bg-white p-5 box-border rounded-2xl border border-gray-200 overflow-hidden cursor-pointer no-underline select-none transition-all hover:shadow-lg"
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        color: 'rgb(0, 0, 0)',
      }}
    >
      <ArrowIcon />

      <div className="flex flex-col gap-[14px] w-full justify-start">
        {/* User Info */}
        <div className="flex items-center gap-3 w-full mt-0">
          <img
            src={avatar}
            alt={username}
            className="w-[42px] h-[42px] rounded-full object-cover"
          />
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-1 pr-6 max-w-full box-border">
              <span className="font-bold text-[15px] overflow-hidden text-ellipsis whitespace-nowrap flex-shrink text-black">
                {username}
              </span>
              {verified && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <VerifiedBadge />
                </div>
              )}
            </div>
            <span className="text-black opacity-60 text-[14px]">{title || handle}</span>
          </div>
        </div>

        {/* Content */}
        <div className="leading-[1.5] whitespace-pre-wrap break-words text-black relative z-[2] font-normal text-[15px]">
          {content}
        </div>

        {/* Image if exists */}
        {image && (
          <div className="w-full rounded-xl overflow-hidden border border-[rgba(238,238,238,0.6)] mt-[2px] leading-[0]">
            <img
              src={image}
              alt="Media Content"
              className="w-full h-auto max-h-[360px] object-cover block"
            />
          </div>
        )}

        {/* Stats */}
        {stats && (
          <>
            <div className="h-[1px] bg-[rgba(238,238,238,0.4)] my-[2px]"></div>
            <div className="flex flex-wrap gap-6 text-black opacity-60 text-[13.5px]">
              {stats.comments !== undefined && (
                <div className="flex items-center gap-[6px]">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-black stroke-2 fill-none opacity-60 block flex-shrink-0" style={{ strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
                  </svg>
                  <span className="font-bold text-black">{stats.comments}</span>
                </div>
              )}
              {stats.retweets !== undefined && (
                <div className="flex items-center gap-[6px]">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-black stroke-2 fill-none opacity-60 block flex-shrink-0" style={{ strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                    <path d="m17 2 4 4-4 4"></path>
                    <path d="M3 11v-1a4 4 0 0 1 4-4h14"></path>
                    <path d="m7 22-4-4 4-4"></path>
                    <path d="M21 13v1a4 4 0 0 1-4 4H3"></path>
                  </svg>
                  <span className="font-bold text-black">{stats.retweets}</span>
                </div>
              )}
              {stats.likes !== undefined && (
                <div className="flex items-center gap-[6px]">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-black stroke-2 fill-none opacity-60 block flex-shrink-0" style={{ strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path>
                  </svg>
                  <span className="font-bold text-black">{stats.likes}</span>
                </div>
              )}
              {stats.views !== undefined && (
                <div className="flex items-center gap-[6px]">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-black stroke-2 fill-none opacity-60 block flex-shrink-0" style={{ strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                    <path d="M3 3v18h18M18 17V9M13 17V5M8 17v-4"></path>
                  </svg>
                  <span className="font-bold text-black">{stats.views}</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </a>
  );
}

// Testimonial data
const testimonials: TestimonialCardProps[] = [
  {
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Zhang",
    username: "张伟",
    handle: "@zhangwei_dev",
    title: "技术团队负责人",
    content: "有份儿真的解决了我们社群的痛点！成员的贡献终于能被量化，大家参与的积极性明显提高了 🎉",
    tweetUrl: "https://x.com",
    stats: { comments: 15, retweets: 23, likes: 142, views: 5200 }
  },
  {
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Li",
    username: "李明",
    handle: "@liming_community",
    title: "社区运营专家",
    content: "无代码就能搞定社群治理，这个产品太适合我们这种非技术背景的社群组织者了！AI生成规则功能超好用 👍",
    tweetUrl: "https://x.com",
    stats: { comments: 28, retweets: 45, likes: 267, views: 8900 }
  },
  {
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Wang",
    username: "王芳",
    handle: "@wangfang_dao",
    title: "DAO创始人",
    content: "投票系统特别透明，按贡献加权的机制很公平。我们社群用了两周，成员满意度大幅提升！",
    tweetUrl: "https://x.com",
    stats: { comments: 32, retweets: 56, likes: 389, views: 12400 }
  },
  {
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Chen",
    username: "陈晨",
    handle: "@chenchen_web3",
    title: "Web3 开发者",
    content: "时间线功能让社群历史一目了然，新成员能快速了解社群发展脉络。产品体验很棒！",
    tweetUrl: "https://x.com",
    stats: { comments: 19, retweets: 34, likes: 203, views: 6700 }
  },
  {
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Liu",
    username: "刘洋",
    handle: "@liuyang_nft",
    title: "NFT 社区管理员",
    content: "有份儿的AI推荐功能真的很智能，能根据成员的历史贡献推荐合适的任务，提高了参与效率。",
    tweetUrl: "https://x.com",
    stats: { comments: 41, retweets: 67, likes: 445, views: 15800 }
  },
  {
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Zhao",
    username: "赵静",
    handle: "@zhaojing_design",
    title: "产品设计师",
    content: "界面设计简洁优雅，用户体验非常流畅。作为设计师，我很欣赏这种注重细节的产品！",
    tweetUrl: "https://x.com",
    stats: { comments: 22, retweets: 38, likes: 312, views: 9200 }
  },
];

// Main component with masonry layout
export function Testimonials() {
  // Split testimonials into five columns for masonry layout
  const columns = [
    testimonials.filter((_, index) => index % 5 === 0),
    testimonials.filter((_, index) => index % 5 === 1),
    testimonials.filter((_, index) => index % 5 === 2),
    testimonials.filter((_, index) => index % 5 === 3),
    testimonials.filter((_, index) => index % 5 === 4),
  ];

  return (
    <div className="w-full py-20 px-6 bg-gray-100">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-4xl font-bold text-center mb-4 text-black">用户评价</h2>
        <p className="text-center text-gray-600 mb-12">看看用户怎么说</p>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-5">
          {columns.map((columnItems, colIndex) => (
            <div key={`col-${colIndex}`} className="flex flex-col gap-5">
              {columnItems.map((testimonial, index) => (
                <TestimonialCard key={`col${colIndex}-${index}`} {...testimonial} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
