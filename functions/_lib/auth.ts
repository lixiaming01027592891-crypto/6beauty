import { ApiError } from './http';

const sessionCookieName = 'no6_admin_session';
const sessionLifetimeSeconds = 8 * 60 * 60;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

interface SessionPayload {
  role: 'content_admin';
  exp: number;
  nonce: string;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function importSessionKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function validateSecretConfiguration(env: Env): void {
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 12) {
    throw new ApiError(503, '後台密碼尚未完成安全設定。');
  }
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    throw new ApiError(503, '登入工作階段尚未完成安全設定。');
  }
}

export async function verifyPassword(env: Env, suppliedPassword: string): Promise<boolean> {
  validateSecretConfiguration(env);
  const [suppliedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', textEncoder.encode(suppliedPassword)),
    crypto.subtle.digest('SHA-256', textEncoder.encode(env.ADMIN_PASSWORD)),
  ]);
  const suppliedBytes = new Uint8Array(suppliedHash);
  const expectedBytes = new Uint8Array(expectedHash);
  let difference = suppliedBytes.length ^ expectedBytes.length;
  const comparisonLength = Math.max(suppliedBytes.length, expectedBytes.length);
  for (let index = 0; index < comparisonLength; index += 1) {
    difference |= (suppliedBytes[index] ?? 0) ^ (expectedBytes[index] ?? 0);
  }
  return difference === 0;
}

export async function createSessionCookie(env: Env, request: Request): Promise<string> {
  validateSecretConfiguration(env);
  const payload: SessionPayload = {
    role: 'content_admin',
    exp: Math.floor(Date.now() / 1000) + sessionLifetimeSeconds,
    nonce: crypto.randomUUID(),
  };
  const payloadBytes = textEncoder.encode(JSON.stringify(payload));
  const key = await importSessionKey(env.SESSION_SECRET);
  const signature = await crypto.subtle.sign('HMAC', key, payloadBytes);
  const token = `${bytesToBase64Url(payloadBytes)}.${bytesToBase64Url(new Uint8Array(signature))}`;
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${sessionCookieName}=${token}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${sessionLifetimeSeconds}${secure}`;
}

export function clearSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${sessionCookieName}=; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

function getCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;
  for (const entry of cookieHeader.split(';')) {
    const separator = entry.indexOf('=');
    if (separator < 0) continue;
    const key = entry.slice(0, separator).trim();
    if (key === name) return entry.slice(separator + 1).trim();
  }
  return null;
}

export async function hasValidSession(env: Env, request: Request): Promise<boolean> {
  validateSecretConfiguration(env);
  const token = getCookie(request, sessionCookieName);
  if (!token) return false;
  const [payloadPart, signaturePart, extraPart] = token.split('.');
  if (!payloadPart || !signaturePart || extraPart) return false;

  try {
    const payloadBytes = base64UrlToBytes(payloadPart);
    const signature = new Uint8Array(base64UrlToBytes(signaturePart));
    const key = await importSessionKey(env.SESSION_SECRET);
    const validSignature = await crypto.subtle.verify('HMAC', key, signature, payloadBytes);
    if (!validSignature) return false;

    const parsed = JSON.parse(textDecoder.decode(payloadBytes)) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return false;
    const role = Reflect.get(parsed, 'role');
    const exp = Reflect.get(parsed, 'exp');
    return role === 'content_admin' && typeof exp === 'number' && exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function requireSession(env: Env, request: Request): Promise<void> {
  if (!(await hasValidSession(env, request))) {
    throw new ApiError(401, '登入已失效，請重新登入。');
  }
}
