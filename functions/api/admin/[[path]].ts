import {
  bookingModeOptions,
  businessStatusOptions,
  dayDefinitions,
  deriveSiteSettings,
  validateEditableSiteSettings,
} from '../../../src/data/settings';
import defaultSettings from '../../../src/data/settings.json';
import {
  clearSessionCookie,
  createSessionCookie,
  hasValidSession,
  requireSession,
  verifyPassword,
} from '../../_lib/auth';
import {
  createArticleSlug,
  parseArticleSource,
  serializeArticle,
  validateArticleInput,
  validateArticleSlug,
  type ArticleRecord,
  type ArticleStatus,
} from '../../_lib/content';
import {
  getFile,
  getLatestCommit,
  listDirectory,
  putBase64File,
  putTextFile,
} from '../../_lib/github';
import {
  createArticleImagePath,
  getFixedImageSlot,
  imageSlots,
  validateImageUpload,
} from '../../_lib/images';
import {
  ApiError,
  handleApiError,
  isRecord,
  jsonResponse,
  methodNotAllowed,
  readJsonBody,
  requireSameOrigin,
} from '../../_lib/http';

const settingsPath = 'src/data/settings.json';
const articleDirectory = 'src/content/blog';
const businessName = '6號美容美學';

function routeSegments(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

function articlePath(slug: string): string {
  return `${articleDirectory}/${validateArticleSlug(slug)}.md`;
}

async function readCurrentSettings(env: Env) {
  const file = await getFile(env, settingsPath);

  let parsed: unknown;
  if (file) {
    try {
      parsed = JSON.parse(file.content) as unknown;
    } catch {
      throw new ApiError(500, '網站基本資料來源格式不正確。');
    }
  } else {
    parsed = defaultSettings;
  }
  const validation = validateEditableSiteSettings(parsed);
  if (!validation.ok) {
    throw new ApiError(500, '網站基本資料來源未通過驗證。', validation.issues);
  }
  return { file, settings: validation.value };
}

async function getSettings(env: Env): Promise<Response> {
  const { settings } = await readCurrentSettings(env);
  return jsonResponse({
    ok: true,
    settings,
    derived: deriveSiteSettings(settings, businessName),
    options: {
      bookingModes: bookingModeOptions,
      businessStatuses: businessStatusOptions,
      days: dayDefinitions,
    },
    locked: {
      brandName: '6號美學',
      businessName,
      englishName: 'No.6 Aesthetics',
      siteUrl: env.PUBLIC_SITE_URL,
      serviceArea: '桃園藝文特區',
    },
  });
}

async function updateSettings(env: Env, request: Request): Promise<Response> {
  const body = await readJsonBody(request, 32_000);
  const validation = validateEditableSiteSettings(body);
  if (!validation.ok) {
    throw new ApiError(400, validation.issues[0]?.message ?? '基本資料格式不正確。', validation.issues);
  }
  const { file } = await readCurrentSettings(env);
  const content = `${JSON.stringify(validation.value, null, 2)}\n`;
  const commitSha = await putTextFile(
    env,
    settingsPath,
    content,
    'admin: update business information',
    file?.sha,
  );
  return jsonResponse({
    ok: true,
    commitSha,
    settings: validation.value,
    derived: deriveSiteSettings(validation.value, businessName),
    deployment: 'pending',
  });
}

function articleSummary(article: ArticleRecord) {
  return {
    slug: article.slug,
    title: article.title,
    description: article.description,
    publishDate: article.publishDate,
    coverImage: article.coverImage,
    status: article.status,
  };
}

async function loadArticles(env: Env): Promise<ArticleRecord[]> {
  const entries = (await listDirectory(env, articleDirectory))
    .filter((entry) => entry.type === 'file' && entry.name.endsWith('.md'))
    .slice(0, 40);
  const articles: ArticleRecord[] = [];
  for (let offset = 0; offset < entries.length; offset += 10) {
    const batch = entries.slice(offset, offset + 10);
    const loaded = await Promise.all(batch.map(async (entry) => {
      const file = await getFile(env, entry.path);
      if (!file) throw new ApiError(502, `找不到文章檔案：${entry.name}`);
      return parseArticleSource(entry.name.replace(/\.md$/, ''), file.content);
    }));
    articles.push(...loaded);
  }
  return articles.sort(
    (first, second) => new Date(second.publishDate).getTime() - new Date(first.publishDate).getTime(),
  );
}

async function getArticles(env: Env): Promise<Response> {
  const articles = await loadArticles(env);
  return jsonResponse({ ok: true, articles: articles.map(articleSummary) });
}

async function getArticle(env: Env, slug: string): Promise<Response> {
  const validatedSlug = validateArticleSlug(slug);
  const file = await getFile(env, articlePath(validatedSlug));
  if (!file) throw new ApiError(404, '找不到這篇文章。');
  return jsonResponse({ ok: true, article: parseArticleSource(validatedSlug, file.content) });
}

async function createArticle(env: Env, request: Request): Promise<Response> {
  const input = validateArticleInput(await readJsonBody(request, 96_000));
  if (input.status !== 'published') {
    throw new ApiError(400, '新文章請直接上線；V1 不提供私人草稿。');
  }
  const slug = createArticleSlug();
  const path = articlePath(slug);
  const existing = await getFile(env, path);
  if (existing) throw new ApiError(409, '文章識別碼重複，請再試一次。');
  const normalizedInput = { ...input, tags: input.tags.length > 0 ? input.tags : ['美容小知識'] };
  const commitSha = await putTextFile(
    env,
    path,
    serializeArticle(normalizedInput),
    `content: publish ${slug}`,
  );
  return jsonResponse({ ok: true, slug, commitSha, deployment: 'pending' }, 201);
}

async function updateArticle(env: Env, request: Request, slug: string): Promise<Response> {
  const validatedSlug = validateArticleSlug(slug);
  const input = validateArticleInput(await readJsonBody(request, 96_000));
  const path = articlePath(validatedSlug);
  const current = await getFile(env, path);
  if (!current) throw new ApiError(404, '找不到這篇文章。');
  const commitSha = await putTextFile(
    env,
    path,
    serializeArticle(input),
    `content: update ${validatedSlug}`,
    current.sha,
  );
  return jsonResponse({ ok: true, slug: validatedSlug, commitSha, deployment: 'pending' });
}

function readRequestedStatus(value: unknown): ArticleStatus {
  if (!isRecord(value) || (value.status !== 'published' && value.status !== 'unpublished')) {
    throw new ApiError(400, '文章狀態不正確。');
  }
  return value.status;
}

async function updateArticleStatus(env: Env, request: Request, slug: string): Promise<Response> {
  const validatedSlug = validateArticleSlug(slug);
  const status = readRequestedStatus(await readJsonBody(request, 8_000));
  const path = articlePath(validatedSlug);
  const current = await getFile(env, path);
  if (!current) throw new ApiError(404, '找不到這篇文章。');
  const article = parseArticleSource(validatedSlug, current.content);
  const commitSha = await putTextFile(
    env,
    path,
    serializeArticle({ ...article, status }),
    `content: ${status === 'published' ? 'publish' : 'unpublish'} ${validatedSlug}`,
    current.sha,
  );
  return jsonResponse({ ok: true, slug: validatedSlug, status, commitSha, deployment: 'pending' });
}

function getImages(): Response {
  return jsonResponse({
    ok: true,
    images: Object.values(imageSlots).map((slot) => ({
      id: slot.id,
      label: slot.label,
      publicPath: slot.publicPath,
      mimeType: slot.mimeType,
      width: slot.width,
      height: slot.height,
      help: slot.help,
    })),
  });
}

async function updateFixedImage(env: Env, request: Request, slotId: string): Promise<Response> {
  const slot = getFixedImageSlot(slotId);
  const body = await readJsonBody(request, 6_000_000);
  const upload = validateImageUpload(body, slot.mimeType, slot.width, slot.height, slot.maximumBytes);
  const current = await getFile(env, slot.repositoryPath);
  if (!current) throw new ApiError(500, '找不到原本的網站圖片。');
  const commitSha = await putBase64File(
    env,
    slot.repositoryPath,
    upload.base64,
    `assets: update ${slot.id} image`,
    current.sha,
  );
  return jsonResponse({
    ok: true,
    commitSha,
    publicPath: slot.publicPath,
    byteLength: upload.byteLength,
    deployment: 'pending',
  });
}

async function uploadArticleImage(env: Env, request: Request): Promise<Response> {
  const body = await readJsonBody(request, 3_000_000);
  const upload = validateImageUpload(body, 'image/jpeg', 1200, 750, 1_500_000);
  const repositoryPath = createArticleImagePath();
  const commitSha = await putBase64File(
    env,
    repositoryPath,
    upload.base64,
    'assets: upload article cover image',
  );
  return jsonResponse({
    ok: true,
    commitSha,
    publicPath: `/${repositoryPath.replace(/^public\//, '')}`,
    deployment: 'pending',
  }, 201);
}

async function getStatus(env: Env): Promise<Response> {
  const [articles, latestCommit, siteOnline] = await Promise.all([
    loadArticles(env),
    getLatestCommit(env),
    fetch(env.PUBLIC_SITE_URL, { method: 'HEAD', redirect: 'manual' })
      .then((response) => response.status >= 200 && response.status < 400)
      .catch(() => false),
  ]);
  return jsonResponse({
    ok: true,
    siteOnline,
    siteUrl: env.PUBLIC_SITE_URL,
    articleCount: articles.length,
    publishedArticleCount: articles.filter((article) => article.status === 'published').length,
    imagesConfigured: Object.keys(imageSlots).length,
    repository: `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`,
    branch: env.GITHUB_BRANCH,
    latestCommit,
  });
}

async function handleAuthenticatedRequest(
  context: EventContext<Env, string, Record<string, unknown>>,
  segments: string[],
): Promise<Response> {
  const { request, env } = context;
  const method = request.method.toUpperCase();
  if (!['GET', 'HEAD'].includes(method)) requireSameOrigin(request);

  if (segments.length === 1 && segments[0] === 'settings') {
    if (method === 'GET') return getSettings(env);
    if (method === 'PUT') return updateSettings(env, request);
    return methodNotAllowed(['GET', 'PUT']);
  }

  if (segments.length === 1 && segments[0] === 'articles') {
    if (method === 'GET') return getArticles(env);
    if (method === 'POST') return createArticle(env, request);
    return methodNotAllowed(['GET', 'POST']);
  }

  if (segments[0] === 'articles' && segments[1]) {
    const slug = segments[1];
    if (segments.length === 2) {
      if (method === 'GET') return getArticle(env, slug);
      if (method === 'PUT') return updateArticle(env, request, slug);
      return methodNotAllowed(['GET', 'PUT']);
    }
    if (segments.length === 3 && segments[2] === 'status') {
      if (method === 'POST') return updateArticleStatus(env, request, slug);
      return methodNotAllowed(['POST']);
    }
  }

  if (segments.length === 1 && segments[0] === 'images') {
    if (method === 'GET') return getImages();
    return methodNotAllowed(['GET']);
  }

  if (segments.length === 2 && segments[0] === 'images' && segments[1] === 'article') {
    if (method === 'POST') return uploadArticleImage(env, request);
    return methodNotAllowed(['POST']);
  }

  if (segments.length === 2 && segments[0] === 'images' && segments[1]) {
    if (method === 'PUT') return updateFixedImage(env, request, segments[1]);
    return methodNotAllowed(['PUT']);
  }

  if (segments.length === 1 && segments[0] === 'status') {
    if (method === 'GET') return getStatus(env);
    return methodNotAllowed(['GET']);
  }

  throw new ApiError(404, '找不到這個後台功能。');
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  try {
    const segments = routeSegments(context.params.path);
    const method = request.method.toUpperCase();

    if (segments.length === 1 && segments[0] === 'session') {
      if (method !== 'GET') return methodNotAllowed(['GET']);
      return jsonResponse({ ok: true, authenticated: await hasValidSession(env, request) });
    }

    if (segments.length === 1 && segments[0] === 'login') {
      if (method !== 'POST') return methodNotAllowed(['POST']);
      requireSameOrigin(request);
      const body = await readJsonBody(request, 4_000);
      const password = isRecord(body) && typeof body.password === 'string' ? body.password : '';
      if (password.length > 256 || !(await verifyPassword(env, password))) {
        console.log(JSON.stringify({
          message: 'admin login rejected',
          ip: request.headers.get('CF-Connecting-IP') ?? 'unknown',
        }));
        throw new ApiError(401, '密碼不正確。');
      }
      return jsonResponse(
        { ok: true, authenticated: true },
        200,
        { 'Set-Cookie': await createSessionCookie(env, request) },
      );
    }

    if (segments.length === 1 && segments[0] === 'logout') {
      if (method !== 'POST') return methodNotAllowed(['POST']);
      requireSameOrigin(request);
      return jsonResponse(
        { ok: true, authenticated: false },
        200,
        { 'Set-Cookie': clearSessionCookie(request) },
      );
    }

    await requireSession(env, request);
    return await handleAuthenticatedRequest(context, segments);
  } catch (error) {
    return handleApiError(error, request);
  }
};
