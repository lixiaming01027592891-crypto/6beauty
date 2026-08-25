import { ApiError, isRecord } from './http';

export type ArticleStatus = 'published' | 'unpublished';

export interface ArticleRecord {
  slug: string;
  title: string;
  description: string;
  publishDate: string;
  coverImage: string;
  tags: string[];
  status: ArticleStatus;
  body: string;
}

export interface ArticleInput {
  title: string;
  description: string;
  publishDate: string;
  coverImage: string;
  tags: string[];
  status: ArticleStatus;
  body: string;
}

function parseFrontmatterString(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return typeof parsed === 'string' ? parsed : trimmed;
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function parseTags(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((tag): tag is string => typeof tag === 'string');
  } catch {
    return [];
  }
}

export function parseArticleSource(slug: string, source: string): ArticleRecord {
  const normalized = source.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    throw new ApiError(422, `文章 ${slug} 缺少資料區塊。`);
  }
  const endIndex = normalized.indexOf('\n---\n', 4);
  if (endIndex < 0) {
    throw new ApiError(422, `文章 ${slug} 的資料區塊不完整。`);
  }

  const frontmatter = normalized.slice(4, endIndex);
  const body = normalized.slice(endIndex + 5).replace(/^\n+/, '').trimEnd();
  const fields = new Map<string, string>();
  for (const line of frontmatter.split('\n')) {
    const separator = line.indexOf(':');
    if (separator < 1) continue;
    fields.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }

  const title = parseFrontmatterString(fields.get('title') ?? '');
  const description = parseFrontmatterString(fields.get('description') ?? '');
  const publishDate = parseFrontmatterString(fields.get('publishDate') ?? '');
  const coverImage = parseFrontmatterString(fields.get('coverImage') ?? '');
  const statusField = parseFrontmatterString(fields.get('status') ?? 'published');
  const status: ArticleStatus = statusField === 'unpublished' ? 'unpublished' : 'published';

  return {
    slug,
    title,
    description,
    publishDate,
    coverImage,
    tags: parseTags(fields.get('tags')),
    status,
    body,
  };
}

export function serializeArticle(article: ArticleInput): string {
  return [
    '---',
    `title: ${JSON.stringify(article.title)}`,
    `description: ${JSON.stringify(article.description)}`,
    `publishDate: ${JSON.stringify(article.publishDate)}`,
    `coverImage: ${JSON.stringify(article.coverImage)}`,
    `tags: ${JSON.stringify(article.tags)}`,
    `status: ${JSON.stringify(article.status)}`,
    '---',
    '',
    article.body.trim(),
    '',
  ].join('\n');
}

function isArticleStatus(value: unknown): value is ArticleStatus {
  return value === 'published' || value === 'unpublished';
}

function hasUnsafeHtml(body: string): boolean {
  return /<\/?[A-Za-z!][^>]*>|(?:javascript|vbscript|data)\s*:|on[a-z]+\s*=/i.test(body);
}

export function validateArticleInput(value: unknown): ArticleInput {
  if (!isRecord(value)) throw new ApiError(400, '文章格式不正確。');

  const title = typeof value.title === 'string' ? value.title.trim() : '';
  const description = typeof value.description === 'string' ? value.description.trim() : '';
  const publishDate = typeof value.publishDate === 'string' ? value.publishDate.trim() : '';
  const coverImage = typeof value.coverImage === 'string' ? value.coverImage.trim() : '';
  const body = typeof value.body === 'string' ? value.body.trim() : '';
  const rawTags = Array.isArray(value.tags) ? value.tags : [];
  const tags = rawTags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim());

  const issues: string[] = [];
  if (title.length < 3 || title.length > 100) issues.push('標題需為 3 至 100 個字。');
  if (description.length < 10 || description.length > 240) issues.push('摘要需為 10 至 240 個字。');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publishDate)) issues.push('發布日期格式不正確。');
  if (!/^\/images\/[A-Za-z0-9/_-]+\.(?:jpg|jpeg|png|webp)$/i.test(coverImage)) {
    issues.push('首圖必須使用網站圖片路徑。');
  }
  if (body.length < 30 || body.length > 30_000) issues.push('內文需為 30 至 30,000 個字。');
  if (hasUnsafeHtml(body)) issues.push('內文只接受 Markdown，不接受 HTML 或程式碼。');
  if (!isArticleStatus(value.status)) issues.push('文章狀態不正確。');
  if (tags.length > 8 || tags.some((tag) => tag.length < 1 || tag.length > 30)) {
    issues.push('文章標籤格式不正確。');
  }

  if (issues.length > 0 || !isArticleStatus(value.status)) {
    throw new ApiError(400, issues[0] ?? '文章格式不正確。', issues);
  }

  return {
    title,
    description,
    publishDate,
    coverImage,
    tags,
    status: value.status,
    body,
  };
}

export function validateArticleSlug(slug: string): string {
  if (!/^[a-z0-9][a-z0-9-]{2,100}$/.test(slug)) {
    throw new ApiError(400, '文章識別碼不正確。');
  }
  return slug;
}

export function createArticleSlug(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `beauty-note-${date}-${crypto.randomUUID().slice(0, 8)}`;
}
