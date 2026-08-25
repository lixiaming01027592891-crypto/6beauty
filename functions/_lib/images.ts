import { ApiError, isRecord } from './http';

export type FixedImageSlot = 'home' | 'contact';

export interface ImageSlotDefinition {
  id: FixedImageSlot;
  label: string;
  repositoryPath: string;
  publicPath: string;
  mimeType: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
  maximumBytes: number;
  help: string;
}

export const imageSlots: Readonly<Record<FixedImageSlot, ImageSlotDefinition>> = {
  home: {
    id: 'home',
    label: '首頁主圖',
    repositoryPath: 'public/hero/hero-bg-new.png',
    publicPath: '/hero/hero-bg-new.png',
    mimeType: 'image/png',
    width: 1280,
    height: 731,
    maximumBytes: 4_000_000,
    help: '首頁滿版主視覺，系統會自動裁切為 1280 × 731。',
  },
  contact: {
    id: 'contact',
    label: '聯絡頁主圖',
    repositoryPath: 'public/images/contact-bg.jpg',
    publicPath: '/images/contact-bg.jpg',
    mimeType: 'image/jpeg',
    width: 1344,
    height: 768,
    maximumBytes: 2_000_000,
    help: '聯絡預約頁首圖，系統會自動裁切為 1344 × 768。',
  },
};

export interface ValidatedImageUpload {
  base64: string;
  byteLength: number;
  mimeType: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
}

function decodeBase64(value: string, maximumBytes: number): Uint8Array {
  const normalized = value.replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new ApiError(400, '圖片編碼格式不正確。');
  }
  const maximumEncodedLength = Math.ceil(maximumBytes / 3) * 4 + 4;
  if (normalized.length > maximumEncodedLength) {
    throw new ApiError(413, '圖片檔案太大。');
  }
  try {
    const binary = atob(normalized);
    if (binary.length > maximumBytes) throw new ApiError(413, '圖片檔案太大。');
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, '圖片編碼格式不正確。');
  }
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => bytes[index] === value)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 1 >= bytes.length) break;
    const segmentLength = ((bytes[offset] ?? 0) << 8) + (bytes[offset + 1] ?? 0);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    if (startOfFrameMarkers.has(marker) && segmentLength >= 7) {
      const height = ((bytes[offset + 3] ?? 0) << 8) + (bytes[offset + 4] ?? 0);
      const width = ((bytes[offset + 5] ?? 0) << 8) + (bytes[offset + 6] ?? 0);
      return { width, height };
    }
    offset += segmentLength;
  }
  return null;
}

export function validateImageUpload(
  value: unknown,
  expectedMimeType: 'image/png' | 'image/jpeg',
  expectedWidth: number,
  expectedHeight: number,
  maximumBytes: number,
): ValidatedImageUpload {
  if (!isRecord(value)) throw new ApiError(400, '圖片資料格式不正確。');
  const contentBase64 = typeof value.contentBase64 === 'string' ? value.contentBase64 : '';
  const mimeType = value.mimeType;
  if (mimeType !== expectedMimeType) throw new ApiError(400, '圖片格式不符合這個位置。');
  const bytes = decodeBase64(contentBase64, maximumBytes);
  const dimensions = expectedMimeType === 'image/png' ? pngDimensions(bytes) : jpegDimensions(bytes);
  if (!dimensions) throw new ApiError(400, '無法辨識圖片格式。');
  if (dimensions.width !== expectedWidth || dimensions.height !== expectedHeight) {
    throw new ApiError(400, `圖片尺寸必須是 ${expectedWidth} × ${expectedHeight}。`);
  }
  return {
    base64: contentBase64.replace(/\s/g, ''),
    byteLength: bytes.byteLength,
    mimeType: expectedMimeType,
    width: dimensions.width,
    height: dimensions.height,
  };
}

export function getFixedImageSlot(value: string): ImageSlotDefinition {
  if (value !== 'home' && value !== 'contact') {
    throw new ApiError(404, '找不到這個圖片位置。');
  }
  return imageSlots[value];
}

export function createArticleImagePath(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `public/images/blog/admin-${date}-${crypto.randomUUID().slice(0, 8)}.jpg`;
}
