import { getRequestConfig } from 'next-intl/server';

// 支持的语言列表
export const locales = ['zh', 'en'] as const;
export type Locale = (typeof locales)[number];

// 默认语言
export const defaultLocale: Locale = 'zh';

export default getRequestConfig(async ({ requestLocale }) => {
  // next-intl v4 API：locale 经由 requestLocale（Promise）传入；
  // 旧版 { locale } 参数在 v4 中恒为 undefined，会导致所有语言静默回退 defaultLocale
  const requested = await requestLocale;
  const validLocale: Locale = locales.includes(requested as Locale)
    ? (requested as Locale)
    : defaultLocale;

  return {
    locale: validLocale,
    messages: (await import(`./messages/${validLocale}.json`)).default
  };
});
