import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  integrations: [tailwind()],
  output: 'static',
  site: 'https://lixiaming01027592891-crypto.github.io',
  base: '/',
  trailingSlash: 'always',
});
