"use client";

import { motion } from "framer-motion";

const testimonials = [
  {
    name: "张小美",
    role: "社区管理员",
    content: "有份儿让社区治理变得简单透明，成员参与度提升了300%",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=1",
    color: "from-blue-50 to-cyan-50"
  },
  {
    name: "李明",
    role: "创作者",
    content: "终于有一个工具能公平记录每个人的贡献，不再需要复杂的投票系统",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=2",
    color: "from-purple-50 to-pink-50"
  },
  {
    name: "王芳",
    role: "活动组织者",
    content: "AI辅助规则生成太智能了，5分钟就能设置好完整的治理框架",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=3",
    color: "from-green-50 to-emerald-50"
  },
  {
    name: "陈浩",
    role: "技术负责人",
    content: "区块链记录让所有决策都可追溯，增强了成员之间的信任",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=4",
    color: "from-orange-50 to-amber-50"
  },
  {
    name: "赵雪",
    role: "内容创作者",
    content: "无需连接钱包就能使用，大大降低了社区成员的参与门槛",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=5",
    color: "from-rose-50 to-red-50"
  },
  {
    name: "刘强",
    role: "产品经理",
    content: "完美的工具！让我们的社区从混乱变得井井有条",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=6",
    color: "from-indigo-50 to-blue-50"
  },
];

export function StaggerTestimonials() {
  return (
    <div className="w-full overflow-hidden py-12">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl font-semibold text-gray-900 mb-4">
            他们都在使用有份儿
          </h2>
          <p className="text-lg text-gray-600">
            来自真实用户的反馈与评价
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                duration: 0.5,
                delay: index * 0.1,
              }}
              whileHover={{ y: -5, transition: { duration: 0.2 } }}
              className={`relative rounded-2xl p-6 bg-gradient-to-br ${testimonial.color} border border-gray-200/50 shadow-sm hover:shadow-md transition-shadow`}
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full overflow-hidden bg-white shadow-sm">
                  <img
                    src={testimonial.avatar}
                    alt={testimonial.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{testimonial.name}</h3>
                  <p className="text-sm text-gray-600">{testimonial.role}</p>
                </div>
              </div>
              <p className="text-gray-700 leading-relaxed">
                "{testimonial.content}"
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
