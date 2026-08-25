export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

const apiHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'Referrer-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
} as const;

export function jsonResponse(data: unknown, status = 200, additionalHeaders?: HeadersInit): Response {
  const headers = new Headers(apiHeaders);
  if (additionalHeaders) {
    new Headers(additionalHeaders).forEach((value, key) => headers.set(key, value));
  }
  return Response.json(data, { status, headers });
}

export function methodNotAllowed(allowed: string[]): Response {
  return jsonResponse(
    { ok: false, error: '不支援這個操作。' },
    405,
    { Allow: allowed.join(', ') },
  );
}

export async function readJsonBody(request: Request, maximumBytes = 64_000): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new ApiError(415, '請使用 JSON 格式送出資料。');
  }

  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new ApiError(413, '送出的資料太大。');
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maximumBytes) {
    throw new ApiError(413, '送出的資料太大。');
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new ApiError(400, 'JSON 格式不正確。');
  }
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  const requestOrigin = new URL(request.url).origin;
  if (!origin || origin !== requestOrigin) {
    throw new ApiError(403, '來源驗證失敗，請重新整理後再試。');
  }
}

export function handleApiError(error: unknown, request: Request): Response {
  if (error instanceof ApiError) {
    return jsonResponse(
      { ok: false, error: error.message, details: error.details },
      error.status,
    );
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({
    message: 'admin api request failed',
    error: message,
    method: request.method,
    path: new URL(request.url).pathname,
  }));
  return jsonResponse({ ok: false, error: '系統暫時無法完成操作，請稍後再試。' }, 500);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
