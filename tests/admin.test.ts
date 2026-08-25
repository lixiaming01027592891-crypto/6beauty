import { describe, expect, it } from 'vitest';
import { createPagesEventContext } from 'cloudflare:test';
import { createSessionCookie, hasValidSession, verifyPassword } from '../functions/_lib/auth';
import { parseArticleSource, serializeArticle, validateArticleInput } from '../functions/_lib/content';
import { ApiError } from '../functions/_lib/http';
import { validateImageUpload } from '../functions/_lib/images';
import { deriveSiteSettings, validateEditableSiteSettings } from '../src/data/settings';
import { onRequest } from '../functions/api/admin/[[path]]';

const validSettings = {
  phone: '0986132728',
  lineId: '0970177878',
  address: '桃園市桃園區南平路181巷6號1樓',
  businessHours: {
    monday: '09:00 - 21:00',
    tuesday: '09:00 - 21:00',
    wednesday: '09:00 - 21:00',
    thursday: '09:00 - 21:00',
    friday: '09:00 - 21:00',
    saturday: '09:00 - 21:00',
    sunday: '09:00 - 21:00',
  },
  bookingMode: 'appointment_only',
  businessStatus: 'open',
} as const;

const testEnv = {
  GITHUB_OWNER: 'owner',
  GITHUB_REPO: 'repo',
  GITHUB_BRANCH: 'main',
  PUBLIC_SITE_URL: 'https://no6beauty.net',
  ADMIN_PASSWORD: 'correct horse battery staple',
  SESSION_SECRET: '0123456789abcdef0123456789abcdef',
  GITHUB_TOKEN: 'test-token',
} as unknown as Env;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

describe('basic settings boundary', () => {
  it('accepts the intended editable fields and derives public labels', () => {
    const result = validateEditableSiteSettings(validSettings);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const derived = deriveSiteSettings(result.value, '6號美容美學');
    expect(derived.phoneDisplay).toBe('0986-132-728');
    expect(derived.hoursLabel).toBe('每日 09:00 - 21:00');
    expect(derived.businessNotice).toContain('全預約制');
    expect(derived.openingHoursSpecification).toHaveLength(7);
  });

  it('rejects arbitrary fields when required values are invalid', () => {
    const result = validateEditableSiteSettings({ ...validSettings, phone: 'abc', businessStatus: 'custom' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.field)).toEqual(expect.arrayContaining(['phone', 'businessStatus']));
  });
});

describe('article safety boundary', () => {
  const article = {
    title: '換季時為什麼肌膚容易緊繃？',
    description: '整理換季肌膚容易乾燥緊繃的常見原因與日常保養方向。',
    publishDate: '2026-08-25',
    coverImage: '/images/blog-1.jpg',
    tags: ['美容小知識', '臉部保養'],
    status: 'published' as const,
    body: '換季時溫度與濕度變化較大，肌膚表面的水分也容易流失。\n\n## 日常可以怎麼做\n\n- 溫和清潔\n- 適度保濕',
  };

  it('round-trips the known frontmatter and defaults legacy status to published', () => {
    const parsed = parseArticleSource('skin-care-note', serializeArticle(article));
    expect(parsed).toMatchObject(article);
    const legacy = serializeArticle(article).replace('status: "published"\n', '');
    expect(parseArticleSource('legacy-note', legacy).status).toBe('published');
  });

  it('rejects raw HTML and script-style event handlers', () => {
    expect(() => validateArticleInput({ ...article, body: `${article.body}\n<script>alert(1)</script>` })).toThrow(ApiError);
    expect(() => validateArticleInput({ ...article, body: `${article.body}\n[按鈕](javascript:alert(1))` })).toThrow(ApiError);
    expect(() => validateArticleInput({ ...article, body: `${article.body}\n[按鈕](data:text/html,alert(1))` })).toThrow(ApiError);
  });
});

describe('image upload constraints', () => {
  it('accepts only the exact PNG dimensions for a fixed slot', () => {
    const bytes = new Uint8Array(24);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, 1280);
    view.setUint32(20, 731);
    const upload = validateImageUpload(
      { contentBase64: bytesToBase64(bytes), mimeType: 'image/png' },
      'image/png',
      1280,
      731,
      4_000_000,
    );
    expect(upload).toMatchObject({ mimeType: 'image/png', width: 1280, height: 731, byteLength: 24 });
    expect(() => validateImageUpload(
      { contentBase64: bytesToBase64(bytes), mimeType: 'image/png' },
      'image/png',
      1200,
      750,
      4_000_000,
    )).toThrow(ApiError);
  });
});

describe('admin authentication', () => {
  it('uses a signed, expiring HttpOnly session cookie', async () => {
    expect(await verifyPassword(testEnv, 'correct horse battery staple')).toBe(true);
    expect(await verifyPassword(testEnv, 'incorrect password')).toBe(false);
    const request = new Request('https://no6beauty.net/api/admin/login');
    const setCookie = await createSessionCookie(testEnv, request);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Secure');
    const cookie = setCookie.split(';')[0];
    expect(await hasValidSession(testEnv, new Request('https://no6beauty.net/api/admin/session', { headers: { Cookie: cookie } }))).toBe(true);
    const [cookieName, token] = cookie.split('=');
    const [payloadPart, signaturePart] = token.split('.');
    const tamperedSignature = `${signaturePart.startsWith('a') ? 'b' : 'a'}${signaturePart.slice(1)}`;
    const tampered = `${cookieName}=${payloadPart}.${tamperedSignature}`;
    expect(await hasValidSession(testEnv, new Request('https://no6beauty.net/api/admin/session', { headers: { Cookie: tampered } }))).toBe(false);
  });

  it('enforces same-origin login and returns a reusable session through the Pages route', async () => {
    const blockedContext = createPagesEventContext<typeof onRequest>({
      request: new Request('https://no6beauty.net/api/admin/login', {
        method: 'POST',
        headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'correct horse battery staple' }),
      }),
      params: { path: ['login'] },
    });
    expect((await onRequest(blockedContext)).status).toBe(403);

    const loginContext = createPagesEventContext<typeof onRequest>({
      request: new Request('https://no6beauty.net/api/admin/login', {
        method: 'POST',
        headers: { Origin: 'https://no6beauty.net', 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'correct horse battery staple' }),
      }),
      params: { path: ['login'] },
    });
    const loginResponse = await onRequest(loginContext);
    expect(loginResponse.status).toBe(200);
    const setCookie = loginResponse.headers.get('set-cookie');
    expect(setCookie).toContain('no6_admin_session=');

    const sessionContext = createPagesEventContext<typeof onRequest>({
      request: new Request('https://no6beauty.net/api/admin/session', {
        headers: { Cookie: setCookie?.split(';')[0] || '' },
      }),
      params: { path: ['session'] },
    });
    const sessionResponse = await onRequest(sessionContext);
    expect(sessionResponse.status).toBe(200);
    expect(await sessionResponse.json()).toMatchObject({ authenticated: true });
  });
});
