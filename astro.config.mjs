import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

// 正式網域。canonical、og:url 與 sitemap 全部由這裡推導出來，
// 所以這個預設值必須是正式網域——填成 *.pages.dev 會讓正式站
// 對外聲明「正版在預覽網址」，權重全部流失。
const site = process.env.SITE_URL || 'https://no6beauty.net';

export default defineConfig({
  integrations: [
    tailwind(),
    sitemap({
      filter: (page) => {
        const pathname = new URL(page).pathname;
        return !pathname.startsWith('/test') && !pathname.startsWith('/admin');
      },
    }),
  ],
  output: 'static',
  site,
  base: '/',
  trailingSlash: 'always',
});
