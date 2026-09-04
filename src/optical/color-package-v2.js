import { isTransferId } from '../protocol/transfer-id.js';
import { MAX_COLOR_INPUT_BYTES, prepareTransferPayload, restoreTransferPayload } from '../transfer/payload-compression.js';

const MAGIC = new TextEncoder().encode('CQF2');
const FORMAT_VERSION = 0x20;
const COMPRESSION_FLAG = 0x01;
const PREFIX_BYTES = 9;
const MAX_METADATA_BYTES = 16 * 1024;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

export class ColorPackageError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ColorPackageError';
    this.code = code;
  }
}

function packageError(code = 'INVALID_COLOR_PACKAGE') {
  return new ColorPackageError(code, 'Renkli aktarım paketi geçersiz.');
}

function isValidSize(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_COLOR_INPUT_BYTES;
}

function toUint8Array(value) {
  if (Object.prototype.toString.call(value) !== '[object Uint8Array]') return null;
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function validateMetadata(metadata, compressionFlag) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)
    || metadata.v !== 'CQF2'
    || !isTransferId(metadata.transferId)
    || typeof metadata.name !== 'string'
    || typeof metadata.type !== 'string'
    || !isValidSize(metadata.originalSize)
    || !isValidSize(metadata.storedSize)
    || (metadata.compression !== 'none' && metadata.compression !== 'zlib')
    || typeof metadata.sha256 !== 'string'
    || !metadata.sha256) {
    throw packageError();
  }

  if ((metadata.compression === 'zlib') !== compressionFlag) {
    throw packageError();
  }
}

function readMetadata(containerBytes) {
  const bytes = toUint8Array(containerBytes);
  if (!bytes || bytes.length < PREFIX_BYTES) {
    throw packageError();
  }

  if (!MAGIC.every((value, index) => bytes[index] === value)) {
    throw packageError();
  }

  const format = bytes[4];
  if ((format & 0xf0) !== FORMAT_VERSION || (format & 0x0e) !== 0) {
    throw packageError();
  }

  const metadataLength = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint32(5, false);
  if (metadataLength > MAX_METADATA_BYTES || PREFIX_BYTES + metadataLength > bytes.length) {
    throw packageError();
  }

  let metadata;
  try {
    metadata = JSON.parse(textDecoder.decode(bytes.subarray(PREFIX_BYTES, PREFIX_BYTES + metadataLength)));
  } catch {
    throw packageError();
  }

  validateMetadata(metadata, Boolean(format & COMPRESSION_FLAG));
  const storedBytes = bytes.subarray(PREFIX_BYTES + metadataLength);
  if (storedBytes.length !== metadata.storedSize) throw packageError();

  return { metadata, storedBytes };
}

export async function createColorPackageV2({ payload, name = '', type = '', transferId }) {
  if (!isTransferId(transferId) || typeof name !== 'string' || typeof type !== 'string') {
    throw packageError();
  }

  const bytes = toUint8Array(payload);
  if (!bytes) throw packageError();
  if (bytes.length > MAX_COLOR_INPUT_BYTES) throw packageError('FILE_TOO_LARGE');
  const prepared = await prepareTransferPayload(bytes);
  const metadata = {
    v: 'CQF2',
    transferId,
    name,
    type,
    originalSize: prepared.originalSize,
    storedSize: prepared.storedSize,
    compression: prepared.compression,
    sha256: prepared.originalSha256,
  };
  const metadataBytes = textEncoder.encode(JSON.stringify(metadata));
  if (metadataBytes.length > MAX_METADATA_BYTES) throw packageError('FILE_TOO_LARGE');

  const containerBytes = new Uint8Array(PREFIX_BYTES + metadataBytes.length + prepared.storedSize);
  containerBytes.set(MAGIC, 0);
  containerBytes[4] = FORMAT_VERSION | (prepared.compression === 'zlib' ? COMPRESSION_FLAG : 0);
  new DataView(containerBytes.buffer).setUint32(5, metadataBytes.length, false);
  containerBytes.set(metadataBytes, PREFIX_BYTES);
  containerBytes.set(prepared.storedBytes, PREFIX_BYTES + metadataBytes.length);

  return { containerBytes, metadata, stats: prepared };
}

export async function openColorPackageV2(containerBytes, options = {}) {
  if (!options || typeof options !== 'object') throw packageError();
  const { expectedTransferId } = options;
  if (expectedTransferId !== undefined && !isTransferId(expectedTransferId)) throw packageError();

  const { metadata, storedBytes } = readMetadata(containerBytes);
  if (expectedTransferId && metadata.transferId !== expectedTransferId) {
    throw packageError('TRANSFER_MISMATCH');
  }

  const payload = await restoreTransferPayload(storedBytes, {
    compression: metadata.compression,
    originalSize: metadata.originalSize,
    storedSize: metadata.storedSize,
    originalSha256: metadata.sha256,
  });

  const outputBytes = new Uint8Array(payload);
  return { payload: outputBytes, name: metadata.name, type: metadata.type, metadata };
}
