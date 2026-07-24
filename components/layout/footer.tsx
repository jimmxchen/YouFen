import Link from 'next/link'

export function Footer() {
  return (
    <footer className="relative border-t border-gray-200 bg-white py-12 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* 品牌信息 */}
          <div className="col-span-1 md:col-span-2">
            <div className="text-xl font-semibold text-gray-900 mb-3">
              有份儿 YouFen
            </div>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">
              无代码社群共治网站，让每个参与者真正有份儿。
            </p>
            <div className="flex items-center space-x-2 text-xs text-gray-500">
              <span>Powered by</span>
              <span className="font-semibold text-emerald-600">Injective</span>
              <span>×</span>
              <span className="font-semibold text-blue-600">AI</span>
            </div>
          </div>

          {/* 产品链接 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-4">产品</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/create" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  创建社群
                </Link>
              </li>
              <li>
                <Link href="/demo" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  查看 Demo
                </Link>
              </li>
              <li>
                <Link href="/docs" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  使用文档
                </Link>
              </li>
            </ul>
          </div>

          {/* 关于链接 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-4">关于</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/bip" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  Build in Public
                </Link>
              </li>
              <li>
                <Link href="/about" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  关于我们
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/youfen"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* 底部版权 */}
        <div className="pt-8 border-t border-gray-200">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <p className="text-xs text-gray-500">
              © 2026 YouFen. All rights reserved.
            </p>
            <div className="flex items-center space-x-6">
              <Link href="/privacy" className="text-xs text-gray-500 hover:text-gray-900 transition-colors">
                隐私政策
              </Link>
              <Link href="/terms" className="text-xs text-gray-500 hover:text-gray-900 transition-colors">
                使用条款
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
