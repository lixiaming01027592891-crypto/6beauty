import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

const site = process.env.SITE_URL || process.env.CF_PAGES_URL || 'https://6beauty.pages.dev';

export default defineConfig({
  integrations: [
    tailwind(),
    sitemap({
      filter: (page) => !new URL(page).pathname.startsWith('/test'),
    }),
  ],
  output: 'static',
  site,
  base: '/',
  trailingSlash: 'always',
});
