import { ApiError, isRecord } from './http';

const githubApiVersion = '2022-11-28';
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface GitHubFile {
  path: string;
  sha: string;
  content: string;
  size: number;
}

export interface GitHubDirectoryEntry {
  name: string;
  path: string;
  sha: string;
  type: 'file' | 'dir';
  size: number;
}

export interface GitHubCommitSummary {
  sha: string;
  message: string;
  date: string | null;
  htmlUrl: string | null;
}

function encodeRepositoryPath(path: string): string {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

function githubUrl(env: Env, path: string): string {
  return `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}${path}`;
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const length = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > 4_000_000) {
    throw new ApiError(502, 'GitHub 回傳資料超出預期大小。');
  }
  return response.json() as Promise<unknown>;
}

async function githubRequest(env: Env, path: string, init?: RequestInit): Promise<Response> {
  if (!env.GITHUB_TOKEN) {
    throw new ApiError(503, 'GitHub 寫入權限尚未設定。');
  }
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/vnd.github+json');
  headers.set('Authorization', `Bearer ${env.GITHUB_TOKEN}`);
  headers.set('X-GitHub-Api-Version', githubApiVersion);
  headers.set('User-Agent', 'no6beauty-admin');
  return fetch(githubUrl(env, path), { ...init, headers });
}

function decodeGitHubText(content: string): string {
  const binary = atob(content.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return textDecoder.decode(bytes);
}

export function textToBase64(content: string): string {
  const bytes = textEncoder.encode(content);
  let binary = '';
  const chunkSize = 16_384;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    for (let index = 0; index < chunk.length; index += 1) {
      binary += String.fromCharCode(chunk[index] ?? 0);
    }
  }
  return btoa(binary);
}

export async function getFile(env: Env, path: string): Promise<GitHubFile | null> {
  const encodedPath = encodeRepositoryPath(path);
  const response = await githubRequest(
    env,
    `/contents/${encodedPath}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`,
  );
  if (response.status === 404) return null;
  const data = await parseJsonResponse(response);
  if (!response.ok || !isRecord(data)) {
    throw new ApiError(502, '無法讀取 GitHub 內容。');
  }
  if (
    typeof data.path !== 'string'
    || typeof data.sha !== 'string'
    || typeof data.content !== 'string'
    || typeof data.size !== 'number'
  ) {
    throw new ApiError(502, 'GitHub 檔案格式不正確。');
  }
  return {
    path: data.path,
    sha: data.sha,
    content: decodeGitHubText(data.content),
    size: data.size,
  };
}

export async function listDirectory(env: Env, path: string): Promise<GitHubDirectoryEntry[]> {
  const encodedPath = encodeRepositoryPath(path);
  const response = await githubRequest(
    env,
    `/contents/${encodedPath}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`,
  );
  const data = await parseJsonResponse(response);
  if (!response.ok || !Array.isArray(data)) {
    throw new ApiError(502, '無法讀取 GitHub 目錄。');
  }

  return data.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    if (
      typeof entry.name !== 'string'
      || typeof entry.path !== 'string'
      || typeof entry.sha !== 'string'
      || (entry.type !== 'file' && entry.type !== 'dir')
      || typeof entry.size !== 'number'
    ) {
      return [];
    }
    return [{
      name: entry.name,
      path: entry.path,
      sha: entry.sha,
      type: entry.type,
      size: entry.size,
    }];
  });
}

async function putFile(
  env: Env,
  path: string,
  base64Content: string,
  message: string,
  currentSha?: string,
): Promise<string> {
  const body: Record<string, string> = {
    message,
    content: base64Content,
    branch: env.GITHUB_BRANCH,
  };
  if (currentSha) body.sha = currentSha;

  const response = await githubRequest(env, `/contents/${encodeRepositoryPath(path)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) {
    const messageFromGitHub = isRecord(data) && typeof data.message === 'string' ? data.message : '';
    if (response.status === 409 || response.status === 422) {
      throw new ApiError(409, '內容剛被其他人更新，請重新整理後再試。');
    }
    console.error(JSON.stringify({
      message: 'github write failed',
      status: response.status,
      path,
      githubMessage: messageFromGitHub,
    }));
    throw new ApiError(502, 'GitHub 暫時無法儲存內容。');
  }

  if (!isRecord(data) || !isRecord(data.commit) || typeof data.commit.sha !== 'string') {
    throw new ApiError(502, 'GitHub 儲存結果格式不正確。');
  }
  return data.commit.sha;
}

export function putTextFile(
  env: Env,
  path: string,
  content: string,
  message: string,
  currentSha?: string,
): Promise<string> {
  return putFile(env, path, textToBase64(content), message, currentSha);
}

export function putBase64File(
  env: Env,
  path: string,
  base64Content: string,
  message: string,
  currentSha?: string,
): Promise<string> {
  return putFile(env, path, base64Content, message, currentSha);
}

export async function getLatestCommit(env: Env): Promise<GitHubCommitSummary | null> {
  const response = await githubRequest(
    env,
    `/commits?sha=${encodeURIComponent(env.GITHUB_BRANCH)}&per_page=1`,
  );
  const data = await parseJsonResponse(response);
  if (!response.ok || !Array.isArray(data)) {
    throw new ApiError(502, '無法讀取最新版本。');
  }
  const first = data[0];
  if (!isRecord(first) || typeof first.sha !== 'string' || !isRecord(first.commit)) return null;
  const commit = first.commit;
  const committer = isRecord(commit.committer) ? commit.committer : null;
  return {
    sha: first.sha,
    message: typeof commit.message === 'string' ? commit.message : '',
    date: committer && typeof committer.date === 'string' ? committer.date : null,
    htmlUrl: typeof first.html_url === 'string' ? first.html_url : null,
  };
}
