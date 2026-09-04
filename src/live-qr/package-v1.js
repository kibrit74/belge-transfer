import { prepareTransferPayload, restoreTransferPayload } from '../transfer/payload-compression.js';
import { sanitizeDownloadName } from '../transfer/safe-download-name.js';
import {
  LQP1_PREFIX_BYTES,
  MAX_LIVE_QR_INPUT_BYTES,
  MAX_LIVE_QR_METADATA_BYTES,
} from './limits.js';

export { MAX_LIVE_QR_INPUT_BYTES };

const MAGIC = new TextEncoder().encode('LQP1');
const PREFIX_BYTES = LQP1_PREFIX_BYTES;
const MAX_METADATA_BYTES = MAX_LIVE_QR_METADATA_BYTES;
const METADATA_KEYS = [
  'name',
  'type',
  'compression',
  'originalSize',
  'storedSize',
  'originalSha256',
  'storedSha256',
];
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

export class LiveQrPackageError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'LiveQrPackageError';
    this.code = code;
  }
}

function packageError(code = 'INVALID_LIVE_QR_PACKAGE') {
  return new LiveQrPackageError(code, 'Canlı QR paketi geçersiz.');
}

function isValidSize(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_LIVE_QR_INPUT_BYTES;
}

function isSha256(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

function toUint8Array(value) {
  if (Object.prototype.toString.call(value) !== '[object Uint8Array]') return null;
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function validateMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw packageError();
  }

  const keys = Object.keys(metadata);
  if (keys.length !== METADATA_KEYS.length
    || !METADATA_KEYS.every((key) => Object.prototype.hasOwnProperty.call(metadata, key))
    || typeof metadata.name !== 'string'
    || typeof metadata.type !== 'string'
    || (metadata.compression !== 'none' && metadata.compression !== 'zlib')
    || !isValidSize(metadata.originalSize)
    || !isValidSize(metadata.storedSize)
    || !isSha256(metadata.originalSha256)
    || !isSha256(metadata.storedSha256)) {
    throw packageError();
  }
}

function parsePackage(containerBytes) {
  const bytes = toUint8Array(containerBytes);
  if (!bytes || bytes.length < PREFIX_BYTES || !MAGIC.every((byte, index) => bytes[index] === byte)) {
    throw packageError();
  }

  const metadataLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, false);
  const metadataEnd = PREFIX_BYTES + metadataLength;
  if (metadataLength > MAX_METADATA_BYTES || metadataEnd > bytes.length) {
    throw packageError();
  }

  let metadata;
  try {
    metadata = JSON.parse(textDecoder.decode(bytes.subarray(PREFIX_BYTES, metadataEnd)));
  } catch {
    throw packageError();
  }

  validateMetadata(metadata);
  const storedBytes = bytes.subarray(metadataEnd);
  if (storedBytes.length !== metadata.storedSize) throw packageError();

  return { metadata, storedBytes };
}

function assertFile(file) {
  if (!file || typeof file !== 'object'
    || typeof file.name !== 'string'
    || typeof file.type !== 'string'
    || !Number.isSafeInteger(file.size)
    || file.size < 0
    || typeof file.arrayBuffer !== 'function') {
    throw new LiveQrPackageError('INVALID_FILE', 'Canlı QR için geçerli bir dosya gerekli.');
  }

  if (file.size > MAX_LIVE_QR_INPUT_BYTES) {
    throw new LiveQrPackageError('FILE_TOO_LARGE', 'Canlı QR için dosya 2 MiB sınırını aşıyor.');
  }
}

export async function createLiveQrPackage(file) {
  assertFile(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > MAX_LIVE_QR_INPUT_BYTES) {
    throw new LiveQrPackageError('FILE_TOO_LARGE', 'Canlı QR için dosya 2 MiB sınırını aşıyor.');
  }

  const prepared = await prepareTransferPayload(bytes, {
    fileName: file.name,
    mimeType: file.type,
  });
  const metadata = {
    name: file.name,
    type: file.type,
    compression: prepared.compression,
    originalSize: prepared.originalSize,
    storedSize: prepared.storedSize,
    originalSha256: prepared.originalSha256,
    storedSha256: prepared.storedSha256,
  };
  const metadataBytes = textEncoder.encode(JSON.stringify(metadata));
  if (metadataBytes.length > MAX_METADATA_BYTES) {
    throw new LiveQrPackageError('FILE_TOO_LARGE', 'Canlı QR paket üst verisi çok büyük.');
  }

  const packageBytes = new Uint8Array(PREFIX_BYTES + metadataBytes.length + prepared.storedSize);
  packageBytes.set(MAGIC);
  new DataView(packageBytes.buffer).setUint32(4, metadataBytes.length, false);
  packageBytes.set(metadataBytes, PREFIX_BYTES);
  packageBytes.set(prepared.storedBytes, PREFIX_BYTES + metadataBytes.length);

  return {
    bytes: packageBytes,
    originalSha256: prepared.originalSha256,
    compression: prepared.compression,
    originalSize: prepared.originalSize,
    storedSize: prepared.storedSize,
  };
}

export async function openLiveQrPackage(bytes) {
  const { metadata, storedBytes } = parsePackage(bytes);

  let originalBytes;
  try {
    originalBytes = await restoreTransferPayload(storedBytes, metadata);
  } catch (error) {
    if (error?.code === 'FILE_HASH_MISMATCH') {
      throw packageError('HASH_MISMATCH');
    }
    throw packageError();
  }

  return {
    file: new File([originalBytes], sanitizeDownloadName(metadata.name), { type: metadata.type }),
    sha256: metadata.originalSha256,
    compression: metadata.compression,
  };
}
