import { unzlibSync, zlibSync } from 'fflate';
import { sha256Base64Url } from '../protocol/hash.js';

export const MAX_TRANSFER_PAYLOAD_BYTES = (50 * 1024 * 1024) + (64 * 1024);
export const MAX_COLOR_INPUT_BYTES = 15 * 1024 * 1024;
const MIN_SAVED_BYTES = 32;
const MIN_SAVED_RATIO = 0.05;
const ALREADY_COMPRESSED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'application/zip',
  'application/gzip',
  'application/x-7z-compressed',
  'application/x-rar-compressed',
]);
const ALREADY_COMPRESSED_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'heic',
  'mp4',
  'm4v',
  'mov',
  'webm',
  'mkv',
  'zip',
  'gz',
  '7z',
  'rar',
]);

export class PayloadCompressionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PayloadCompressionError';
    this.code = code;
  }
}

function assertPayload(bytes, expectedSize) {
  if (!(bytes instanceof Uint8Array)) {
    throw new PayloadCompressionError('INVALID_PAYLOAD', 'Aktarım verisi Uint8Array olmalıdır.');
  }

  if (!Number.isSafeInteger(bytes.length) || bytes.length > MAX_TRANSFER_PAYLOAD_BYTES) {
    throw new PayloadCompressionError('INVALID_PAYLOAD', 'Aktarım verisi izin verilen boyut sınırını aşıyor.');
  }

  if (expectedSize !== undefined && (!Number.isSafeInteger(expectedSize) || expectedSize < 0 || bytes.length !== expectedSize)) {
    throw new PayloadCompressionError('INVALID_PAYLOAD', 'Aktarım verisi beklenen boyutla eşleşmiyor.');
  }
}

function assertMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    throw new PayloadCompressionError('INVALID_PAYLOAD', 'Aktarım üst verisi geçersiz.');
  }

  if (metadata.compression !== 'none' && metadata.compression !== 'zlib') {
    throw new PayloadCompressionError('INVALID_PAYLOAD', 'Sıkıştırma türü geçersiz.');
  }

  if (!Number.isSafeInteger(metadata.originalSize)
    || metadata.originalSize < 0
    || metadata.originalSize > MAX_TRANSFER_PAYLOAD_BYTES) {
    throw new PayloadCompressionError('INVALID_PAYLOAD', 'Özgün veri boyutu geçersiz.');
  }

  if (!Number.isSafeInteger(metadata.storedSize) || metadata.storedSize < 0) {
    throw new PayloadCompressionError('INVALID_PAYLOAD', 'Saklanan veri boyutu geçersiz.');
  }

  if (typeof metadata.originalSha256 !== 'string' || !metadata.originalSha256) {
    throw new PayloadCompressionError('INVALID_PAYLOAD', 'Özgün veri özeti geçersiz.');
  }

  if (metadata.storedSha256 !== undefined
    && (typeof metadata.storedSha256 !== 'string' || !metadata.storedSha256)) {
    throw new PayloadCompressionError('INVALID_PAYLOAD', 'Saklanan veri özeti geçersiz.');
  }
}

export function shouldAttemptCompression({ mimeType = '', fileName = '' } = {}) {
  const normalizedMimeType = typeof mimeType === 'string' ? mimeType.trim().toLowerCase() : '';
  if (
    normalizedMimeType.startsWith('video/')
    || ALREADY_COMPRESSED_MIME_TYPES.has(normalizedMimeType)
  ) {
    return false;
  }

  const normalizedFileName = typeof fileName === 'string' ? fileName.trim().toLowerCase() : '';
  const extensionStart = normalizedFileName.lastIndexOf('.');
  const extension = extensionStart >= 0 ? normalizedFileName.slice(extensionStart + 1) : '';
  return !ALREADY_COMPRESSED_EXTENSIONS.has(extension);
}

export async function prepareTransferPayload(bytes, options) {
  assertPayload(bytes);

  const originalSha256 = await sha256Base64Url(bytes);
  let compressed = null;

  if (shouldAttemptCompression(options)) {
    try {
      compressed = zlibSync(bytes, { level: 6 });
    } catch {
      compressed = null;
    }
  }

  const savedBytes = compressed ? bytes.length - compressed.length : 0;
  const useCompressed = Boolean(
    compressed
      && savedBytes >= MIN_SAVED_BYTES
      && savedBytes / Math.max(1, bytes.length) >= MIN_SAVED_RATIO,
  );
  const storedBytes = useCompressed ? compressed : new Uint8Array(bytes);
  const storedSha256 = useCompressed
    ? await sha256Base64Url(storedBytes)
    : originalSha256;

  return {
    storedBytes,
    compression: useCompressed ? 'zlib' : 'none',
    originalSize: bytes.length,
    storedSize: storedBytes.length,
    originalSha256,
    storedSha256,
    savedBytes: useCompressed ? savedBytes : 0,
    savedPercent: useCompressed
      ? Math.round((savedBytes / Math.max(1, bytes.length)) * 100)
      : 0,
  };
}

export async function restoreTransferPayload(storedBytes, metadata) {
  assertMetadata(metadata);
  assertPayload(storedBytes, metadata.storedSize);

  if (metadata.storedSha256
    && await sha256Base64Url(storedBytes) !== metadata.storedSha256) {
    throw new PayloadCompressionError(
      'FILE_HASH_MISMATCH',
      'Saklanan veri bütünlük kontrolünü geçemedi.',
    );
  }

  let original;
  try {
    original = metadata.compression === 'zlib'
      ? unzlibSync(storedBytes, { out: new Uint8Array(metadata.originalSize) })
      : new Uint8Array(storedBytes);
  } catch {
    throw new PayloadCompressionError(
      'DECOMPRESSION_FAILED',
      'Sıkıştırılmış veri açılamadı.',
    );
  }

  if (original.length !== metadata.originalSize
    || await sha256Base64Url(original) !== metadata.originalSha256) {
    throw new PayloadCompressionError(
      'FILE_HASH_MISMATCH',
      'Dosya bütünlük doğrulaması başarısız.',
    );
  }

  return original;
}
