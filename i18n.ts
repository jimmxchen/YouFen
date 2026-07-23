import { getRequestConfig } from 'next-intl/server';

// 支持的语言列表
export const locales = ['zh', 'en'] as const;
export type Locale = (typeof locales)[number];

// 默认语言
export const defaultLocale: Locale = 'zh';

export default getRequestConfig(async ({ locale }) => {
  // 如果 locale 未定义，使用默认语言
  const validLocale = locale || defaultLocale;

  console.log('i18n.ts - Received locale:', locale, 'Using:', validLocale);

  return {
    locale: validLocale,
    messages: (await import(`./messages/${validLocale}.json`)).default
  };
});
