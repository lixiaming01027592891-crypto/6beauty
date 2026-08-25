import { buildPagesASSETSBinding, cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      miniflare: {
        compatibilityDate: '2026-08-20',
        compatibilityFlags: ['nodejs_compat'],
        bindings: {
          GITHUB_OWNER: 'owner',
          GITHUB_REPO: 'repo',
          GITHUB_BRANCH: 'main',
          PUBLIC_SITE_URL: 'https://no6beauty.net',
          ADMIN_PASSWORD: 'correct horse battery staple',
          SESSION_SECRET: '0123456789abcdef0123456789abcdef',
          GITHUB_TOKEN: 'test-token',
        },
        serviceBindings: {
          ASSETS: await buildPagesASSETSBinding('./public'),
        },
      },
    })),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
